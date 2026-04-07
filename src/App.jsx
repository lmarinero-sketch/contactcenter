import { useState } from 'react'
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

const VIEW_TITLES = {
    overview: 'Overview',
    agents: 'Performance de Agentes',
    chatbot: 'Chatbot Analytics',
    conversations: 'Conversaciones',
    rag: 'Simon IA',
    'rag-rules': 'Reglas de Simon',
    'rag-analytics': 'Analytics de Simon',
    shifts: 'Diagrama de Turnos',
    logbook: 'Bitácora',
}

const VIEW_DESCRIPTIONS = {
    overview: 'Vista general del Contact Center',
    agents: 'Análisis detallado del rendimiento de cada agente',
    chatbot: 'Árbol de decisiones y efectividad del bot',
    conversations: 'Explorar conversaciones individuales',
    rag: 'Consultá documentos internos con IA — respuestas precisas con citación de fuentes',
    'rag-rules': 'Ingresá reglas e información que Simon debe recordar al responder',
    'rag-analytics': 'Métricas de uso, rendimiento y calidad de Simon IA',
    shifts: 'Calendario mensual de turnos del equipo',
    logbook: 'Registro de novedades, sugerencias, problemas y cambios',
}

function App() {
    const { user, profile, loading } = useAuth()
    const [activeView, setActiveView] = useState('overview')
    const [refreshKey, setRefreshKey] = useState(0)
    const [pendingTicketId, setPendingTicketId] = useState(null)
    const [mobileOpen, setMobileOpen] = useState(false)

    const [forceRefreshCount, setForceRefreshCount] = useState(0)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [showRefreshDone, setShowRefreshDone] = useState(false)

    // Loading state
    if (loading) {
        return (
            <div className="app-loading">
                <Loader2 size={32} className="spin" />
                <span>Cargando...</span>
            </div>
        )
    }

    // Not authenticated → show login
    if (!user) {
        return <LoginPage />
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

    const navigateToConversation = (ticketId) => {
        setPendingTicketId(ticketId)
        setActiveView('conversations')
    }

    const handleViewChange = (view) => {
        setActiveView(view)
        setMobileOpen(false) // Close sidebar on mobile after selecting
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
            case 'shifts': return <ShiftCalendar key={refreshKey} />
            case 'logbook': return <BitacoraPanel key={refreshKey} />
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

