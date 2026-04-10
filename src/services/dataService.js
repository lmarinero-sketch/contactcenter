import { supabase, supabaseHub } from '../lib/supabase'

// ===================== HELPER: FETCH ALL ROWS (bypass 1000-row default) =====================
const BATCH_SIZE = 1000

async function fetchAllRows(tableName, selectColumns, filters = []) {
    let allData = []
    let offset = 0
    let hasMore = true
    const maxRows = 50000 // Safety cap — cc_tickets already has 10k+ rows
    const startTime = Date.now()
    const TIMEOUT_MS = 60000 // 60s max for any fetchAllRows call (dataset is 10k+ rows)

    while (hasMore && allData.length < maxRows) {
        // Timeout guard
        if (Date.now() - startTime > TIMEOUT_MS) {
            console.warn(`fetchAllRows(${tableName}): timeout after ${allData.length} rows`)
            break
        }

        let query = supabase
            .from(tableName)
            .select(selectColumns)
            .range(offset, offset + BATCH_SIZE - 1)

        // Apply any filters
        for (const f of filters) {
            if (f.type === 'not') query = query.not(f.column, f.op, f.value)
            else if (f.type === 'eq') query = query.eq(f.column, f.value)
            else if (f.type === 'gte') query = query.gte(f.column, f.value)
            else if (f.type === 'lte') query = query.lte(f.column, f.value)
            else if (f.type === 'in') query = query.in(f.column, f.value)
            else if (f.type === 'order') query = query.order(f.column, f.options)
        }

        const { data, error } = await query
        if (error) throw error

        allData = allData.concat(data || [])
        hasMore = (data?.length || 0) === BATCH_SIZE
        offset += BATCH_SIZE
    }

    return allData
}

// ===================== TICKETS =====================
export async function fetchTickets({ limit = 50, offset = 0, agent = null, dateFrom = null, dateTo = null, ticketIds = null } = {}) {
    let query = supabase
        .from('cc_tickets')
        .select(`
      *,
      cc_analysis (
        detected_intent,
        category,
        overall_sentiment,
        sentiment_score,
        agent_tone,
        agent_protocol_score,
        bot_first_choice,
        bot_second_choice,
        bot_third_choice,
        conversation_summary,
        message_count,
        first_response_time_seconds,
        total_resolution_time_seconds
      )
    `, { count: 'exact' })
        .order('received_at', { ascending: false })
        .range(offset, offset + limit - 1)

    if (agent) query = query.eq('agent_name', agent)
    if (dateFrom) query = query.gte('received_at', dateFrom)
    if (dateTo) query = query.lte('received_at', dateTo)
    if (ticketIds && ticketIds.length > 0) query = query.in('ticket_id', ticketIds)

    const { data, error, count } = await query
    if (error) throw error
    return { tickets: data || [], total: count || 0 }
}

export async function fetchTicketDetail(ticketId) {
    const { data: ticket, error: ticketError } = await supabase
        .from('cc_tickets')
        .select('*')
        .eq('ticket_id', ticketId)
        .single()

    if (ticketError) throw ticketError

    const { data: messages, error: msgError } = await supabase
        .from('cc_messages')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('message_order', { ascending: true })

    if (msgError) throw msgError

    const { data: analysis, error: analysisError } = await supabase
        .from('cc_analysis')
        .select('*')
        .eq('ticket_id', ticketId)
        .single()

    return { ticket, messages: messages || [], analysis: analysis || null }
}

// ===================== OVERVIEW STATS =====================

// In-memory cache to avoid redundant full re-fetches (invalidated on force refresh)
let _overviewCache = null
let _overviewCacheTime = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 min cache unless force-refreshed

// 1️⃣  Fetch raw data — uses cache unless forceRefresh=true or cache is stale
export async function fetchOverviewRawData(forceRefresh = false) {
    const now = Date.now()
    if (!forceRefresh && _overviewCache && (now - _overviewCacheTime) < CACHE_TTL_MS) {
        console.log('[dataService] Returning cached overview data (age:', Math.round((now - _overviewCacheTime) / 1000), 's)')
        return _overviewCache
    }

    console.log('[dataService] Fetching fresh overview data...' + (forceRefresh ? ' (FORCE REFRESH)' : ''))

    // Race loading against a 45s timeout to prevent infinite loading
    const dataPromise = Promise.all([
        fetchAllRows('cc_tickets', 'ticket_id, chat_started_at, received_at, agent_name, transferred_to_agent, bot_handoff_seconds, customer_name, customer_phone'),
        fetchAllRows('cc_analysis', 'ticket_id, overall_sentiment, sentiment_score, detected_intent, intent_confidence, category, subcategory, customer_keywords, agent_keywords, bot_resolution, bot_first_choice, bot_second_choice, bot_third_choice, conversation_summary, improvement_suggestions, analyzed_at, agent_tone, agent_greeting, agent_farewell, agent_response_quality, message_count, first_response_time_seconds, total_resolution_time_seconds'),
    ])

    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Data loading timeout (45s) — intentá nuevamente')), 45000)
    )

    const [allTickets, allAnalyses] = await Promise.race([dataPromise, timeoutPromise])

    const result = { allTickets, allAnalyses }
    _overviewCache = result
    _overviewCacheTime = Date.now()
    console.log(`[dataService] Loaded ${allTickets.length} tickets, ${allAnalyses.length} analyses`)

    return result
}

// Force-invalidate cache (called when user presses Refresh)
export function invalidateOverviewCache() {
    _overviewCache = null
    _overviewCacheTime = 0
    console.log('[dataService] Overview cache invalidated')
}

// Helper: extract unique agent names from raw tickets (for filter dropdown)
export function extractAgentList(allTickets) {
    const names = new Set()
    allTickets.forEach(t => {
        if (t.agent_name) names.add(t.agent_name)
    })
    return [...names].sort()
}

