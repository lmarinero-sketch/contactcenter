import { useState, useEffect, useMemo } from 'react'
import {
    Users, Star, Clock, MessageSquare,
    ThumbsUp, ThumbsDown, ChevronDown, ChevronUp, Filter, AlertTriangle, Download, Timer
} from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts'
import { fetchAgentStats, exportToCSV } from '../services/dataService'
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

    const getProtocolBadge = (score) => {
        if (score === null || score === undefined) return <span className="badge neutral">N/A</span>
        const num = parseFloat(score)
        if (num >= 8) return <span className="badge positive">{score}/10</span>
        if (num >= 5) return <span className="badge warning">{score}/10</span>
        return <span className="badge negative">{score}/10</span>
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
            protocolo_prom: a.avg_protocol,
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
                            <th title="Score de cumplimiento de protocolo del Sanatorio (0 a 10). Evalúa saludo, presentación, escucha activa, resolución y despedida.">Protocolo</th>
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
                                            {agent.avg_protocol !== null && parseFloat(agent.avg_protocol) < 7 && (
                                                <span className="quality-alert warning" title="Protocolo por debajo de 7/10">
                                                    <AlertTriangle size={10} /> Protocolo
                                                </span>
                                            )}
                                            {agent.avg_sentiment !== null && parseFloat(agent.avg_sentiment) < 0 && (
                                                <span className="quality-alert danger" title="Sentimiento promedio negativo">
                                                    <AlertTriangle size={10} /> Sentimiento
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td><strong>{agent.total_chats}</strong></td>
                                    <td>{getSentimentBadge(agent.avg_sentiment)}</td>
                                    <td>{getProtocolBadge(agent.avg_protocol)}</td>
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
    // Radar chart data
    const radarData = [
        { metric: 'Protocolo', value: parseFloat(agent.avg_protocol) || 0, max: 10 },
        { metric: 'Sentimiento', value: ((parseFloat(agent.avg_sentiment) || 0) + 1) * 5, max: 10 },
        { metric: 'Saludo', value: parseFloat(agent.greeting_rate) / 10, max: 10 },
        { metric: 'Despedida', value: parseFloat(agent.farewell_rate) / 10, max: 10 },
        { metric: 'Velocidad', value: agent.avg_response_time ? Math.max(0, 10 - (agent.avg_response_time / 60)) : 5, max: 10 },
        { metric: 'Handoff', value: agent.avg_handoff_time ? Math.max(0, 10 - (agent.avg_handoff_time / 180)) : 5, max: 10 },
    ]

    // Tone distribution chart
    const toneData = Object.entries(agent.tones).map(([name, value]) => ({ name, value }))

    // Keywords
    const keywords = agent.top_keywords || []

    return (
        <div className="slide-in-right" style={{
            background: '#f8fafc', padding: '20px',
            borderTop: '2px solid #1a6bb5',
        }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
                {/* Radar Chart */}
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

                {/* Tone Distribution */}
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

                {/* Keywords */}
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

                        {/* Top intents */}
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
        </div>
    )
}
