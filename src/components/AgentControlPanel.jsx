import { useState, useEffect, useMemo } from 'react'
import {
    Clock, MessageSquare, Users, ChevronLeft, ChevronRight,
    Calendar, Download, Eye, ArrowUpRight, ArrowDownRight,
    Timer, AlertTriangle, Activity, Loader2, BarChart3, ChevronDown, ChevronUp, Fingerprint, MessageCircle
} from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import { fetchAgentActivity, fetchAgentActivityRange, fetchFichadasForAgents, fetchConversationsByTicketIds, fetchTicketMessages, exportToCSV } from '../services/dataService'

// ── Agent color from name (consistent with AgentsPanel) ──
function getAgentColor(name) {
    const hue = (name?.charCodeAt(0) || 0) * 15
    return {
        bg: `hsl(${hue}, 60%, 90%)`,
        text: `hsl(${hue}, 60%, 35%)`,
        accent: `hsl(${hue}, 65%, 55%)`,
    }
}

function formatTime(isoString) {
    if (!isoString) return '—'
    const d = new Date(isoString)
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatHours(hours) {
    if (!hours && hours !== 0) return '—'
    const h = Math.floor(hours)
    const m = Math.round((hours - h) * 60)
    if (h === 0) return `${m}min`
    return `${h}h ${m}m`
}

function formatDate(dateString) {
    const d = new Date(dateString + 'T12:00:00')
    return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
}

function formatShortDate(dateString) {
    const d = new Date(dateString + 'T12:00:00')
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

export default function AgentControlPanel() {
    const [mode, setMode] = useState('daily') // 'daily' | 'range'
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
    const [dailyData, setDailyData] = useState(null)
    const [rangeData, setRangeData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [expandedAgent, setExpandedAgent] = useState(null)
    const [fichadasData, setFichadasData] = useState({})

    // Range mode defaults to last 7 days
    const [dateFrom, setDateFrom] = useState(() => {
        const d = new Date()
        d.setDate(d.getDate() - 6)
        return d.toISOString().slice(0, 10)
    })
    const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10))

    const isToday = selectedDate === new Date().toISOString().slice(0, 10)

    useEffect(() => {
        if (mode === 'daily') loadDaily()
        else loadRange()
    }, [mode, selectedDate, dateFrom, dateTo])

    async function loadDaily() {
        try {
            setLoading(true)
            const [data, fichadas] = await Promise.all([
                fetchAgentActivity(selectedDate),
                fetchFichadasForAgents(selectedDate),
            ])
            setDailyData(data)
            setFichadasData(fichadas || {})
        } catch (err) {
            console.error('Error loading agent activity:', err)
        } finally {
            setLoading(false)
        }
    }

    async function loadRange() {
        try {
            setLoading(true)
            const data = await fetchAgentActivityRange(dateFrom, dateTo)
            setRangeData(data)
        } catch (err) {
            console.error('Error loading agent range:', err)
        } finally {
            setLoading(false)
        }
    }

    function goDay(offset) {
        const d = new Date(selectedDate + 'T12:00:00')
        d.setDate(d.getDate() + offset)
        setSelectedDate(d.toISOString().slice(0, 10))
    }

    // ── KPI calculations ──
    const kpis = useMemo(() => {
        if (mode === 'daily' && dailyData) {
            const agents = dailyData.agents || []
            const totalMsgs = agents.reduce((s, a) => s + a.total_messages, 0)
            const totalHrs = agents.reduce((s, a) => s + a.hours_worked, 0)
            const avgHrs = agents.length > 0 ? totalHrs / agents.length : 0
            const firstLogin = agents.length > 0 && agents[0].first_message
                ? formatTime(agents[0].first_message) : '—'
            // who worked the latest
            const lastAgent = [...agents].sort((a, b) => {
                if (!a.last_message) return 1
                if (!b.last_message) return -1
                return new Date(b.last_message) - new Date(a.last_message)
            })[0]
            const lastLogout = lastAgent?.last_message ? formatTime(lastAgent.last_message) : '—'

            return {
                agentsActive: agents.length,
                totalMessages: totalMsgs,
                avgHoursWorked: avgHrs,
                firstLogin,
                lastLogout,
            }
        }
        if (mode === 'range' && rangeData) {
            const totalMsgs = rangeData.reduce((s, a) => s + a.total_messages, 0)
            const totalDaysWorked = rangeData.reduce((s, a) => s + a.days_worked, 0)
            const avgHrsDay = rangeData.length > 0
                ? rangeData.reduce((s, a) => s + a.avg_hours_per_day, 0) / rangeData.length
                : 0
            return {
                agentsActive: rangeData.length,
                totalMessages: totalMsgs,
                avgHoursWorked: avgHrsDay,
                totalDaysWorked,
            }
        }
        return { agentsActive: 0, totalMessages: 0, avgHoursWorked: 0 }
    }, [mode, dailyData, rangeData])

    // ── Export ──
    function handleExport() {
        if (mode === 'daily' && dailyData) {
            const csv = dailyData.agents.map(a => ({
                agente: a.agent_name,
                fecha: dailyData.date,
                primer_mensaje: formatTime(a.first_message),
                ultimo_mensaje: formatTime(a.last_message),
                horas_trabajadas: formatHours(a.hours_worked),
                mensajes: a.total_messages,
                tickets: a.unique_tickets,
            }))
            exportToCSV(csv, `control_agentes_${dailyData.date}`)
        } else if (mode === 'range' && rangeData) {
            const csv = []
            rangeData.forEach(agent => {
                agent.daily_details.forEach(d => {
                    csv.push({
                        agente: agent.agent_name,
                        fecha: d.date,
                        primer_mensaje: formatTime(d.first_message),
                        ultimo_mensaje: formatTime(d.last_message),
                        horas: formatHours(d.hours_worked),
                        mensajes: d.total_messages,
                        tickets: d.unique_tickets,
                    })
                })
            })
            exportToCSV(csv, `control_agentes_${dateFrom}_a_${dateTo}`)
        }
    }

    // ── Agent hourly chart data ──
    function getHourlyChartData(hourlyBreakdown) {
        return hourlyBreakdown.map((count, hour) => ({
            hour: `${hour.toString().padStart(2, '0')}:00`,
            mensajes: count,
        })).filter((_, i) => i >= 6 && i <= 22) // Only show 6 AM to 10 PM
    }

    return (
        <div className="fade-in">
            {/* ── Mode toggle + date controls ── */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: '20px', flexWrap: 'wrap', gap: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Mode tabs */}
                    <div style={{
                        display: 'flex', borderRadius: '10px', overflow: 'hidden',
                        border: '1px solid #e2e8f0', background: '#f8fafc'
                    }}>
                        <button
                            onClick={() => setMode('daily')}
                            style={{
                                padding: '8px 18px', border: 'none', cursor: 'pointer',
                                fontSize: '13px', fontWeight: 600, fontFamily: 'inherit',
                                background: mode === 'daily' ? '#1a6bb5' : 'transparent',
                                color: mode === 'daily' ? 'white' : '#64748b',
                                transition: 'all 0.2s',
                            }}
                        >
                            <Calendar size={14} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
                            Vista Diaria
                        </button>
                        <button
                            onClick={() => setMode('range')}
                            style={{
                                padding: '8px 18px', border: 'none', cursor: 'pointer',
                                fontSize: '13px', fontWeight: 600, fontFamily: 'inherit',
                                background: mode === 'range' ? '#1a6bb5' : 'transparent',
                                color: mode === 'range' ? 'white' : '#64748b',
                                transition: 'all 0.2s',
                            }}
                        >
                            <BarChart3 size={14} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
                            Resumen Rango
                        </button>
                    </div>

                    {/* Date controls */}
                    {mode === 'daily' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                                onClick={() => goDay(-1)}
                                style={{
                                    padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0',
                                    background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center'
                                }}
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <div style={{
                                padding: '6px 16px', borderRadius: '8px', background: isToday ? '#eff6ff' : '#f8fafc',
                                border: `1px solid ${isToday ? '#93c5fd' : '#e2e8f0'}`,
                                fontSize: '13px', fontWeight: 600, color: isToday ? '#1a6bb5' : '#475569',
                                textTransform: 'capitalize', minWidth: '200px', textAlign: 'center',
                            }}>
                                {isToday && <span style={{
                                    fontSize: '10px', background: '#1a6bb5', color: 'white',
                                    padding: '2px 8px', borderRadius: '6px', marginRight: '8px',
                                    fontWeight: 700, textTransform: 'uppercase'
                                }}>HOY</span>}
                                {formatDate(selectedDate)}
                            </div>
                            <button
                                onClick={() => goDay(1)}
                                disabled={isToday}
                                style={{
                                    padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0',
                                    background: '#f8fafc', cursor: isToday ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', opacity: isToday ? 0.4 : 1
                                }}
                            >
                                <ChevronRight size={16} />
                            </button>
                            {!isToday && (
                                <button
                                    onClick={() => setSelectedDate(new Date().toISOString().slice(0, 10))}
                                    style={{
                                        padding: '6px 14px', borderRadius: '8px', border: '1px solid #93c5fd',
                                        background: '#eff6ff', cursor: 'pointer', fontSize: '12px',
                                        fontWeight: 600, color: '#1a6bb5', fontFamily: 'inherit',
                                    }}
                                >
                                    Ir a Hoy
                                </button>
                            )}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={e => setDateFrom(e.target.value)}
                                style={{
                                    padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0',
                                    fontSize: '13px', fontFamily: 'inherit', color: '#475569',
                                }}
                            />
                            <span style={{ fontSize: '13px', color: '#94a3b8' }}>→</span>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={e => setDateTo(e.target.value)}
                                max={new Date().toISOString().slice(0, 10)}
                                style={{
                                    padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0',
                                    fontSize: '13px', fontFamily: 'inherit', color: '#475569',
                                }}
                            />
                        </div>
                    )}
                </div>

                <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleExport}
                    title="Exportar a CSV"
                >
                    <Download size={14} /> CSV
                </button>
            </div>

            {/* ── Loading ── */}
            {loading && (
                <div className="loading-spinner">
                    <div className="spinner"></div>
                </div>
            )}

            {/* ── DAILY VIEW ── */}
            {!loading && mode === 'daily' && dailyData && (
                <>
                    {/* KPI Cards */}
                    <div className="kpi-grid" style={{ marginBottom: '24px' }}>
                        <div className="kpi-card">
                            <div className="kpi-icon" style={{ background: '#eff6ff', color: '#1a6bb5' }}>
                                <Users size={20} />
                            </div>
                            <div className="kpi-content">
                                <span className="kpi-label">Agentes Activos</span>
                                <span className="kpi-value">{kpis.agentsActive}</span>
                            </div>
                        </div>
                        <div className="kpi-card">
                            <div className="kpi-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                                <MessageSquare size={20} />
                            </div>
                            <div className="kpi-content">
                                <span className="kpi-label">Mensajes Respondidos</span>
                                <span className="kpi-value">{kpis.totalMessages}</span>
                            </div>
                        </div>
                        <div className="kpi-card">
                            <div className="kpi-icon" style={{ background: '#faf5ff', color: '#7c3aed' }}>
                                <Clock size={20} />
                            </div>
                            <div className="kpi-content">
                                <span className="kpi-label">Promedio Horas</span>
                                <span className="kpi-value">{formatHours(kpis.avgHoursWorked)}</span>
                            </div>
                        </div>
                        <div className="kpi-card">
                            <div className="kpi-icon" style={{ background: '#fefce8', color: '#ca8a04' }}>
                                <Timer size={20} />
                            </div>
                            <div className="kpi-content">
                                <span className="kpi-label">Primer / Último Login</span>
                                <span className="kpi-value" style={{ fontSize: '16px' }}>
                                    {kpis.firstLogin} — {kpis.lastLogout}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Agent Activity Table */}
                    {dailyData.agents.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
                            <AlertTriangle size={40} style={{ color: '#f59e0b', marginBottom: '16px' }} />
                            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>
                                Sin actividad registrada
                            </h3>
                            <p style={{ fontSize: '13px', color: '#64748b' }}>
                                No se encontraron mensajes de agentes humanos para el {formatDate(selectedDate)}
                            </p>
                        </div>
                    ) : (
                        <div className="card">
                            <div className="card-header">
                                <h3>
                                    <Activity size={18} style={{ marginRight: '8px', verticalAlign: '-3px', color: '#1a6bb5' }} />
                                    Detalle de Actividad por Agente
                                </h3>
                                <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                                    {dailyData.agents.length} agentes • {dailyData.total_messages} mensajes totales
                                </span>
                            </div>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Agente</th>
                                        <th title="Hora del primer mensaje enviado ese día">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <ArrowUpRight size={12} color="#16a34a" />
                                                Entrada
                                            </div>
                                        </th>
                                        <th title="Hora del último mensaje enviado ese día">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <ArrowDownRight size={12} color="#dc2626" />
                                                Salida
                                            </div>
                                        </th>
                                        <th title="Diferencia entre primer y último mensaje">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Clock size={12} />
                                                Horas Trabajadas
                                            </div>
                                        </th>
                                        <th title="Total de mensajes OUT enviados por este agente">Mensajes</th>
                                        <th title="Cantidad de tickets únicos en los que participó">Tickets</th>
                                        <th title="Fichada física del reloj (RRHH)">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Fingerprint size={12} color="#8b5cf6" />
                                                Fichada
                                            </div>
                                        </th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dailyData.agents.map(agent => {
                                        const colors = getAgentColor(agent.agent_name)
                                        const isExpanded = expandedAgent === agent.agent_name
                                        const fichada = fichadasData[agent.agent_name]
                                        return (
                                            <>
                                                <tr
                                                    key={agent.agent_name}
                                                    style={{ cursor: 'pointer' }}
                                                    onClick={() => setExpandedAgent(isExpanded ? null : agent.agent_name)}
                                                >
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                            <div style={{
                                                                width: '32px', height: '32px', borderRadius: '50%',
                                                                background: colors.bg, color: colors.text,
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                fontSize: '13px', fontWeight: 700, flexShrink: 0,
                                                            }}>
                                                                {agent.agent_name?.charAt(0) || '?'}
                                                            </div>
                                                            <span style={{ fontWeight: 600 }}>{agent.agent_name}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span style={{
                                                            padding: '4px 10px', borderRadius: '6px',
                                                            background: '#f0fdf4', color: '#16a34a',
                                                            fontWeight: 700, fontSize: '13px', fontFamily: 'monospace',
                                                        }}>
                                                            {formatTime(agent.first_message)}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span style={{
                                                            padding: '4px 10px', borderRadius: '6px',
                                                            background: '#fef2f2', color: '#dc2626',
                                                            fontWeight: 700, fontSize: '13px', fontFamily: 'monospace',
                                                        }}>
                                                            {formatTime(agent.last_message)}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <HoursBar hours={agent.hours_worked} />
                                                    </td>
                                                    <td>
                                                        <strong style={{ color: '#1e293b', fontSize: '15px' }}>
                                                            {agent.total_messages}
                                                        </strong>
                                                    </td>
                                                    <td>
                                                        <span className="badge info">{agent.unique_tickets}</span>
                                                    </td>
                                                    <td>
                                                        <FichadaBadge fichada={fichada} />
                                                    </td>
                                                    <td>
                                                        {isExpanded
                                                            ? <ChevronUp size={16} color="#94a3b8" />
                                                            : <ChevronDown size={16} color="#94a3b8" />
                                                        }
                                                    </td>
                                                </tr>
                                                {isExpanded && (
                                                    <tr key={`${agent.agent_name}-detail`}>
                                                        <td colSpan="8" style={{ padding: 0 }}>
                                                            <div style={{
                                                                background: '#f8fafc', padding: '20px',
                                                                borderTop: `2px solid ${colors.accent}`,
                                                            }}>
                                                                <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '12px' }}>
                                                                    📊 Distribución Horaria de Mensajes — {agent.agent_name}
                                                                </div>
                                                                <div style={{ height: '180px' }}>
                                                                    <ResponsiveContainer width="100%" height="100%">
                                                                        <BarChart data={getHourlyChartData(agent.hourly_breakdown)}>
                                                                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                                                            <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                                                                            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                                                                            <Tooltip
                                                                                contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                                                                                formatter={(value) => [`${value} mensajes`, 'Enviados']}
                                                                            />
                                                                            <Bar dataKey="mensajes" radius={[4, 4, 0, 0]}>
                                                                                {getHourlyChartData(agent.hourly_breakdown).map((entry, index) => (
                                                                                    <Cell
                                                                                        key={`cell-${index}`}
                                                                                        fill={entry.mensajes > 0 ? colors.accent : '#e2e8f0'}
                                                                                        fillOpacity={entry.mensajes > 0 ? 0.85 : 0.3}
                                                                                    />
                                                                                ))}
                                                                            </Bar>
                                                                        </BarChart>
                                                                    </ResponsiveContainer>
                                                                </div>
                                                                {/* Timeline visual */}
                                                                <div style={{ marginTop: '16px' }}>
                                                                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>
                                                                        Línea de Tiempo
                                                                    </div>
                                                                    <TimelineBar agent={agent} />
                                                                </div>
                                                                {/* Conversations section */}
                                                                <div style={{ marginTop: '16px' }}>
                                                                    <ConversationsSection agent={agent} colors={colors} />
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}

            {/* ── RANGE VIEW ── */}
            {!loading && mode === 'range' && rangeData && (
                <>
                    {/* KPI Cards */}
                    <div className="kpi-grid" style={{ marginBottom: '24px' }}>
                        <div className="kpi-card">
                            <div className="kpi-icon" style={{ background: '#eff6ff', color: '#1a6bb5' }}>
                                <Users size={20} />
                            </div>
                            <div className="kpi-content">
                                <span className="kpi-label">Agentes Activos</span>
                                <span className="kpi-value">{kpis.agentsActive}</span>
                            </div>
                        </div>
                        <div className="kpi-card">
                            <div className="kpi-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                                <MessageSquare size={20} />
                            </div>
                            <div className="kpi-content">
                                <span className="kpi-label">Total Mensajes</span>
                                <span className="kpi-value">{kpis.totalMessages}</span>
                            </div>
                        </div>
                        <div className="kpi-card">
                            <div className="kpi-icon" style={{ background: '#faf5ff', color: '#7c3aed' }}>
                                <Clock size={20} />
                            </div>
                            <div className="kpi-content">
                                <span className="kpi-label">Promedio Horas/Día</span>
                                <span className="kpi-value">{formatHours(kpis.avgHoursWorked)}</span>
                            </div>
                        </div>
                        <div className="kpi-card">
                            <div className="kpi-icon" style={{ background: '#fefce8', color: '#ca8a04' }}>
                                <Calendar size={20} />
                            </div>
                            <div className="kpi-content">
                                <span className="kpi-label">Total Jornadas</span>
                                <span className="kpi-value">{kpis.totalDaysWorked}</span>
                            </div>
                        </div>
                    </div>

                    {/* Agent Summary Table */}
                    {rangeData.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
                            <AlertTriangle size={40} style={{ color: '#f59e0b', marginBottom: '16px' }} />
                            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>Sin actividad en el rango</h3>
                        </div>
                    ) : (
                        <div className="card">
                            <div className="card-header">
                                <h3>
                                    <BarChart3 size={18} style={{ marginRight: '8px', verticalAlign: '-3px', color: '#1a6bb5' }} />
                                    Resumen por Agente ({dateFrom} → {dateTo})
                                </h3>
                            </div>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Agente</th>
                                        <th>Días Trabajados</th>
                                        <th>Total Mensajes</th>
                                        <th>Prom. Mensajes/Día</th>
                                        <th>Prom. Horas/Día</th>
                                        <th>Total Tickets</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rangeData.map(agent => {
                                        const colors = getAgentColor(agent.agent_name)
                                        const isExpanded = expandedAgent === agent.agent_name
                                        return (
                                            <>
                                                <tr
                                                    key={agent.agent_name}
                                                    style={{ cursor: 'pointer' }}
                                                    onClick={() => setExpandedAgent(isExpanded ? null : agent.agent_name)}
                                                >
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                            <div style={{
                                                                width: '32px', height: '32px', borderRadius: '50%',
                                                                background: colors.bg, color: colors.text,
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                fontSize: '13px', fontWeight: 700,
                                                            }}>
                                                                {agent.agent_name?.charAt(0)}
                                                            </div>
                                                            <span style={{ fontWeight: 600 }}>{agent.agent_name}</span>
                                                        </div>
                                                    </td>
                                                    <td><strong>{agent.days_worked}</strong></td>
                                                    <td><strong style={{ fontSize: '15px' }}>{agent.total_messages}</strong></td>
                                                    <td>
                                                        <span className="badge info">{agent.avg_messages_per_day}</span>
                                                    </td>
                                                    <td>
                                                        <HoursBar hours={agent.avg_hours_per_day} />
                                                    </td>
                                                    <td>
                                                        <span className="badge neutral">{agent.total_tickets}</span>
                                                    </td>
                                                    <td>
                                                        {isExpanded
                                                            ? <ChevronUp size={16} color="#94a3b8" />
                                                            : <ChevronDown size={16} color="#94a3b8" />
                                                        }
                                                    </td>
                                                </tr>
                                                {isExpanded && (
                                                    <tr key={`${agent.agent_name}-range-detail`}>
                                                        <td colSpan="7" style={{ padding: 0 }}>
                                                            <div style={{
                                                                background: '#f8fafc', padding: '20px',
                                                                borderTop: `2px solid ${colors.accent}`,
                                                            }}>
                                                                <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '12px' }}>
                                                                    📅 Detalle Diario — {agent.agent_name}
                                                                </div>
                                                                <table style={{
                                                                    width: '100%', borderCollapse: 'collapse',
                                                                    fontSize: '12px', background: 'white',
                                                                    borderRadius: '10px', overflow: 'hidden',
                                                                    border: '1px solid #e2e8f0'
                                                                }}>
                                                                    <thead>
                                                                        <tr style={{ background: '#f1f5f9' }}>
                                                                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Fecha</th>
                                                                            <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: '#16a34a' }}>Entrada</th>
                                                                            <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: '#dc2626' }}>Salida</th>
                                                                            <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>Horas</th>
                                                                            <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>Mensajes</th>
                                                                            <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>Tickets</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {agent.daily_details.map((day, i) => (
                                                                            <tr key={day.date} style={{ borderTop: '1px solid #e2e8f0' }}>
                                                                                <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1e293b', textTransform: 'capitalize' }}>
                                                                                    {new Date(day.date + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                                                                                </td>
                                                                                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                                                    <span style={{
                                                                                        padding: '2px 8px', borderRadius: '4px',
                                                                                        background: '#f0fdf4', color: '#16a34a',
                                                                                        fontWeight: 600, fontFamily: 'monospace', fontSize: '11px'
                                                                                    }}>
                                                                                        {formatTime(day.first_message)}
                                                                                    </span>
                                                                                </td>
                                                                                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                                                    <span style={{
                                                                                        padding: '2px 8px', borderRadius: '4px',
                                                                                        background: '#fef2f2', color: '#dc2626',
                                                                                        fontWeight: 600, fontFamily: 'monospace', fontSize: '11px'
                                                                                    }}>
                                                                                        {formatTime(day.last_message)}
                                                                                    </span>
                                                                                </td>
                                                                                <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>
                                                                                    {formatHours(day.hours_worked)}
                                                                                </td>
                                                                                <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#1a6bb5' }}>
                                                                                    {day.total_messages}
                                                                                </td>
                                                                                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                                                    {day.unique_tickets}
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                                {/* Conversations section */}
                                                                <div style={{ marginTop: '16px' }}>
                                                                    <ConversationsSection agent={agent} colors={colors} />
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

// ── Visual: Hours worked progress bar ──
function HoursBar({ hours }) {
    if (!hours && hours !== 0) return <span style={{ color: '#94a3b8' }}>—</span>
    // 8 hours = 100%, color gradient
    const pct = Math.min(100, (hours / 8) * 100)
    let barColor = '#10b981' // green
    if (hours < 4) barColor = '#f59e0b' // amber
    if (hours < 2) barColor = '#ef4444' // red
    if (hours >= 8) barColor = '#1a6bb5' // blue for full shift

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '120px' }}>
            <div style={{
                flex: 1, height: '8px', borderRadius: '4px',
                background: '#f1f5f9', overflow: 'hidden', minWidth: '60px'
            }}>
                <div style={{
                    width: `${pct}%`, height: '100%', borderRadius: '4px',
                    background: barColor, transition: 'width 0.5s ease',
                }} />
            </div>
            <span style={{ fontSize: '13px', fontWeight: 700, color: barColor, minWidth: '50px' }}>
                {formatHours(hours)}
            </span>
        </div>
    )
}

// ── Visual: Timeline bar showing work window ──
function TimelineBar({ agent }) {
    if (!agent.first_message || !agent.last_message) return null

    const first = new Date(agent.first_message)
    const last = new Date(agent.last_message)
    // Map 6:00 to 22:00 → 0% to 100%
    const rangeStartHour = 6
    const rangeEndHour = 22
    const totalRange = rangeEndHour - rangeStartHour

    const firstPct = Math.max(0, ((first.getHours() + first.getMinutes() / 60) - rangeStartHour) / totalRange * 100)
    const lastPct = Math.min(100, ((last.getHours() + last.getMinutes() / 60) - rangeStartHour) / totalRange * 100)

    const colors = getAgentColor(agent.agent_name)
    const hours = Array.from({ length: totalRange + 1 }, (_, i) => i + rangeStartHour)

    return (
        <div style={{ position: 'relative' }}>
            {/* Hour markers */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                {hours.map(h => (
                    <span key={h} style={{ fontSize: '9px', color: '#94a3b8', width: '30px', textAlign: 'center' }}>
                        {h}:00
                    </span>
                ))}
            </div>
            {/* Bar */}
            <div style={{
                position: 'relative', height: '24px', borderRadius: '6px',
                background: '#f1f5f9', overflow: 'hidden',
            }}>
                {/* Active window */}
                <div style={{
                    position: 'absolute',
                    left: `${firstPct}%`,
                    width: `${Math.max(1, lastPct - firstPct)}%`,
                    height: '100%',
                    background: `linear-gradient(135deg, ${colors.accent}cc, ${colors.accent}88)`,
                    borderRadius: '4px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <span style={{
                        fontSize: '10px', fontWeight: 700, color: 'white',
                        textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                        whiteSpace: 'nowrap', overflow: 'hidden',
                    }}>
                        {formatTime(agent.first_message)} — {formatTime(agent.last_message)}
                    </span>
                </div>
            </div>
        </div>
    )
}

// ── Visual: Fichada badge showing clock-in/clock-out from RRHH ──
function formatFichadaTime(timeStr) {
    if (!timeStr) return '—'
    // timeStr is TIME format like "08:30:00"
    const parts = timeStr.split(':')
    if (parts.length < 2) return timeStr
    return `${parts[0]}:${parts[1]}`
}

function FichadaBadge({ fichada }) {
    if (!fichada) {
        return (
            <span style={{
                padding: '4px 10px', borderRadius: '6px',
                background: '#f8fafc', color: '#cbd5e1',
                fontWeight: 600, fontSize: '11px',
            }}>
                Sin datos
            </span>
        )
    }

    const entrada = formatFichadaTime(fichada.fichada_entrada)
    const salida = formatFichadaTime(fichada.fichada_salida)
    const isTarde = fichada.tarde
    const horasFichada = fichada.horas_trabajadas_min
        ? `${Math.floor(fichada.horas_trabajadas_min / 60)}h ${fichada.horas_trabajadas_min % 60}m`
        : null

    return (
        <div
            style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}
            title={`Fichada física:\nEntrada: ${entrada}\nSalida: ${salida}${horasFichada ? `\nHoras: ${horasFichada}` : ''}${isTarde ? '\n⚠ Llegó tarde' : ''}`}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{
                    padding: '2px 8px', borderRadius: '4px',
                    background: isTarde ? '#fef3c7' : '#f5f3ff',
                    color: isTarde ? '#b45309' : '#7c3aed',
                    fontWeight: 700, fontSize: '11px', fontFamily: 'monospace',
                }}>
                    {entrada}
                </span>
                <span style={{ color: '#cbd5e1', fontSize: '10px' }}>→</span>
                <span style={{
                    padding: '2px 8px', borderRadius: '4px',
                    background: '#f5f3ff', color: '#7c3aed',
                    fontWeight: 700, fontSize: '11px', fontFamily: 'monospace',
                }}>
                    {salida}
                </span>
            </div>
            {isTarde && (
                <span style={{
                    fontSize: '9px', fontWeight: 700, color: '#b45309',
                    textTransform: 'uppercase', letterSpacing: '0.5px',
                }}>
                    ⚠ tarde
                </span>
            )}
        </div>
    )
}

// ── Collapsible: All conversations handled by an agent ──
function ConversationsSection({ agent, colors }) {
    const [expanded, setExpanded] = useState(false)
    const [conversations, setConversations] = useState(null)
    const [loading, setLoading] = useState(false)

    async function handleToggle() {
        if (expanded) {
            setExpanded(false)
            return
        }
        setExpanded(true)
        if (!conversations && agent.ticket_ids?.length > 0) {
            setLoading(true)
            try {
                const data = await fetchConversationsByTicketIds(agent.ticket_ids)
                setConversations(data)
            } catch (err) {
                console.error('Error loading conversations:', err)
            } finally {
                setLoading(false)
            }
        }
    }

    const ticketCount = agent.ticket_ids?.length || agent.unique_tickets || 0

    return (
        <div>
            <button
                onClick={handleToggle}
                style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    background: expanded ? colors.bg : '#ffffff',
                    border: `1px solid ${expanded ? colors.accent + '44' : '#e2e8f0'}`,
                    borderRadius: '8px', padding: '10px 14px',
                    cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                    color: expanded ? colors.text : '#475569',
                    width: '100%', fontFamily: 'inherit',
                    transition: 'all 0.2s',
                }}
            >
                <MessageCircle size={14} color={colors.accent} />
                Conversaciones Atendidas
                <span style={{
                    background: colors.accent, color: 'white',
                    padding: '2px 8px', borderRadius: '10px',
                    fontSize: '11px', fontWeight: 700,
                }}>
                    {ticketCount}
                </span>
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
            </button>

            {expanded && (
                <div style={{
                    marginTop: '8px',
                    maxHeight: '420px',
                    overflowY: 'auto',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    background: 'white',
                }}>
                    {loading && (
                        <div style={{ padding: '30px', textAlign: 'center' }}>
                            <Loader2 size={20} style={{ color: colors.accent, animation: 'spin 1s linear infinite' }} />
                            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px' }}>
                                Cargando conversaciones...
                            </div>
                        </div>
                    )}

                    {!loading && conversations && conversations.length === 0 && (
                        <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                            No se encontraron conversaciones
                        </div>
                    )}

                    {!loading && conversations && conversations.map((conv, idx) => (
                        <ConversationCard key={conv.ticket_id} conv={conv} isLast={idx === conversations.length - 1} />
                    ))}
                </div>
            )}
        </div>
    )
}

// ── Card: Single conversation in the agent's list (expandable with chat) ──
function ConversationCard({ conv, isLast }) {
    const [expanded, setExpanded] = useState(false)
    const [messages, setMessages] = useState(null)
    const [loadingMsgs, setLoadingMsgs] = useState(false)

    const analysis = conv.analysis
    const sentimentColor = {
        'positive': '#16a34a',
        'neutral': '#64748b',
        'negative': '#dc2626',
        'frustrated': '#dc2626',
    }[analysis?.overall_sentiment] || '#94a3b8'

    const sentimentBg = {
        'positive': '#f0fdf4',
        'neutral': '#f8fafc',
        'negative': '#fef2f2',
        'frustrated': '#fef2f2',
    }[analysis?.overall_sentiment] || '#f8fafc'

    const sentimentLabel = {
        'positive': 'Positivo',
        'neutral': 'Neutro',
        'negative': 'Negativo',
        'frustrated': 'Frustrado',
    }[analysis?.overall_sentiment] || analysis?.overall_sentiment || '—'

    const channelIcon = conv.channel === 'WHATSAPP' ? '📱' : '💻'
    const channelLabel = conv.channel === 'WHATSAPP' ? 'WhatsApp' : 'Web'
    const timeStr = conv.chat_started_at
        ? new Date(conv.chat_started_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
        : '—'

    async function handleToggleChat() {
        if (expanded) {
            setExpanded(false)
            return
        }
        setExpanded(true)
        if (!messages) {
            setLoadingMsgs(true)
            try {
                const data = await fetchTicketMessages(conv.ticket_id)
                setMessages(data)
            } catch (err) {
                console.error('Error loading messages:', err)
            } finally {
                setLoadingMsgs(false)
            }
        }
    }

    return (
        <div style={{ borderBottom: isLast ? 'none' : '1px solid #f1f5f9' }}>
            {/* Clickable header */}
            <div
                onClick={handleToggleChat}
                style={{
                    padding: '12px 16px',
                    display: 'flex', gap: '12px', alignItems: 'flex-start',
                    transition: 'background 0.15s',
                    cursor: 'pointer',
                    background: expanded ? '#f8fafc' : 'transparent',
                }}
                onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = '#fafbfc' }}
                onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = 'transparent' }}
            >
                {/* Left: sentiment color bar */}
                <div style={{
                    width: '4px', minHeight: '44px', borderRadius: '2px',
                    background: sentimentColor, flexShrink: 0, marginTop: '2px',
                }} />

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Top row: ticket ID, customer, time, channel */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        <span style={{
                            fontFamily: 'monospace', fontSize: '11px', fontWeight: 700,
                            color: '#1a6bb5', background: '#eff6ff',
                            padding: '2px 6px', borderRadius: '4px',
                        }}>
                            {conv.ticket_id}
                        </span>
                        <span style={{ fontWeight: 600, fontSize: '12px', color: '#1e293b' }}>
                            {conv.customer_name || 'Sin nombre'}
                        </span>
                        {conv.customer_phone && (
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                {conv.customer_phone}
                            </span>
                        )}
                        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                            <span>{channelIcon} {channelLabel}</span>
                            <span style={{ fontFamily: 'monospace' }}>{timeStr}</span>
                            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </span>
                    </div>

                    {/* Summary */}
                    {analysis?.conversation_summary && (
                        <p style={{
                            fontSize: '11px', color: '#64748b', margin: '0 0 6px 0',
                            lineHeight: '1.5',
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            display: '-webkit-box', WebkitLineClamp: expanded ? 'unset' : 2, WebkitBoxOrient: 'vertical',
                        }}>
                            {analysis.conversation_summary}
                        </p>
                    )}

                    {/* Bottom badges */}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{
                            fontSize: '10px', fontWeight: 600,
                            padding: '2px 8px', borderRadius: '4px',
                            background: sentimentBg, color: sentimentColor,
                        }}>
                            {sentimentLabel}
                        </span>
                        {analysis?.detected_intent && (
                            <span style={{
                                fontSize: '10px', fontWeight: 600,
                                padding: '2px 8px', borderRadius: '4px',
                                background: '#f5f3ff', color: '#7c3aed',
                            }}>
                                {analysis.detected_intent}
                            </span>
                        )}
                        {analysis?.message_count && (
                            <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                                {analysis.message_count} msgs
                            </span>
                        )}
                        <span style={{
                            fontSize: '10px', fontWeight: 600,
                            padding: '2px 8px', borderRadius: '4px',
                            background: conv.status === 'CLOSED' ? '#f1f5f9' : '#fefce8',
                            color: conv.status === 'CLOSED' ? '#64748b' : '#ca8a04',
                        }}>
                            {conv.status || '—'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Expanded chat messages */}
            {expanded && (
                <div style={{
                    padding: '0 16px 16px 32px',
                    background: '#f8fafc',
                    borderTop: '1px solid #f1f5f9',
                }}>
                    {loadingMsgs && (
                        <div style={{ padding: '20px', textAlign: 'center' }}>
                            <Loader2 size={16} style={{ color: '#64748b', animation: 'spin 1s linear infinite' }} />
                            <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '8px' }}>Cargando mensajes...</span>
                        </div>
                    )}
                    {!loadingMsgs && messages && messages.length === 0 && (
                        <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '11px' }}>
                            Sin mensajes registrados
                        </div>
                    )}
                    {!loadingMsgs && messages && messages.length > 0 && (
                        <div style={{
                            display: 'flex', flexDirection: 'column', gap: '6px',
                            maxHeight: '400px', overflowY: 'auto',
                            paddingTop: '12px',
                        }}>
                            {messages.map((msg, i) => (
                                <ChatBubble key={i} msg={msg} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ── Chat bubble for inline message view ──
function ChatBubble({ msg }) {
    const isOutgoing = msg.action === 'OUT'
    const timeStr = msg.message_timestamp
        ? new Date(msg.message_timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
        : ''

    return (
        <div style={{
            display: 'flex',
            justifyContent: isOutgoing ? 'flex-end' : 'flex-start',
        }}>
            <div style={{
                maxWidth: '78%',
                padding: '8px 12px',
                borderRadius: '12px',
                borderBottomRightRadius: isOutgoing ? '4px' : '12px',
                borderBottomLeftRadius: isOutgoing ? '12px' : '4px',
                background: isOutgoing ? '#eff6ff' : 'white',
                border: `1px solid ${isOutgoing ? '#bfdbfe' : '#e2e8f0'}`,
                fontSize: '12px',
                lineHeight: '1.5',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            }}>
                <div style={{
                    fontSize: '10px', fontWeight: 700,
                    color: isOutgoing ? '#1a6bb5' : '#64748b',
                    marginBottom: '2px',
                }}>
                    {msg.sender_name || (isOutgoing ? 'Agente' : 'Cliente')}
                </div>
                <div style={{ color: '#1e293b', wordBreak: 'break-word' }}>
                    {msg.message}
                </div>
                <div style={{ fontSize: '9px', color: '#94a3b8', textAlign: 'right', marginTop: '3px' }}>
                    {timeStr}
                </div>
            </div>
        </div>
    )
}
