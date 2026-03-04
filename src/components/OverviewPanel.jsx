import { useState, useEffect } from 'react'
import {
    MessageSquare, ArrowRightLeft, Smile, Shield, Clock,
    TrendingUp, TrendingDown, AlertTriangle, Download, Zap, ChevronRight, Timer
} from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, AreaChart, Area, Legend
} from 'recharts'
import { fetchOverviewStats, fetchProblematicChats, exportToCSV } from '../services/dataService'
import { format } from 'date-fns'
import DateFilter from './DateFilter'

const SENTIMENT_COLORS = {
    positive: '#10b981',
    neutral: '#64748b',
    negative: '#ef4444',
    frustrated: '#dc2626',
}

const PIE_COLORS = ['#1a6bb5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

export default function OverviewPanel({ onNavigateToChat }) {
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const [dateFrom, setDateFrom] = useState(null)
    const [dateTo, setDateTo] = useState(null)
    const [problems, setProblems] = useState([])

    useEffect(() => {
        loadAll()
    }, [dateFrom, dateTo])

    async function loadAll() {
        try {
            setLoading(true)
            const [statsData, problemsData] = await Promise.all([
                fetchOverviewStats(dateFrom, dateTo),
                fetchProblematicChats(dateFrom, dateTo),
            ])
            setStats(statsData)
            setProblems(problemsData)
        } catch (err) {
            console.error('Error loading overview:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleDateChange = (from, to) => {
        setDateFrom(from)
        setDateTo(to)
    }

    if (loading) {
        return (
            <div className="loading-spinner"><div className="spinner"></div></div>
        )
    }

    if (!stats || stats.totalChats === 0) {
        return (
            <div className="empty-state">
                <MessageSquare />
                <h3>Sin datos todavía</h3>
                <p>
                    Cuando AsisteClick comience a enviar webhooks, los datos aparecerán aquí automáticamente.
                    Configura el webhook apuntando a tu Edge Function.
                </p>
            </div>
        )
    }

    // Chart data
    const sentimentData = Object.entries(stats.sentimentDist).map(([key, value]) => ({
        name: key.charAt(0).toUpperCase() + key.slice(1), value,
        color: SENTIMENT_COLORS[key],
    }))

    const intentData = Object.entries(stats.intentDist)
        .sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([name, value]) => ({ name, value }))

    const hourlyData = stats.hourlyDist.map((count, hour) => ({
        hour: `${hour.toString().padStart(2, '0')}:00`, chats: count,
    }))

    const botPathData = Object.entries(stats.botPathDist)
        .sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }))

    const deptData = Object.entries(stats.deptDist)
        .sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }))

    const formatSeconds = (seconds) => {
        if (!seconds) return '—'
        if (seconds < 60) return `${seconds}s`
        const min = Math.floor(seconds / 60)
        const sec = seconds % 60
        return `${min}m ${sec}s`
    }

    // Semaphore logic
    const getSemaphore = (metric, value) => {
        switch (metric) {
            case 'sentiment': return value >= 0.3 ? 'green' : value >= 0 ? 'yellow' : 'red'
            case 'protocol': return value >= 8 ? 'green' : value >= 6 ? 'yellow' : 'red'
            case 'transfer': return value <= 30 ? 'green' : value <= 60 ? 'yellow' : 'red'
            case 'response': return value <= 30 ? 'green' : value <= 120 ? 'yellow' : 'red'
            case 'handoff': return value <= 300 ? 'green' : value <= 900 ? 'yellow' : 'red' // 5min / 15min
            default: return 'green'
        }
    }

    // Export handler
    const handleExport = () => {
        if (!problems.length) return
        exportToCSV(problems.map(p => ({
            ticket_id: p.ticket_id,
            cliente: p.customer_name,
            agente: p.agent_name || 'Bot',
            sentimiento: p.analysis?.overall_sentiment,
            score_sentimiento: p.analysis?.sentiment_score,
            protocolo: p.analysis?.agent_protocol_score,
            intencion: p.analysis?.detected_intent,
            resumen: p.analysis?.conversation_summary,
            razones: p.reasons.join('; '),
            fecha: p.received_at,
        })), 'chats_problematicos')
    }

    return (
        <div className="fade-in">
            {/* Date Filter */}
            <DateFilter dateFrom={dateFrom} dateTo={dateTo} onChange={handleDateChange} />

            {/* Executive Summary Card */}
            <div className="exec-card" style={{ marginBottom: '20px' }}>
                <div className="exec-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Zap size={16} color="#1a6bb5" />
                        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>Resumen Ejecutivo</h3>
                    </div>
                    {problems.length > 0 && (
                        <span className="quality-alert danger">
                            <AlertTriangle size={11} /> {problems.length} chat{problems.length > 1 ? 's' : ''} problemático{problems.length > 1 ? 's' : ''}
                        </span>
                    )}
                </div>
                <div className="exec-kpis">
                    <div className="exec-kpi">
                        <div className="exec-kpi-value">{stats.totalChats}</div>
                        <div className="exec-kpi-label">Chats Totales</div>
                    </div>
                    <div className="exec-kpi">
                        <div className="exec-kpi-value">
                            <span className={`semaphore ${getSemaphore('transfer', stats.transferRate)}`}></span>
                            {stats.transferRate}%
                        </div>
                        <div className="exec-kpi-label">Tasa Transferencia</div>
                    </div>
                    <div className="exec-kpi">
                        <div className="exec-kpi-value">
                            <span className={`semaphore ${getSemaphore('sentiment', stats.avgSentiment)}`}></span>
                            {stats.avgSentiment}
                        </div>
                        <div className="exec-kpi-label">Sentimiento Prom.</div>
                    </div>
                    <div className="exec-kpi">
                        <div className="exec-kpi-value">
                            <span className={`semaphore ${getSemaphore('protocol', stats.avgProtocol)}`}></span>
                            {stats.avgProtocol}<span style={{ fontSize: '14px', color: '#94a3b8' }}>/10</span>
                        </div>
                        <div className="exec-kpi-label">Protocolo Prom.</div>
                    </div>
                    <div className="exec-kpi">
                        <div className="exec-kpi-value">
                            <span className={`semaphore ${getSemaphore('response', stats.avgResponseTime)}`}></span>
                            {formatSeconds(stats.avgResponseTime)}
                        </div>
                        <div className="exec-kpi-label">1ª Respuesta</div>
                    </div>
                    {stats.handoffCount > 0 && (
                        <div className="exec-kpi">
                            <div className="exec-kpi-value">
                                <span className={`semaphore ${getSemaphore('handoff', stats.avgHandoffTime)}`}></span>
                                {formatSeconds(stats.avgHandoffTime)}
                            </div>
                            <div className="exec-kpi-label">Handoff Bot→Agente</div>
                        </div>
                    )}
                </div>
            </div>

            {/* KPIs (detailed) */}
            <div className="kpi-grid stagger">
                <div className="kpi-card">
                    <div className="kpi-icon blue"><MessageSquare size={22} /></div>
                    <div className="kpi-info">
                        <div className="kpi-label" title="Cantidad total de conversaciones recibidas a través de todos los canales (WhatsApp, Web, etc.)">Total Chats</div>
                        <div className="kpi-value">{stats.totalChats}</div>
                    </div>
                </div>

                <div className="kpi-card">
                    <div className="kpi-icon yellow"><ArrowRightLeft size={22} /></div>
                    <div className="kpi-info">
                        <div className="kpi-label" title="Porcentaje de conversaciones que el bot no pudo resolver solo y fueron derivadas a un agente humano.">Tasa Transferencia</div>
                        <div className="kpi-value">{stats.transferRate}%</div>
                        <div className={`kpi-change ${stats.transferRate > 50 ? 'negative' : 'positive'}`}>
                            {stats.transferRate > 50
                                ? <><TrendingUp size={12} /> Alta transferencia</>
                                : <><TrendingDown size={12} /> Buen nivel</>
                            }
                        </div>
                    </div>
                </div>

                <div className="kpi-card">
                    <div className="kpi-icon green"><Smile size={22} /></div>
                    <div className="kpi-info">
                        <div className="kpi-label" title="Promedio de satisfacción de los pacientes. Se mide de -1.0 (muy insatisfecho) a +1.0 (muy satisfecho).">Sentimiento Promedio</div>
                        <div className="kpi-value">{stats.avgSentiment}</div>
                        <div className={`kpi-change ${stats.avgSentiment >= 0 ? 'positive' : 'negative'}`}>
                            {stats.avgSentiment >= 0 ? 'Positivo' : 'Negativo'}
                        </div>
                    </div>
                </div>

                <div className="kpi-card">
                    <div className="kpi-icon blue"><Shield size={22} /></div>
                    <div className="kpi-info">
                        <div className="kpi-label" title="Promedio de cumplimiento de protocolo de los agentes (0 a 10). Evalúa saludo, presentación, escucha activa, resolución y despedida.">Score Protocolo</div>
                        <div className="kpi-value">{stats.avgProtocol}<span style={{ fontSize: '14px', color: '#94a3b8' }}>/10</span></div>
                    </div>
                </div>

                <div className="kpi-card">
                    <div className="kpi-icon yellow"><Clock size={22} /></div>
                    <div className="kpi-info">
                        <div className="kpi-label" title="Tiempo promedio que tarda un agente en enviar su primer mensaje después de recibir la conversación del bot.">Tiempo 1ª Respuesta</div>
                        <div className="kpi-value">{formatSeconds(stats.avgResponseTime)}</div>
                    </div>
                </div>

                {stats.handoffCount > 0 && (
                    <div className="kpi-card">
                        <div className="kpi-icon" style={{ background: '#fef3c7', color: '#d97706' }}><Timer size={22} /></div>
                        <div className="kpi-info">
                            <div className="kpi-label" title="Tiempo promedio entre el último mensaje del bot y el primer mensaje del agente humano. Mide cuánto espera el paciente después de que el bot termina.">Handoff Bot → Agente</div>
                            <div className="kpi-value">{formatSeconds(stats.avgHandoffTime)}</div>
                            <div className={`kpi-change ${stats.avgHandoffTime <= 300 ? 'positive' : 'negative'}`}>
                                {stats.avgHandoffTime <= 300
                                    ? <><TrendingDown size={12} /> Buen tiempo</>
                                    : <><TrendingUp size={12} /> Espera alta</>
                                }
                            </div>
                            <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                                Min: {formatSeconds(stats.minHandoffTime)} • Max: {formatSeconds(stats.maxHandoffTime)} • {stats.handoffCount} chats
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Problematic Chats Section */}
            {problems.length > 0 && (
                <div className="card" style={{ marginTop: '20px', marginBottom: '20px' }}>
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <AlertTriangle size={16} color="#ef4444" />
                            <h3 style={{ margin: 0 }}>
                                ⚠️ Chats Problemáticos
                                <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: 600, marginLeft: '8px' }}>
                                    {problems.length}
                                </span>
                            </h3>
                        </div>
                        <button className="btn btn-secondary btn-sm" onClick={handleExport} title="Exportar a Excel/CSV">
                            <Download size={14} /> CSV
                        </button>
                    </div>
                    <div className="card-body">
                        <div className="problem-list">
                            {problems.slice(0, 10).map(p => (
                                <div
                                    key={p.ticket_id}
                                    className="problem-item"
                                    style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                                    onClick={() => onNavigateToChat?.(p.ticket_id)}
                                    onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                                    onMouseLeave={e => e.currentTarget.style.background = ''}
                                    title="Click para ver la conversación completa"
                                >
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                            <code style={{ fontSize: '11px', background: '#fee2e2', padding: '2px 6px', borderRadius: '4px', color: '#991b1b' }}>
                                                {p.ticket_id}
                                            </code>
                                            <span style={{ fontSize: '12px', fontWeight: 600 }}>{p.customer_name || '—'}</span>
                                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>{p.agent_name || 'Bot'}</span>
                                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                                {p.received_at ? format(new Date(p.received_at), 'dd/MM HH:mm') : ''}
                                            </span>
                                        </div>
                                        <div className="problem-reasons">
                                            {p.reasons.map((r, i) => (
                                                <span key={i} className="problem-reason">{r}</span>
                                            ))}
                                        </div>
                                        {p.analysis?.conversation_summary && (
                                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', fontStyle: 'italic' }}>
                                                {p.analysis.conversation_summary}
                                            </div>
                                        )}
                                    </div>
                                    <ChevronRight size={16} color="#ef4444" style={{ flexShrink: 0, opacity: 0.6 }} />
                                </div>
                            ))}
                            {problems.length > 10 && (
                                <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '8px' }}>
                                    ... y {problems.length - 10} más
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Charts Row 1 */}
            <div className="grid-2">
                <div className="card">
                    <div className="card-header">
                        <h3 title="Distribución de la cantidad de chats recibidos por cada hora del día.">Chats por Hora del Día</h3>
                    </div>
                    <div className="card-body">
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={hourlyData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="hour" tick={{ fontSize: 11 }} interval={2} />
                                    <YAxis tick={{ fontSize: 11 }} />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                                    <Area type="monotone" dataKey="chats" stroke="#1a6bb5" fill="#1a6bb5" fillOpacity={0.15} strokeWidth={2} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="card-header">
                        <h3 title="Proporción de pacientes con experiencia positiva, neutra, negativa o frustrada.">Distribución de Sentimiento</h3>
                    </div>
                    <div className="card-body">
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={sentimentData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value"
                                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                        {sentimentData.map((entry, i) => (
                                            <Cell key={i} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts Row 2 */}
            <div className="grid-2">
                <div className="card">
                    <div className="card-header">
                        <h3 title="Motivos más frecuentes por los cuales los pacientes se comunican.">Intenciones Detectadas</h3>
                    </div>
                    <div className="card-body">
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={intentData} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis type="number" tick={{ fontSize: 11 }} />
                                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                                    <Bar dataKey="value" fill="#1a6bb5" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="card-header">
                        <h3>Primer Camino del Bot</h3>
                    </div>
                    <div className="card-body">
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={botPathData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value"
                                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                        {botPathData.map((entry, i) => (
                                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>

            {/* Department Distribution */}
            {deptData.length > 0 && (
                <div className="card" style={{ marginBottom: '24px' }}>
                    <div className="card-header">
                        <h3>Distribución por Departamento</h3>
                    </div>
                    <div className="card-body">
                        <div className="chart-container-sm">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={deptData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 11 }} />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                                    <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
