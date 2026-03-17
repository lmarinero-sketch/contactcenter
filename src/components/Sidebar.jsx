import { useState } from 'react'
import {
    LayoutDashboard, Users, Bot, MessageSquare,
    ChevronLeft, ChevronRight, Brain,
    Shield, BarChart3, CalendarDays, BookOpen,
    LogOut, UserCircle
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

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

const GESTION_ITEMS = [
    { id: 'shifts', label: 'Diagrama de Turnos', icon: CalendarDays },
    { id: 'logbook', label: 'Bitácora', icon: BookOpen },
]

const ROLE_LABELS = {
    coordinador: 'Coordinador',
    agente: 'Agente',
    refuerzo: 'Refuerzo',
}

const ROLE_COLORS = {
    coordinador: '#10b981',
    agente: '#3b82f6',
    refuerzo: '#f59e0b',
}

export default function Sidebar({ activeView, onViewChange, mobileOpen }) {
    const [collapsed, setCollapsed] = useState(false)
    const { profile, signOut } = useAuth()

    const handleLogout = async () => {
        try {
            await signOut()
        } catch (err) {
            console.error('Error signing out:', err)
        }
    }

    return (
        <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
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

                {!collapsed && <div className="nav-section-label" style={{ marginTop: 8 }}>Gestión</div>}
                {GESTION_ITEMS.map(item => (
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
            </nav>

            <div className="sidebar-toggle">
                <button onClick={() => setCollapsed(!collapsed)}>
                    {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                </button>
            </div>

            {/* User info + logout */}
            {!collapsed && profile && (
                <div className="sidebar-user">
                    <div className="sidebar-user-info">
                        <UserCircle size={20} />
                        <div className="sidebar-user-details">
                            <span className="sidebar-user-name">{profile.full_name}</span>
                            <span
                                className="sidebar-user-role"
                                style={{
                                    background: (ROLE_COLORS[profile.role] || '#64748b') + '22',
                                    color: ROLE_COLORS[profile.role] || '#64748b',
                                }}
                            >
                                {ROLE_LABELS[profile.role] || profile.role}
                            </span>
                        </div>
                    </div>
                    <button className="sidebar-logout-btn" onClick={handleLogout} title="Cerrar sesión">
                        <LogOut size={16} />
                    </button>
                </div>
            )}

            {collapsed && profile && (
                <div className="sidebar-user-collapsed">
                    <button className="sidebar-logout-btn" onClick={handleLogout} title="Cerrar sesión">
                        <LogOut size={16} />
                    </button>
                </div>
            )}

            {!collapsed && (
                <div className="sidebar-footer">
                    <span className="sidebar-footer-version">Sistema Contact Center v2.0</span>
                    <span className="sidebar-footer-credit">CREADO POR INNOVACIÓN Y<br />TRANSFORMACIÓN DIGITAL</span>
                </div>
            )}
        </aside>
    )
}