// 2️⃣  Pure computation — runs client-side, instant on filter changes
export function computeOverviewStats(allTickets, allAnalyses, dateFrom = null, dateTo = null, selectedAgent = null) {
    // Apply date filter to get current-view tickets
    let tickets = allTickets.filter(t => {
        if (!dateFrom && !dateTo) return true
        const d = t.received_at ? new Date(t.received_at) : null
        if (!d) return false
        if (dateFrom && d < new Date(dateFrom)) return false
        if (dateTo && d > new Date(dateTo)) return false
        return true
    })

    // Apply agent filter
    if (selectedAgent) {
        tickets = tickets.filter(t => t.agent_name === selectedAgent)
    }

    const ticketIds = new Set(tickets.map(t => t.ticket_id))
    const analyses = allAnalyses.filter(a => ticketIds.has(a.ticket_id))

    // ─── BASIC KPIs ───
    // Each unique phone number = 1 unique chat (same person contacting multiple times counts as 1)
    const uniquePhones = new Set(tickets.map(t => t.customer_phone).filter(Boolean))
    const totalChats = uniquePhones.size || tickets.length // fallback if no phones
    const totalTickets = tickets.length  // keep raw ticket count for reference
    const transferred = tickets.filter(t => t.transferred_to_agent).length
    const transferRate = totalTickets > 0 ? parseFloat(((transferred / totalTickets) * 100).toFixed(1)) : 0

    const sentimentScores = analyses.filter(a => a.sentiment_score !== null).map(a => a.sentiment_score)
    const avgSentiment = sentimentScores.length > 0
        ? parseFloat((sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length).toFixed(2))
        : 0

    // Bot handoff
    const handoffTimes = tickets.filter(t => t.bot_handoff_seconds !== null && t.bot_handoff_seconds > 0).map(t => t.bot_handoff_seconds)
    const avgHandoffTime = handoffTimes.length > 0
        ? Math.round(handoffTimes.reduce((a, b) => a + b, 0) / handoffTimes.length)
        : 0
    const handoffCount = handoffTimes.length

    // ─── SENTIMENT DISTRIBUTION ───
    const sentimentDist = { positive: 0, neutral: 0, negative: 0, frustrated: 0 }
    analyses.forEach(a => {
        if (a.overall_sentiment && sentimentDist.hasOwnProperty(a.overall_sentiment)) {
            sentimentDist[a.overall_sentiment]++
        }
    })

    // ─── INTENT DISTRIBUTION (with normalization) ───
    // Map similar intents to canonical names
    const INTENT_MAP = {
        'solicitar turno': 'Solicitar turno',
        'solicitar un turno': 'Solicitar turno',
        'pedir turno': 'Solicitar turno',
        'turno': 'Solicitar turno',
        'sacar turno': 'Solicitar turno',
        'reprogramar turno': 'Reprogramar turno',
        'reprogramar un turno': 'Reprogramar turno',
        'cambiar turno': 'Reprogramar turno',
        'modificar turno': 'Reprogramar turno',
        'cancelar turno': 'Cancelar turno',
        'cancelación de turno': 'Cancelar turno',
        'anular turno': 'Cancelar turno',
        'consulta': 'Consulta general',
        'consulta general': 'Consulta general',
        'consulta médica': 'Consulta general',
        'información': 'Consulta general',
        'solicitar autorización': 'Solicitar autorización',
        'autorización': 'Solicitar autorización',
        'pedir autorización': 'Solicitar autorización',
        'reclamo': 'Reclamo',
        'queja': 'Reclamo',
        'solicitar informe': 'Solicitar informe',
        'informe': 'Solicitar informe',
        'pedir informe': 'Solicitar informe',
        'solicitar resultados': 'Solicitar resultados',
        'resultados': 'Solicitar resultados',
        'pedir resultados': 'Solicitar resultados',
    }
    function normalizeIntent(raw) {
        if (!raw) return null
        const key = raw.trim().toLowerCase()
        return INTENT_MAP[key] || raw.trim()
    }

    const intentDist = {}
    analyses.forEach(a => {
        const intent = normalizeIntent(a.detected_intent)
        if (intent) {
            intentDist[intent] = (intentDist[intent] || 0) + 1
        }
    })

    // ─── BOT PATH DISTRIBUTION ───
    const botPathDist = {}
    analyses.forEach(a => {
        const choice = a.bot_first_choice || 'No detectado'
        botPathDist[choice] = (botPathDist[choice] || 0) + 1
    })

    // ─── HOURLY DISTRIBUTION ───
    const hourlyDist = Array(24).fill(0)
    tickets.forEach(t => {
        if (t.chat_started_at) {
            const hour = new Date(t.chat_started_at).getHours()
            hourlyDist[hour]++
        }
    })

    // ─── DAY OF WEEK DISTRIBUTION ───
    const dailyDist = Array(7).fill(0)
    tickets.forEach(t => {
        if (t.chat_started_at) {
            const day = new Date(t.chat_started_at).getDay()
            dailyDist[day]++
        }
    })

    // ─── HEATMAP: HOUR × DAY MATRIX (totals + averages per day-of-week) ───
    const heatmapData = Array.from({ length: 7 }, () => Array(24).fill(0))
    const heatmapDayOccurrences = Array(7).fill(0)
    const heatmapSeenDates = new Set()
    tickets.forEach(t => {
        if (t.chat_started_at) {
            const d = new Date(t.chat_started_at)
            heatmapData[d.getDay()][d.getHours()]++
            const dayDateKey = `${d.getDay()}-${d.toISOString().slice(0, 10)}`
            if (!heatmapSeenDates.has(dayDateKey)) {
                heatmapSeenDates.add(dayDateKey)
                heatmapDayOccurrences[d.getDay()]++
            }
        }
    })
    // Average per day-of-week: total / number of occurrences of that day
    const heatmapAvgData = heatmapData.map((hours, dayIdx) =>
        hours.map(total => heatmapDayOccurrences[dayIdx] > 0 ? Math.round(total / heatmapDayOccurrences[dayIdx]) : 0)
    )

    // ─── WEEKLY TREND (respects date filters) ───
    // Count unique phones per week (1 phone = 1 chat regardless of ticket count)
    const now = new Date()

    // Determine how many weeks to show based on filter range
    let trendWeeks = 8 // default
    if (dateFrom) {
        const fromDate = new Date(dateFrom)
        const diffDays = Math.ceil((now - fromDate) / (1000 * 60 * 60 * 24))
        trendWeeks = Math.max(1, Math.ceil(diffDays / 7))
    }

    const weeklyTrend = []
    for (let w = trendWeeks - 1; w >= 0; w--) {
        const weekStart = new Date(now)
        weekStart.setDate(now.getDate() - (w * 7) - now.getDay() + 1)
        weekStart.setHours(0, 0, 0, 0)
        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekStart.getDate() + 6)
        weekEnd.setHours(23, 59, 59, 999)

        // Use filtered tickets instead of allTickets
        const weekTickets = tickets.filter(t => {
            if (!t.chat_started_at) return false
            const d = new Date(t.chat_started_at)
            return d >= weekStart && d <= weekEnd
        })
        const weekUniquePhones = new Set(weekTickets.map(t => t.customer_phone).filter(Boolean))
        const weekChats = weekUniquePhones.size || weekTickets.length

        const label = `${weekStart.getDate()}/${weekStart.getMonth() + 1}`
        weeklyTrend.push({ label, chats: weekChats, weekStart: weekStart.toISOString() })
    }
    const currentWeekChats = weeklyTrend[weeklyTrend.length - 1]?.chats || 0
    const prevWeekChats = weeklyTrend[weeklyTrend.length - 2]?.chats || 0
    const weeklyVariation = prevWeekChats > 0
        ? parseFloat((((currentWeekChats - prevWeekChats) / prevWeekChats) * 100).toFixed(1))
        : 0

    // ─── SENTIMENT WEEKLY TREND (respects date filters) ───
    const sentimentTrend = []
    const allTicketsMap = new Map(allTickets.map(t => [t.ticket_id, t]))
    const filteredTicketsMap = new Map(tickets.map(t => [t.ticket_id, t]))
    for (let w = trendWeeks - 1; w >= 0; w--) {
        const weekStart = new Date(now)
        weekStart.setDate(now.getDate() - (w * 7) - now.getDay() + 1)
        weekStart.setHours(0, 0, 0, 0)
        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekStart.getDate() + 6)
        weekEnd.setHours(23, 59, 59, 999)

        // Use filteredTicketsMap to respect date filter
        const weekAnalyses = analyses.filter(a => {
            const ticket = filteredTicketsMap.get(a.ticket_id)
            if (!ticket?.chat_started_at) return false
            const d = new Date(ticket.chat_started_at)
            return d >= weekStart && d <= weekEnd
        })

        const scores = weekAnalyses.filter(a => a.sentiment_score !== null).map(a => a.sentiment_score)
        const avgScore = scores.length > 0
            ? parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2))
            : null

        const negCount = weekAnalyses.filter(a =>
            a.overall_sentiment === 'negative' || a.overall_sentiment === 'frustrated'
        ).length

        const label = `${weekStart.getDate()}/${weekStart.getMonth() + 1}`
        sentimentTrend.push({
            label,
            avgScore,
            negativeCount: negCount,
            total: weekAnalyses.length,
            negativeRate: weekAnalyses.length > 0 ? parseFloat(((negCount / weekAnalyses.length) * 100).toFixed(1)) : 0,
        })
    }

    // ─── 7-DAY DEMAND FORECAST ───
    const forecast = []
    const dayLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
    for (let d = 1; d <= 7; d++) {
        const targetDate = new Date(now)
        targetDate.setDate(now.getDate() + d)
        const dayOfWeek = targetDate.getDay()

        const historicalCounts = []
        for (let w = 1; w <= 4; w++) {
            const refDate = new Date(targetDate)
            refDate.setDate(targetDate.getDate() - (w * 7))
            const refStart = new Date(refDate)
            refStart.setHours(0, 0, 0, 0)
            const refEnd = new Date(refDate)
            refEnd.setHours(23, 59, 59, 999)

            const dayTickets = allTickets.filter(t => {
                if (!t.chat_started_at) return false
                const td = new Date(t.chat_started_at)
                return td >= refStart && td <= refEnd
            })
            const dayUniquePhones = new Set(dayTickets.map(t => t.customer_phone).filter(Boolean))
            const count = dayUniquePhones.size || dayTickets.length
            historicalCounts.push(count)
        }

        const weights = [4, 3, 2, 1]
        const totalWeight = weights.reduce((a, b) => a + b, 0)
        const weightedAvg = historicalCounts.length > 0
            ? Math.round(historicalCounts.reduce((sum, c, i) => sum + c * (weights[i] || 1), 0) / totalWeight)
            : 0

        const trendFactor = prevWeekChats > 0 && currentWeekChats > 0
            ? currentWeekChats / prevWeekChats
            : 1
        const adjusted = Math.round(weightedAvg * Math.min(Math.max(trendFactor, 0.7), 1.3))

        forecast.push({
            day: dayLabels[dayOfWeek],
            date: `${targetDate.getDate()}/${targetDate.getMonth() + 1}`,
            predicted: adjusted,
            historical: weightedAvg,
        })
    }

    // ─── SMART ALERTS ───
    const alerts = []

    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)
    const todayTickets = allTickets.filter(t => {
        if (!t.chat_started_at) return false
        return new Date(t.chat_started_at) >= todayStart
    })
    const agentLoadToday = {}
    todayTickets.forEach(t => {
        if (t.agent_name) {
            agentLoadToday[t.agent_name] = (agentLoadToday[t.agent_name] || 0) + 1
        }
    })
    const todayUniquePhones = new Set(todayTickets.map(t => t.customer_phone).filter(Boolean))
    const totalToday = todayUniquePhones.size || todayTickets.length
    Object.entries(agentLoadToday).forEach(([name, count]) => {
        if (totalToday > 3 && count / totalToday > 0.5) {
            alerts.push({
                type: 'warning',
                icon: '👤',
                message: `${name} tiene ${Math.round((count / totalToday) * 100)}% de los chats de hoy (${count}/${totalToday})`,
            })
        }
    })

    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(now.getDate() - 7)
    const fourteenDaysAgo = new Date(now)
    fourteenDaysAgo.setDate(now.getDate() - 14)

    const recentKeywords = {}
    const previousKeywords = {}
    allAnalyses.forEach(a => {
        const ticket = allTicketsMap.get(a.ticket_id)
        if (!ticket?.chat_started_at || !a.customer_keywords) return
        const d = new Date(ticket.chat_started_at)

        if (d >= sevenDaysAgo) {
            a.customer_keywords.forEach(kw => {
                recentKeywords[kw] = (recentKeywords[kw] || 0) + 1
            })
        } else if (d >= fourteenDaysAgo && d < sevenDaysAgo) {
            a.customer_keywords.forEach(kw => {
                previousKeywords[kw] = (previousKeywords[kw] || 0) + 1
            })
        }
    })

    const emergingKeywords = []
    Object.entries(recentKeywords).forEach(([kw, count]) => {
        const prev = previousKeywords[kw] || 0
        if (count >= 3 && (prev === 0 || count / prev >= 2)) {
            emergingKeywords.push({ keyword: kw, current: count, previous: prev })
        }
    })
    emergingKeywords.sort((a, b) => b.current - a.current)

    if (emergingKeywords.length > 0) {
        const top = emergingKeywords[0]
        const increment = top.previous > 0 ? `+${Math.round(((top.current - top.previous) / top.previous) * 100)}%` : 'NUEVA'
        alerts.push({
            type: 'info',
            icon: '🔍',
            message: `Keyword "${top.keyword}" en alza: ${top.current} menciones esta semana (${increment})`,
        })
    }

    const thisWeekSentiment = sentimentTrend[sentimentTrend.length - 1]
    if (thisWeekSentiment && thisWeekSentiment.negativeRate > 25) {
        alerts.push({
            type: 'danger',
            icon: '😠',
            message: `${thisWeekSentiment.negativeRate}% de chats con sentimiento negativo esta semana`,
        })
    }

    const todayConflicts = analyses.filter(a => {
        const ticket = allTicketsMap.get(a.ticket_id)
        if (!ticket?.chat_started_at) return false
        return new Date(ticket.chat_started_at) >= todayStart &&
            (a.sentiment_score !== null && a.sentiment_score < -0.3 || a.overall_sentiment === 'frustrated')
    }).length
    if (todayConflicts > 0) {
        alerts.push({
            type: 'danger',
            icon: '⚠️',
            message: `${todayConflicts} chat${todayConflicts > 1 ? 's' : ''} en riesgo de conflicto hoy`,
        })
    }

    // ─── BOT EFFICIENCY ───
    const botResolved = analyses.filter(a => a.bot_resolution === true).length
    const botTotal = analyses.length
    const botResolutionRate = botTotal > 0 ? parseFloat(((botResolved / botTotal) * 100).toFixed(1)) : 0

    // Build a Map for O(1) ticket lookups (fixes O(n²) bottleneck)
    const ticketsMap = new Map(tickets.map(t => [t.ticket_id, t]))

    const pathTransferRate = {}
    analyses.forEach(a => {
        const path = a.bot_first_choice || 'No detectado'
        if (!pathTransferRate[path]) pathTransferRate[path] = { total: 0, transferred: 0 }
        pathTransferRate[path].total++
        const ticket = ticketsMap.get(a.ticket_id)
        if (ticket?.transferred_to_agent) pathTransferRate[path].transferred++
    })
    const botPathTransferRates = Object.entries(pathTransferRate)
        .map(([path, data]) => ({
            path,
            total: data.total,
            transferred: data.transferred,
            rate: data.total > 0 ? parseFloat(((data.transferred / data.total) * 100).toFixed(1)) : 0,
        }))
        .sort((a, b) => b.rate - a.rate)

    // ─── PROBLEMATIC CHATS (computed from filtered data) ───
    const problematicChats = []
    analyses.forEach(a => {
        const ticket = ticketsMap.get(a.ticket_id)
        if (!ticket) return
        const reasons = []
        if (a.overall_sentiment === 'negative' || a.overall_sentiment === 'frustrated') reasons.push(`Sentimiento: ${a.overall_sentiment}`)
        if (a.sentiment_score !== null && a.sentiment_score < -0.3) reasons.push(`Score: ${a.sentiment_score}`)
        if (a.message_count && a.message_count > 20) reasons.push(`Conversación larga: ${a.message_count} msgs`)
        if (reasons.length > 0) {
            problematicChats.push({
                ticket_id: ticket.ticket_id,
                customer_name: ticket.customer_name,
                agent_name: ticket.agent_name,
                received_at: ticket.received_at,
                analysis: a,
                reasons,
            })
        }
    })
    problematicChats.sort((a, b) => (a.analysis?.sentiment_score || 0) - (b.analysis?.sentiment_score || 0))

    // ─── AGENT DISTRIBUTION (Top agents by chat count) ───
    const agentCounts = {}
    tickets.forEach(t => {
        const name = t.agent_name || 'Bot (sin agente)'
        agentCounts[name] = (agentCounts[name] || 0) + 1
    })
    const agentDist = Object.entries(agentCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, chats: count }))

    // ─── DAILY VOLUME (chats per calendar day) ───
    const dailyVolumeBuckets = {}
    tickets.forEach(t => {
        if (t.chat_started_at) {
            const dateKey = new Date(t.chat_started_at).toISOString().slice(0, 10)
            if (!dailyVolumeBuckets[dateKey]) dailyVolumeBuckets[dateKey] = new Set()
            if (t.customer_phone) {
                dailyVolumeBuckets[dateKey].add(t.customer_phone)
            } else {
                dailyVolumeBuckets[dateKey].add(t.ticket_id)
            }
        }
    })
    const dailyVolume = Object.entries(dailyVolumeBuckets)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-30) // last 30 days max
        .map(([date, phoneSet]) => ({
            date: `${parseInt(date.slice(8))}/${parseInt(date.slice(5, 7))}`,
            chats: phoneSet.size,
        }))

    return {
        totalChats,
        totalTickets,
        transferRate,
        avgSentiment,
        avgHandoffTime,
        handoffCount,
        sentimentDist,
        intentDist,
        botPathDist,
        hourlyDist,
        dailyDist,
        heatmapData,
        heatmapAvgData,
        weeklyTrend,
        weeklyVariation,
        currentWeekChats,
        sentimentTrend,
        forecast,
        alerts,
        emergingKeywords: emergingKeywords.slice(0, 5),
        botResolutionRate,
        botPathTransferRates,
        agentLoadToday,
        totalToday,
        problematicChats,
        agentDist,
        dailyVolume,
    }
}

