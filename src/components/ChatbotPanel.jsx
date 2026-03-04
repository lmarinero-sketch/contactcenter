import { useState, useEffect } from 'react'
import { Bot, ArrowRight, CheckCircle, XCircle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { fetchBotTreeStats } from '../services/dataService'

const COLORS = ['#1a6bb5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4']

// Known tree structure
const BOT_TREE_CONFIG = {
    level1: [
        { key: 'A', label: 'Turnos o Autorizaciones' },
        { key: 'B', label: 'Guardias' },
        { key: 'C', label: 'Otras consultas' },
    ],
    level2_A: [
        { key: 'A', label: 'Solicitar turnos' },
        { key: 'B', label: 'Reprogramar o cancelar turnos' },
        { key: 'C', label: 'Autorizaciones' },
        { key: 'D', label: 'Chequeo preventivo' },
        { key: 'E', label: 'Programa prevenir' },
        { key: 'F', label: 'Información' },
        { key: 'G', label: 'Volver al menú anterior' },
    ],
    level3_A_A: [
        { key: 'A', label: 'Turnos de consultas' },
        { key: 'B', label: 'Turnos de Tomografía, Ecografía, Mamografía, Densitometría y Rayos X' },
        { key: 'C', label: 'Volver al menú anterior' },
    ],
}

export default function ChatbotPanel() {
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadStats()
    }, [])

    async function loadStats() {
        try {
            setLoading(true)
            const data = await fetchBotTreeStats()
            setStats(data)
        } catch (err) {
            console.error('Error loading bot tree stats:', err)
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return <div className="loading-spinner"><div className="spinner"></div></div>
    }

    if (!stats || stats.totalAnalyzed === 0) {
        return (
            <div className="empty-state">
                <Bot />
                <h3>Sin datos del chatbot</h3>
                <p>Los datos del árbol del chatbot se completarán cuando las conversaciones sean analizadas por OpenAI.</p>
            </div>
        )
    }

    // Calculate percentages for tree visualization
    const total = stats.totalAnalyzed || 1

    const getCount = (choices, label) => {
        return choices[label] || 0
    }

    const getPercentage = (choices, label) => {
        const count = getCount(choices, label)
        return ((count / total) * 100).toFixed(1)
    }

    const firstChoiceData = Object.entries(stats.firstChoices)
        .sort((a, b) => b[1] - a[1])
        .map(([name, value]) => ({ name, value }))

    const secondChoiceData = Object.entries(stats.secondChoices)
        .sort((a, b) => b[1] - a[1])
        .map(([name, value]) => ({ name, value }))

    const thirdChoiceData = Object.entries(stats.thirdChoices)
        .sort((a, b) => b[1] - a[1])
        .map(([name, value]) => ({ name, value }))

    return (
        <div className="fade-in">
            {/* KPIs Row */}
            <div className="kpi-grid stagger">
                <div className="kpi-card">
                    <div className="kpi-icon blue">
                        <Bot size={22} />
                    </div>
                    <div className="kpi-info">
                        <div className="kpi-label">Conversaciones Analizadas</div>
                        <div className="kpi-value">{stats.totalAnalyzed}</div>
                    </div>
                </div>

                <div className="kpi-card">
                    <div className="kpi-icon green">
                        <CheckCircle size={22} />
                    </div>
                    <div className="kpi-info">
                        <div className="kpi-label">Resolución del Bot</div>
                        <div className="kpi-value">{stats.botResolutionRate}%</div>
                        <div className={`kpi-change ${parseFloat(stats.botResolutionRate) >= 30 ? 'positive' : 'negative'}`}>
                            {parseFloat(stats.botResolutionRate) >= 30 ? 'Buen nivel' : 'Puede mejorar'}
                        </div>
                    </div>
                </div>

                <div className="kpi-card">
                    <div className="kpi-icon yellow">
                        <XCircle size={22} />
                    </div>
                    <div className="kpi-info">
                        <div className="kpi-label">Transferidos a Agente</div>
                        <div className="kpi-value">{(100 - parseFloat(stats.botResolutionRate)).toFixed(1)}%</div>
                    </div>
                </div>
            </div>

            {/* Visual Tree */}
            <div className="card" style={{ marginBottom: '24px' }}>
                <div className="card-header">
                    <h3>🌳 Árbol del Chatbot — Flujo de Decisiones</h3>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>Basado en {stats.totalAnalyzed} conversaciones</span>
                </div>
                <div className="bot-tree">
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a6bb5', marginBottom: '12px' }}>
                        "¿Cómo te puedo ayudar? Selecciona una opción"
                    </div>

                    {/* Level 1 */}
                    {BOT_TREE_CONFIG.level1.map((option, i) => {
                        const count = getCount(stats.firstChoices, option.label)
                        const pct = getPercentage(stats.firstChoices, option.label)
                        return (
                            <div key={option.key}>
                                <div className="tree-node" style={{ borderLeft: `3px solid ${COLORS[i]}` }}>
                                    <div className="tree-node-label">
                                        <div className="tree-node-key">{option.key}</div>
                                        {option.label}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div className="tree-node-count">{count}</div>
                                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>{pct}%</span>
                                    </div>
                                </div>
                                <div className="tree-node-bar">
                                    <div className="tree-node-bar-fill" style={{ width: `${pct}%` }}></div>
                                </div>

                                {/* Level 2 for option A */}
                                {option.key === 'A' && (
                                    <div className="tree-level">
                                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', margin: '12px 0 8px', padding: '0 8px' }}>
                                            "Por favor selecciona una de estas opciones"
                                        </div>
                                        {BOT_TREE_CONFIG.level2_A.map((sub, j) => {
                                            const subCount = getCount(stats.secondChoices, sub.label)
                                            const subPct = total > 0 ? ((subCount / total) * 100).toFixed(1) : 0
                                            return (
                                                <div key={sub.key}>
                                                    <div className="tree-node">
                                                        <div className="tree-node-label">
                                                            <div className="tree-node-key" style={{ background: COLORS[(j + 1) % COLORS.length] }}>{sub.key}</div>
                                                            {sub.label}
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                            <div className="tree-node-count">{subCount}</div>
                                                            <span style={{ fontSize: '12px', color: '#94a3b8' }}>{subPct}%</span>
                                                        </div>
                                                    </div>
                                                    <div className="tree-node-bar">
                                                        <div className="tree-node-bar-fill" style={{ width: `${subPct * 3}%`, background: COLORS[(j + 1) % COLORS.length] }}></div>
                                                    </div>

                                                    {/* Level 3 for A > A (Solicitar turnos) */}
                                                    {sub.key === 'A' && (
                                                        <div className="tree-level">
                                                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', margin: '12px 0 8px', padding: '0 8px' }}>
                                                                "Selecciona el tipo de turno que necesitas"
                                                            </div>
                                                            {BOT_TREE_CONFIG.level3_A_A.map((third, k) => {
                                                                const thirdCount = getCount(stats.thirdChoices, third.label)
                                                                const thirdPct = total > 0 ? ((thirdCount / total) * 100).toFixed(1) : 0
                                                                return (
                                                                    <div key={third.key}>
                                                                        <div className="tree-node">
                                                                            <div className="tree-node-label">
                                                                                <div className="tree-node-key" style={{ background: COLORS[(k + 3) % COLORS.length] }}>{third.key}</div>
                                                                                <span style={{ fontSize: '12px' }}>{third.label}</span>
                                                                            </div>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                                <div className="tree-node-count">{thirdCount}</div>
                                                                                <span style={{ fontSize: '12px', color: '#94a3b8' }}>{thirdPct}%</span>
                                                                            </div>
                                                                        </div>
                                                                        <div className="tree-node-bar">
                                                                            <div className="tree-node-bar-fill" style={{ width: `${thirdPct * 5}%`, background: COLORS[(k + 3) % COLORS.length] }}></div>
                                                                        </div>
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Charts */}
            <div className="grid-2">
                <div className="card">
                    <div className="card-header">
                        <h3>Primera Elección (Nivel 1)</h3>
                    </div>
                    <div className="card-body">
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={firstChoiceData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                    <YAxis tick={{ fontSize: 11 }} />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                        {firstChoiceData.map((entry, i) => (
                                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="card-header">
                        <h3>Segunda Elección (Nivel 2)</h3>
                    </div>
                    <div className="card-body">
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={secondChoiceData} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis type="number" tick={{ fontSize: 11 }} />
                                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={140} />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                        {secondChoiceData.map((entry, i) => (
                                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
