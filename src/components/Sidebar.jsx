import { useState } from 'react'
import {
    LayoutDashboard, Users, Bot, MessageSquare,
    TrendingUp, ChevronLeft, ChevronRight, Brain,
    Shield, BarChart3
} from 'lucide-react'

const NAV_ITEMS = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'agents', label: 'Agentes', icon: Users },
    { id: 'chatbot', label: 'Chatbot Analytics', icon: Bot },
    { id: 'conversations', label: 'Conversaciones', icon: MessageSquare },
]

const TOOL_ITEMS = [
    { id: 'rag', label: 'Simon IA', icon: Brain },
    { id: 'rag-rules', label: 'Reglas', icon: Shield, sub: true },
    { id: 'rag-analytics', label: 'Analytics', icon: BarChart3, sub: true },
]

export default function Sidebar({ activeView, onViewChange }) {
    const [collapsed, setCollapsed] = useState(false)

    return (
        <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
            <div className="sidebar-header">
                <div className="sidebar-logo">
                    <img src="/logosanatorio.png" alt="Sanatorio Argentino" />
                </div>
                {!collapsed && (
                    <div className="sidebar-brand">
                        <h1>Sanatorio Argentino</h1>
                        <span>Contact Center</span>
                    </div>
                )}
            </div>

            <nav className="sidebar-nav">
                {!collapsed && <div className="nav-section-label">Analytics</div>}
                {NAV_ITEMS.map(item => (
                    <button
                        key={item.id}
                        className={`nav-item ${activeView === item.id ? 'active' : ''}`}
                        onClick={() => onViewChange(item.id)}
                        title={collapsed ? item.label : undefined}
                    >
                        <item.icon size={18} />
                        {!collapsed && <span>{item.label}</span>}
                    </button>
                ))}
                {!collapsed && <div className="nav-section-label" style={{ marginTop: 8 }}>Herramientas</div>}
                {TOOL_ITEMS.map(item => (
                    <button
                        key={item.id}
                        className={`nav-item ${item.sub ? 'nav-sub' : ''} ${activeView === item.id ? 'active' : ''}`}
                        onClick={() => onViewChange(item.id)}
                        title={collapsed ? item.label : undefined}
                    >
                        <item.icon size={item.sub ? 15 : 18} />
                        {!collapsed && <span>{item.label}</span>}
                    </button>
                ))}
            </nav>

            <div className="sidebar-toggle">
                <button onClick={() => setCollapsed(!collapsed)}>
                    {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                </button>
            </div>

            {!collapsed && (
                <div className="sidebar-footer">
                    <span className="sidebar-footer-version">Sistema Contact Center v1.0</span>
                    <span className="sidebar-footer-credit">CREADO POR INNOVACIÓN Y<br />TRANSFORMACIÓN DIGITAL</span>
                </div>
            )}
        </aside>
    )
}