// ===================== AGENT STATS =====================
export async function fetchAgentStats(dateFrom = null, dateTo = null) {
    const filters = [
        { type: 'not', column: 'agent_name', op: 'is', value: null },
    ]
    if (dateFrom) filters.push({ type: 'gte', column: 'received_at', value: dateFrom })
    if (dateTo) filters.push({ type: 'lte', column: 'received_at', value: dateTo })

    const data = await fetchAllRows('cc_tickets', `
      agent_id,
      agent_name,
      transferred_to_agent,
      bot_handoff_seconds,
      cc_analysis (
        overall_sentiment,
        sentiment_score,
        agent_tone,
        agent_protocol_score,
        agent_greeting,
        agent_farewell,
        first_response_time_seconds,
        total_resolution_time_seconds,
        message_count,
        agent_message_count,
        detected_intent,
        agent_keywords
      )
    `, filters)

    // Group by agent
    const agentMap = {}
    data?.forEach(ticket => {
        const name = ticket.agent_name
        if (!agentMap[name]) {
            agentMap[name] = {
                agent_id: ticket.agent_id,
                agent_name: name,
                total_chats: 0,
                sentiments: [],
                protocol_scores: [], // deprecated, kept for compat
                tones: {},
                response_times: [],
                handoff_times: [],
                greetings: 0,
                farewells: 0,
                agent_participated: 0,
                keywords: {},
                intents: {},
            }
        }

        const agent = agentMap[name]
        agent.total_chats++

        // Track handoff time from ticket
        if (ticket.bot_handoff_seconds !== null && ticket.bot_handoff_seconds > 0) {
            agent.handoff_times.push(ticket.bot_handoff_seconds)
        }

        const analysis = ticket.cc_analysis?.[0] || ticket.cc_analysis
        if (analysis) {
            if (analysis.sentiment_score !== null) agent.sentiments.push(analysis.sentiment_score)
            if (analysis.agent_tone) agent.tones[analysis.agent_tone] = (agent.tones[analysis.agent_tone] || 0) + 1
            if (analysis.first_response_time_seconds) agent.response_times.push(analysis.first_response_time_seconds)

            // Only count greeting/farewell when agent actually participated
            const agentParticipated = analysis.agent_tone && analysis.agent_tone !== 'N/A'
            if (agentParticipated) {
                agent.agent_participated++
                if (analysis.agent_greeting) agent.greetings++
                if (analysis.agent_farewell) agent.farewells++
            }
            if (analysis.detected_intent) agent.intents[analysis.detected_intent] = (agent.intents[analysis.detected_intent] || 0) + 1

            if (analysis.agent_keywords) {
                analysis.agent_keywords.forEach(kw => {
                    agent.keywords[kw] = (agent.keywords[kw] || 0) + 1
                })
            }
        }
    })

    // Calculate averages
    return Object.values(agentMap).map(agent => ({
        ...agent,
        avg_sentiment: agent.sentiments.length > 0
            ? (agent.sentiments.reduce((a, b) => a + b, 0) / agent.sentiments.length).toFixed(2)
            : null,
        avg_protocol: null,
        avg_response_time: agent.response_times.length > 0
            ? Math.round(agent.response_times.reduce((a, b) => a + b, 0) / agent.response_times.length)
            : null,
        avg_handoff_time: agent.handoff_times.length > 0
            ? Math.round(agent.handoff_times.reduce((a, b) => a + b, 0) / agent.handoff_times.length)
            : null,
        max_handoff_time: agent.handoff_times.length > 0 ? Math.max(...agent.handoff_times) : null,
        min_handoff_time: agent.handoff_times.length > 0 ? Math.min(...agent.handoff_times) : null,
        greeting_rate: agent.agent_participated > 0 ? ((agent.greetings / agent.agent_participated) * 100).toFixed(0) : 0,
        farewell_rate: agent.agent_participated > 0 ? ((agent.farewells / agent.agent_participated) * 100).toFixed(0) : 0,
        top_keywords: Object.entries(agent.keywords).sort((a, b) => b[1] - a[1]).slice(0, 10),
        dominant_tone: Object.entries(agent.tones).sort((a, b) => b[1] - a[1])?.[0]?.[0] || 'N/A',
    })).sort((a, b) => b.total_chats - a.total_chats)
}

