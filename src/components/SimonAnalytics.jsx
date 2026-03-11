/**
 * SimonAnalytics — Dashboard de Analytics para Simon IA
 * Muestra métricas de uso, calidad, pipeline, y tendencias
 */
import { useState, useEffect } from 'react'
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    AreaChart, Area
} from 'recharts'
import {
    TrendingUp, MessageSquare, CheckCircle, AlertCircle,
    FileText, Brain, Clock, Loader2, RefreshCw, BarChart3,
    Search, Sparkles, HelpCircle, BookOpen, Shield, Zap,
    Target, Activity
} from 'lucide-react'

const RAG_API_BASE = import.meta.env.VITE_RAG_API_URL || '/rag-api'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899']

const QUALITY_COLORS = {
    successful: '#10b981',
    no_info: '#ef4444',
    clarification: '#f59e0b',
}

export default function SimonAnalytics() {
    const [data, setData] = useState(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState(null)
    const [period, setPeriod] = useState(30)

    useEffect(() => {
        loadAnalytics()
    }, [period])

    async function loadAnalytics() {
        setIsLoading(true)
        setError(null)
        try {
            const resp = await fetch(`${RAG_API_BASE}/analytics?days=${period}`)
            if (!resp.ok) throw new Error('Error al cargar analytics')
            const result = await resp.json()
            setData(result)
        } catch (e) {
            setError(e.message)
        }
        setIsLoading(false)
    }

    if (isLoading) {
        return (
            <div className="simon-analytics">
                <div className="simon-analytics-loading">
                    <Loader2 size={24} className="rag-spin" />
                    <p>Cargando analytics de Simon...</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="simon-analytics">
                <div className="simon-analytics-error">
                    <AlertCircle size={24} />
                    <p>{error}</p>
                    <button onClick={loadAnalytics}>Reintentar</button>
                </div>
            </div>
        )
    }

    if (!data) return null

    const { overview, daily_usage, top_topics, response_quality, pipeline_performance, top_sources, knowledge_base, disambiguation, hourly_distribution } = data

    // Prepare pie chart data
    const qualityPie = [
        { name: 'Exitosas', value: response_quality.successful, color: QUALITY_COLORS.successful },
        { name: 'Sin info', value: response_quality.no_info, color: QUALITY_COLORS.no_info },
        { name: 'Clarificación', value: response_quality.clarification, color: QUALITY_COLORS.clarification },
    ].filter(d => d.value > 0)

    return (
        <div className="simon-analytics">
            {/* Header */}
            <div className="sa-header">
                <div className="sa-header-left">
                    <BarChart3 size={20} />
                    <div>
                        <h2>Analytics de Simon</h2>
                        <p>Métricas de uso y rendimiento</p>
                    </div>
                </div>
                <div className="sa-header-actions">
                    <select
                        className="sa-period-select"
                        value={period}
                        onChange={e => setPeriod(Number(e.target.value))}
                    >
                        <option value={7}>Últimos 7 días</option>
                        <option value={30}>Últimos 30 días</option>
                        <option value={90}>Últimos 90 días</option>
                    </select>
                    <button className="sa-refresh-btn" onClick={loadAnalytics} title="Actualizar">
                        <RefreshCw size={14} />
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="sa-kpi-grid">
                <div className="sa-kpi-card">
                    <div className="sa-kpi-icon" style={{ background: '#eff6ff', color: '#3b82f6' }}>
                        <MessageSquare size={18} />
                    </div>
                    <div className="sa-kpi-value">{overview.total_questions}</div>
                    <div className="sa-kpi-label">Consultas</div>
                </div>
                <div className="sa-kpi-card">
                    <div className="sa-kpi-icon" style={{ background: '#ecfdf5', color: '#10b981' }}>
                        <CheckCircle size={18} />
                    </div>
                    <div className="sa-kpi-value">{response_quality.satisfaction_score}%</div>
                    <div className="sa-kpi-label">Satisfacción</div>
                </div>
                <div className="sa-kpi-card">
                    <div className="sa-kpi-icon" style={{ background: '#f5f3ff', color: '#8b5cf6' }}>
                        <Brain size={18} />
                    </div>
                    <div className="sa-kpi-value">{overview.total_conversations}</div>
                    <div className="sa-kpi-label">Conversaciones</div>
                </div>
                <div className="sa-kpi-card">
                    <div className="sa-kpi-icon" style={{ background: '#fff7ed', color: '#f97316' }}>
                        <FileText size={18} />
                    </div>
                    <div className="sa-kpi-value">{knowledge_base.total_chunks}</div>
                    <div className="sa-kpi-label">Docs indexados</div>
                </div>
            </div>

            {/* Charts Row 1: Daily Usage + Response Quality */}
            <div className="sa-charts-row">
                <div className="sa-chart-card sa-chart-wide">
                    <div className="sa-chart-title">
                        <TrendingUp size={14} />
                        Consultas por día
                    </div>
                    <div className="sa-chart-body">
                        {daily_usage.length > 0 ? (
                            <ResponsiveContainer width="100%" height={200}>
                                <AreaChart data={daily_usage}>
                                    <defs>
                                        <linearGradient id="colorQueries" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis
                                        dataKey="date"
                                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                                        tickFormatter={d => d.slice(5)}
                                    />
                                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                    <Tooltip
                                        contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                                        labelFormatter={d => `Fecha: ${d}`}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="queries"
                                        stroke="#3b82f6"
                                        strokeWidth={2}
                                        fill="url(#colorQueries)"
                                        name="Consultas"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="sa-chart-empty">Sin datos en este período</div>
                        )}
                    </div>
                </div>

                <div className="sa-chart-card">
                    <div className="sa-chart-title">
                        <Target size={14} />
                        Calidad de respuestas
                    </div>
                    <div className="sa-chart-body">
                        {qualityPie.length > 0 ? (
                            <div className="sa-quality-section">
                                <ResponsiveContainer width="100%" height={140}>
                                    <PieChart>
                                        <Pie
                                            data={qualityPie}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={35}
                                            outerRadius={60}
                                            paddingAngle={3}
                                            dataKey="value"
                                        >
                                            {qualityPie.map((entry, i) => (
                                                <Cell key={i} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="sa-quality-legend">
                                    {qualityPie.map((item, i) => (
                                        <div key={i} className="sa-quality-item">
                                            <span className="sa-quality-dot" style={{ background: item.color }} />
                                            <span>{item.name}</span>
                                            <strong>{item.value}</strong>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="sa-chart-empty">Sin datos</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Charts Row 2: Top Keywords + Top Sources */}
            <div className="sa-charts-row">
                <div className="sa-chart-card">
                    <div className="sa-chart-title">
                        <Search size={14} />
                        Temas más consultados
                    </div>
                    <div className="sa-chart-body">
                        {top_topics?.keywords?.length > 0 ? (
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart
                                    data={top_topics.keywords.slice(0, 8)}
                                    layout="vertical"
                                    margin={{ left: 60 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                    <YAxis
                                        dataKey="keyword"
                                        type="category"
                                        tick={{ fontSize: 10, fill: '#64748b' }}
                                        width={55}
                                    />
                                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                                    <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} name="Menciones" />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="sa-chart-empty">Sin datos suficientes</div>
                        )}
                    </div>
                </div>

                <div className="sa-chart-card">
                    <div className="sa-chart-title">
                        <BookOpen size={14} />
                        Documentos más citados
                    </div>
                    <div className="sa-chart-body">
                        {top_sources?.length > 0 ? (
                            <div className="sa-source-list">
                                {top_sources.slice(0, 8).map((src, i) => (
                                    <div key={i} className="sa-source-item">
                                        <span className="sa-source-rank">#{i + 1}</span>
                                        <span className="sa-source-name" title={src.filename}>
                                            {src.filename.length > 25 ? src.filename.slice(0, 25) + '...' : src.filename}
                                        </span>
                                        <span className="sa-source-count">{src.citations} citas</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="sa-chart-empty">Sin datos</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Row 3: Pipeline Performance + Hourly Distribution */}
            <div className="sa-charts-row">
                <div className="sa-chart-card">
                    <div className="sa-chart-title">
                        <Zap size={14} />
                        Pipeline IA — Rendimiento
                    </div>
                    <div className="sa-chart-body">
                        <div className="sa-pipeline-stats">
                            <div className="sa-pipeline-stat">
                                <span className="sa-pipeline-stat-label">Docs buscados (prom)</span>
                                <span className="sa-pipeline-stat-value">{pipeline_performance.avg_total_searched}</span>
                            </div>
                            <div className="sa-pipeline-stat">
                                <span className="sa-pipeline-stat-label">Resultados únicos (prom)</span>
                                <span className="sa-pipeline-stat-value">{pipeline_performance.avg_unique_results}</span>
                            </div>
                            <div className="sa-pipeline-stat">
                                <span className="sa-pipeline-stat-label">Re-rankeados (prom)</span>
                                <span className="sa-pipeline-stat-value">{pipeline_performance.avg_reranked_kept}</span>
                            </div>
                            <div className="sa-pipeline-stat">
                                <span className="sa-pipeline-stat-label">Multi-queries (prom)</span>
                                <span className="sa-pipeline-stat-value">{pipeline_performance.avg_multi_queries}</span>
                            </div>
                            <div className="sa-pipeline-stat highlight">
                                <span className="sa-pipeline-stat-label">Uso de HyDE</span>
                                <span className="sa-pipeline-stat-value">{pipeline_performance.hyde_usage_rate}%</span>
                            </div>
                            <div className="sa-pipeline-stat highlight">
                                <span className="sa-pipeline-stat-label">Tasa de aprendizaje</span>
                                <span className="sa-pipeline-stat-value">{pipeline_performance.learning_rate}%</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="sa-chart-card">
                    <div className="sa-chart-title">
                        <Clock size={14} />
                        Distribución horaria
                    </div>
                    <div className="sa-chart-body">
                        {hourly_distribution.some(h => h.queries > 0) ? (
                            <ResponsiveContainer width="100%" height={200}>
                                <BarChart data={hourly_distribution}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis
                                        dataKey="hour"
                                        tick={{ fontSize: 9, fill: '#94a3b8' }}
                                        tickFormatter={h => `${h}h`}
                                    />
                                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                    <Tooltip
                                        contentStyle={{ fontSize: 11, borderRadius: 8 }}
                                        labelFormatter={h => `${h}:00 hs`}
                                    />
                                    <Bar dataKey="queries" fill="#06b6d4" radius={[3, 3, 0, 0]} name="Consultas" />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="sa-chart-empty">Sin datos</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Row 4: Knowledge Base + Disambiguation + Frequent Questions */}
            <div className="sa-charts-row sa-charts-triple">
                <div className="sa-chart-card sa-card-compact">
                    <div className="sa-chart-title">
                        <Shield size={14} />
                        Base de conocimiento
                    </div>
                    <div className="sa-chart-body">
                        <div className="sa-kb-stats">
                            <div className="sa-kb-stat">
                                <FileText size={14} />
                                <div>
                                    <strong>{knowledge_base.total_chunks}</strong>
                                    <span>Chunks de documentos</span>
                                </div>
                            </div>
                            <div className="sa-kb-stat">
                                <Shield size={14} />
                                <div>
                                    <strong>{knowledge_base.total_rules}</strong>
                                    <span>Reglas manuales</span>
                                </div>
                            </div>
                            <div className="sa-kb-stat">
                                <Brain size={14} />
                                <div>
                                    <strong>{knowledge_base.total_learned}</strong>
                                    <span>Chunks aprendidos</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="sa-chart-card sa-card-compact">
                    <div className="sa-chart-title">
                        <HelpCircle size={14} />
                        Desambiguación
                    </div>
                    <div className="sa-chart-body">
                        <div className="sa-disambig">
                            <div className="sa-disambig-value">
                                {disambiguation.total_disambiguations}
                            </div>
                            <div className="sa-disambig-rate">
                                {disambiguation.rate}% de consultas
                            </div>
                            <div className={`sa-disambig-badge ${disambiguation.rate < 10 ? 'good' : disambiguation.rate < 25 ? 'warn' : 'bad'}`}>
                                {disambiguation.interpretation}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="sa-chart-card sa-card-compact">
                    <div className="sa-chart-title">
                        <Activity size={14} />
                        Promedio por conversación
                    </div>
                    <div className="sa-chart-body">
                        <div className="sa-disambig">
                            <div className="sa-disambig-value">{overview.avg_messages_per_conversation}</div>
                            <div className="sa-disambig-rate">mensajes promedio</div>
                            <div className="sa-disambig-badge good">
                                {overview.avg_messages_per_conversation > 4
                                    ? 'Buena profundidad de conversación'
                                    : 'Consultas puntuales'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Frequent Questions */}
            {top_topics?.frequent_questions?.length > 0 && (
                <div className="sa-chart-card sa-full-width">
                    <div className="sa-chart-title">
                        <MessageSquare size={14} />
                        Preguntas más frecuentes
                    </div>
                    <div className="sa-chart-body">
                        <div className="sa-faq-list">
                            {top_topics.frequent_questions.slice(0, 8).map((faq, i) => (
                                <div key={i} className="sa-faq-item">
                                    <span className="sa-faq-rank">#{i + 1}</span>
                                    <span className="sa-faq-text">{faq.question}</span>
                                    <span className="sa-faq-count">{faq.count}x</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
