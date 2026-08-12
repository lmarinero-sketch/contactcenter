import { useState, useEffect } from 'react'
import { RefreshCw, Loader2, Menu, Check } from 'lucide-react'
import { useAuth } from './contexts/AuthContext'
import LoginPage from './components/LoginPage'
import Sidebar from './components/Sidebar'
import OverviewPanel from './components/OverviewPanel'
import AgentsPanel from './components/AgentsPanel'
import ChatbotPanel from './components/ChatbotPanel'
import ConversationsPanel from './components/ConversationsPanel'
import RAGPanel from './components/RAGPanel'
import RAGRules from './components/RAGRules'
import SimonAnalytics from './components/SimonAnalytics'
import ShiftCalendar from './components/ShiftCalendar'
import BitacoraPanel from './components/BitacoraPanel'
import AgentControlPanel from './components/AgentControlPanel'
import TurnosDashboard from './components/BI/TurnosDashboard'
import CanalesDashboard from './components/BI/CanalesDashboard'
import DataEntryPanel from './components/DataEntryPanel'
import PublicSimonChat from './components/PublicSimonChat'

const VIEW_TITLES = {
    overview: 'Overview',
    agents: 'Performance de Agentes',
    chatbot: 'Chatbot Analytics',
    conversations: 'Conversaciones',
    rag: 'Simon IA',
    'rag-rules': 'Reglas de Simon',
    'rag-analytics': 'Analytics de Simon',
    'agent-control': 'Control de Agentes',
    shifts: 'Diagrama de Turnos',
    logbook: 'Bitácora',
    'bi-turnos': 'BI: Turnos Otorgados',
    'bi-canales': 'BI: Canales de Creación',
    'data-entry': 'Carga de Información',
}

const VIEW_DESCRIPTIONS = {
    overview: 'Vista general del Contact Center',
    agents: 'Análisis detallado del rendimiento de cada agente',
    chatbot: 'Árbol de decisiones y efectividad del bot',
    conversations: 'Explorar conversaciones individuales',
    rag: 'Consultá documentos internos con IA — respuestas precisas con citación de fuentes',
    'rag-rules': 'Ingresá reglas e información que Simon debe recordar al responder',
    'rag-analytics': 'Métricas de uso, rendimiento y calidad de Simon IA',
    'agent-control': 'Horarios de entrada/salida, horas trabajadas y mensajes respondidos por agente',
    shifts: 'Calendario mensual de turnos del equipo',
    logbook: 'Registro de novedades, sugerencias, problemas y cambios',
    'bi-turnos': 'Análisis avanzado y mapa de calor de turnos operativos',
    'bi-canales': 'Comparativa Contact Center vs Recepciones vs Turnos Online — Volumen, ausentismo y eficiencia por canal',
    'data-entry': 'Apartado exclusivo para cargar datos y métricas al sistema',
}

const VIEW_TO_PATH = {
    overview: '/overview',
    rag: '/simon',
    'rag-rules': '/simon-rules',
    'rag-analytics': '/simon-analytics',
    agents: '/agentes',
    chatbot: '/chatbot',
    conversations: '/conversaciones',
    'agent-control': '/control-agentes',
    shifts: '/turnos',
    logbook: '/bitacora',
    'bi-turnos': '/bi-turnos',
    'bi-canales': '/bi-canales',
    'data-entry': '/cargar',
}

const PATH_TO_VIEW = {
    '/': 'overview',
    '/overview': 'overview',
    '/simon': 'rag',
    '/simon-rules': 'rag-rules',
    '/simon-reglas': 'rag-rules',
    '/simon-analytics': 'rag-analytics',
    '/agentes': 'agents',
    '/chatbot': 'chatbot',
    '/conversaciones': 'conversations',
    '/control-agentes': 'agent-control',
    '/turnos': 'shifts',
    '/bitacora': 'logbook',
    '/bi-turnos': 'bi-turnos',
    '/bi-canales': 'bi-canales',
    '/cargar': 'data-entry',
}