// ===================== BOT TREE STATS =====================
export async function fetchBotTreeStats(dateFrom = null, dateTo = null) {
    const filters = []

    if (dateFrom || dateTo) {
        // We need to join with tickets for date filtering
        const ticketFilters = []
        if (dateFrom) ticketFilters.push({ type: 'gte', column: 'received_at', value: dateFrom })
        if (dateTo) ticketFilters.push({ type: 'lte', column: 'received_at', value: dateTo })
        const filteredTickets = await fetchAllRows('cc_tickets', 'ticket_id', ticketFilters)
        if (filteredTickets.length > 0) {
            filters.push({ type: 'in', column: 'ticket_id', value: filteredTickets.map(t => t.ticket_id) })
        }
    }

    const data = await fetchAllRows('cc_analysis', 'bot_first_choice, bot_second_choice, bot_third_choice, bot_resolution, bot_path_depth', filters)

    // First choice distribution
    const firstChoices = {}
    const secondChoices = {}
    const thirdChoices = {}
    let botResolutions = 0
    let totalAnalyzed = 0

    data?.forEach(a => {
        totalAnalyzed++
        if (a.bot_first_choice) firstChoices[a.bot_first_choice] = (firstChoices[a.bot_first_choice] || 0) + 1
        if (a.bot_second_choice) secondChoices[a.bot_second_choice] = (secondChoices[a.bot_second_choice] || 0) + 1
        if (a.bot_third_choice) thirdChoices[a.bot_third_choice] = (thirdChoices[a.bot_third_choice] || 0) + 1
        if (a.bot_resolution) botResolutions++
    })

    return {
        firstChoices,
        secondChoices,
        thirdChoices,
        botResolutionRate: totalAnalyzed > 0 ? ((botResolutions / totalAnalyzed) * 100).toFixed(1) : 0,
        totalAnalyzed,
    }
}

