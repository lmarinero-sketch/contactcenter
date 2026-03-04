import { supabase } from '../lib/supabase'

// ===================== TICKETS =====================
export async function fetchTickets({ limit = 50, offset = 0, agent = null, dateFrom = null, dateTo = null } = {}) {
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
export async function fetchOverviewStats(dateFrom = null, dateTo = null) {
    let ticketQuery = supabase.from('cc_tickets').select('*', { count: 'exact' })
    if (dateFrom) ticketQuery = ticketQuery.gte('received_at', dateFrom)
    if (dateTo) ticketQuery = ticketQuery.lte('received_at', dateTo)

    const { data: tickets, count: totalTickets } = await ticketQuery

    let analysisQuery = supabase.from('cc_analysis').select('*')
    if (tickets && tickets.length > 0) {
        const ticketIds = tickets.map(t => t.ticket_id)
        analysisQuery = analysisQuery.in('ticket_id', ticketIds)
    }

    const { data: analyses } = await analysisQuery

    // Calculate KPIs
    const totalChats = totalTickets || 0
    const transferred = tickets?.filter(t => t.transferred_to_agent).length || 0
    const transferRate = totalChats > 0 ? ((transferred / totalChats) * 100).toFixed(1) : 0

    const sentimentScores = analyses?.filter(a => a.sentiment_score !== null).map(a => a.sentiment_score) || []
    const avgSentiment = sentimentScores.length > 0
        ? (sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length).toFixed(2)
        : 0


    const responseTimes = analyses?.filter(a => a.first_response_time_seconds !== null).map(a => a.first_response_time_seconds) || []
    const avgResponseTime = responseTimes.length > 0
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : 0

    // Bot handoff metrics (time between bot last msg and human agent first msg)
    const handoffTimes = tickets?.filter(t => t.bot_handoff_seconds !== null && t.bot_handoff_seconds > 0).map(t => t.bot_handoff_seconds) || []
    const avgHandoffTime = handoffTimes.length > 0
        ? Math.round(handoffTimes.reduce((a, b) => a + b, 0) / handoffTimes.length)
        : 0
    const maxHandoffTime = handoffTimes.length > 0 ? Math.max(...handoffTimes) : 0
    const minHandoffTime = handoffTimes.length > 0 ? Math.min(...handoffTimes) : 0
    const handoffCount = handoffTimes.length

    // Sentiment distribution
    const sentimentDist = { positive: 0, neutral: 0, negative: 0, frustrated: 0 }
    analyses?.forEach(a => {
        if (a.overall_sentiment && sentimentDist.hasOwnProperty(a.overall_sentiment)) {
            sentimentDist[a.overall_sentiment]++
        }
    })

    // Intent distribution
    const intentDist = {}
    analyses?.forEach(a => {
        if (a.detected_intent) {
            intentDist[a.detected_intent] = (intentDist[a.detected_intent] || 0) + 1
        }
    })

    // Department distribution
    const deptDist = {}
    tickets?.forEach(t => {
        const dept = t.department_name || 'Sin departamento'
        deptDist[dept] = (deptDist[dept] || 0) + 1
    })

    // Bot path distribution (first choice)
    const botPathDist = {}
    analyses?.forEach(a => {
        const choice = a.bot_first_choice || 'No detectado'
        botPathDist[choice] = (botPathDist[choice] || 0) + 1
    })

    // Hourly distribution
    const hourlyDist = Array(24).fill(0)
    tickets?.forEach(t => {
        if (t.chat_started_at) {
            const hour = new Date(t.chat_started_at).getHours()
            hourlyDist[hour]++
        }
    })

    return {
        totalChats,
        transferRate: parseFloat(transferRate),
        avgSentiment: parseFloat(avgSentiment),
        avgProtocol: parseFloat(avgProtocol),
        avgResponseTime,
        avgHandoffTime,
        maxHandoffTime,
        minHandoffTime,
        handoffCount,
        sentimentDist,
        intentDist,
        deptDist,
        botPathDist,
        hourlyDist,
    }
}

// ===================== AGENT STATS =====================
export async function fetchAgentStats(dateFrom = null, dateTo = null) {
    let query = supabase
        .from('cc_tickets')
        .select(`
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
    `)
        .not('agent_name', 'is', null)

    if (dateFrom) query = query.gte('received_at', dateFrom)
    if (dateTo) query = query.lte('received_at', dateTo)

    const { data, error } = await query
    if (error) throw error

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
            if (analysis.agent_greeting) agent.greetings++
            if (analysis.agent_farewell) agent.farewells++
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
        greeting_rate: agent.total_chats > 0 ? ((agent.greetings / agent.total_chats) * 100).toFixed(0) : 0,
        farewell_rate: agent.total_chats > 0 ? ((agent.farewells / agent.total_chats) * 100).toFixed(0) : 0,
        top_keywords: Object.entries(agent.keywords).sort((a, b) => b[1] - a[1]).slice(0, 10),
        dominant_tone: Object.entries(agent.tones).sort((a, b) => b[1] - a[1])?.[0]?.[0] || 'N/A',
    })).sort((a, b) => b.total_chats - a.total_chats)
}

// ===================== BOT TREE STATS =====================
export async function fetchBotTreeStats(dateFrom = null, dateTo = null) {
    let query = supabase
        .from('cc_analysis')
        .select('bot_first_choice, bot_second_choice, bot_third_choice, bot_resolution, bot_path_depth')

    if (dateFrom || dateTo) {
        // We need to join with tickets for date filtering
        const ticketQuery = supabase.from('cc_tickets').select('ticket_id')
        if (dateFrom) ticketQuery.gte('received_at', dateFrom)
        if (dateTo) ticketQuery.lte('received_at', dateTo)
        const { data: filteredTickets } = await ticketQuery
        if (filteredTickets) {
            query = query.in('ticket_id', filteredTickets.map(t => t.ticket_id))
        }
    }

    const { data, error } = await query
    if (error) throw error

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
    const { data, error } = await supabase
        .from('cc_tickets')
        .select('agent_name')
        .not('agent_name', 'is', null)

    if (error) throw error

    const unique = [...new Set(data?.map(d => d.agent_name).filter(Boolean))]
    return unique.sort()
}

// ===================== PROBLEMATIC CHATS =====================
export async function fetchProblematicChats(dateFrom = null, dateTo = null) {
    let query = supabase
        .from('cc_tickets')
        .select(`
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
        `)
        .order('received_at', { ascending: false })

    if (dateFrom) query = query.gte('received_at', dateFrom)
    if (dateTo) query = query.lte('received_at', dateTo)

    const { data, error } = await query
    if (error) throw error

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
