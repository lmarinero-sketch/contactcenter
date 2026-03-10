import { useState, useEffect, useRef } from 'react'
import {
    Send, Upload, FileText, Trash2, MessageSquare,
    Plus, Loader2, ChevronRight, Brain, BookOpen,
    AlertCircle, CheckCircle, File, X, Clock,
    Search, Sparkles, Layers, BarChart3, FolderOpen, Tag,
    Download, FolderPlus, ArrowLeft, Home, Folder
} from 'lucide-react'
import {
    sendRAGMessage, listRAGConversations, getRAGConversationMessages,
    deleteRAGConversation, uploadRAGDocument, uploadRAGBatch,
    listRAGFiles, downloadRAGFile, createRAGFolder, deleteRAGFile,
    deleteRAGFolder, checkRAGHealth
} from '../api/ragClient'

// Simple markdown-ish renderer (bold, lists, sources)
function renderMarkdown(text) {
    if (!text) return ''
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^- (.*)/gm, '• $1')
        .replace(/^(\d+)\. (.*)/gm, '$1. $2')
        .replace(/\n/g, '<br/>')
}

export default function RAGPanel() {
    // State
    const [activeTab, setActiveTab] = useState('chat') // 'chat' | 'documents'
    const [conversations, setConversations] = useState([])
    const [activeConversation, setActiveConversation] = useState(null)
    const [messages, setMessages] = useState([])
    const [inputValue, setInputValue] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState('')
    const [error, setError] = useState(null)
    const [backendOnline, setBackendOnline] = useState(null)
    const [showSidebar, setShowSidebar] = useState(true)

    // File manager state
    const [fileItems, setFileItems] = useState([])
    const [currentFolder, setCurrentFolder] = useState('')
    const [totalFiles, setTotalFiles] = useState(0)
    const [uploadTag, setUploadTag] = useState('')
    const [showNewFolder, setShowNewFolder] = useState(false)
    const [newFolderName, setNewFolderName] = useState('')

    const messagesEndRef = useRef(null)
    const fileInputRef = useRef(null)
    const folderInputRef = useRef(null)

    // Check backend health on mount
    useEffect(() => {
        checkRAGHealth().then(setBackendOnline)
        loadConversations()
        loadFiles()
    }, [])

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    // Load conversations
    async function loadConversations() {
        try {
            const data = await listRAGConversations()
            setConversations(data.conversations || [])
        } catch (e) {
            console.error('Error loading conversations:', e)
        }
    }

    // Load files for current folder
    async function loadFiles(folder) {
        const f = folder !== undefined ? folder : currentFolder
        try {
            const data = await listRAGFiles(f)
            setFileItems(data.items || [])
            setTotalFiles(data.total_files || 0)
        } catch (e) {
            console.error('Error loading files:', e)
        }
    }

    // Navigate to folder
    function navigateToFolder(folderPath) {
        setCurrentFolder(folderPath)
        loadFiles(folderPath)
    }

    // Go back one level
    function goBack() {
        const parts = currentFolder.split('/').filter(Boolean)
        parts.pop()
        navigateToFolder(parts.join('/'))
    }

    // Get breadcrumb parts
    function getBreadcrumbs() {
        if (!currentFolder) return []
        return currentFolder.split('/').filter(Boolean)
    }

    // Select a conversation
    async function selectConversation(conv) {
        setActiveConversation(conv.id)
        setError(null)
        try {
            const data = await getRAGConversationMessages(conv.id)
            setMessages(data.messages || [])
        } catch (e) {
            setError('Error al cargar mensajes')
        }
    }

    // Start new conversation
    function startNewConversation() {
        setActiveConversation(null)
        setMessages([])
        setError(null)
        setInputValue('')
    }

    // Send message
    async function handleSend() {
        if (!inputValue.trim() || isLoading) return

        const question = inputValue.trim()
        setInputValue('')
        setError(null)

        // Add user message optimistically
        const userMsg = { role: 'user', content: question, created_at: new Date().toISOString() }
        setMessages(prev => [...prev, userMsg])
        setIsLoading(true)

        try {
            const result = await sendRAGMessage(question, activeConversation)

            // If new conversation was created, update state
            if (!activeConversation && result.conversation_id) {
                setActiveConversation(result.conversation_id)
                loadConversations()
            }

            // Add assistant message
            const assistantMsg = {
                role: 'assistant',
                content: result.answer,
                sources: result.sources,
                pipeline_info: result.pipeline,
                created_at: new Date().toISOString(),
            }
            setMessages(prev => [...prev, assistantMsg])
        } catch (e) {
            setError(e.message || 'Error al procesar la pregunta')
        } finally {
            setIsLoading(false)
        }
    }

    // Handle file upload (single or multiple)
    async function handleFileUpload(event) {
        const files = Array.from(event.target.files || [])
        if (!files.length) return

        setIsUploading(true)
        setError(null)

        if (files.length === 1) {
            setUploadProgress(`Procesando "${files[0].name}"...`)
            try {
                const result = await uploadRAGDocument(files[0], currentFolder, uploadTag)
                loadFiles()
                setUploadProgress(`✅ "${files[0].name}" — ${result.total_chunks} chunks`)
                setTimeout(() => setUploadProgress(''), 4000)
            } catch (e) {
                setError(e.message || 'Error al subir documento')
                setUploadProgress('')
            }
        } else {
            try {
                const result = await uploadRAGBatch(files, currentFolder, uploadTag, (p) => {
                    setUploadProgress(`Subiendo ${p.current}/${p.total}: "${p.filename}"...`)
                })
                loadFiles()
                setUploadProgress(`✅ ${result.processed} procesados, ${result.total_chunks} chunks - ${result.failed} fallidos, ${result.skipped} omitidos`)
                setTimeout(() => setUploadProgress(''), 6000)
            } catch (e) {
                setError(e.message || 'Error al subir archivos')
                setUploadProgress('')
            }
        }

        setIsUploading(false)
        setUploadTag('')
        if (fileInputRef.current) fileInputRef.current.value = ''
        if (folderInputRef.current) folderInputRef.current.value = ''
    }

    // Delete file
    async function handleDeleteFile(item) {
        const path = item.storage_path || `${item.folder}/${item.name}`.replace(/^\//, '')
        if (!confirm(`¿Eliminar "${item.name}"?`)) return
        try {
            await deleteRAGFile(path)
            loadFiles()
        } catch (e) {
            setError(e.message)
        }
    }

    // Delete folder
    async function handleDeleteFolder(item) {
        if (!confirm(`¿Eliminar carpeta "${item.name}" y todo su contenido?`)) return
        try {
            await deleteRAGFolder(item.path)
            loadFiles()
        } catch (e) {
            setError(e.message)
        }
    }

    // Create folder
    async function handleCreateFolder() {
        if (!newFolderName.trim()) return
        try {
            await createRAGFolder(newFolderName.trim(), currentFolder)
            setNewFolderName('')
            setShowNewFolder(false)
            loadFiles()
        } catch (e) {
            setError(e.message)
        }
    }

    // Download file
    async function handleDownload(item) {
        try {
            const path = item.storage_path || `${item.folder}/${item.name}`.replace(/^\//, '')
            await downloadRAGFile(path)
        } catch (e) {
            setError(e.message)
        }
    }

    // Delete conversation
    async function handleDeleteConversation(convId, e) {
        e.stopPropagation()
        if (!confirm('¿Eliminar esta conversación?')) return
        try {
            await deleteRAGConversation(convId)
            if (activeConversation === convId) {
                startNewConversation()
            }
            loadConversations()
        } catch (e) {
            setError(e.message)
        }
    }

    // Key press handler
    function handleKeyPress(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    // Format file size
    function formatFileSize(bytes) {
        if (!bytes) return '—'
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    // Format time
    function formatTime(dateStr) {
        if (!dateStr) return ''
        const d = new Date(dateStr)
        const now = new Date()
        const diff = now - d
        if (diff < 60000) return 'Ahora'
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
        return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
    }

    const FILE_ICONS = {
        '.pdf': '📄', '.docx': '📝', '.xlsx': '📊', '.xls': '📊',
        '.csv': '📋', '.txt': '📃', '.md': '📃', '.json': '🔧',
        '.xml': '🔧', '.html': '🌐', '.htm': '🌐',
    }

    return (
        <div className="rag-container">
            {/* Left: Conversation Sidebar */}
            {showSidebar && (
                <div className="rag-sidebar">
                    <div className="rag-sidebar-header">
                        <button className="btn btn-primary rag-new-chat-btn" onClick={startNewConversation}>
                            <Plus size={14} />
                            Nueva Consulta
                        </button>
                    </div>

                    {/* Tab switcher */}
                    <div className="rag-tabs">
                        <button
                            className={`rag-tab ${activeTab === 'chat' ? 'active' : ''}`}
                            onClick={() => setActiveTab('chat')}
                        >
                            <MessageSquare size={14} />
                            Chat
                        </button>
                        <button
                            className={`rag-tab ${activeTab === 'documents' ? 'active' : ''}`}
                            onClick={() => setActiveTab('documents')}
                        >
                            <FileText size={14} />
                            Archivos ({totalFiles})
                        </button>
                    </div>

                    {/* Conversation list */}
                    {activeTab === 'chat' && (
                        <div className="rag-conv-list">
                            {conversations.length === 0 ? (
                                <div className="rag-empty-state">
                                    <Brain size={32} />
                                    <p>No hay conversaciones aún</p>
                                    <span>Hacé una pregunta para comenzar</span>
                                </div>
                            ) : (
                                conversations.map(conv => (
                                    <div
                                        key={conv.id}
                                        className={`rag-conv-item ${activeConversation === conv.id ? 'active' : ''}`}
                                        onClick={() => selectConversation(conv)}
                                    >
                                        <div className="rag-conv-item-content">
                                            <span className="rag-conv-title">{conv.title || 'Sin título'}</span>
                                            <span className="rag-conv-time">
                                                <Clock size={10} />
                                                {formatTime(conv.updated_at)}
                                            </span>
                                        </div>
                                        <button
                                            className="rag-conv-delete"
                                            onClick={(e) => handleDeleteConversation(conv.id, e)}
                                            title="Eliminar conversación"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* File Manager */}
                    {activeTab === 'documents' && (
                        <div className="rag-doc-list">
                            {/* Toolbar */}
                            <div className="rag-fm-toolbar">
                                <input ref={fileInputRef} type="file" onChange={handleFileUpload}
                                    accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md,.json,.xml,.html,.htm"
                                    style={{ display: 'none' }} disabled={isUploading} multiple />
                                <input ref={folderInputRef} type="file" onChange={handleFileUpload}
                                    style={{ display: 'none' }} disabled={isUploading}
                                    webkitdirectory="" directory="" multiple />
                                <div className="rag-fm-actions">
                                    <button className="rag-fm-btn" onClick={() => fileInputRef.current?.click()}
                                        disabled={isUploading} title="Subir archivos">
                                        {isUploading ? <Loader2 size={13} className="rag-spin" /> : <Upload size={13} />}
                                    </button>
                                    <button className="rag-fm-btn" onClick={() => folderInputRef.current?.click()}
                                        disabled={isUploading} title="Subir carpeta">
                                        <FolderOpen size={13} />
                                    </button>
                                    <button className="rag-fm-btn" onClick={() => setShowNewFolder(!showNewFolder)} title="Nueva carpeta">
                                        <FolderPlus size={13} />
                                    </button>
                                </div>
                                <div className="rag-tag-input">
                                    <Tag size={11} />
                                    <input type="text" placeholder="Tag" value={uploadTag}
                                        onChange={(e) => setUploadTag(e.target.value)}
                                        disabled={isUploading} className="rag-tag-field" />
                                </div>
                            </div>

                            {/* New folder form */}
                            {showNewFolder && (
                                <div className="rag-fm-newfolder">
                                    <input type="text" placeholder="Nombre de carpeta"
                                        value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                                        className="rag-fm-newfolder-input" autoFocus />
                                    <button className="rag-fm-btn-sm" onClick={handleCreateFolder}><CheckCircle size={12} /></button>
                                    <button className="rag-fm-btn-sm" onClick={() => { setShowNewFolder(false); setNewFolderName('') }}><X size={12} /></button>
                                </div>
                            )}

                            {uploadProgress && <div className="rag-upload-status">{uploadProgress}</div>}

                            {/* Breadcrumbs */}
                            <div className="rag-fm-breadcrumbs">
                                <button className="rag-fm-crumb" onClick={() => navigateToFolder('')}>
                                    <Home size={12} />
                                </button>
                                {getBreadcrumbs().map((part, i) => {
                                    const path = getBreadcrumbs().slice(0, i + 1).join('/')
                                    return (
                                        <span key={path} className="rag-fm-crumb-item">
                                            <ChevronRight size={10} />
                                            <button className="rag-fm-crumb" onClick={() => navigateToFolder(path)}>
                                                {part}
                                            </button>
                                        </span>
                                    )
                                })}
                            </div>

                            {/* File list */}
                            {fileItems.length === 0 ? (
                                <div className="rag-empty-state">
                                    <BookOpen size={32} />
                                    <p>{currentFolder ? 'Carpeta vacía' : 'No hay archivos'}</p>
                                    <span>Subí archivos para que la IA pueda consultarlos</span>
                                </div>
                            ) : (
                                fileItems.map(item => (
                                    item.type === 'folder' ? (
                                        <div key={item.path} className="rag-doc-item rag-folder-item"
                                            onClick={() => navigateToFolder(item.path)} style={{ cursor: 'pointer' }}>
                                            <div className="rag-doc-icon"><Folder size={18} color="#3b82f6" /></div>
                                            <div className="rag-doc-info">
                                                <span className="rag-doc-name">{item.name}</span>
                                                <span className="rag-doc-meta">Carpeta</span>
                                            </div>
                                            <button className="rag-doc-delete" onClick={(e) => { e.stopPropagation(); handleDeleteFolder(item) }} title="Eliminar carpeta">
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    ) : (
                                        <div key={item.name} className="rag-doc-item">
                                            <div className="rag-doc-icon">{FILE_ICONS[item.file_type] || '📄'}</div>
                                            <div className="rag-doc-info">
                                                <span className="rag-doc-name">{item.name}</span>
                                                <span className="rag-doc-meta">
                                                    {item.total_chunks} chunks · {formatFileSize(item.file_size)}
                                                    {item.tag && <span className="rag-doc-tag">{item.tag}</span>}
                                                </span>
                                            </div>
                                            <button className="rag-doc-action" onClick={() => handleDownload(item)} title="Descargar">
                                                <Download size={12} />
                                            </button>
                                            <button className="rag-doc-delete" onClick={() => handleDeleteFile(item)} title="Eliminar">
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    )
                                ))
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Right: Chat Area */}
            <div className="rag-chat-area">
                {/* Status bar */}
                <div className="rag-status-bar">
                    <button
                        className="rag-sidebar-toggle"
                        onClick={() => setShowSidebar(!showSidebar)}
                        title={showSidebar ? 'Ocultar panel' : 'Mostrar panel'}
                    >
                        <ChevronRight size={16} style={{ transform: showSidebar ? 'rotate(180deg)' : 'none' }} />
                    </button>
                    <div className="rag-status-info">
                        <Brain size={16} />
                        <span className="rag-status-title">Asistente IA Documental</span>
                    </div>
                    <div className="rag-status-indicators">
                        <span className={`rag-status-dot ${backendOnline ? 'online' : 'offline'}`} />
                        <span className="rag-status-label">
                            {backendOnline === null ? 'Verificando...' : backendOnline ? 'Backend Online' : 'Backend Offline'}
                        </span>
                        <span className="badge info" style={{ marginLeft: 8 }}>
                            {totalFiles} docs
                        </span>
                    </div>
                </div>

                {/* Messages */}
                <div className="rag-messages">
                    {messages.length === 0 && !isLoading ? (
                        <div className="rag-welcome">
                            <div className="rag-welcome-icon">
                                <Brain size={48} />
                            </div>
                            <h3>Asistente IA Documental</h3>
                            <p>Preguntá lo que necesites sobre los documentos cargados. Las respuestas incluyen citación de fuentes.</p>
                            <div className="rag-welcome-features">
                                <div className="rag-feature">
                                    <Search size={18} />
                                    <span>Búsqueda Híbrida</span>
                                </div>
                                <div className="rag-feature">
                                    <Sparkles size={18} />
                                    <span>Re-ranking IA</span>
                                </div>
                                <div className="rag-feature">
                                    <Layers size={18} />
                                    <span>Multi-Query</span>
                                </div>
                                <div className="rag-feature">
                                    <BookOpen size={18} />
                                    <span>Citación Obligatoria</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        messages.map((msg, i) => (
                            <div key={i} className={`rag-message ${msg.role}`}>
                                <div className="rag-message-avatar">
                                    {msg.role === 'user' ? '👤' : '🧠'}
                                </div>
                                <div className="rag-message-content">
                                    <div
                                        className="rag-message-text"
                                        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                                    />
                                    {/* Sources */}
                                    {msg.sources && msg.sources.length > 0 && (
                                        <div className="rag-sources">
                                            <div className="rag-sources-header">
                                                <FileText size={12} />
                                                Fuentes consultadas
                                            </div>
                                            {msg.sources.map((src, j) => (
                                                <div key={j} className="rag-source-item">
                                                    <span className="rag-source-icon">{FILE_ICONS[src.file_type] || '📄'}</span>
                                                    <span className="rag-source-name">{src.filename}</span>
                                                    <span className="badge info">{src.chunks_used} chunks</span>
                                                    {src.rerank_score > 0 && (
                                                        <span className="badge positive">{src.rerank_score}/10</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {/* Pipeline info */}
                                    {msg.pipeline_info && (
                                        <div className="rag-pipeline-info">
                                            <BarChart3 size={11} />
                                            <span>HyDE: {msg.pipeline_info.hyde_generated ? '✓' : '✗'}</span>
                                            <span>Queries: {(msg.pipeline_info.multi_queries || 0) + 1}</span>
                                            <span>Buscados: {msg.pipeline_info.total_searched}</span>
                                            <span>Únicos: {msg.pipeline_info.unique_results}</span>
                                            <span>Usados: {msg.pipeline_info.reranked_kept}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}

                    {/* Loading state */}
                    {isLoading && (
                        <div className="rag-message assistant">
                            <div className="rag-message-avatar">🧠</div>
                            <div className="rag-message-content">
                                <div className="rag-thinking">
                                    <Loader2 size={16} className="rag-spin" />
                                    <span>Analizando documentos...</span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Error */}
                {error && (
                    <div className="rag-error">
                        <AlertCircle size={14} />
                        {error}
                        <button onClick={() => setError(null)}><X size={12} /></button>
                    </div>
                )}

                {/* Input */}
                <div className="rag-input-area">
                    <div className="rag-input-wrapper">
                        <textarea
                            className="rag-input"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyPress}
                            placeholder="Escribí tu pregunta sobre los documentos..."
                            rows={1}
                            disabled={isLoading || !backendOnline}
                        />
                        <button
                            className="rag-send-btn"
                            onClick={handleSend}
                            disabled={!inputValue.trim() || isLoading || !backendOnline}
                        >
                            {isLoading ? <Loader2 size={18} className="rag-spin" /> : <Send size={18} />}
                        </button>
                    </div>
                    <div className="rag-input-hint">
                        Respuestas basadas exclusivamente en documentos cargados · Enter para enviar
                    </div>
                </div>
            </div>
        </div>
    )
}