// ===================== UNIQUE AGENTS =====================
export async function fetchAgentList() {
    const data = await fetchAllRows('cc_tickets', 'agent_name', [
        { type: 'not', column: 'agent_name', op: 'is', value: null },
    ])

    const unique = [...new Set(data.map(d => d.agent_name).filter(Boolean))]
    return unique.sort()
}

// ===================== PROBLEMATIC CHATS =====================
// ===================== RISK TICKET IDS (lightweight) =====================
export async function fetchRiskTicketIds() {
    const data = await fetchAllRows('cc_analysis', 'ticket_id, overall_sentiment, sentiment_score')

    const riskIds = new Set()
    data.forEach(a => {
        if (
            a.overall_sentiment === 'frustrated' ||
            a.overall_sentiment === 'negative' ||
            (a.sentiment_score !== null && a.sentiment_score < -0.3)
        ) {
            riskIds.add(a.ticket_id)
        }
    })
    return riskIds
}

export async function fetchProblematicChats(dateFrom = null, dateTo = null) {
    const filters = [
        { type: 'order', column: 'received_at', options: { ascending: false } },
    ]
    if (dateFrom) filters.push({ type: 'gte', column: 'received_at', value: dateFrom })
    if (dateTo) filters.push({ type: 'lte', column: 'received_at', value: dateTo })

    const data = await fetchAllRows('cc_tickets', `
            ticket_id,
            agent_name,
            customer_name,
            received_at,
            channel,
            cc_analysis (
                overall_sentiment,
                sentiment_score,
                agent_tone,
                detected_intent,
                conversation_summary
            )
        `, filters)

    // Filter for problematic conversations
    return (data || []).filter(ticket => {
        const analysis = Array.isArray(ticket.cc_analysis) ? ticket.cc_analysis[0] : ticket.cc_analysis
        if (!analysis) return false
        return (
            analysis.sentiment_score !== null && analysis.sentiment_score < -0.3 ||
            analysis.overall_sentiment === 'frustrated' ||
            analysis.overall_sentiment === 'negative'
        )
    }).map(ticket => {
        const analysis = Array.isArray(ticket.cc_analysis) ? ticket.cc_analysis[0] : ticket.cc_analysis
        return {
            ...ticket,
            analysis,
            reasons: [
                analysis?.sentiment_score < -0.3 ? `Sentimiento bajo (${analysis.sentiment_score.toFixed(2)})` : null,
                analysis?.overall_sentiment === 'frustrated' ? 'Paciente frustrado' : null,
                analysis?.overall_sentiment === 'negative' ? 'Experiencia negativa' : null,
            ].filter(Boolean)
        }
    })
}

