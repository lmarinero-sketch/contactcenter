import { useState, useEffect, useMemo } from 'react'
import {
    MessageSquare, Smile, Clock,
    TrendingUp, TrendingDown, AlertTriangle, Download, Zap, ChevronRight, Timer,
    CalendarDays, Bot, Activity, Search, Users, BarChart3, UserCheck
} from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, AreaChart, Area, Legend, LineChart, Line, ComposedChart,
    ReferenceLine
} from 'recharts'
import { fetchOverviewRawData, computeOverviewStats, exportToCSV } from '../services/dataService'
import { format } from 'date-fns'
import DateFilter from './DateFilter'

const SENTIMENT_COLORS = {
    positive: '#10b981',
    neutral: '#64748b',
    negative: '#ef4444',
    frustrated: '#dc2626',
}

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const HEATMAP_HOURS = Array.from({ length: 14 }, (_, i) => i + 7)

function getHeatmapColor(value, max) {
    if (value === 0) return '#f8fafc'
    const intensity = Math.min(value / Math.max(max, 1), 1)
    if (intensity < 0.25) return '#dbeafe'
    if (intensity < 0.5) return '#93c5fd'
    if (intensity < 0.75) return '#3b82f6'
    return '#1d4ed8'
}

export default function OverviewPanel({ onNavigateToChat }) {
    // Raw data — loaded ONCE
    const [rawData, setRawData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState(null)

    // Filter state — changes trigger instant recalc, no fetch
    const [dateFrom, setDateFrom] = useState(null)
    const [dateTo, setDateTo] = useState(null)

    // Load raw data once on mount
    useEffect(() => {
        let mounted = true
        let timeoutId = null

        async function load() {
            try {
                setLoading(true)
                setLoadError(null)

                // Safety timeout — 25s max for data loading
                timeoutId = setTimeout(() => {
                    if (mounted && loading) {
                        setLoadError('La carga de datos tardó demasiado. Intentá nuevamente.')
                        setLoading(false)
                    }
                }, 25000)

                const data = await fetchOverviewRawData()
                if (mounted) {
                    setRawData(data)
                    setLoadError(null)
                }
            } catch (err) {
                console.error('Error loading overview:', err)
                if (mounted) {
                    setLoadError(err.message || 'Error al cargar los datos')
                }
            } finally {
                if (mounted) setLoading(false)
                if (timeoutId) clearTimeout(timeoutId)
            }
        }
        load()

        return () => {
            mounted = false
            if (timeoutId) clearTimeout(timeoutId)
        }
    }, [])

    // Compute stats instantly when filters change — no spinner, no refetch
    const stats = useMemo(() => {
        if (!rawData) return null
        return computeOverviewStats(rawData.allTickets, rawData.allAnalyses, dateFrom, dateTo)
    }, [rawData, dateFrom, dateTo])

    const problems = stats?.problematicChats || []

    const handleDateChange = (from, to) => {
        setDateFrom(from)
        setDateTo(to)
    }

    if (loading) {
        return (
            <div className="loading-spinner"><div className="spinner"></div></div>
        )
    }

    if (loadError) {
        return (
            <div className="empty-state">
                <AlertTriangle color="#ef4444" />
                <h3>Error al cargar datos</h3>
                <p>{loadError}</p>
                <button className="btn btn-primary" style={{ marginTop: '12px' }}
                    onClick={() => window.location.reload()}>
                    Reintentar
                </button>
            </div>
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

    const reorderedDays = [1, 2, 3, 4, 5, 6, 0]
    const maxDayCount = Math.max(...(stats.dailyDist || [0]))
    const dailyData = reorderedDays.map(dayIndex => ({
        name: DAY_LABELS[dayIndex],
        chats: stats.dailyDist?.[dayIndex] || 0,
        fill: stats.dailyDist?.[dayIndex] === maxDayCount && maxDayCount > 0 ? '#0d9488' : '#5eead4',
    }))

    const trendData = (stats.weeklyTrend || []).map(w => ({
        name: w.label, chats: w.chats,
    }))

    const sentTrendData = (stats.sentimentTrend || []).map(w => ({
        name: w.label, score: w.avgScore, negativeRate: w.negativeRate,
    }))

    const forecastData = stats.forecast || []
    const heatmapMax = Math.max(...(stats.heatmapData || []).flat().filter(Boolean), 1)

    const formatSeconds = (seconds) => {
        if (!seconds) return '—'
        if (seconds < 60) return `${seconds}s`
        const min = Math.floor(seconds / 60)
        const sec = seconds % 60
        return `${min}m ${sec}s`
    }

    const getSemaphore = (metric, value) => {
        switch (metric) {
            case 'sentiment': return value >= 0.3 ? 'green' : value >= 0 ? 'yellow' : 'red'
            case 'handoff': return value <= 300 ? 'green' : value <= 900 ? 'yellow' : 'red'
            default: return 'green'
        }
    }

    const handleExport = () => {
        if (!problems.length) return
        exportToCSV(problems.map(p => ({
            ticket_id: p.ticket_id,
            cliente: p.customer_name,
            agente: p.agent_name || 'Bot',
            sentimiento: p.analysis?.overall_sentiment,
            score_sentimiento: p.analysis?.sentiment_score,
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

            {/* ═══ EXECUTIVE SUMMARY ═══ */}
            <div className="exec-card" style={{ marginBottom: '20px' }}>
                <div className="exec-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Zap size={16} color="#1a6bb5" />
                        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>Resumen Ejecutivo</h3>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {stats.weeklyVariation !== 0 && (
                            <span className={`quality-alert ${stats.weeklyVariation > 0 ? 'info' : 'warning'}`}>
                                {stats.weeklyVariation > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                                {stats.weeklyVariation > 0 ? '+' : ''}{stats.weeklyVariation}% vs semana pasada
                            </span>
                        )}
                        {problems.length > 0 && (
                            <span className="quality-alert danger">
                                <AlertTriangle size={11} /> {problems.length} chat{problems.length > 1 ? 's' : ''} problemático{problems.length > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                </div>
                <div className="exec-kpis">
                    <div className="exec-kpi">
                        <div className="exec-kpi-value">{stats.totalChats}</div>
                        <div className="exec-kpi-label">Chats Únicos</div>
                        {stats.totalTickets && stats.totalTickets !== stats.totalChats && (
                            <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                                {stats.totalTickets} conversaciones
                            </div>
                        )}
                    </div>
                    <div className="exec-kpi">
                        <div className="exec-kpi-value">
                            <span className={`semaphore ${getSemaphore('sentiment', stats.avgSentiment)}`}></span>
                            {stats.avgSentiment}
                        </div>
                        <div className="exec-kpi-label">Sentimiento Prom.</div>
                    </div>
                    <div className="exec-kpi">
                        <div className="exec-kpi-value">{stats.botResolutionRate}%</div>
                        <div className="exec-kpi-label">Resolución Bot</div>
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
                    <div className="exec-kpi">
                        <div className="exec-kpi-value">{stats.totalToday || 0}</div>
                        <div className="exec-kpi-label">Chats Hoy</div>
                    </div>
                </div>
            </div>

            {/* ═══ SMART ALERTS ═══ */}
            {stats.alerts && stats.alerts.length > 0 && (
                <div className="card" style={{ marginBottom: '20px' }}>
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Activity size={16} color="#f59e0b" />
                            <h3 style={{ margin: 0 }}>Alertas Inteligentes</h3>
                        </div>
                    </div>
                    <div className="card-body" style={{ padding: '12px 20px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {stats.alerts.map((alert, i) => (
                                <div key={i} className={`smart-alert smart-alert--${alert.type}`}>
                                    <span className="smart-alert-icon">{alert.icon}</span>
                                    <span className="smart-alert-msg">{alert.message}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ ROW 1: WEEKLY TREND + FORECAST ═══ */}
            <div className="grid-2">
                <div className="card">
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <TrendingUp size={16} color="#1a6bb5" />
                            <h3 style={{ margin: 0 }}>Tendencia Semanal (8 semanas)</h3>
                        </div>
                    </div>
                    <div className="card-body">
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={trendData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 11 }} />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                                    <Area type="monotone" dataKey="chats" stroke="#1a6bb5" fill="#1a6bb5" fillOpacity={0.12} strokeWidth={2.5}
                                        name="Chats" dot={{ r: 4, fill: '#1a6bb5' }} animationDuration={600} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <BarChart3 size={16} color="#8b5cf6" />
                            <h3 style={{ margin: 0 }}>🔮 Pronóstico Próximos 7 Días</h3>
                        </div>
                    </div>
                    <div className="card-body">
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={forecastData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="day" tick={{ fontSize: 12, fontWeight: 500 }} />
                                    <YAxis tick={{ fontSize: 11 }} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                                        formatter={(value, name) => [
                                            `${value} chats`,
                                            name === 'predicted' ? 'Pronóstico' : 'Promedio histórico'
                                        ]}
                                        labelFormatter={(label, payload) => {
                                            const item = payload?.[0]?.payload
                                            return item ? `${label} ${item.date}` : label
                                        }}
                                    />
                                    <Bar dataKey="predicted" fill="#8b5cf6" radius={[6, 6, 0, 0]} name="predicted" animationDuration={600} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ ROW 2: HEATMAP + CHATS POR DÍA ═══ */}
            <div className="grid-2">
                <div className="card">
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <CalendarDays size={16} color="#0d9488" />
                            <h3 style={{ margin: 0 }}>Mapa de Calor — Demanda</h3>
                        </div>
                    </div>
                    <div className="card-body">
                        <div className="heatmap-container">
                            <div className="heatmap-grid">
                                <div className="heatmap-label"></div>
                                {HEATMAP_HOURS.map(h => (
                                    <div key={h} className="heatmap-hour-label">{h}</div>
                                ))}
                                {[1, 2, 3, 4, 5, 6, 0].map(dayIdx => (
                                    <>
                                        <div key={`label-${dayIdx}`} className="heatmap-day-label">{DAY_LABELS[dayIdx]}</div>
                                        {HEATMAP_HOURS.map(h => {
                                            const val = stats.heatmapData?.[dayIdx]?.[h] || 0
                                            return (
                                                <div
                                                    key={`${dayIdx}-${h}`}
                                                    className="heatmap-cell"
                                                    style={{ background: getHeatmapColor(val, heatmapMax), transition: 'background 0.4s ease' }}
                                                    title={`${DAY_LABELS[dayIdx]} ${h}:00 — ${val} chats`}
                                                >
                                                    {val > 0 && <span className="heatmap-cell-value">{val}</span>}
                                                </div>
                                            )
                                        })}
                                    </>
                                ))}
                            </div>
                            <div className="heatmap-legend">
                                <span style={{ fontSize: '10px', color: '#94a3b8' }}>Menos</span>
                                {['#f8fafc', '#dbeafe', '#93c5fd', '#3b82f6', '#1d4ed8'].map((c, i) => (
                                    <div key={i} style={{ width: 16, height: 10, background: c, borderRadius: 2, border: '1px solid #e2e8f0' }} />
                                ))}
                                <span style={{ fontSize: '10px', color: '#94a3b8' }}>Más</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <CalendarDays size={16} color="#0d9488" />
                            <h3 style={{ margin: 0 }}>Chats por Día de la Semana</h3>
                        </div>
                    </div>
                    <div className="card-body">
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={dailyData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 500 }} />
                                    <YAxis tick={{ fontSize: 11 }} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                                        formatter={(value) => [`${value} chats`, 'Cantidad']}
                                    />
                                    <Bar dataKey="chats" radius={[6, 6, 0, 0]} animationDuration={600}>
                                        {dailyData.map((entry, i) => (
                                            <Cell key={i} fill={entry.fill} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ ROW 3: SENTIMENT TREND + DISTRIBUTION ═══ */}
            <div className="grid-2">
                <div className="card">
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Smile size={16} color="#10b981" />
                            <h3 style={{ margin: 0 }}>Evolución del Sentimiento (8 semanas)</h3>
                        </div>
                    </div>
                    <div className="card-body">
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={sentTrendData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} domain={[-1, 1]} />
                                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} unit="%" />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                                    <ReferenceLine yAxisId="left" y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                                    <Area yAxisId="left" type="monotone" dataKey="score" stroke="#10b981" fill="#10b981" fillOpacity={0.1}
                                        strokeWidth={2} name="Score promedio" dot={{ r: 3 }} animationDuration={600} />
                                    <Line yAxisId="right" type="monotone" dataKey="negativeRate" stroke="#ef4444"
                                        strokeWidth={2} name="% Negativos" dot={{ r: 3 }} strokeDasharray="4 2" animationDuration={600} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <UserCheck size={16} color="#1a6bb5" />
                            <h3 style={{ margin: 0 }}>Top Agentes</h3>
                        </div>
                    </div>
                    <div className="card-body">
                        <div className="chart-container">
                            {stats.agentDist && stats.agentDist.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={stats.agentDist} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis type="number" tick={{ fontSize: 11 }} />
                                        <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} />
                                        <Tooltip
                                            contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                                            formatter={(value) => [`${value} chats`, 'Cantidad']}
                                        />
                                        <Bar dataKey="chats" fill="#1a6bb5" radius={[0, 6, 6, 0]} animationDuration={600} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '20px' }}>Sin datos de agentes</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ ROW 4: EMERGING KEYWORDS + INTENCIONES ═══ */}
            <div className="grid-2">
                {stats.emergingKeywords && stats.emergingKeywords.length > 0 && (
                    <div className="card">
                        <div className="card-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Search size={16} color="#f59e0b" />
                                <h3 style={{ margin: 0 }}>Keywords Emergentes (7 días)</h3>
                            </div>
                        </div>
                        <div className="card-body">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {stats.emergingKeywords.map((kw, i) => (
                                    <div key={i} className="keyword-row">
                                        <div className="keyword-name">"{kw.keyword}"</div>
                                        <div className="keyword-stats">
                                            <span className="keyword-count">{kw.current}</span>
                                            <span className="keyword-change">
                                                {kw.previous > 0
                                                    ? `+${Math.round(((kw.current - kw.previous) / kw.previous) * 100)}%`
                                                    : '🆕 NUEVA'
                                                }
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                <div className="card">
                    <div className="card-header">
                        <h3>Intenciones Detectadas</h3>
                    </div>
                    <div className="card-body">
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={intentData} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis type="number" tick={{ fontSize: 11 }} />
                                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                                    <Bar dataKey="value" fill="#1a6bb5" radius={[0, 4, 4, 0]} animationDuration={600} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ ROW 5: BOT EFFICIENCY + HOURLY ═══ */}
            <div className="grid-2">
                <div className="card">
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <BarChart3 size={16} color="#8b5cf6" />
                            <h3 style={{ margin: 0 }}>Volumen Diario</h3>
                        </div>
                    </div>
                    <div className="card-body">
                        <div className="chart-container">
                            {stats.dailyVolume && stats.dailyVolume.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={stats.dailyVolume}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={Math.max(0, Math.floor(stats.dailyVolume.length / 8))} />
                                        <YAxis tick={{ fontSize: 11 }} />
                                        <Tooltip
                                            contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                                            formatter={(value) => [`${value} chats`, 'Cantidad']}
                                        />
                                        <Area type="monotone" dataKey="chats" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.15} strokeWidth={2}
                                            dot={{ r: 3, fill: '#8b5cf6' }} animationDuration={600} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '20px' }}>Sin datos de volumen</div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="card-header">
                        <h3>Chats por Hora del Día</h3>
                    </div>
                    <div className="card-body">
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={hourlyData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="hour" tick={{ fontSize: 11 }} interval={2} />
                                    <YAxis tick={{ fontSize: 11 }} />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                                    <Area type="monotone" dataKey="chats" stroke="#1a6bb5" fill="#1a6bb5" fillOpacity={0.15} strokeWidth={2}
                                        animationDuration={600} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ PROBLEMATIC CHATS ═══ */}
            {problems.length > 0 && (
                <div className="card" style={{ marginBottom: '24px' }}>
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <AlertTriangle size={16} color="#ef4444" />
                            <h3 style={{ margin: 0 }}>
                                ⚠️ Chats en Riesgo
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
        </div>
    )
}
