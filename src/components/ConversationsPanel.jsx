import { useState, useEffect } from 'react'
import { MessageSquare, ChevronRight, X, User, Bot as BotIcon, Info, Phone, Mail, MapPin, Calendar, Shield, Stethoscope, Download, Image as ImageIcon } from 'lucide-react'
import { fetchTickets, fetchTicketDetail, fetchAgentList, exportToCSV } from '../services/dataService'
import { format } from 'date-fns'

// Check if a string is an image URL
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']
function isImageUrl(text) {
    if (!text) return false
    const trimmed = text.trim()
    try {
        const url = new URL(trimmed)
        return IMAGE_EXTENSIONS.some(ext => url.pathname.toLowerCase().endsWith(ext))
    } catch {
        return false
    }
}

// Tooltip label helper
function Tip({ text, children }) {
    return (
        <span className="analysis-label" title={text}>
            {children}
            <Info size={11} />
        </span>
    )
}

export default function ConversationsPanel({ initialTicketId, onTicketConsumed }) {
    const [tickets, setTickets] = useState([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [agents, setAgents] = useState([])
    const [selectedTicket, setSelectedTicket] = useState(null)
    const [detailData, setDetailData] = useState(null)
    const [detailLoading, setDetailLoading] = useState(false)
    const [lightboxUrl, setLightboxUrl] = useState(null)

    // Filters
    const [filterAgent, setFilterAgent] = useState('')
    const [page, setPage] = useState(0)
    const PAGE_SIZE = 20

    useEffect(() => { loadAgents() }, [])
    useEffect(() => { loadTickets() }, [filterAgent, page])

    // Auto-open a ticket when navigated from Overview
    useEffect(() => {
        if (initialTicketId) {
            openDetail(initialTicketId)
            onTicketConsumed?.()
        }
    }, [initialTicketId])

    async function loadAgents() {
        try {
            const data = await fetchAgentList()
            setAgents(data)
        } catch (err) { console.error('Error loading agents:', err) }
    }

    async function loadTickets() {
        try {
            setLoading(true)
            const { tickets: data, total: count } = await fetchTickets({
                limit: PAGE_SIZE, offset: page * PAGE_SIZE,
                agent: filterAgent || null,
            })
            setTickets(data)
            setTotal(count)
        } catch (err) { console.error('Error loading tickets:', err) }
        finally { setLoading(false) }
    }

    async function openDetail(ticketId) {
        try {
            setSelectedTicket(ticketId)
            setDetailLoading(true)
            const data = await fetchTicketDetail(ticketId)
            setDetailData(data)
        } catch (err) { console.error('Error loading detail:', err) }
        finally { setDetailLoading(false) }
    }

    function closeDetail() { setSelectedTicket(null); setDetailData(null) }

    const getSentimentBadge = (sentiment) => {
        const map = { 'positive': 'positive', 'neutral': 'neutral', 'negative': 'negative', 'frustrated': 'frustrated' }
        return <span className={`badge ${map[sentiment] || 'neutral'}`}>{sentiment || 'N/A'}</span>
    }

    const formatDate = (dateStr) => {
        if (!dateStr) return '—'
        try { return format(new Date(dateStr), 'dd/MM/yyyy HH:mm') } catch { return dateStr }
    }

    const getChannelBadge = (channel) => {
        if (!channel) return null
        const ch = channel.toUpperCase()
        if (ch === 'WHATSAPP') return <span className="channel-badge whatsapp">📱 WA</span>
        if (ch === 'WEB') return <span className="channel-badge web">🌐 Web</span>
        return <span className="channel-badge web">{ch}</span>
    }

    // Extract rich patient data from raw_payload
    const getPatientData = (ticket) => {
        const raw = ticket?.raw_payload
        if (!raw) return null
        const customer = raw.customer || {}
        const customFields = raw.custom_fields || raw.customFields || {}
        return {
            name: customer.name || ticket.customer_name || null,
            email: customer.email || ticket.customer_email || null,
            phone: customer.phone || ticket.customer_phone || null,
            country: customer.country_name || ticket.customer_country_name || null,
            browser: customer.browser_os || null,
            channel: raw.channel || ticket.channel || null,
            botName: raw.bot?.name || ticket.bot_name || null,
            department: raw.department?.name || ticket.department_name || null,
            dni: customFields.dni || customFields.Dni || customFields.DNI || raw.dni || null,
            patientName: customFields.paciente_nombre || customFields['Paciente nombre'] || raw.paciente_nombre || null,
            birthDate: customFields.fecha_nacimiento || customFields['Fecha nacimiento'] || raw.fecha_nacimiento || null,
            obraSocial: customFields.obra_social || customFields['Obra social'] || raw.obra_social || null,
            specialty: customFields.medico_especialidad || customFields['Medico especialidad'] || raw.medico_especialidad || null,
            appointmentDate: customFields.turnos_dia_hora || customFields['Turnos dia hora'] || raw.turnos_dia_hora || null,
        }
    }

    const totalPages = Math.ceil(total / PAGE_SIZE)

    return (
        <div className="fade-in" style={{ display: 'flex', gap: '0', height: 'calc(100vh - var(--header-height) - 48px)' }}>
            {/* Left: List */}
            <div style={{ flex: selectedTicket ? '0 0 42%' : '1', display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'flex 0.3s ease' }}>
                <div className="filters-bar" style={{ padding: '0 0 12px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <select className="filter-select" value={filterAgent} onChange={(e) => { setFilterAgent(e.target.value); setPage(0) }}>
                        <option value="">Todos los agentes</option>
                        {agents.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>{total} conversaciones</span>
                </div>

                <div className="card" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {loading ? (
                            <div className="loading-spinner"><div className="spinner"></div></div>
                        ) : tickets.length === 0 ? (
                            <div className="empty-state">
                                <MessageSquare />
                                <h3>Sin conversaciones</h3>
                                <p>No se encontraron conversaciones con los filtros aplicados.</p>
                            </div>
                        ) : (
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Ticket</th>
                                        <th>Cliente</th>
                                        <th>Agente</th>
                                        <th title="Sentimiento: cómo se sintió el paciente. Positivo = conforme, Neutral = sin emoción clara, Negativo/Frustrated = insatisfecho.">
                                            Sentimiento
                                        </th>
                                        <th title="Intención: el motivo real por el cual el paciente se comunicó (ej: solicitar turno, cancelar turno, consulta).">
                                            Intención
                                        </th>
                                        <th>Fecha</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tickets.map(ticket => {
                                        const analysis = Array.isArray(ticket.cc_analysis) ? ticket.cc_analysis[0] : ticket.cc_analysis
                                        return (
                                            <tr
                                                key={ticket.ticket_id}
                                                style={{ cursor: 'pointer', background: selectedTicket === ticket.ticket_id ? '#e8f4fc' : undefined }}
                                                onClick={() => openDetail(ticket.ticket_id)}
                                            >
                                                <td><code style={{ fontSize: '11px', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>{ticket.ticket_id}</code></td>
                                                <td style={{ fontWeight: 500 }}>{ticket.customer_name || '—'}</td>
                                                <td>
                                                    {ticket.agent_name
                                                        ? <span style={{ fontWeight: 500 }}>{ticket.agent_name}</span>
                                                        : <span className="bot-label"><BotIcon size={13} /> Bot</span>
                                                    }
                                                </td>
                                                <td>{getSentimentBadge(analysis?.overall_sentiment)}</td>
                                                <td>
                                                    <span className="badge info" style={{ fontSize: '11px' }}>
                                                        {analysis?.detected_intent || 'Sin análisis'}
                                                    </span>
                                                </td>
                                                <td style={{ fontSize: '12px', color: '#64748b' }}>{formatDate(ticket.received_at)}</td>
                                                <td><ChevronRight size={14} color="#94a3b8" /></td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', padding: '12px', borderTop: '1px solid #e2e8f0' }}>
                            <button className="btn btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
                            <span style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center' }}>Pág {page + 1} de {totalPages}</span>
                            <button className="btn btn-secondary btn-sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Siguiente</button>
                        </div>
                    )}
                </div>
            </div>

            {/* Right: Detail Panel */}
            {selectedTicket && (
                <div className="slide-in-right" style={{
                    flex: '0 0 58%', marginLeft: '16px', display: 'flex', flexDirection: 'column',
                    overflow: 'hidden', borderRadius: 'var(--radius-md)',
                }}>
                    <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {/* Header */}
                        <div className="card-header" style={{ flexShrink: 0, borderBottom: '2px solid var(--blue-100)' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <h3 style={{ margin: 0 }}>Conversación {selectedTicket}</h3>
                                    {detailData?.ticket && getChannelBadge(detailData.ticket.channel)}
                                </div>
                                {detailData?.ticket && (
                                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                                        {detailData.ticket.customer_name} • {detailData.ticket.agent_name || 'Solo Bot'} • {formatDate(detailData.ticket.received_at)}
                                    </span>
                                )}
                            </div>
                            <button className="btn btn-secondary btn-sm" onClick={closeDetail}>
                                <X size={14} />
                            </button>
                        </div>

                        {detailLoading ? (
                            <div className="loading-spinner"><div className="spinner"></div></div>
                        ) : detailData ? (
                            <div style={{ flex: 1, overflowY: 'auto' }}>

                                {/* Patient Data */}
                                {detailData.ticket && (() => {
                                    const pd = getPatientData(detailData.ticket)
                                    if (!pd) return null
                                    const hasCustom = pd.dni || pd.patientName || pd.obraSocial || pd.specialty || pd.appointmentDate
                                    return (
                                        <div className="patient-data-section">
                                            <div className="patient-data-title">📋 Datos del Paciente</div>
                                            <div className="patient-data-grid">
                                                {pd.channel && <PatientField icon="📱" label="Canal" value={pd.channel} />}
                                                {pd.phone && <PatientField icon={<Phone size={12} />} label="Teléfono" value={pd.phone} />}
                                                {pd.email && <PatientField icon={<Mail size={12} />} label="Email" value={pd.email} />}
                                                {pd.country && <PatientField icon={<MapPin size={12} />} label="Ubicación" value={pd.country} />}
                                                {pd.department && <PatientField icon="🏢" label="Departamento" value={pd.department} />}
                                                {pd.botName && <PatientField icon="🤖" label="Chatbot" value={pd.botName} />}
                                                {hasCustom && <>
                                                    {pd.patientName && <PatientField icon={<User size={12} />} label="Paciente" value={pd.patientName} />}
                                                    {pd.dni && <PatientField icon={<Shield size={12} />} label="DNI" value={pd.dni} />}
                                                    {pd.birthDate && <PatientField icon={<Calendar size={12} />} label="Nacimiento" value={pd.birthDate} />}
                                                    {pd.obraSocial && <PatientField icon="🏥" label="Obra Social" value={pd.obraSocial} />}
                                                    {pd.specialty && <PatientField icon={<Stethoscope size={12} />} label="Especialidad" value={pd.specialty} />}
                                                    {pd.appointmentDate && <PatientField icon={<Calendar size={12} />} label="Turno" value={pd.appointmentDate} />}
                                                </>}
                                                {pd.browser && <PatientField icon="💻" label="Dispositivo" value={pd.browser} />}
                                            </div>
                                        </div>
                                    )
                                })()}

                                {/* Analysis */}
                                {detailData.analysis && (
                                    <div className="analysis-section">
                                        <div className="analysis-grid">
                                            <div className="analysis-item">
                                                <Tip text="Intención detectada: el motivo por el cual el paciente se comunicó. Se detecta automáticamente por IA analizando el contenido completo de la conversación.">
                                                    Intención
                                                </Tip>
                                                <span className="badge info">{detailData.analysis.detected_intent}</span>
                                            </div>
                                            <div className="analysis-item">
                                                <Tip text="Sentimiento: cómo se sintió el paciente. Positivo = conforme. Neutro = sin emoción clara. Negativo/Frustrated = insatisfecho. Score de -1.0 a +1.0.">
                                                    Sentimiento
                                                </Tip>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    {getSentimentBadge(detailData.analysis.overall_sentiment)}
                                                    {detailData.analysis.sentiment_score != null && (
                                                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                                                            ({detailData.analysis.sentiment_score > 0 ? '+' : ''}{detailData.analysis.sentiment_score.toFixed(2)})
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="analysis-item">
                                                <Tip text="Tono del agente: cordial = amable y servicial. Profesional = formal y correcto. Empático = muestra comprensión. Informal = casual. Brusco = seco o poco cortés.">
                                                    Tono Agente
                                                </Tip>
                                                <span className="badge neutral">{detailData.analysis.agent_tone}</span>
                                            </div>
                                        </div>

                                        <div className="analysis-grid">
                                            <div className="analysis-item">
                                                <Tip text="Si el agente saluda y se despide correctamente del paciente.">
                                                    Saludo / Despedida
                                                </Tip>
                                                <span style={{ fontSize: '12px' }}>
                                                    {detailData.analysis.agent_greeting ? '✅' : '❌'} Saluda
                                                    {' • '}
                                                    {detailData.analysis.agent_farewell ? '✅' : '❌'} Despide
                                                </span>
                                            </div>
                                            <div className="analysis-item">
                                                <Tip text="Tiempo que tardó el agente en responder por primera vez al paciente.">
                                                    Tiempos
                                                </Tip>
                                                <span style={{ fontSize: '12px', color: '#475569' }}>
                                                    1ª resp: {detailData.analysis.first_response_time_seconds ? `${detailData.analysis.first_response_time_seconds}s` : '—'}
                                                </span>
                                            </div>
                                        </div>

                                        {detailData.analysis.conversation_summary && (
                                            <div className="analysis-summary">
                                                💡 {detailData.analysis.conversation_summary}
                                            </div>
                                        )}

                                        {detailData.analysis.bot_first_choice && (
                                            <div className="analysis-path">
                                                <Tip text="Camino del Bot: las opciones que eligió el paciente dentro del menú del chatbot automático.">
                                                    🌳 Camino
                                                </Tip>
                                                <span style={{ marginLeft: '4px' }}>
                                                    {[detailData.analysis.bot_first_choice, detailData.analysis.bot_second_choice, detailData.analysis.bot_third_choice].filter(Boolean).join(' → ')}
                                                </span>
                                            </div>
                                        )}

                                        {detailData.analysis.improvement_suggestions?.length > 0 && (
                                            <div className="analysis-suggestions">
                                                <div className="analysis-suggestions-title">💡 Sugerencias de Mejora</div>
                                                {detailData.analysis.improvement_suggestions.map((s, i) => (
                                                    <div key={i} className="analysis-suggestion-item">• {s}</div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Messages */}
                                <div className="conversation-messages">
                                    {detailData.messages.map((msg, i) => (
                                        <div key={i} className={`message-bubble ${msg.action === 'OUT' ? 'outgoing' : 'incoming'}`}>
                                            <div className="message-sender">
                                                {msg.action === 'OUT' ? <BotIcon size={12} /> : <User size={12} />}
                                                {msg.sender_name}
                                            </div>
                                            {isImageUrl(msg.message) ? (
                                                <div>
                                                    <img
                                                        src={msg.message.trim()}
                                                        alt="Imagen enviada"
                                                        className="message-image"
                                                        onClick={() => setLightboxUrl(msg.message.trim())}
                                                        loading="lazy"
                                                    />
                                                    <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <ImageIcon size={10} /> Imagen
                                                    </div>
                                                </div>
                                            ) : (
                                                <div>{msg.message}</div>
                                            )}
                                            <div className="message-time">{formatDate(msg.message_timestamp)}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Lightbox */}
                                {lightboxUrl && (
                                    <div className="lightbox-overlay" onClick={() => setLightboxUrl(null)}>
                                        <img src={lightboxUrl} alt="Imagen ampliada" />
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </div>
                </div>
            )}
        </div>
    )
}

function PatientField({ icon, label, value }) {
    return (
        <div className="patient-field">
            <span className="patient-field-icon">{icon}</span>
            <span className="patient-field-label">{label}:</span>
            <span className="patient-field-value">{value}</span>
        </div>
    )
}