// ===================== AGENT ACTIVITY CONTROL =====================
// AsisteClick quirk: ALL OUT messages share the same sender_name (bot or agent header).
// So we CANNOT trust sender_name to distinguish human vs bot messages.
// Instead we:
//   1. Get the real agent from cc_tickets.agent_name (already corrected)
//   2. For each ticket's messages, use content heuristics to identify bot vs human messages
//   3. Only count non-bot OUT messages as agent work

// Bot message content patterns (same as fix_v4) — bot always sends these exact phrases
const BOT_CONTENT_PATTERNS = [
    'hola mi nombre es betina',
    'soy asistente virtual',
    '¿cómo te puedo ayudar?',
    'selecciona una opción',
    'selecciona una de estas opciones',
    'por favor selecciona',
    'en breve un operador se pondrá en contacto',
    'ingresa el dni',
    '¿cuál es el nombre del médico?',
    'indica la fecha y hora',
    '¿cuál es el día y horario preferido',
    '¿quieres reprogramar',
    'volver al menú',
    'a. solicitar turnos',
    'b. reprogramar',
    'c. autorizaciones',
    'd. chequeo preventivo',
    'e. programa prevenir',
    'f. información',
    'a. turnos',
    'b. guardias',
    'c. otras consultas',
    'selecciona el tipo de turno',
    'a. turnos de consultas',
    'b. turnos de tomografía',
]

function _isBotContent(messageText) {
    if (!messageText) return false
    const lower = messageText.toLowerCase().trim()
    return BOT_CONTENT_PATTERNS.some(p => lower.includes(p))
}

