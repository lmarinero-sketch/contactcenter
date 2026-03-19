import { useState, useEffect } from 'react'
import { Bot, ArrowRight, CheckCircle, XCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { fetchBotTreeStats } from '../services/dataService'
import DateFilter from './DateFilter'

const LEVEL_COLORS = {
    1: ['#1a6bb5', '#10b981', '#8b5cf6'],
    2: ['#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#2563eb', '#64748b'],
    3: ['#f59e0b', '#06b6d4', '#64748b'],
}

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

function TreeNode({ option, count, total, color, level, children, defaultOpen = false }) {
    const [open, setOpen] = useState(defaultOpen)
    const pct = total > 0 ? ((count / total) * 100) : 0
    const hasChildren = !!children

    return (
        <div className={`tree-branch tree-branch--level-${level}`}>
            <div
                className={`tree-card tree-card--level-${level}`}
                style={{ '--accent-color': color }}
                onClick={() => hasChildren && setOpen(!open)}
            >
                <div className="tree-card-left">
                    <div className="tree-card-key" style={{ background: color }}>
                        {option.key}
                    </div>
                    <div className="tree-card-content">
                        <div className="tree-card-label">{option.label}</div>
                        <div className="tree-card-bar">
                            <div
                                className="tree-card-bar-fill"
                                style={{ width: `${Math.max(pct, 1)}%`, background: color }}
                            />
                        </div>
                    </div>
                </div>
                <div className="tree-card-right">
                    <div className="tree-card-stats">
                        <span className="tree-card-count">{count}</span>
                        <span className="tree-card-pct">{pct.toFixed(1)}%</span>
                    </div>
                    {hasChildren && (
                        <div className="tree-card-toggle">
                            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </div>
                    )}
                </div>
            </div>
            {hasChildren && open && (
                <div className="tree-children">
                    <div className="tree-connector-line" style={{ borderColor: color + '40' }} />
                    {children}
                </div>
            )}
        </div>
    )
}

export default function ChatbotPanel() {
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const [dateFrom, setDateFrom] = useState(null)
    const [dateTo, setDateTo] = useState(null)

    useEffect(() => {
        loadStats()
    }, [dateFrom, dateTo])

    async function loadStats() {
        try {
            setLoading(true)
            const data = await fetchBotTreeStats(dateFrom, dateTo)
            setStats(data)
        } catch (err) {
            console.error('Error loading bot tree stats:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleDateChange = (from, to) => {
        setDateFrom(from)
        setDateTo(to)
    }

    if (loading) {
        return <div className="loading-spinner"><div className="spinner"></div></div>
    }

    if (!stats || stats.totalAnalyzed === 0) {
        return (
            <div className="fade-in">
                <DateFilter dateFrom={dateFrom} dateTo={dateTo} onChange={handleDateChange} />
                <div className="empty-state">
                    <Bot />
                    <h3>Sin datos del chatbot</h3>
                    <p>Los datos del árbol del chatbot se completarán cuando las conversaciones sean analizadas por OpenAI.</p>
                </div>
            </div>
        )
    }

    const total = stats.totalAnalyzed || 1

    const getCount = (choices, label) => choices[label] || 0

    const secondChoiceData = Object.entries(stats.secondChoices)
        .sort((a, b) => b[1] - a[1])
        .map(([name, value]) => ({ name: name.length > 30 ? name.substring(0, 28) + '…' : name, value, fullName: name }))

    const thirdChoiceData = Object.entries(stats.thirdChoices)
        .sort((a, b) => b[1] - a[1])
        .map(([name, value]) => ({ name: name.length > 35 ? name.substring(0, 33) + '…' : name, value, fullName: name }))

    return (
        <div className="fade-in">
            {/* Date Filter */}
            <DateFilter dateFrom={dateFrom} dateTo={dateTo} onChange={handleDateChange} />
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
                    <div className="tree-prompt">
                        <Bot size={14} />
                        "¿Cómo te puedo ayudar? Selecciona una opción"
                    </div>

                    {/* Level 1 */}
                    {BOT_TREE_CONFIG.level1.map((option, i) => {
                        const count = getCount(stats.firstChoices, option.label)
                        const color = LEVEL_COLORS[1][i]
                        return (
                            <TreeNode
                                key={option.key}
                                option={option}
                                count={count}
                                total={total}
                                color={color}
                                level={1}
                                defaultOpen={option.key === 'A'}
                            >
                                {option.key === 'A' && (
                                    <>
                                        <div className="tree-prompt tree-prompt--sub">
                                            "Por favor selecciona una de estas opciones"
                                        </div>
                                        {BOT_TREE_CONFIG.level2_A.map((sub, j) => {
                                            const subCount = getCount(stats.secondChoices, sub.label)
                                            const subColor = LEVEL_COLORS[2][j]
                                            return (
                                                <TreeNode
                                                    key={sub.key}
                                                    option={sub}
                                                    count={subCount}
                                                    total={total}
                                                    color={subColor}
                                                    level={2}
                                                    defaultOpen={sub.key === 'A'}
                                                >
                                                    {sub.key === 'A' && (
                                                        <>
                                                            <div className="tree-prompt tree-prompt--sub">
                                                                "Selecciona el tipo de turno que necesitas"
                                                            </div>
                                                            {BOT_TREE_CONFIG.level3_A_A.map((third, k) => {
                                                                const thirdCount = getCount(stats.thirdChoices, third.label)
                                                                const thirdColor = LEVEL_COLORS[3][k]
                                                                return (
                                                                    <TreeNode
                                                                        key={third.key}
                                                                        option={third}
                                                                        count={thirdCount}
                                                                        total={total}
                                                                        color={thirdColor}
                                                                        level={3}
                                                                    />
                                                                )
                                                            })}
                                                        </>
                                                    )}
                                                </TreeNode>
                                            )
                                        })}
                                    </>
                                )}
                            </TreeNode>
                        )
                    })}
                </div>
            </div>

            {/* Charts */}
            <div className="grid-2">
                <div className="card">
                    <div className="card-header">
                        <h3>Segunda Elección (Nivel 2)</h3>
                    </div>
                    <div className="card-body">
                        <div style={{ width: '100%', height: Math.max(250, secondChoiceData.length * 40) }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={secondChoiceData} layout="vertical" margin={{ left: 10, right: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis type="number" tick={{ fontSize: 11 }} />
                                    <YAxis
                                        dataKey="name"
                                        type="category"
                                        tick={{ fontSize: 11 }}
                                        width={180}
                                    />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                                        formatter={(value, _, props) => [value, props.payload.fullName || 'Cantidad']}
                                    />
                                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                        {secondChoiceData.map((entry, i) => (
                                            <Cell key={i} fill={LEVEL_COLORS[2][i % LEVEL_COLORS[2].length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="card-header">
                        <h3>Tercera Elección (Nivel 3)</h3>
                    </div>
                    <div className="card-body">
                        <div style={{ width: '100%', height: Math.max(250, thirdChoiceData.length * 45) }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={thirdChoiceData} layout="vertical" margin={{ left: 10, right: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis type="number" tick={{ fontSize: 11 }} />
                                    <YAxis
                                        dataKey="name"
                                        type="category"
                                        tick={{ fontSize: 11 }}
                                        width={200}
                                    />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                                        formatter={(value, _, props) => [value, props.payload.fullName || 'Cantidad']}
                                    />
                                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                        {thirdChoiceData.map((entry, i) => (
                                            <Cell key={i} fill={LEVEL_COLORS[3][i % LEVEL_COLORS[3].length]} />
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
