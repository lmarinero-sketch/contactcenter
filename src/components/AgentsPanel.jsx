import { useState, useEffect, useMemo } from 'react'
import {
    Users, Star, Clock, MessageSquare,
    ThumbsUp, ThumbsDown, ChevronDown, ChevronUp, Filter, AlertTriangle, Download, Timer,
    Brain, Sparkles, TrendingUp, TrendingDown, Target, Loader2
} from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts'
import { fetchAgentStats, exportToCSV, fetchAgentProfile } from '../services/dataService'
import DateFilter from './DateFilter'

export default function AgentsPanel() {
    const [agents, setAgents] = useState([])
    const [loading, setLoading] = useState(true)
    const [expandedAgent, setExpandedAgent] = useState(null)
    const [excludedAgents, setExcludedAgents] = useState(['Betina'])
    const [dateFrom, setDateFrom] = useState(null)
    const [dateTo, setDateTo] = useState(null)

    useEffect(() => {
        loadAgents()
    }, [dateFrom, dateTo])

    async function loadAgents() {
        try {
            setLoading(true)
            const data = await fetchAgentStats(dateFrom, dateTo)
            setAgents(data)
        } catch (err) {
            console.error('Error loading agent stats:', err)
        } finally {
            setLoading(false)
        }
    }

    const toggleExcludeAgent = (name) => {
        setExcludedAgents(prev =>
            prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
        )
    }

    // Aggregate keywords from all non-excluded agents
    const globalKeywords = useMemo(() => {
        const merged = {}
        agents
            .filter(a => !excludedAgents.includes(a.agent_name))
            .forEach(agent => {
                Object.entries(agent.keywords || {}).forEach(([word, count]) => {
                    merged[word] = (merged[word] || 0) + count
                })
            })
        return Object.entries(merged)
            .sort((a, b) => b[1] - a[1])
    }, [agents, excludedAgents])

    const topKeywordsChart = globalKeywords.slice(0, 20).map(([name, value]) => ({ name, value }))
    const includedCount = agents.filter(a => !excludedAgents.includes(a.agent_name)).length

    if (loading) {
        return <div className="loading-spinner"><div className="spinner"></div></div>
    }

    if (agents.length === 0) {
        return (
            <div className="empty-state">
                <Users />
                <h3>Sin datos de agentes</h3>
                <p>Los datos de agentes aparecerán cuando se procesen las primeras conversaciones.</p>
            </div>
        )
    }

    const formatSeconds = (seconds) => {
        if (!seconds) return '—'
        if (seconds < 60) return `${seconds}s`
        const min = Math.floor(seconds / 60)
        const sec = seconds % 60
        if (min >= 60) {
            const hrs = Math.floor(min / 60)
            const remainMin = min % 60
            return `${hrs}h ${remainMin}m`
        }
        return `${min}m ${sec}s`
    }

    const getHandoffBadge = (seconds) => {
        if (seconds === null || seconds === undefined) return <span className="badge neutral">N/A</span>
        const label = formatSeconds(seconds)
        if (seconds <= 300) return <span className="badge positive">{label}</span>
        if (seconds <= 900) return <span className="badge warning">{label}</span>
        return <span className="badge negative">{label}</span>
    }

    const getSentimentBadge = (score) => {
        if (score === null || score === undefined) return <span className="badge neutral">N/A</span>
        const num = parseFloat(score)
        if (num >= 0.3) return <span className="badge positive">Positivo ({score})</span>
        if (num >= -0.3) return <span className="badge neutral">Neutral ({score})</span>
        return <span className="badge negative">Negativo ({score})</span>
    }



    const getToneBadge = (tone) => {
        const toneMap = {
            'cordial': 'positive',
            'profesional': 'info',
            'empático': 'positive',
            'informal': 'warning',
            'brusco': 'negative',
        }
        return <span className={`badge ${toneMap[tone] || 'neutral'}`}>{tone}</span>
    }

    const handleExportAgents = () => {
        const csvData = agents.map(a => ({
            agente: a.agent_name,
            total_chats: a.total_chats,
            sentimiento_prom: a.avg_sentiment,
            protocolo_prom: 'N/A',
            tono_dominante: a.dominant_tone,
            tasa_saludo: a.greeting_rate + '%',
            tasa_despedida: a.farewell_rate + '%',
            tiempo_respuesta: a.avg_response_time ? a.avg_response_time + 's' : '—',
            handoff_promedio: a.avg_handoff_time ? formatSeconds(a.avg_handoff_time) : '—',
            handoff_max: a.max_handoff_time ? formatSeconds(a.max_handoff_time) : '—',
        }))
        exportToCSV(csvData, 'ranking_agentes')
    }

    return (
        <div className="fade-in">
            <DateFilter dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t) }} />

            {/* Agent ranking */}
            <div className="card" style={{ marginBottom: '24px' }}>
                <div className="card-header">
                    <h3>Ranking de Agentes</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>{agents.length} agentes</span>
                        <button className="btn btn-secondary btn-sm" onClick={handleExportAgents} title="Exportar a Excel/CSV">
                            <Download size={14} /> CSV
                        </button>
                    </div>
                </div>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Agente</th>
                            <th title="Cantidad total de conversaciones atendidas por este agente">Total Chats</th>
                            <th title="Promedio de satisfacción de los pacientes atendidos por este agente. Va de -1.0 (muy insatisfecho) a +1.0 (muy satisfecho).">Sentimiento</th>
                            <th title="Tono predominante del agente en sus conversaciones: cordial, profesional, empático, informal o brusco.">Tono Dominante</th>
                            <th title="Porcentaje de conversaciones en las que el agente saludó correctamente al paciente.">Saluda</th>
                            <th title="Porcentaje de conversaciones en las que el agente se despidió correctamente del paciente.">Se despide</th>
                            <th title="Tiempo promedio que tarda el agente en enviar su primer mensaje después de recibir la conversación.">1ª Respuesta</th>
                            <th title="Tiempo promedio entre el último mensaje del bot y el primer mensaje de este agente. Verde ≤5min, Amarillo ≤15min, Rojo >15min.">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Timer size={12} />
                                    Handoff
                                </div>
                            </th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {agents.map((agent, index) => (
                            <>
                                <tr key={agent.agent_name} style={{ cursor: 'pointer' }} onClick={() => setExpandedAgent(expandedAgent === agent.agent_name ? null : agent.agent_name)}>
                                    <td style={{ fontWeight: 700, color: '#1a6bb5' }}>{index + 1}</td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{
                                                width: '32px', height: '32px', borderRadius: '50%',
                                                background: `hsl(${(agent.agent_name?.charCodeAt(0) || 0) * 15}, 60%, 90%)`,
                                                color: `hsl(${(agent.agent_name?.charCodeAt(0) || 0) * 15}, 60%, 40%)`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '13px', fontWeight: 700
                                            }}>
                                                {agent.agent_name?.charAt(0) || '?'}
                                            </div>
                                            <span style={{ fontWeight: 600 }}>{agent.agent_name}</span>
                                        </div>
                                    </td>
                                    <td><strong>{agent.total_chats}</strong></td>
                                    <td>{getSentimentBadge(agent.avg_sentiment)}</td>
                                    <td>{getToneBadge(agent.dominant_tone)}</td>
                                    <td>{agent.greeting_rate}%</td>
                                    <td>{agent.farewell_rate}%</td>
                                    <td>{formatSeconds(agent.avg_response_time)}</td>
                                    <td>{getHandoffBadge(agent.avg_handoff_time)}</td>
                                    <td>
                                        {expandedAgent === agent.agent_name
                                            ? <ChevronUp size={16} />
                                            : <ChevronDown size={16} />
                                        }
                                    </td>
                                </tr>
                                {expandedAgent === agent.agent_name && (
                                    <tr key={`${agent.agent_name}-detail`}>
                                        <td colSpan="11" style={{ padding: 0 }}>
                                            <AgentDetail agent={agent} />
                                        </td>
                                    </tr>
                                )}
                            </>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Global Keyword Analysis */}
            <div className="card" style={{ marginBottom: '24px' }}>
                <div className="card-header">
                    <div>
                        <h3>🔍 Análisis Global de Palabras Clave</h3>
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                            Analizando {includedCount} de {agents.length} agentes
                            {excludedAgents.length > 0 && ` • Excluidos: ${excludedAgents.join(', ')}`}
                        </span>
                    </div>
                    <Filter size={16} color="#94a3b8" />
                </div>
                <div className="card-body">
                    {/* Agent toggle filters */}
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                            Incluir / Excluir Agentes
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {agents.map(agent => {
                                const isExcluded = excludedAgents.includes(agent.agent_name)
                                return (
                                    <button
                                        key={agent.agent_name}
                                        onClick={() => toggleExcludeAgent(agent.agent_name)}
                                        style={{
                                            padding: '5px 14px',
                                            borderRadius: '100px',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            border: isExcluded ? '1px solid #e2e8f0' : '1px solid #1a6bb5',
                                            background: isExcluded ? '#f8fafc' : '#eff6ff',
                                            color: isExcluded ? '#94a3b8' : '#2563eb',
                                            textDecoration: isExcluded ? 'line-through' : 'none',
                                            transition: 'all 150ms ease',
                                            fontFamily: 'inherit',
                                        }}
                                    >
                                        {agent.agent_name} ({agent.total_chats})
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {globalKeywords.length > 0 ? (
                        <div className="grid-2">
                            {/* Bar Chart */}
                            <div>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '12px' }}>
                                    Top 20 Palabras Más Usadas
                                </div>
                                <div style={{ height: '400px' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={topKeywordsChart} layout="vertical" margin={{ left: 10 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                            <XAxis type="number" tick={{ fontSize: 11 }} />
                                            <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} />
                                            <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                                            <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Tag Cloud */}
                            <div>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '12px' }}>
                                    Todas las Palabras ({globalKeywords.length})
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                                    {globalKeywords.map(([word, count], i) => {
                                        const maxCount = globalKeywords[0]?.[1] || 1
                                        const ratio = count / maxCount
                                        const size = Math.max(11, Math.round(11 + ratio * 14))
                                        const opacity = Math.max(0.5, ratio)
                                        return (
                                            <span
                                                key={word}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    padding: '4px 12px',
                                                    borderRadius: '100px',
                                                    fontSize: `${size}px`,
                                                    fontWeight: ratio > 0.5 ? 700 : 500,
                                                    background: `rgba(139, 92, 246, ${opacity * 0.15})`,
                                                    color: `rgba(109, 40, 217, ${Math.max(0.6, opacity)})`,
                                                    border: `1px solid rgba(139, 92, 246, ${opacity * 0.2})`,
                                                }}
                                            >
                                                {word}
                                                <strong style={{ fontSize: '10px', opacity: 0.7 }}>({count})</strong>
                                            </span>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <p style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '40px' }}>
                            No hay palabras clave para los agentes seleccionados
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}

function AgentDetail({ agent }) {
    const [aiProfile, setAiProfile] = useState(null)
    const [aiLoading, setAiLoading] = useState(false)
    const [aiError, setAiError] = useState(null)

    async function generateProfile() {
        try {
            setAiLoading(true)
            setAiError(null)
            const result = await fetchAgentProfile(agent.agent_name)
            setAiProfile(result.profile)
        } catch (err) {
            setAiError(err.message)
        } finally {
            setAiLoading(false)
        }
    }

    // Radar chart data
    const radarData = [
        { metric: 'Calidad', value: Math.max(0, ((parseFloat(agent.avg_sentiment) || 0) + 1) * 5), max: 10 },
        { metric: 'Sentimiento', value: ((parseFloat(agent.avg_sentiment) || 0) + 1) * 5, max: 10 },
        { metric: 'Saludo', value: parseFloat(agent.greeting_rate) / 10, max: 10 },
        { metric: 'Despedida', value: parseFloat(agent.farewell_rate) / 10, max: 10 },
        { metric: 'Velocidad', value: agent.avg_response_time ? Math.max(0, 10 - (agent.avg_response_time / 60)) : 5, max: 10 },
        { metric: 'Handoff', value: agent.avg_handoff_time ? Math.max(0, 10 - (agent.avg_handoff_time / 180)) : 5, max: 10 },
    ]

    const toneData = Object.entries(agent.tones).map(([name, value]) => ({ name, value }))
    const keywords = agent.top_keywords || []

    const getScoreColor = (score) => {
        if (score >= 8) return '#10b981'
        if (score >= 6) return '#f59e0b'
        if (score >= 4) return '#f97316'
        return '#ef4444'
    }

    const getPriorityStyle = (priority) => {
        const map = {
            alta: { bg: '#fef2f2', border: '#fca5a5', color: '#dc2626', icon: '🔴' },
            media: { bg: '#fffbeb', border: '#fcd34d', color: '#d97706', icon: '🟡' },
            baja: { bg: '#f0fdf4', border: '#86efac', color: '#16a34a', icon: '🟢' },
        }
        return map[priority] || map.media
    }

    return (
        <div className="slide-in-right" style={{
            background: '#f8fafc', padding: '20px',
            borderTop: '2px solid #1a6bb5',
        }}>
            {/* Row 1: Radar + Tone + Keywords */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
                <div className="card">
                    <div className="card-header"><h3>Performance Radar</h3></div>
                    <div className="card-body">
                        <ResponsiveContainer width="100%" height={220}>
                            <RadarChart data={radarData}>
                                <PolarGrid stroke="#e2e8f0" />
                                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
                                <PolarRadiusAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                                <Radar name="Score" dataKey="value" stroke="#1a6bb5" fill="#1a6bb5" fillOpacity={0.2} />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="card">
                    <div className="card-header"><h3>Distribución de Tono</h3></div>
                    <div className="card-body">
                        {toneData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={toneData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 11 }} />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                                    <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <p style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '40px' }}>Sin datos suficientes</p>
                        )}
                    </div>
                </div>

                <div className="card">
                    <div className="card-header"><h3>Palabras Clave</h3></div>
                    <div className="card-body">
                        {keywords.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {keywords.map(([word, count]) => (
                                    <span key={word} className="badge info" style={{ fontSize: '12px', padding: '5px 12px' }}>
                                        {word} <strong>({count})</strong>
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <p style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '40px' }}>Sin keywords detectadas</p>
                        )}

                        {Object.keys(agent.intents).length > 0 && (
                            <>
                                <h4 style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginTop: '20px', marginBottom: '8px' }}>
                                    Intenciones más atendidas
                                </h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {Object.entries(agent.intents)
                                        .sort((a, b) => b[1] - a[1])
                                        .slice(0, 5)
                                        .map(([intent, count]) => (
                                            <div key={intent} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0' }}>
                                                <span style={{ color: '#475569' }}>{intent}</span>
                                                <strong>{count}</strong>
                                            </div>
                                        ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Row 2: AI Profile Analysis */}
            <div style={{ marginTop: '20px' }}>
                {!aiProfile && !aiLoading && (
                    <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
                        <Brain size={48} style={{ color: '#8b5cf6', margin: '0 auto 16px' }} />
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>
                            Análisis IA del Agente
                        </h3>
                        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px', maxWidth: '500px', margin: '0 auto 20px' }}>
                            Genera un perfil completo basado en IA analizando todas las conversaciones de {agent.agent_name}.
                            Incluye fortalezas, debilidades, estilo de comunicación y recomendaciones.
                        </p>
                        <button
                            onClick={generateProfile}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '8px',
                                padding: '12px 28px', borderRadius: '12px',
                                background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
                                color: 'white', border: 'none', cursor: 'pointer',
                                fontSize: '14px', fontWeight: 600,
                                boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)',
                                transition: 'all 0.2s'
                            }}
                            onMouseOver={e => e.target.style.transform = 'translateY(-2px)'}
                            onMouseOut={e => e.target.style.transform = 'translateY(0)'}
                        >
                            <Sparkles size={18} />
                            Generar Análisis IA
                        </button>
                        {aiError && (
                            <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '12px' }}>{aiError}</p>
                        )}
                    </div>
                )}

                {aiLoading && (
                    <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
                        <Loader2 size={40} style={{ color: '#8b5cf6', margin: '0 auto 16px', animation: 'spin 1s linear infinite' }} />
                        <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#475569' }}>
                            Analizando {agent.total_chats} conversaciones de {agent.agent_name}...
                        </h3>
                        <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px' }}>Esto puede tardar unos segundos</p>
                        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                    </div>
                )}

                {aiProfile && (
                    <div className="card">
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Brain size={18} style={{ color: '#8b5cf6' }} />
                                Perfil IA — {agent.agent_name}
                            </h3>
                            <button
                                onClick={generateProfile}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '6px 14px', borderRadius: '8px',
                                    background: '#f1f5f9', border: '1px solid #e2e8f0',
                                    cursor: 'pointer', fontSize: '12px', color: '#64748b'
                                }}
                            >
                                <Sparkles size={14} /> Regenerar
                            </button>
                        </div>
                        <div className="card-body" style={{ padding: '24px' }}>
                            {/* Score + Executive Summary */}
                            <div style={{
                                display: 'flex', gap: '24px', alignItems: 'flex-start',
                                marginBottom: '24px', padding: '20px',
                                background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)',
                                borderRadius: '12px', border: '1px solid #e2e8f0'
                            }}>
                                <div style={{
                                    minWidth: '80px', height: '80px',
                                    borderRadius: '50%',
                                    background: `conic-gradient(${getScoreColor(aiProfile.score_general)} ${aiProfile.score_general * 10}%, #f1f5f9 0)`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    position: 'relative'
                                }}>
                                    <div style={{
                                        width: '64px', height: '64px', borderRadius: '50%',
                                        background: 'white', display: 'flex',
                                        alignItems: 'center', justifyContent: 'center',
                                        flexDirection: 'column'
                                    }}>
                                        <span style={{ fontSize: '22px', fontWeight: 800, color: getScoreColor(aiProfile.score_general) }}>
                                            {aiProfile.score_general}
                                        </span>
                                        <span style={{ fontSize: '9px', color: '#94a3b8' }}>/10</span>
                                    </div>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>
                                        Resumen Ejecutivo
                                    </h4>
                                    <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6, margin: 0 }}>
                                        {aiProfile.resumen_ejecutivo}
                                    </p>
                                    {aiProfile.nota_final && (
                                        <p style={{
                                            fontSize: '12px', color: '#8b5cf6', fontStyle: 'italic',
                                            marginTop: '8px', margin: '8px 0 0'
                                        }}>
                                            ✨ {aiProfile.nota_final}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Strengths & Weaknesses */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                                {/* Strengths */}
                                <div>
                                    <h4 style={{
                                        fontSize: '13px', fontWeight: 700, color: '#16a34a',
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        marginBottom: '12px'
                                    }}>
                                        <TrendingUp size={16} /> Puntos Fuertes
                                    </h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {(aiProfile.puntos_fuertes || []).map((p, i) => (
                                            <div key={i} style={{
                                                padding: '12px 16px', borderRadius: '10px',
                                                background: '#f0fdf4', border: '1px solid #bbf7d0'
                                            }}>
                                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#166534', marginBottom: '4px' }}>
                                                    ✅ {p.titulo}
                                                </div>
                                                <div style={{ fontSize: '12px', color: '#15803d', lineHeight: 1.5 }}>
                                                    {p.descripcion}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Weaknesses */}
                                <div>
                                    <h4 style={{
                                        fontSize: '13px', fontWeight: 700, color: '#dc2626',
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        marginBottom: '12px'
                                    }}>
                                        <TrendingDown size={16} /> Puntos a Mejorar
                                    </h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {(aiProfile.puntos_debiles || []).map((p, i) => (
                                            <div key={i} style={{
                                                padding: '12px 16px', borderRadius: '10px',
                                                background: '#fef2f2', border: '1px solid #fecaca'
                                            }}>
                                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#991b1b', marginBottom: '4px' }}>
                                                    ⚠️ {p.titulo}
                                                </div>
                                                <div style={{ fontSize: '12px', color: '#b91c1c', lineHeight: 1.5 }}>
                                                    {p.descripcion}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Recommendations */}
                            <div style={{ marginBottom: '24px' }}>
                                <h4 style={{
                                    fontSize: '13px', fontWeight: 700, color: '#1e293b',
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    marginBottom: '12px'
                                }}>
                                    <Target size={16} style={{ color: '#6d28d9' }} /> Recomendaciones de Mejora
                                </h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {(aiProfile.recomendaciones || []).map((r, i) => {
                                        const pStyle = getPriorityStyle(r.prioridad)
                                        return (
                                            <div key={i} style={{
                                                padding: '12px 16px', borderRadius: '10px',
                                                background: pStyle.bg, border: `1px solid ${pStyle.border}`,
                                                display: 'flex', gap: '12px', alignItems: 'flex-start'
                                            }}>
                                                <span style={{ fontSize: '16px', flexShrink: 0 }}>{pStyle.icon}</span>
                                                <div>
                                                    <div style={{ fontSize: '13px', fontWeight: 600, color: pStyle.color, marginBottom: '2px' }}>
                                                        {r.titulo}
                                                        <span style={{
                                                            fontSize: '10px', fontWeight: 500,
                                                            marginLeft: '8px', padding: '2px 8px',
                                                            borderRadius: '100px', background: pStyle.color + '15',
                                                            color: pStyle.color, textTransform: 'uppercase'
                                                        }}>
                                                            {r.prioridad}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.5 }}>
                                                        {r.descripcion}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Key Phrases */}
                            {(aiProfile.frases_clave || []).length > 0 && (
                                <div style={{ marginBottom: '24px' }}>
                                    <h4 style={{
                                        fontSize: '13px', fontWeight: 700, color: '#1e293b',
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        marginBottom: '12px'
                                    }}>
                                        💬 Frases Clave del Agente
                                    </h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {aiProfile.frases_clave.map((f, i) => {
                                            const typeColors = {
                                                cordial: { bg: '#f0fdf4', border: '#bbf7d0', color: '#166534' },
                                                profesional: { bg: '#eff6ff', border: '#bfdbfe', color: '#1e40af' },
                                                informal: { bg: '#fffbeb', border: '#fde68a', color: '#92400e' },
                                                'problemática': { bg: '#fef2f2', border: '#fecaca', color: '#991b1b' },
                                            }
                                            const style = typeColors[f.tipo] || typeColors.profesional
                                            return (
                                                <div key={i} style={{
                                                    padding: '10px 16px', borderRadius: '10px',
                                                    background: style.bg, border: `1px solid ${style.border}`,
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px'
                                                }}>
                                                    <div style={{ flex: 1 }}>
                                                        <span style={{ fontSize: '13px', fontWeight: 600, color: style.color }}>
                                                            "{f.frase}"
                                                        </span>
                                                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                                            {f.comentario}
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                                        <span style={{
                                                            fontSize: '10px', padding: '2px 8px',
                                                            borderRadius: '100px', background: style.color + '15',
                                                            color: style.color, fontWeight: 600, textTransform: 'capitalize'
                                                        }}>{f.tipo}</span>
                                                        <span style={{
                                                            fontSize: '10px', padding: '2px 8px',
                                                            borderRadius: '100px', background: '#f1f5f9',
                                                            color: '#64748b', fontWeight: 500
                                                        }}>Frecuencia: {f.frecuencia}</span>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Spelling Errors */}
                            {(aiProfile.errores_ortograficos || []).length > 0 && (
                                <div style={{ marginBottom: '24px' }}>
                                    <h4 style={{
                                        fontSize: '13px', fontWeight: 700, color: '#dc2626',
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        marginBottom: '12px'
                                    }}>
                                        ✏️ Errores Ortográficos Detectados
                                    </h4>
                                    <div style={{
                                        borderRadius: '10px', border: '1px solid #fecaca',
                                        overflow: 'hidden'
                                    }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                            <thead>
                                                <tr style={{ background: '#fef2f2' }}>
                                                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#991b1b', fontWeight: 600 }}>Escribió</th>
                                                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#166534', fontWeight: 600 }}>Correcto</th>
                                                    <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>Veces</th>
                                                    <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>Gravedad</th>
                                                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#64748b' }}>Contexto</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {aiProfile.errores_ortograficos.map((err, i) => (
                                                    <tr key={i} style={{ borderTop: '1px solid #fecaca' }}>
                                                        <td style={{ padding: '8px 12px', color: '#dc2626', fontWeight: 600 }}>
                                                            <s>{err.palabra_incorrecta}</s>
                                                        </td>
                                                        <td style={{ padding: '8px 12px', color: '#16a34a', fontWeight: 600 }}>
                                                            {err.correccion}
                                                        </td>
                                                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                            {err.cantidad}x
                                                        </td>
                                                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                            <span className={`badge ${err.gravedad === 'grave' ? 'negative' : 'warning'}`}>
                                                                {err.gravedad}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '8px 12px', color: '#64748b', fontSize: '11px', fontStyle: 'italic' }}>
                                                            "...{err.ejemplo_contexto}..."
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Communication Profile */}
                            {aiProfile.perfil_comunicacion && (
                                <div style={{
                                    padding: '16px 20px', borderRadius: '12px',
                                    background: 'linear-gradient(135deg, #faf5ff, #f5f3ff)',
                                    border: '1px solid #e9d5ff'
                                }}>
                                    <h4 style={{
                                        fontSize: '13px', fontWeight: 700, color: '#6d28d9',
                                        marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px'
                                    }}>
                                        <MessageSquare size={16} /> Perfil de Comunicación
                                    </h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        <div>
                                            <div style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 600, marginBottom: '4px' }}>
                                                Estilo Dominante
                                            </div>
                                            <div style={{ fontSize: '13px', color: '#4c1d95' }}>
                                                {aiProfile.perfil_comunicacion.estilo_dominante}
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 600, marginBottom: '4px' }}>
                                                Frases Frecuentes
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                {(aiProfile.perfil_comunicacion.frases_frecuentes || aiProfile.perfil_comunicacion.palabras_frecuentes || []).map(w => (
                                                    <span key={w} style={{
                                                        fontSize: '11px', padding: '2px 10px',
                                                        borderRadius: '100px', background: '#ede9fe',
                                                        color: '#6d28d9'
                                                    }}>{w}</span>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 600, marginBottom: '4px' }}>
                                                Nivel de Empatía
                                            </div>
                                            <span className={`badge ${aiProfile.perfil_comunicacion.nivel_empatia === 'alto' ? 'positive' : aiProfile.perfil_comunicacion.nivel_empatia === 'medio' ? 'warning' : 'negative'}`}>
                                                {aiProfile.perfil_comunicacion.nivel_empatia}
                                            </span>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 600, marginBottom: '4px' }}>
                                                Nivel de Proactividad
                                            </div>
                                            <span className={`badge ${aiProfile.perfil_comunicacion.nivel_proactividad === 'alto' ? 'positive' : aiProfile.perfil_comunicacion.nivel_proactividad === 'medio' ? 'warning' : 'negative'}`}>
                                                {aiProfile.perfil_comunicacion.nivel_proactividad}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