// Queries cc_messages by message_timestamp (the actual time the agent typed),
// NOT by ticket date. If an agent replies today to yesterday's ticket, it counts as TODAY's work.
export async function fetchAgentActivity(targetDate = null) {
    // Default to today (in local timezone)
    const date = targetDate ? new Date(targetDate) : new Date()
    const dayStart = new Date(date)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(date)
    dayEnd.setHours(23, 59, 59, 999)

    // 1. Fetch all OUT messages within the target date's timestamp range
    //    We need the message text to detect bot content
    const messages = await fetchAllRows('cc_messages',
        'sender_name, message_timestamp, ticket_id, action, message',
        [
            { type: 'eq', column: 'action', value: 'OUT' },
            { type: 'gte', column: 'message_timestamp', value: dayStart.toISOString() },
            { type: 'lte', column: 'message_timestamp', value: dayEnd.toISOString() },
        ]
    )

    // 2. Get the distinct ticket_ids from these messages
    const ticketIds = [...new Set(messages.map(m => m.ticket_id))]
    if (ticketIds.length === 0) {
        return { date: dayStart.toISOString().slice(0, 10), agents: [], total_messages: 0 }
    }

    // 3. Get the real agent_name from cc_tickets for each ticket
    //    (agent_name is already corrected by fix scripts to reflect the actual human agent)
    const tickets = await fetchAllRows('cc_tickets',
        'ticket_id, agent_name',
        [{ type: 'in', column: 'ticket_id', value: ticketIds }]
    )
    const ticketAgentMap = {}
    tickets.forEach(t => { ticketAgentMap[t.ticket_id] = t.agent_name })

    // 4. Filter: only keep messages that are NOT bot content AND belong to a ticket with a human agent
    const agentMap = {}
    let totalHumanMessages = 0

    messages.forEach(msg => {
        const agentName = ticketAgentMap[msg.ticket_id]
        if (!agentName) return // ticket has no human agent (bot-only conversation)
        if (_isBotContent(msg.message)) return // this is a bot-generated message

        if (!agentMap[agentName]) {
            agentMap[agentName] = {
                agent_name: agentName,
                timestamps: [],
                ticket_ids: new Set(),
            }
        }
        agentMap[agentName].timestamps.push(new Date(msg.message_timestamp))
        agentMap[agentName].ticket_ids.add(msg.ticket_id)
        totalHumanMessages++
    })

    // 5. Calculate metrics per agent
    const result = Object.values(agentMap).map(agent => {
        const sorted = agent.timestamps
            .filter(d => !isNaN(d.getTime()))
            .sort((a, b) => a - b)

        const firstMsg = sorted.length > 0 ? sorted[0] : null
        const lastMsg = sorted.length > 0 ? sorted[sorted.length - 1] : null

        let hoursWorked = 0
        if (firstMsg && lastMsg) {
            hoursWorked = (lastMsg - firstMsg) / (1000 * 60 * 60)
        }

        // Calculate hourly distribution for this agent (messages per hour)
        const hourlyBreakdown = Array(24).fill(0)
        sorted.forEach(t => {
            hourlyBreakdown[t.getHours()]++
        })

        return {
            agent_name: agent.agent_name,
            first_message: firstMsg ? firstMsg.toISOString() : null,
            last_message: lastMsg ? lastMsg.toISOString() : null,
            hours_worked: parseFloat(hoursWorked.toFixed(2)),
            total_messages: sorted.length,
            unique_tickets: agent.ticket_ids.size,
            hourly_breakdown: hourlyBreakdown,
        }
    }).sort((a, b) => {
        // Sort: who started first
        if (!a.first_message) return 1
        if (!b.first_message) return -1
        return new Date(a.first_message) - new Date(b.first_message)
    })

    return {
        date: dayStart.toISOString().slice(0, 10),
        agents: result,
        total_messages: totalHumanMessages,
    }
}

// Fetch agent activity for a date range (for the weekly summary)
export async function fetchAgentActivityRange(dateFrom, dateTo) {
    const from = new Date(dateFrom)
    const to = new Date(dateTo)

    // Fetch all at once instead of day-by-day for efficiency
    const fromStart = new Date(from)
    fromStart.setHours(0, 0, 0, 0)
    const toEnd = new Date(to)
    toEnd.setHours(23, 59, 59, 999)

    // 1. Fetch all OUT messages in the range (with message content for bot detection)
    const messages = await fetchAllRows('cc_messages',
        'sender_name, message_timestamp, ticket_id, action, message',
        [
            { type: 'eq', column: 'action', value: 'OUT' },
            { type: 'gte', column: 'message_timestamp', value: fromStart.toISOString() },
            { type: 'lte', column: 'message_timestamp', value: toEnd.toISOString() },
        ]
    )

    // 2. Get real agent names from cc_tickets
    const ticketIds = [...new Set(messages.map(m => m.ticket_id))]
    if (ticketIds.length === 0) return []

    const tickets = await fetchAllRows('cc_tickets',
        'ticket_id, agent_name',
        [{ type: 'in', column: 'ticket_id', value: ticketIds }]
    )
    const ticketAgentMap = {}
    tickets.forEach(t => { ticketAgentMap[t.ticket_id] = t.agent_name })

    // 3. Group by agent + day (filtering out bot content)
    const agentDayMap = {}
    messages.forEach(msg => {
        const agentName = ticketAgentMap[msg.ticket_id]
        if (!agentName) return
        if (_isBotContent(msg.message)) return

        const dayKey = new Date(msg.message_timestamp).toISOString().slice(0, 10)
        const key = `${agentName}|${dayKey}`

        if (!agentDayMap[key]) {
            agentDayMap[key] = {
                agent_name: agentName,
                date: dayKey,
                timestamps: [],
                ticket_ids: new Set(),
            }
        }
        agentDayMap[key].timestamps.push(new Date(msg.message_timestamp))
        agentDayMap[key].ticket_ids.add(msg.ticket_id)
    })

    // 4. Calculate per agent summary across all days
    const agentSummary = {}
    Object.values(agentDayMap).forEach(entry => {
        if (!agentSummary[entry.agent_name]) {
            agentSummary[entry.agent_name] = {
                agent_name: entry.agent_name,
                days_worked: 0,
                total_messages: 0,
                total_hours: 0,
                total_tickets: new Set(),
                daily_details: [],
            }
        }

        const sorted = entry.timestamps.sort((a, b) => a - b)
        const first = sorted[0]
        const last = sorted[sorted.length - 1]
        const hours = (last - first) / (1000 * 60 * 60)

        agentSummary[entry.agent_name].days_worked++
        agentSummary[entry.agent_name].total_messages += sorted.length
        agentSummary[entry.agent_name].total_hours += hours
        entry.ticket_ids.forEach(id => agentSummary[entry.agent_name].total_tickets.add(id))
        agentSummary[entry.agent_name].daily_details.push({
            date: entry.date,
            first_message: first.toISOString(),
            last_message: last.toISOString(),
            hours_worked: parseFloat(hours.toFixed(2)),
            total_messages: sorted.length,
            unique_tickets: entry.ticket_ids.size,
        })
    })

    return Object.values(agentSummary).map(a => ({
        ...a,
        avg_hours_per_day: a.days_worked > 0 ? parseFloat((a.total_hours / a.days_worked).toFixed(2)) : 0,
        avg_messages_per_day: a.days_worked > 0 ? Math.round(a.total_messages / a.days_worked) : 0,
        total_tickets: a.total_tickets.size,
        daily_details: a.daily_details.sort((a, b) => a.date.localeCompare(b.date)),
    })).sort((a, b) => b.total_messages - a.total_messages)
}