function getViewFromLocation() {
    const path = window.location.pathname.toLowerCase()
    const hash = window.location.hash.toLowerCase().replace(/^#\/?/, '/')
    const params = new URLSearchParams(window.location.search)
    const viewParam = params.get('view')

    if (viewParam) {
        if (PATH_TO_VIEW['/' + viewParam]) return PATH_TO_VIEW['/' + viewParam]
        if (VIEW_TITLES[viewParam]) return viewParam
    }

    if (hash && PATH_TO_VIEW['/' + hash]) return PATH_TO_VIEW['/' + hash]
    if (hash && PATH_TO_VIEW[hash]) return PATH_TO_VIEW[hash]

    if (path && PATH_TO_VIEW[path]) return PATH_TO_VIEW[path]

    return 'overview'
}

function App() {
    const { user, profile, loading, signOut, isSimon } = useAuth()
    const [activeView, setActiveView] = useState(() => getViewFromLocation())
    const [refreshKey, setRefreshKey] = useState(0)
    const [pendingTicketId, setPendingTicketId] = useState(null)
    const [mobileOpen, setMobileOpen] = useState(false)

    const [forceRefreshCount, setForceRefreshCount] = useState(0)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [showRefreshDone, setShowRefreshDone] = useState(false)

    useEffect(() => {
        const handleLocationChange = (event) => {
            const view = event.state?.view || getViewFromLocation()
            setActiveView(view)
        }

        window.addEventListener('popstate', handleLocationChange)
        window.addEventListener('hashchange', handleLocationChange)

        // Ensure history has an entry for current view
        const currentView = getViewFromLocation()
        const targetPath = VIEW_TO_PATH[currentView] || `/${currentView}`
        if (window.location.pathname !== targetPath && window.location.pathname === '/') {
            window.history.replaceState({ view: currentView }, '', targetPath)
        }

        return () => {
            window.removeEventListener('popstate', handleLocationChange)
            window.removeEventListener('hashchange', handleLocationChange)
        }
    }, [])

    // Detect dedicated load mode
    const isDedicatedCargaMode = 
        !isSimon && (
        window.location.pathname === '/cargar-portal' || 
        window.location.search.includes('view=cargar-portal') || 
        window.location.hash === '#/cargar-portal'
        );

    // Detect dedicated Simon mode (for user with simon role or explicit standalone portal path)
    const isDedicatedSimonMode = 
        isSimon ||
        window.location.pathname === '/simon-portal' || 
        window.location.search.includes('view=simon-portal') || 
        window.location.hash === '#/simon-portal';

    // Detect public Simon mode (no auth required)
    const isPublicSimonMode = 
        window.location.pathname === '/simon-public' || 
        window.location.search.includes('view=simon-public') || 
        window.location.hash === '#/simon-public';

    // Loading state
    if (loading) {
        return (
            <div className="app-loading">
                <Loader2 size={32} className="spin" />
                <span>Cargando...</span>
            </div>
        )
    }

    // Render public Simon portal before auth check
    if (isPublicSimonMode) {
        return <PublicSimonChat key={refreshKey} />
    }

    // Not authenticated → show login
    if (!user) {
        return <LoginPage isCargaMode={isDedicatedCargaMode} isSimonMode={isDedicatedSimonMode} />
    }

    // Render standalone data entry portal if in dedicated mode
    if (isDedicatedCargaMode) {
        const roleLabels = {
            coordinador: 'Coordinador',
            gerente: 'Gte. Administrativo',
            agente: 'Agente',
            refuerzo: 'Refuerzo',
            simon: 'Asistente Simon',
        }
        
        const roleColors = {
            coordinador: '#10b981',
            gerente: '#8b5cf6',
            agente: '#3b82f6',
            refuerzo: '#f59e0b',
            simon: '#ec4899',
        }
        
        const userRole = profile?.role || 'operador'

        return (
            <div className="carga-layout">
                <header className="carga-header">
                    <div className="carga-header-left">
                        <div className="carga-logo">
                            <img src="/logosanatorio.png" alt="Sanatorio Argentino" />
                        </div>
                        <div className="carga-brand-info">
                            <h1>Portal de Carga — Simon IA</h1>
                            <span>Carga exclusiva de datos y directivas de entrenamiento</span>
                        </div>
                    </div>
                    <div className="carga-header-right">
                        {profile && (
                            <div className="carga-user-info">
                                <span className="carga-user-name">{profile.full_name}</span>
                                <span 
                                    className="carga-user-role"
                                    style={{
                                        background: (roleColors[userRole] || '#64748b') + '22',
                                        color: roleColors[userRole] || '#64748b'
                                    }}
                                >
                                    {roleLabels[userRole] || userRole}
                                </span>
                            </div>
                        )}
                        <button 
                            className="btn btn-secondary" 
                            onClick={async () => {
                                try {
                                    await signOut()
                                } catch (err) {
                                    console.error('Error signing out:', err)
                                }
                            }}
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px',
                                padding: '10px 16px',
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                borderRadius: '10px',
                                border: '1px solid #d1d5db',
                                backgroundColor: 'white',
                                color: '#374151',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            Cerrar Sesión
                        </button>
                    </div>
                </header>
                <div className="carga-content">
                    <DataEntryPanel key={refreshKey} />
                </div>
            </div>
        )
    }

    // Render standalone Simon portal if in dedicated mode
    if (isDedicatedSimonMode) {
        const roleLabels = {
            coordinador: 'Coordinador',
            gerente: 'Gte. Administrativo',
            agente: 'Agente',
            refuerzo: 'Refuerzo',
            simon: 'Asistente Simon',
        }
        
        const roleColors = {
            coordinador: '#10b981',
            gerente: '#8b5cf6',
            agente: '#3b82f6',
            refuerzo: '#f59e0b',
            simon: '#ec4899',
        }
        
        const userRole = profile?.role || 'operador'

        return (
            <div className="carga-layout">
                <header className="carga-header" style={{ borderBottom: '1px solid #e2e8f0', background: 'white' }}>
                    <div className="carga-header-left">
                        <div className="carga-logo">
                            <img src="/logosanatorio.png" alt="Sanatorio Argentino" />
                        </div>
                        <div className="carga-brand-info">
                            <h1>Asistente Documental — Simon IA</h1>
                            <span>Sanatorio Argentino</span>
                        </div>
                    </div>
                    <div className="carga-header-right">
                        {profile && (
                            <div className="carga-user-info">
                                <span className="carga-user-name">{profile.full_name}</span>
                                <span 
                                    className="carga-user-role"
                                    style={{
                                        background: (roleColors[userRole] || '#64748b') + '22',
                                        color: roleColors[userRole] || '#64748b'
                                    }}
                                >
                                    {roleLabels[userRole] || userRole}
                                </span>
                            </div>
                        )}
                        <button 
                            className="btn btn-secondary" 
                            onClick={async () => {
                                try {
                                    await signOut()
                                } catch (err) {
                                    console.error('Error signing out:', err)
                                }
                            }}
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px',
                                padding: '10px 16px',
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                borderRadius: '10px',
                                border: '1px solid #d1d5db',
                                backgroundColor: 'white',
                                color: '#374151',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            Cerrar Sesión
                        </button>
                    </div>
                </header>
                <div className="carga-content" style={{ padding: 0, height: 'calc(100vh - 73px)' }}>
                    <RAGPanel key={refreshKey} />
                </div>
            </div>
        )
    }

    const handleRefresh = () => {
        setIsRefreshing(true)
        setShowRefreshDone(false)
        setForceRefreshCount(prev => prev + 1)
        setRefreshKey(prev => prev + 1)
        // Reset visual state after a reasonable time
        setTimeout(() => {
            setIsRefreshing(false)
            setShowRefreshDone(true)
            setTimeout(() => setShowRefreshDone(false), 2000)
        }, 3000)
    }

    const handleViewChange = (view, pushHistory = true) => {
        setActiveView(view)
        setMobileOpen(false) // Close sidebar on mobile after selecting

        if (pushHistory) {
            const targetPath = VIEW_TO_PATH[view] || `/${view}`
            if (window.location.pathname !== targetPath) {
                window.history.pushState({ view }, '', targetPath)
            }
        }
    }

    const navigateToConversation = (ticketId) => {
        setPendingTicketId(ticketId)
        handleViewChange('conversations')
    }

    const renderView = () => {
        switch (activeView) {
            case 'overview': return <OverviewPanel key={refreshKey} onNavigateToChat={navigateToConversation} forceRefresh={forceRefreshCount} />
            case 'agents': return <AgentsPanel key={refreshKey} />
            case 'chatbot': return <ChatbotPanel key={refreshKey} />
            case 'conversations': return <ConversationsPanel key={refreshKey} initialTicketId={pendingTicketId} onTicketConsumed={() => setPendingTicketId(null)} />
            case 'rag': return <RAGPanel key={refreshKey} />
            case 'rag-rules': return <RAGRules key={refreshKey} />
            case 'rag-analytics': return <SimonAnalytics key={refreshKey} />
            case 'agent-control': return <AgentControlPanel key={refreshKey} />
            case 'shifts': return <ShiftCalendar key={refreshKey} />
            case 'logbook': return <BitacoraPanel key={refreshKey} />
            case 'bi-turnos': return <TurnosDashboard key={refreshKey} />
            case 'bi-canales': return <CanalesDashboard key={refreshKey} />
            case 'data-entry': return <DataEntryPanel key={refreshKey} />
            default: return <OverviewPanel key={refreshKey} />
        }
    }

    return (
        <div className="app-layout">
            {/* Mobile overlay */}
            {mobileOpen && <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />}

            <Sidebar activeView={activeView} onViewChange={handleViewChange} mobileOpen={mobileOpen} />

            <main className="main-content">
                <header className="main-header">
                    <div className="header-left">
                        <button className="btn-mobile-menu" onClick={() => setMobileOpen(!mobileOpen)}>
                            <Menu size={20} />
                        </button>
                        <div>
                            <h2>{VIEW_TITLES[activeView]}</h2>
                            <span className="breadcrumb hide-mobile">{VIEW_DESCRIPTIONS[activeView]}</span>
                        </div>
                    </div>
                    <div className="header-right">
                        <button 
                            className={`btn btn-secondary ${isRefreshing ? 'btn-refreshing' : ''} ${showRefreshDone ? 'btn-refresh-done' : ''}`}
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                        >
                            {isRefreshing ? (
                                <><Loader2 size={14} className="spin" /><span className="hide-mobile">Actualizando...</span></>
                            ) : showRefreshDone ? (
                                <><Check size={14} /><span className="hide-mobile">Actualizado ✓</span></>
                            ) : (
                                <><RefreshCw size={14} /><span className="hide-mobile">Actualizar</span></>
                            )}
                        </button>
                    </div>
                </header>

                <div className="page-content">
                    {renderView()}
                </div>
            </main>
        </div>
    )
}

export default App

