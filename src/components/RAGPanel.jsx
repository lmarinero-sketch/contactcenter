import { useState, useEffect, useRef } from 'react'
import {
    Send, Upload, FileText, Trash2, MessageSquare,
    Plus, Loader2, ChevronRight, Brain, BookOpen,
    AlertCircle, CheckCircle, File, X, Clock,
    Search, Sparkles, Layers, BarChart3, FolderOpen, Tag,
    Download, FolderPlus, ArrowLeft, Home, Folder,
    Lightbulb, GraduationCap, HelpCircle, Shield, FileWarning,
    Info
} from 'lucide-react'
import {
    sendRAGMessage, listRAGConversations, getRAGConversationMessages,
    deleteRAGConversation, uploadRAGDocument, uploadRAGBatch,
    listRAGFiles, downloadRAGFile, createRAGFolder, deleteRAGFile,
    deleteRAGFolder, checkRAGHealth
} from '../api/ragClient'
import RAGHelp from './RAGHelp'

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
    const [learningStats, setLearningStats] = useState(null)
    const [showSidebar, setShowSidebar] = useState(true)
    const [showHelp, setShowHelp] = useState(false)

    // Session state — Simon boot sequence
    const [sessionStarted, setSessionStarted] = useState(false)
    const [bootPhase, setBootPhase] = useState('idle') // idle | waking | connecting | loading | ready | error
    const [bootTimer, setBootTimer] = useState(0)

    // File manager state
    const [fileItems, setFileItems] = useState([])
    const [currentFolder, setCurrentFolder] = useState('')
    const [totalFiles, setTotalFiles] = useState(0)
    const [uploadTag, setUploadTag] = useState('')
    const [showNewFolder, setShowNewFolder] = useState(false)
    const [newFolderName, setNewFolderName] = useState('')

    // Upload confirmation modal state
    const [showUploadModal, setShowUploadModal] = useState(false)
    const [pendingFiles, setPendingFiles] = useState([])

    const messagesEndRef = useRef(null)
    const fileInputRef = useRef(null)
    const folderInputRef = useRef(null)
    const bootTimerRef = useRef(null)

    // Start Simon boot sequence
    async function startSimon() {
        setSessionStarted(true)
        setBootPhase('waking')
        setBootTimer(0)

        // Start timer
        const startTime = Date.now()
        bootTimerRef.current = setInterval(() => {
            setBootTimer(Math.floor((Date.now() - startTime) / 1000))
        }, 1000)

        // Phase 1: Wake up server
        const maxAttempts = 30 // ~60 seconds max
        let online = false
        for (let i = 0; i < maxAttempts; i++) {
            online = await checkRAGHealth()
            if (online) break
            await new Promise(r => setTimeout(r, 2000))
        }

        if (!online) {
            setBootPhase('error')
            setBackendOnline(false)
            clearInterval(bootTimerRef.current)
            return
        }

        setBackendOnline(true)

        // Phase 2: Connect AI
        setBootPhase('connecting')
        await new Promise(r => setTimeout(r, 800))

        // Phase 3: Load data
        setBootPhase('loading')
        await Promise.all([
            loadConversations(),
            loadFiles(),
            loadLearningStats(),
        ])

        // Phase 4: Ready!
        setBootPhase('ready')
        clearInterval(bootTimerRef.current)

        // Auto-dismiss after brief delay
        await new Promise(r => setTimeout(r, 1200))
        setBootPhase('done')
    }

    // Load learning stats
    async function loadLearningStats() {
        try {
            const RAG_API_BASE = import.meta.env.VITE_RAG_API_URL || '/rag-api'
            const resp = await fetch(`${RAG_API_BASE}/learning/stats`)
            if (resp.ok) {
                const data = await resp.json()
                setLearningStats(data)
            }
        } catch (e) {
            console.error('Error loading learning stats:', e)
        }
    }

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

            // Handle disambiguation/clarification response
            if (result.type === 'clarification') {
                const clarificationMsg = {
                    role: 'assistant',
                    content: result.answer,
                    type: 'clarification',
                    suggestions: result.suggestions || [],
                    pipeline_info: result.pipeline,
                    created_at: new Date().toISOString(),
                }
                setMessages(prev => [...prev, clarificationMsg])
            } else {
                // Normal answer
                const assistantMsg = {
                    role: 'assistant',
                    content: result.answer,
                    sources: result.sources,
                    pipeline_info: result.pipeline,
                    created_at: new Date().toISOString(),
                }
                setMessages(prev => [...prev, assistantMsg])
                // Refresh learning stats after successful answer
                loadLearningStats()
            }
        } catch (e) {
            setError(e.message || 'Error al procesar la pregunta')
        } finally {
            setIsLoading(false)
        }
    }

    // Supported extensions for filtering
    const SUPPORTED_EXTS = ['.pdf', '.docx', '.xlsx', '.xls', '.csv', '.txt', '.md', '.json', '.xml', '.html', '.htm']

    // Handle file selection — show confirmation modal
    function handleFileSelect(event) {
        const files = Array.from(event.target.files || [])
        if (!files.length) return
        setPendingFiles(files)
        setShowUploadModal(true)
    }

    // Get upload summary for the modal
    function getUploadSummary(files) {
        const supported = []
        const unsupported = []
        let totalSize = 0
        const typeCounts = {}

        for (const file of files) {
            const ext = '.' + file.name.split('.').pop().toLowerCase()
            totalSize += file.size
            if (SUPPORTED_EXTS.includes(ext)) {
                supported.push(file)
                typeCounts[ext] = (typeCounts[ext] || 0) + 1
            } else {
                unsupported.push(file)
            }
        }

        // Detect folder name from webkitRelativePath
        let folderName = ''
        if (files[0]?.webkitRelativePath) {
            folderName = files[0].webkitRelativePath.split('/')[0]
        }

        return { supported, unsupported, totalSize, typeCounts, folderName }
    }

    // Confirm upload from modal
    async function confirmUpload() {
        setShowUploadModal(false)
        const files = pendingFiles
        setPendingFiles([])

        if (!files.length) return

        setIsUploading(true)
        setError(null)

        // Filter to supported files only
        const supportedFiles = files.filter(f => {
            const ext = '.' + f.name.split('.').pop().toLowerCase()
            return SUPPORTED_EXTS.includes(ext)
        })

        if (supportedFiles.length === 0) {
            setError('Ninguno de los archivos seleccionados tiene un formato soportado')
            setIsUploading(false)
            return
        }

        if (supportedFiles.length === 1) {
            setUploadProgress(`Procesando "${supportedFiles[0].name}"...`)
            try {
                const result = await uploadRAGDocument(supportedFiles[0], currentFolder, uploadTag)
                loadFiles()
                setUploadProgress(`✅ "${supportedFiles[0].name}" — ${result.total_chunks} chunks`)
                setTimeout(() => setUploadProgress(''), 4000)
            } catch (e) {
                setError(e.message || 'Error al subir documento')
                setUploadProgress('')
            }
        } else {
            try {
                const result = await uploadRAGBatch(supportedFiles, currentFolder, uploadTag, (p) => {
                    const retryLabel = p.retrying ? ' 🔄 Reintentando...' : ''
                    const statusParts = [`Subiendo ${p.current}/${p.total}: "${p.filename}"${retryLabel}`]
                    if (p.processed > 0) statusParts.push(`✅ ${p.processed}`)
                    if (p.failed > 0) statusParts.push(`❌ ${p.failed}`)
                    setUploadProgress(statusParts.join(' · '))
                })
                loadFiles()
                const parts = [`✅ ${result.processed} procesados`, `${result.total_chunks} chunks`]
                if (result.failed > 0) parts.push(`❌ ${result.failed} fallidos`)
                if (result.skipped > 0) parts.push(`⏭ ${result.skipped} omitidos`)
                setUploadProgress(parts.join(' · '))
                setTimeout(() => setUploadProgress(''), 8000)
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

    // Cancel upload from modal
    function cancelUpload() {
        setShowUploadModal(false)
        setPendingFiles([])
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

    // Handle clicking a disambiguation suggestion
    function handleSuggestionClick(suggestion) {
        setInputValue(suggestion)
        // Auto-send the suggestion
        setTimeout(() => {
            const fakeEvent = { key: 'Enter', shiftKey: false, preventDefault: () => {} }
            // Directly call handleSend with the suggestion
            setInputValue('')
            setError(null)
            const userMsg = { role: 'user', content: suggestion, created_at: new Date().toISOString() }
            setMessages(prev => [...prev, userMsg])
            setIsLoading(true)
            sendRAGMessage(suggestion, activeConversation)
                .then(result => {
                    if (!activeConversation && result.conversation_id) {
                        setActiveConversation(result.conversation_id)
                        loadConversations()
                    }
                    if (result.type === 'clarification') {
                        setMessages(prev => [...prev, {
                            role: 'assistant', content: result.answer,
                            type: 'clarification', suggestions: result.suggestions || [],
                            pipeline_info: result.pipeline, created_at: new Date().toISOString(),
                        }])
                    } else {
                        setMessages(prev => [...prev, {
                            role: 'assistant', content: result.answer,
                            sources: result.sources, pipeline_info: result.pipeline,
                            created_at: new Date().toISOString(),
                        }])
                        loadLearningStats()
                    }
                })
                .catch(e => setError(e.message))
                .finally(() => setIsLoading(false))
        }, 50)
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

    // === WELCOME / BOOT SCREEN ===
    if (bootPhase !== 'done') {
        return (
            <div className="simon-welcome">
                <div className="simon-welcome-card">
                    <div className="simon-avatar-container">
                        <img src="/simon.webp" alt="Simon" className="simon-avatar" />
                        <div className="simon-avatar-glow" />
                    </div>
                    <h1 className="simon-name">Simon</h1>
                    <p className="simon-subtitle">Asistente IA Documental</p>
                    <p className="simon-desc">
                        Consultá documentos del Sanatorio Argentino con inteligencia artificial.
                        Respuestas precisas con citación de fuentes.
                    </p>

                    {/* Pre-boot state */}
                    {bootPhase === 'idle' && (
                        <>
                            <button className="simon-start-btn" onClick={startSimon}>
                                <Brain size={18} />
                                Iniciar charla con Simon
                            </button>
                            <div className="simon-sleep-info">
                                <Clock size={13} />
                                <span>
                                    Simon se apaga tras <strong>15 min</strong> de inactividad y
                                    demora entre <strong>30–60 seg</strong> en volver a encenderse
                                </span>
                            </div>
                        </>
                    )}

                    {/* Boot phases */}
                    {bootPhase !== 'idle' && bootPhase !== 'error' && (
                        <div className="simon-boot">
                            <div className="simon-boot-phases">
                                <div className={`simon-boot-phase ${bootPhase === 'waking' ? 'active' : (bootPhase !== 'waking' ? 'done' : '')}`}>
                                    <div className="simon-boot-dot" />
                                    <span>Despertando servidor...</span>
                                    {bootPhase === 'waking' && <Loader2 size={12} className="rag-spin" />}
                                    {bootPhase !== 'waking' && <CheckCircle size={12} />}
                                </div>
                                <div className={`simon-boot-phase ${bootPhase === 'connecting' ? 'active' : (['loading', 'ready', 'done'].includes(bootPhase) ? 'done' : '')}`}>
                                    <div className="simon-boot-dot" />
                                    <span>Conectando IA...</span>
                                    {bootPhase === 'connecting' && <Loader2 size={12} className="rag-spin" />}
                                    {['loading', 'ready', 'done'].includes(bootPhase) && <CheckCircle size={12} />}
                                </div>
                                <div className={`simon-boot-phase ${bootPhase === 'loading' ? 'active' : (['ready', 'done'].includes(bootPhase) ? 'done' : '')}`}>
                                    <div className="simon-boot-dot" />
                                    <span>Cargando documentos...</span>
                                    {bootPhase === 'loading' && <Loader2 size={12} className="rag-spin" />}
                                    {['ready', 'done'].includes(bootPhase) && <CheckCircle size={12} />}
                                </div>
                                <div className={`simon-boot-phase ${bootPhase === 'ready' ? 'active done' : ''}`}>
                                    <div className="simon-boot-dot" />
                                    <span>¡Simon está listo!</span>
                                    {bootPhase === 'ready' && <Sparkles size={12} />}
                                </div>
                            </div>
                            <div className="simon-boot-timer">
                                <Clock size={11} />
                                {bootTimer}s
                            </div>
                        </div>
                    )}

                    {/* Error state */}
                    {bootPhase === 'error' && (
                        <div className="simon-boot-error">
                            <AlertCircle size={18} />
                            <div>
                                <strong>No se pudo conectar con Simon</strong>
                                <p>El servidor puede estar en mantenimiento. Intentá de nuevo en unos minutos.</p>
                            </div>
                            <button className="simon-retry-btn" onClick={() => { setBootPhase('idle'); setSessionStarted(false); }}>
                                Reintentar
                            </button>
                        </div>
                    )}
                </div>

                <div className="simon-welcome-footer">
                    Sanatorio Argentino · Powered by GPT-4o + RAG Pipeline V3.0
                </div>
            </div>
        )
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
                                <input ref={fileInputRef} type="file" onChange={handleFileSelect}
                                    accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md,.json,.xml,.html,.htm"
                                    style={{ display: 'none' }} disabled={isUploading} multiple />
                                <input ref={folderInputRef} type="file" onChange={handleFileSelect}
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
                        <img src="/simon.webp" alt="Simon" className="rag-simon-mini" />
                        <span className="rag-status-title">Simon</span>
                    </div>
                    <div className="rag-status-indicators">
                        <span className={`rag-status-dot ${backendOnline ? 'online' : 'offline'}`} />
                        <span className="rag-status-label">
                            {backendOnline === null ? 'Verificando...' : backendOnline ? 'Backend Online' : 'Backend Offline'}
                        </span>
                        <span className="badge info" style={{ marginLeft: 8 }}>
                            {totalFiles} docs
                        </span>
                        {learningStats && learningStats.learned_chunks > 0 && (
                            <span className="badge positive" style={{ marginLeft: 4 }} title="Q&A aprendidos del historial">
                                <GraduationCap size={10} style={{ marginRight: 3 }} />
                                {learningStats.learned_chunks} aprendidos
                            </span>
                        )}
                        <button
                            className="rag-help-trigger"
                            onClick={() => setShowHelp(true)}
                            title="¿Cómo funciona?"
                        >
                            <HelpCircle size={15} />
                        </button>
                    </div>
                </div>

                {/* Messages */}
                <div className="rag-messages">
                    {messages.length === 0 && !isLoading ? (
                        <div className="rag-welcome">
                            <div className="rag-welcome-icon">
                                <img src="/simon.webp" alt="Simon" style={{ width: 64, height: 64, borderRadius: 16, objectFit: 'cover' }} />
                            </div>
                            <h3>Simon</h3>
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
                                    {/* Clarification Suggestions */}
                                    {msg.type === 'clarification' && msg.suggestions && msg.suggestions.length > 0 && (
                                        <div className="rag-clarification">
                                            <div className="rag-clarification-header">
                                                <Lightbulb size={14} />
                                                Sugerencias
                                            </div>
                                            <div className="rag-suggestion-chips">
                                                {msg.suggestions.map((suggestion, j) => (
                                                    <button
                                                        key={j}
                                                        className="rag-suggestion-chip"
                                                        onClick={() => handleSuggestionClick(suggestion)}
                                                        disabled={isLoading}
                                                    >
                                                        <HelpCircle size={12} />
                                                        {suggestion}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {/* Sources */}
                                    {msg.sources && msg.sources.length > 0 && (
                                        <div className="rag-sources">
                                            <div className="rag-sources-header">
                                                <FileText size={12} />
                                                Fuentes consultadas
                                            </div>
                                            {msg.sources.map((src, j) => (
                                                <div key={j} className="rag-source-item">
                                                    <span className="rag-source-icon">
                                                        {src.source_type === 'chat_history' ? '🧠' : (FILE_ICONS[src.file_type] || '📄')}
                                                    </span>
                                                    <span className="rag-source-name">
                                                        {src.source_type === 'chat_history' ? 'Aprendido de chat previo' : src.filename}
                                                    </span>
                                                    <span className="badge info">{src.chunks_used} chunks</span>
                                                    {src.rerank_score > 0 && (
                                                        <span className="badge positive">{src.rerank_score}/10</span>
                                                    )}
                                                    {src.source_type === 'chat_history' && (
                                                        <span className="badge" style={{ background: '#7c3aed22', color: '#7c3aed', fontSize: '10px' }}>
                                                            <GraduationCap size={9} /> Aprendido
                                                        </span>
                                                    )}
                                                    {src.source_type !== 'chat_history' && src.storage_path && (
                                                        <button
                                                            className="rag-source-download"
                                                            onClick={() => downloadRAGFile(src.storage_path)}
                                                            title={`Descargar ${src.filename}`}
                                                        >
                                                            <Download size={11} />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {/* Pipeline info */}
                                    {msg.pipeline_info && (
                                        <div className="rag-pipeline-info">
                                            <BarChart3 size={11} />
                                            {msg.pipeline_info.disambiguation_triggered && (
                                                <span style={{ color: '#f59e0b' }}>🤔 Desambiguación</span>
                                            )}
                                            <span>HyDE: {msg.pipeline_info.hyde_generated ? '✓' : '✗'}</span>
                                            <span>Queries: {(msg.pipeline_info.multi_queries || 0) + 1}</span>
                                            <span>Buscados: {msg.pipeline_info.total_searched}</span>
                                            <span>Únicos: {msg.pipeline_info.unique_results}</span>
                                            <span>Usados: {msg.pipeline_info.reranked_kept}</span>
                                            {msg.pipeline_info.chat_learning && (
                                                <span style={{ color: '#7c3aed' }}>📚 Aprendido</span>
                                            )}
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

            {/* Upload Confirmation Modal */}
            {showUploadModal && (() => {
                const summary = getUploadSummary(pendingFiles)
                return (
                    <div className="rag-modal-overlay" onClick={cancelUpload}>
                        <div className="rag-modal" onClick={(e) => e.stopPropagation()}>
                            <div className="rag-modal-header">
                                <div className="rag-modal-icon">
                                    <Upload size={24} />
                                </div>
                                <h3>Confirmar carga de archivos</h3>
                                <button className="rag-modal-close" onClick={cancelUpload}>
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="rag-modal-body">
                                {/* Folder info */}
                                {summary.folderName && (
                                    <div className="rag-modal-folder">
                                        <Folder size={16} />
                                        <span>Carpeta: <strong>{summary.folderName}</strong></span>
                                    </div>
                                )}

                                {/* Summary stats */}
                                <div className="rag-modal-stats">
                                    <div className="rag-modal-stat">
                                        <FileText size={18} />
                                        <div>
                                            <span className="rag-modal-stat-value">{summary.supported.length}</span>
                                            <span className="rag-modal-stat-label">archivos compatibles</span>
                                        </div>
                                    </div>
                                    <div className="rag-modal-stat">
                                        <BarChart3 size={18} />
                                        <div>
                                            <span className="rag-modal-stat-value">
                                                {summary.totalSize < 1024 * 1024
                                                    ? `${(summary.totalSize / 1024).toFixed(1)} KB`
                                                    : `${(summary.totalSize / (1024 * 1024)).toFixed(1)} MB`}
                                            </span>
                                            <span className="rag-modal-stat-label">tamaño total</span>
                                        </div>
                                    </div>
                                </div>

                                {/* File types breakdown */}
                                <div className="rag-modal-types">
                                    <span className="rag-modal-types-label">Tipos de archivo:</span>
                                    <div className="rag-modal-type-chips">
                                        {Object.entries(summary.typeCounts).map(([ext, count]) => (
                                            <span key={ext} className="rag-modal-type-chip">
                                                {FILE_ICONS[ext] || '📄'} {ext} ({count})
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {/* Unsupported files warning */}
                                {summary.unsupported.length > 0 && (
                                    <div className="rag-modal-warning">
                                        <FileWarning size={14} />
                                        <span>
                                            <strong>{summary.unsupported.length}</strong> archivo(s) no soportado(s) serán omitidos
                                            {summary.unsupported.length <= 5 && (
                                                <span className="rag-modal-warning-files">
                                                    : {summary.unsupported.map(f => f.name).join(', ')}
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                )}

                                {/* Destination info */}
                                <div className="rag-modal-destination">
                                    <Info size={13} />
                                    <span>
                                        Destino: <strong>{currentFolder || 'Raíz'}</strong>
                                        {uploadTag && <> · Tag: <strong>{uploadTag}</strong></>}
                                    </span>
                                </div>
                            </div>

                            <div className="rag-modal-footer">
                                <button className="rag-modal-btn cancel" onClick={cancelUpload}>
                                    Cancelar
                                </button>
                                <button className="rag-modal-btn confirm" onClick={confirmUpload}>
                                    <Upload size={14} />
                                    Cargar {summary.supported.length} archivo{summary.supported.length !== 1 ? 's' : ''}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            })()}
            {showHelp && <RAGHelp onClose={() => setShowHelp(false)} />}
        </div>
    )
}