// ===================== FICHADAS (RRHH Cross-DB) =====================
// Maps Contact Center agent names → RRHH fichadas_colaboradores search patterns
// Uses ILIKE for fuzzy matching since RRHH has full names (surname + multiple names)
// Names confirmed from RRHH screenshots: OLIVIER SOFIA, AGUILERA DANIELA ROMINA,
// ACOSTA ESQUIVEL MARIA ANTONELL...
const AGENT_FICHADA_MAP = {
    'Sofia': '%OLIVIER%SOFIA%',
    'Antonella': '%ESQUIVEL%ANTONELL%',
    'Daniela': '%AGUILERA%DANIELA%',
}

/**
 * Fetch fichadas (clock-in/clock-out) from the RRHH database for CC agents.
 * Queries fichadas_registros via the Hub Supabase client.
 * @param {string} targetDate - ISO date string (YYYY-MM-DD)
 * @returns {Object} Map of agentName → { fichada_entrada, fichada_salida, fecha }
 */
export async function fetchFichadasForAgents(targetDate) {
    if (!supabaseHub) {
        console.warn('[Fichadas] Hub Supabase not configured')
        return {}
    }

    const date = targetDate || new Date().toISOString().slice(0, 10)

    // 1. Get the colaborador IDs for our agents from RRHH using fuzzy match
    const colaboradorIds = {} // ccName → colabId
    for (const [ccName, pattern] of Object.entries(AGENT_FICHADA_MAP)) {
        const { data } = await supabaseHub
            .from('fichadas_colaboradores')
            .select('id, nombre_completo')
            .ilike('nombre_completo', pattern)
            .limit(1)
            .maybeSingle()

        if (data) {
            colaboradorIds[data.id] = ccName
        }
    }

    const colabIds = Object.keys(colaboradorIds)
    if (colabIds.length === 0) {
        console.warn('[Fichadas] No matching colaboradores found')
        return {}
    }

    // 2. Fetch fichadas for this date
    const { data: registros, error: regError } = await supabaseHub
        .from('fichadas_registros')
        .select('colaborador_id, fecha, fichada_entrada, fichada_salida, horas_trabajadas_min, tarde')
        .in('colaborador_id', colabIds)
        .eq('fecha', date)

    if (regError) {
        console.warn('[Fichadas] Error fetching registros:', regError.message)
        return {}
    }

    // 3. Map back to CC agent names (colaboradorIds already has colabId → ccName)


    const result = {}
    ;(registros || []).forEach(reg => {
        const agentName = colaboradorIds[reg.colaborador_id]
        if (!agentName) return
        result[agentName] = {
            fichada_entrada: reg.fichada_entrada,
            fichada_salida: reg.fichada_salida,
            horas_trabajadas_min: reg.horas_trabajadas_min || 0,
            tarde: reg.tarde || false,
            fecha: reg.fecha,
        }
    })

    return result
}

/**
 * Fetch fichadas for a date range — used by the range view.
 */
export async function fetchFichadasRange(dateFrom, dateTo) {
    if (!supabaseHub) return {}

    // Fuzzy-match colaboradores (same approach as daily)
    const colaboradorIds = {} // colabId → ccName
    for (const [ccName, pattern] of Object.entries(AGENT_FICHADA_MAP)) {
        const { data } = await supabaseHub
            .from('fichadas_colaboradores')
            .select('id, nombre_completo')
            .ilike('nombre_completo', pattern)
            .limit(1)
            .maybeSingle()

        if (data) {
            colaboradorIds[data.id] = ccName
        }
    }

    const colabIds = Object.keys(colaboradorIds)
    if (colabIds.length === 0) return {}

    const { data: registros } = await supabaseHub
        .from('fichadas_registros')
        .select('colaborador_id, fecha, fichada_entrada, fichada_salida, horas_trabajadas_min, tarde')
        .in('colaborador_id', colabIds)
        .gte('fecha', dateFrom)
        .lte('fecha', dateTo)
        .order('fecha', { ascending: true })

    // Group by agent → date
    const result = {} // agentName → { [date]: fichada }
    ;(registros || []).forEach(reg => {
        const agentName = colaboradorIds[reg.colaborador_id]
        if (!agentName) return
        if (!result[agentName]) result[agentName] = {}
        result[agentName][reg.fecha] = {
            fichada_entrada: reg.fichada_entrada,
            fichada_salida: reg.fichada_salida,
            horas_trabajadas_min: reg.horas_trabajadas_min || 0,
            tarde: reg.tarde || false,
        }
    })

    return result
}

// ===================== CSV EXPORT =====================
export function exportToCSV(data, filename) {
    if (!data || data.length === 0) return

    const headers = Object.keys(data[0])
    const csvRows = [
        headers.join(','),
        ...data.map(row =>
            headers.map(h => {
                let val = row[h]
                if (val === null || val === undefined) val = ''
                if (typeof val === 'object') val = JSON.stringify(val)
                // Escape commas and quotes
                val = String(val).replace(/"/g, '""')
                return `"${val}"`
            }).join(',')
        )
    ]

    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
}

// ===================== AGENT AI PROFILE =====================
export async function fetchAgentProfile(agentName, dateFrom = null, dateTo = null) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    const body = { agent_name: agentName }
    if (dateFrom) body.date_from = dateFrom
    if (dateTo) body.date_to = dateTo

    const response = await fetch(`${supabaseUrl}/functions/v1/analyze-agent`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify(body)
    })

    if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Error al generar perfil del agente')
    }

    return await response.json()
}
