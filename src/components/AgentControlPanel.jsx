import { useState, useEffect, useMemo } from 'react'
import {
    Clock, MessageSquare, Users, ChevronLeft, ChevronRight,
    Calendar, Download, Eye, ArrowUpRight, ArrowDownRight,
    Timer, AlertTriangle, Activity, Loader2, BarChart3, ChevronDown, ChevronUp
} from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import { fetchAgentActivity, fetchAgentActivityRange, exportToCSV } from '../services/dataService'

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
            const data = await fetchAgentActivity(selectedDate)
            setDailyData(data)
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
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dailyData.agents.map(agent => {
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
                                                        {isExpanded
                                                            ? <ChevronUp size={16} color="#94a3b8" />
                                                            : <ChevronDown size={16} color="#94a3b8" />
                                                        }
                                                    </td>
                                                </tr>
                                                {isExpanded && (
                                                    <tr key={`${agent.agent_name}-detail`}>
                                                        <td colSpan="7" style={{ padding: 0 }}>
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
