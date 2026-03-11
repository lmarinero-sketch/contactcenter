import { useState } from 'react'
import { RefreshCw, Calendar } from 'lucide-react'
import Sidebar from './components/Sidebar'
import OverviewPanel from './components/OverviewPanel'
import AgentsPanel from './components/AgentsPanel'
import ChatbotPanel from './components/ChatbotPanel'
import ConversationsPanel from './components/ConversationsPanel'
import RAGPanel from './components/RAGPanel'

const VIEW_TITLES = {
    overview: 'Overview',
    agents: 'Performance de Agentes',
    chatbot: 'Chatbot Analytics',
    conversations: 'Conversaciones',
    rag: 'Simon IA',
}

const VIEW_DESCRIPTIONS = {
    overview: 'Vista general del Contact Center',
    agents: 'Análisis detallado del rendimiento de cada agente',
    chatbot: 'Árbol de decisiones y efectividad del bot',
    conversations: 'Explorar conversaciones individuales',
    rag: 'Consultá documentos internos con IA — respuestas precisas con citación de fuentes',
}

function App() {
    const [activeView, setActiveView] = useState('overview')
    const [refreshKey, setRefreshKey] = useState(0)
    const [pendingTicketId, setPendingTicketId] = useState(null)

    const handleRefresh = () => setRefreshKey(prev => prev + 1)

    const navigateToConversation = (ticketId) => {
        setPendingTicketId(ticketId)
        setActiveView('conversations')
    }

    const renderView = () => {
        switch (activeView) {
            case 'overview': return <OverviewPanel key={refreshKey} onNavigateToChat={navigateToConversation} />
            case 'agents': return <AgentsPanel key={refreshKey} />
            case 'chatbot': return <ChatbotPanel key={refreshKey} />
            case 'conversations': return <ConversationsPanel key={refreshKey} initialTicketId={pendingTicketId} onTicketConsumed={() => setPendingTicketId(null)} />
            case 'rag': return <RAGPanel key={refreshKey} />
            default: return <OverviewPanel key={refreshKey} />
        }
    }

    return (
        <div className="app-layout">
            <Sidebar activeView={activeView} onViewChange={setActiveView} />

            <main className="main-content">
                <header className="main-header">
                    <div className="header-left">
                        <div>
                            <h2>{VIEW_TITLES[activeView]}</h2>
                            <span className="breadcrumb">{VIEW_DESCRIPTIONS[activeView]}</span>
                        </div>
                    </div>
                    <div className="header-right">
                        <button className="btn btn-secondary" onClick={handleRefresh}>
                            <RefreshCw size={14} />
                            Actualizar
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
