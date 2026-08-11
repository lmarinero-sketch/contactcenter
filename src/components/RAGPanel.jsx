import { useState, useEffect, useRef } from 'react'
import {
    Send, Upload, FileText, Trash2, MessageSquare,
    Plus, Loader2, ChevronRight, Brain, BookOpen,
    AlertCircle, CheckCircle, File, X, Clock,
    Search, Sparkles, Layers, BarChart3, FolderOpen, Tag,
    Download, FolderPlus, ArrowLeft, Home, Folder,
    Lightbulb, GraduationCap, HelpCircle, Shield, FileWarning,
    Info, ThumbsUp, ThumbsDown, Eye, Calendar, ExternalLink
} from 'lucide-react'
import {
    sendRAGMessage, listRAGConversations, getRAGConversationMessages,
    deleteRAGConversation, uploadRAGDocument, uploadRAGBatch,
    listRAGFiles, downloadRAGFile, previewRAGFile, createRAGFolder, deleteRAGFile,
    deleteRAGFolder, checkRAGHealth, fetchSuggestions, submitFeedback
} from '../api/ragClient'
import RAGHelp from './RAGHelp'

// Simple markdown-ish renderer (bold, lists, sources)
// Simple markdown-ish renderer (bold, lists, tables, alerts, sources)
function renderMarkdown(text) {
    if (!text) return ''
    
    let html = text;
    
    // 0. Extract Mermaid blocks before HTML escaping
    const mermaidBlocks = [];
    html = html.replace(/```mermaid[ \t]*\r?\n([\s\S]*?)\r?\n```/gi, (match, code) => {
        mermaidBlocks.push(code);
        return `__MERMAID_BLOCK_${mermaidBlocks.length - 1}__`;
    });
    
    // 1. Clean HTML entities
    html = html
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    
    // 2. Parse horizontal lines (---)
    html = html.replace(/^---$/gm, '<hr class="markdown-hr" />');
    
    // 3. Parse blockquotes / alerts (e.g. > [!NOTE], > text)
    html = html.replace(/^&gt;\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n([\s\S]*?)(?=\n\n|\n&gt;|\n\n|$)/gm, (match, type, content) => {
        return `<div class="markdown-alert markdown-alert-${type.toLowerCase()}"><strong>${type}</strong>:<br/>${content.trim()}</div>`;
    });
    html = html.replace(/^&gt;\s*(.*)/gm, '<blockquote class="markdown-blockquote">$1</blockquote>');
    
    // 3.5. Parse Headers
    html = html.replace(/^### (.*$)/gm, '<h3 class="markdown-h3">$1</h3>');
    html = html.replace(/^## (.*$)/gm, '<h2 class="markdown-h2">$1</h2>');
    html = html.replace(/^# (.*$)/gm, '<h1 class="markdown-h1">$1</h1>');
    
    // 4. Parse Tables
    // A simple regex to detect tables: lines starting with |
    const tableRegex = /((?:^\|.+\|(?:\r?\n|$))+)/gm;
    html = html.replace(tableRegex, (match) => {
        const rows = match.trim().split('\n');
        if (rows.length < 2) return match;
        
        // Parse rows
        let tableHtml = '<div class="markdown-table-wrapper"><table class="markdown-table">';
        
        rows.forEach((row, rowIndex) => {
            // Check if it's a separator line like |---|---|
            if (row.includes('---') && (rowIndex === 1)) return;
            
            const cols = row.split('|').map(c => c.trim()).filter((c, i, arr) => i > 0 && i < arr.length - 1);
            
            tableHtml += '<tr>';
            cols.forEach(col => {
                const tag = rowIndex === 0 ? 'th' : 'td';
                tableHtml += `<${tag}>${col}</${tag}>`;
            });
            tableHtml += '</tr>';
        });
        
        tableHtml += '</table></div>';
        return tableHtml;
    });
    
    // 5. Parse bold and italics (safely restoring tags)
    html = html
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    // 6. Parse bulleted lists
    html = html.replace(/^\s*-\s+(.*)/gm, '<li>$1</li>');
    // Wrap lists in ul
    html = html.replace(/((?:<li>.*<\/li>(?:\r?\n|$))+)/g, '<ul class="markdown-list">$1</ul>');
    
    // 7. Parse numbered lists
    html = html.replace(/^\s*(\d+)\.\s+(.*)/gm, '<li class="num-li" data-num="$1">$2</li>');
    html = html.replace(/((?:<li class="num-li".*<\/li>(?:\r?\n|$))+)/g, '<ol class="markdown-num-list">$1</ol>');
    
    // 8. Replace line breaks (except inside table wrappers or list wrappers to avoid spacing bugs)
    html = html.replace(/\n/g, '<br/>');
    
    // Restore clean tags without duplicate brs
    html = html
        .replace(/<\/tr><br\/>/g, '</tr>')
        .replace(/<\/table><br\/>/g, '</table>')
        .replace(/<\/div><br\/>/g, '</div>')
        .replace(/<\/ul><br\/>/g, '</ul>')
        .replace(/<\/ol><br\/>/g, '</ol>')
        .replace(/<li>(.*?)<\/li><br\/>/g, '<li>$1</li>');
        
    // 9. Restore Mermaid blocks
    html = html.replace(/__MERMAID_BLOCK_(\d+)__/g, (match, index) => {
        return `<div class="mermaid">${mermaidBlocks[index]}</div>`;
    });
        
    return html;
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

    const [suggestions, setSuggestions] = useState({ categories: [], top_queries: [] })
    const [showAutocomplete, setShowAutocomplete] = useState(false)

    const [sessionStarted, setSessionStarted] = useState(false)
    const [bootPhase, setBootPhase] = useState('idle')
    const [bootTimer, setBootTimer] = useState(0)

    const [isDarkMode, setIsDarkMode] = useState(() => {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    });

    useEffect(() => {
        if (isDarkMode) {
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
        }
    }, [isDarkMode]);

    const [fileItems, setFileItems] = useState([])
    const [currentFolder, setCurrentFolder] = useState('')
    const [totalFiles, setTotalFiles] = useState(0)
    const [uploadTag, setUploadTag] = useState('')
    const [showNewFolder, setShowNewFolder] = useState(false)
    const [newFolderName, setNewFolderName] = useState('')

    const [showUploadModal, setShowUploadModal] = useState(false)
    const [pendingFiles, setPendingFiles] = useState([])
    const [confirmAction, setConfirmAction] = useState(null)
    const [feedbackState, setFeedbackState] = useState({})
    const [previewItem, setPreviewItem] = useState(null)
    const [previewData, setPreviewData] = useState(null)
    const [isPreviewLoading, setIsPreviewLoading] = useState(false)
    const [previewTab, setPreviewTab] = useState('visual')
    const [chunkSearchQuery, setChunkSearchQuery] = useState('')

    const messagesEndRef = useRef(null)
    const fileInputRef = useRef(null)
    const folderInputRef = useRef(null)
    const bootTimerRef = useRef(null)

    async function startSimon() {
        setSessionStarted(true)
        setBootPhase('waking')
        setBootTimer(0)

        const startTime = Date.now()
        bootTimerRef.current = setInterval(() => {
            setBootTimer(Math.floor((Date.now() - startTime) / 1000))
        }, 1000)

        const maxAttempts = 30
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
        setBootPhase('connecting')
        await new Promise(r => setTimeout(r, 800))
        setBootPhase('loading')
        await Promise.all([loadConversations(), loadFiles(), loadLearningStats()])
        setBootPhase('ready')
        clearInterval(bootTimerRef.current)
        await new Promise(r => setTimeout(r, 1200))
        setBootPhase('done')
    }

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

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        if (window.mermaid && messages.length > 0) {
            setTimeout(() => {
                try {
                    window.mermaid.init(undefined, document.querySelectorAll('.mermaid'));
                } catch (e) {
                    console.error('Mermaid render error', e);
                }
            }, 100);
        }
    }, [messages])

    useEffect(() => {
        fetchSuggestions().then(data => setSuggestions(data)).catch(() => {})
    }, [])

    async function loadConversations() {
        try {
            const data = await listRAGConversations()
            setConversations(data.conversations || [])
        } catch (e) {
            console.error('Error loading conversations:', e)
        }
    }

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

    function navigateToFolder(folderPath) {
        setCurrentFolder(folderPath)
        loadFiles(folderPath)
    }

    function goBack() {
        const parts = currentFolder.split('/').filter(Boolean)
        parts.pop()
        navigateToFolder(parts.join('/'))
    }

    function getBreadcrumbs() {
        if (!currentFolder) return []
        return currentFolder.split('/').filter(Boolean)
    }

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

    function startNewConversation() {
        setActiveConversation(null)
        setMessages([])
        setError(null)
        setInputValue('')
    }

    async function handleSend() {
        if (!inputValue.trim() || isLoading) return
        const question = inputValue.trim()
        setInputValue('')
        setError(null)
        const userMsg = { role: 'user', content: question, created_at: new Date().toISOString() }
        setMessages(prev => [...prev, userMsg])
        setIsLoading(true)
        try {
            const result = await sendRAGMessage(question, activeConversation)
            if (!activeConversation && result.conversation_id) {
                setActiveConversation(result.conversation_id)
                loadConversations()
            }
            if (result.type === 'clarification') {
                setMessages(prev => [...prev, {
                    role: 'assistant', content: result.answer, type: 'clarification',
                    suggestions: result.suggestions || [], pipeline_info: result.pipeline,
                    created_at: new Date().toISOString()
                }])
            } else {
                setMessages(prev => [...prev, {
                    role: 'assistant', content: result.answer, sources: result.sources,
                    pipeline_info: result.pipeline, created_at: new Date().toISOString()
                }])
                loadLearningStats()
            }
        } catch (e) {
            setError(e.message || 'Error al procesar la pregunta')
        } finally {
            setIsLoading(false)
        }
    }

    const SUPPORTED_EXTS = ['.pdf', '.docx', '.xlsx', '.xls', '.csv', '.txt', '.md', '.json', '.xml', '.html', '.htm', '.png', '.jpg', '.jpeg', '.webp']

    function handleFileSelect(event) {
        const files = Array.from(event.target.files || [])
        if (!files.length) return
        setPendingFiles(files)
        setShowUploadModal(true)
    }

    function getUploadSummary(files) {
        const supported = [], unsupported = []
        let totalSize = 0, typeCounts = {}
        for (const file of files) {
            const ext = '.' + file.name.split('.').pop().toLowerCase()
            totalSize += file.size
            if (SUPPORTED_EXTS.includes(ext) && !file.name.startsWith('~$') && !file.name.startsWith('.')) {
                supported.push(file)
                typeCounts[ext] = (typeCounts[ext] || 0) + 1
            } else {
                unsupported.push(file)
            }
        }
        let folderName = ''
        if (files[0]?.webkitRelativePath) folderName = files[0].webkitRelativePath.split('/')[0]
        return { supported, unsupported, totalSize, typeCounts, folderName }
    }

    async function confirmUpload() {
        setShowUploadModal(false)
        const files = pendingFiles
        setPendingFiles([])
        if (!files.length) return
        setIsUploading(true)
        setError(null)
        const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
        const supportedFiles = files.filter(f => 
            SUPPORTED_EXTS.includes('.' + f.name.split('.').pop().toLowerCase()) && f.size <= MAX_FILE_SIZE
        )
        if (supportedFiles.length === 0) {
            setError('Ninguno de los archivos seleccionados tiene un formato soportado o excede el límite de 50MB')
            setIsUploading(false)
            return
        }
        if (supportedFiles.length === 1) {
            setUploadProgress(`Procesando "${supportedFiles[0].name}"...`)
            try {
                const result = await uploadRAGDocument(supportedFiles[0], currentFolder, uploadTag)
                loadFiles()
                setUploadProgress(`✅ "${supportedFiles[0].name}" - ${result.total_chunks} chunks`)
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

    function cancelUpload() {
        setShowUploadModal(false)
        setPendingFiles([])
        if (fileInputRef.current) fileInputRef.current.value = ''
        if (folderInputRef.current) folderInputRef.current.value = ''
    }

    async function handleDeleteFile(item) {
        setConfirmAction({
            title: 'Eliminar Archivo',
            message: `¿Estás seguro de que deseás eliminar "${item.name}"?`,
            onConfirm: async () => {
                const path = item.storage_path || `${item.folder}/${item.name}`.replace(/^\//, '')
                try {
                    await deleteRAGFile(path)
                    loadFiles()
                } catch (e) {
                    setError(e.message)
                }
            }
        });
    }

    async function handleDeleteFolder(item) {
        setConfirmAction({
            title: 'Eliminar Carpeta',
            message: `¿Eliminar la carpeta "${item.name}" y todo su contenido? Esta acción no se puede deshacer.`,
            onConfirm: async () => {
                try {
                    await deleteRAGFolder(item.path)
                    loadFiles()
                } catch (e) {
                    setError(e.message)
                }
            }
        });
    }

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

    async function handleDownload(item) {
        try {
            const path = item.storage_path || `${item.folder}/${item.name || item.filename}`.replace(/^\//, '')
            await downloadRAGFile(path)
        } catch (e) {
            setError(e.message)
        }
    }

    async function handleOpenPreview(item) {
        const path = item.storage_path || `${item.folder || ''}/${item.name || item.filename}`.replace(/^\//, '')
        setPreviewItem(item)
        setPreviewData(null)
        setIsPreviewLoading(true)
        setPreviewTab('visual')
        setChunkSearchQuery('')
        try {
            const data = await previewRAGFile(path)
            setPreviewData(data)
        } catch (e) {
            setError('No se pudo cargar la vista previa: ' + e.message)
            setPreviewItem(null)
        } finally {
            setIsPreviewLoading(false)
        }
    }

    async function handleDeleteConversation(convId, e) {
        e.stopPropagation()
        setConfirmAction({
            title: 'Eliminar Conversación',
            message: '¿Estás seguro de que querés eliminar esta conversación del historial?',
            onConfirm: async () => {
                try {
                    await deleteRAGConversation(convId)
                    if (activeConversation === convId) startNewConversation()
                    loadConversations()
                } catch (err) {
                    setError(err.message)
                }
            }
        });
    }

    function handleSuggestionClick(suggestion) {
        setInputValue(suggestion)
        setTimeout(() => {
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
                            role: 'assistant', content: result.answer, type: 'clarification',
                            suggestions: result.suggestions || [], pipeline_info: result.pipeline,
                            created_at: new Date().toISOString()
                        }])
                    } else {
                        setMessages(prev => [...prev, {
                            role: 'assistant', content: result.answer, sources: result.sources,
                            pipeline_info: result.pipeline, created_at: new Date().toISOString()
                        }])
                        loadLearningStats()
                    }
                })
                .catch(e => setError(e.message))
                .finally(() => setIsLoading(false))
        }, 50)
    }

    async function handleFeedback(assistantMsgIndex, isCorrect) {
        if (!activeConversation) return
        const key = `${activeConversation}-${assistantMsgIndex}`
        setFeedbackState(prev => ({ ...prev, [key]: 'loading' }))
        try {
            await submitFeedback(activeConversation, assistantMsgIndex, isCorrect)
            setFeedbackState(prev => ({ ...prev, [key]: isCorrect ? 'correct' : 'incorrect' }))
        } catch (e) {
            console.error('Feedback error:', e)
            setFeedbackState(prev => {
                const next = { ...prev }; delete next[key]; return next
            })
            setError('Error al enviar feedback')
        }
    }

    function formatFileSize(bytes) {
        if (!bytes) return '0 B'
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

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
        '.csv': '🔢', '.txt': '📄', '.md': '📄', '.json': '⚙️',
        '.xml': '⚙️', '.html': '🌐', '.htm': '🌐',
        '.png': '🖼️', '.jpg': '🖼️', '.jpeg': '🖼️', '.webp': '🖼️',
    }

    if (bootPhase !== 'done') {
        return (
            <div className="simon-welcome">
                <div className="simon-welcome-card">
                    <div className="simon-avatar-container">
                        <img src="/simonminutes.webp" alt="Simon" className="simon-avatar" />
                        <div className="simon-avatar-glow" />
                    </div>
                    <h1 className="simon-name">Simon</h1>
                    <p className="simon-subtitle">Asistente IA Documental</p>
                    <p className="simon-desc">Consultá documentos del Sanatorio Argentino con inteligencia artificial. Respuestas precisas con citación de fuentes.</p>
                    {bootPhase === 'idle' && (
                        <>
                            <button className="simon-start-btn" onClick={startSimon}>
                                <Brain size={18} /> Iniciar charla con Simon
                            </button>
                            <div className="simon-sleep-info">
                                <Clock size={13} /> <span>Simon se apaga tras <strong>15 min</strong> de inactividad y demora entre <strong>30-60 seg</strong> en volver a encenderse</span>
                            </div>
                        </>
                    )}
                    {bootPhase !== 'idle' && bootPhase !== 'error' && (
                        <div className="simon-boot">
                            <div className="simon-boot-phases">
                                <div className={`simon-boot-phase ${bootPhase === 'waking' ? 'active' : (bootPhase !== 'waking' ? 'done' : '')}`}>
                                    <div className="simon-boot-dot" /> <span>Despertando servidor...</span>
                                </div>
                                <div className={`simon-boot-phase ${bootPhase === 'connecting' ? 'active' : (['loading', 'ready', 'done'].includes(bootPhase) ? 'done' : '')}`}>
                                    <div className="simon-boot-dot" /> <span>Conectando IA...</span>
                                </div>
                                <div className={`simon-boot-phase ${bootPhase === 'loading' ? 'active' : (['ready', 'done'].includes(bootPhase) ? 'done' : '')}`}>
                                    <div className="simon-boot-dot" /> <span>Cargando documentos...</span>
                                </div>
                                <div className={`simon-boot-phase ${bootPhase === 'ready' ? 'active done' : ''}`}>
                                    <div className="simon-boot-dot" /> <span>¡Simon está listo!</span>
                                </div>
                            </div>
                            <div className="simon-boot-timer"><Clock size={11} /> {bootTimer}s</div>
                        </div>
                    )}
                    {bootPhase === 'error' && (
                        <div className="simon-boot-error">
                            <AlertCircle size={18} />
                            <div><strong>No se pudo conectar con Simon</strong><p>El servidor puede estar en mantenimiento.</p></div>
                            <button className="simon-retry-btn" onClick={() => { setBootPhase('idle'); setSessionStarted(false); }}>Reintentar</button>
                        </div>
                    )}
                </div>
                <div className="simon-welcome-footer">Sanatorio Argentino · Powered by GPT-4o + RAG Pipeline V3.2</div>
            </div>
        )
    }

    return (
        <div className="rag-container">
            {showSidebar && (
                <div className="rag-sidebar">
                    <div className="rag-sidebar-header">
                        <button className="btn btn-primary rag-new-chat-btn" onClick={startNewConversation}>
                            <Plus size={14} /> Nueva Consulta
                        </button>
                    </div>
                    <div className="rag-tabs">
                        <button className={`rag-tab ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>
                            <MessageSquare size={14} /> Chat
                        </button>
                        <button className={`rag-tab ${activeTab === 'documents' ? 'active' : ''}`} onClick={() => setActiveTab('documents')}>
                            {isUploading ? <Loader2 size={14} className="rag-spin" /> : <FileText size={14} />} Archivos ({totalFiles})
                        </button>
                    </div>
                    {activeTab === 'chat' && (
                        <div className="rag-conv-list">
                            {conversations.length === 0 ? (
                                <div className="rag-empty-state"><Brain size={32} /><p>No hay conversaciones</p></div>
                            ) : (
                                conversations.map(conv => (
                                    <div key={conv.id} className={`rag-conv-item ${activeConversation === conv.id ? 'active' : ''}`} onClick={() => selectConversation(conv)}>
                                        <div className="rag-conv-item-content">
                                            <span className="rag-conv-title">{conv.title || 'Sin título'}</span>
                                            <span className="rag-conv-time"><Clock size={10} /> {formatTime(conv.updated_at)}</span>
                                        </div>
                                        <button className="rag-conv-delete" onClick={(e) => handleDeleteConversation(conv.id, e)}><Trash2 size={12} /></button>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            )}

            <div className="simon-modern-container" style={{ display: activeTab === 'chat' ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
                <div className="simon-glass-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button className="rag-sidebar-toggle" onClick={() => setShowSidebar(!showSidebar)}><ChevronRight size={16} style={{ transform: showSidebar ? 'rotate(180deg)' : 'none' }} /></button>
                        <div>
                            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>Simon IA</h2>
                        </div>
                    </div>
                    <button className="simon-theme-toggle" onClick={() => setIsDarkMode(!isDarkMode)}>{isDarkMode ? '☀️' : '🌙'}</button>
                </div>

                <div className="simon-messages-container">
                    {messages.length === 0 && !isLoading ? (
                        <div className="rag-chat-empty">
                            <Brain size={48} color="var(--blue-500)" />
                            <h2>¿Qué necesitas consultar hoy?</h2>
                        </div>
                    ) : (
                        messages.map((msg, i) => (
                            <div key={i} className={`simon-message-band ${msg.role}`}>
                                <div className="simon-message-inner">
                                    <div className={`simon-message-avatar ${msg.role}`}>
                                        {msg.role === 'assistant' ? <Brain size={16} /> : <span>U</span>}
                                    </div>
                                    <div className="simon-message-content">
                                        <div className="rag-message-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                                        {msg.sources && msg.sources.length > 0 && (
                                            <div className="rag-sources">
                                                {msg.sources.map((src, j) => (
                                                    <div key={j} className="rag-source-item">
                                                        <span>{FILE_ICONS[src.file_type] || '📄'} {src.filename}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                    {isLoading && (
                        <div className="simon-message-band assistant">
                            <div className="simon-message-inner">
                                <div className="simon-message-avatar assistant"><Brain size={16} /></div>
                                <div className="simon-message-content">
                                    <div className="rag-typing" style={{ padding: '8px 0' }}>
                                        <div className="rag-dot" /> <div className="rag-dot" /> <div className="rag-dot" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>


            {/* Documents Area */}
            <div className="rag-documents-area" style={{ display: activeTab === 'documents' ? 'flex' : 'none', flex: 1, flexDirection: 'column', background: '#f8fafc', overflow: 'hidden' }}>
                    <div className="rag-doc-header" style={{ padding: '24px 32px 16px', background: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#0f172a', margin: 0 }}>Gestión de Archivos</h2>
                            <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '4px 0 0' }}>Administrá los documentos disponibles para Simon IA</p>
                        </div>
                        <div className="rag-fm-toolbar" style={{ borderBottom: 'none', padding: 0 }}>
                            <input ref={fileInputRef} type="file" onChange={handleFileSelect}
                                accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md,.json,.xml,.html,.htm,.png,.jpg,.jpeg,.webp"
                                style={{ display: 'none' }} multiple />
                            <input ref={folderInputRef} type="file" onChange={handleFileSelect}
                                style={{ display: 'none' }} webkitdirectory="" directory="" multiple />
                            <div className="rag-tag-input" style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0 8px' }}>
                                <Tag size={14} color="#94a3b8" />
                                <input type="text" placeholder="Tag" value={uploadTag}
                                    onChange={(e) => setUploadTag(e.target.value)}
                                    className="rag-tag-field" style={{ border: 'none', outline: 'none', padding: '8px', fontSize: '13px', width: '100px' }} />
                            </div>
                            <div className="rag-fm-actions" style={{ display: 'flex', gap: '8px' }}>
                                <button className="btn btn-secondary" onClick={() => setShowNewFolder(!showNewFolder)} style={{ gap: '6px', display: 'flex', alignItems: 'center', background: 'white', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500, color: '#475569' }}>
                                    <FolderPlus size={14} /> Nueva Carpeta
                                </button>
                                <button className="btn btn-secondary" onClick={() => folderInputRef.current?.click()} style={{ gap: '6px', display: 'flex', alignItems: 'center', background: 'white', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500, color: '#475569' }}>
                                    <FolderOpen size={14} /> Subir Carpeta
                                </button>
                                <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} style={{ gap: '6px', display: 'flex', alignItems: 'center', background: '#3b82f6', border: 'none', color: 'white', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>
                                    <Upload size={14} /> Subir Archivos
                                </button>
                            </div>
                        </div>
                    </div>

                    {showNewFolder && (
                        <div className="rag-fm-newfolder" style={{ padding: '12px 32px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input type="text" placeholder="Nombre de carpeta"
                                value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                                className="rag-fm-newfolder-input" autoFocus style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', width: '250px' }} />
                            <button onClick={handleCreateFolder} style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}><CheckCircle size={14} /> Crear</button>
                            <button onClick={() => { setShowNewFolder(false); setNewFolderName('') }} style={{ background: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}><X size={14} /> Cancelar</button>
                        </div>
                    )}

                    <div className="rag-doc-list-container" style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
                        {(isUploading || uploadProgress) && (
                            <div className="rag-upload-status" style={{ padding: '12px 16px', background: '#eff6ff', color: '#1e40af', borderRadius: '8px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', border: '1px solid #bfdbfe' }}>
                                <Loader2 size={16} className="rag-spin" />
                                <span>{uploadProgress || 'Preparando y subiendo en segundo plano...'}</span>
                            </div>
                        )}

                        {/* Breadcrumbs */}
                        <div className="rag-fm-breadcrumbs" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#475569' }}>
                            <button className="rag-fm-crumb" onClick={() => navigateToFolder('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#3b82f6', padding: 0 }}>
                                <Home size={14} style={{ marginRight: '4px' }} /> Inicio
                            </button>
                            {getBreadcrumbs().map((part, i) => {
                                const path = getBreadcrumbs().slice(0, i + 1).join('/')
                                return (
                                    <span key={path} className="rag-fm-crumb-item" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <ChevronRight size={14} style={{ color: '#cbd5e1' }} />
                                        <button className="rag-fm-crumb" onClick={() => navigateToFolder(path)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', padding: 0, fontWeight: 500 }}>
                                            {part}
                                        </button>
                                    </span>
                                )
                            })}
                        </div>

                        {/* Table */}
                        {fileItems.length === 0 ? (
                            <div className="rag-empty-state" style={{ background: 'white', borderRadius: '12px', padding: '48px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                                <BookOpen size={48} style={{ color: '#cbd5e1', marginBottom: '16px' }} />
                                <p style={{ fontSize: '16px', fontWeight: 500, color: '#334155', margin: '0 0 8px 0' }}>{currentFolder ? 'Carpeta vacía' : 'No hay archivos'}</p>
                                <span style={{ fontSize: '14px' }}>Subí archivos para que la IA pueda consultarlos</span>
                            </div>
                        ) : (
                            <div className="rag-doc-table-container" style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                <table className="rag-doc-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                                            <th style={{ padding: '12px 16px', fontWeight: 600 }}>Nombre</th>
                                            <th style={{ padding: '12px 16px', fontWeight: 600, width: '120px' }}>Tamaño</th>
                                            <th style={{ padding: '12px 16px', fontWeight: 600, width: '100px' }}>Chunks</th>
                                            <th style={{ padding: '12px 16px', fontWeight: 600, width: '120px' }}>Tag</th>
                                            <th style={{ padding: '12px 16px', fontWeight: 600, width: '100px', textAlign: 'right' }}>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {fileItems.map(item => (
                                            item.type === 'folder' ? (
                                                <tr key={item.path} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.background = 'white'} onClick={() => navigateToFolder(item.path)}>
                                                    <td style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', color: '#334155', fontWeight: 500 }}>
                                                        <Folder size={18} color="#3b82f6" /> {item.name}
                                                    </td>
                                                    <td style={{ padding: '12px 16px', color: '#94a3b8' }}>�</td>
                                                    <td style={{ padding: '12px 16px', color: '#94a3b8' }}>�</td>
                                                    <td style={{ padding: '12px 16px', color: '#94a3b8' }}>�</td>
                                                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteFolder(item) }} title="Eliminar carpeta" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '6px', borderRadius: '4px', transition: 'all 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#fef2f2'} onMouseLeave={(e) => e.currentTarget.style.background = 'none'}>
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ) : (
                                                <tr key={item.name} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.background = 'white'}>
                                                    <td style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', color: '#334155', fontWeight: 500 }}>
                                                        <span style={{ fontSize: '18px' }}>{FILE_ICONS[item.file_type] || '📄'}</span> {item.name}
                                                    </td>
                                                    <td style={{ padding: '12px 16px', color: '#64748b' }}>{formatFileSize(item.file_size)}</td>
                                                    <td style={{ padding: '12px 16px', color: '#64748b' }}>{item.total_chunks}</td>
                                                    <td style={{ padding: '12px 16px' }}>
                                                        {item.tag && <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 500 }}>{item.tag}</span>}
                                                    </td>
                                                    <td style={{ padding: '12px 16px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '4px' }}>
                                                        <button onClick={() => handleOpenPreview(item)} title="Visualizar sin descargar" style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', padding: '6px', borderRadius: '4px', transition: 'all 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#e0e7ff'} onMouseLeave={(e) => e.currentTarget.style.background = 'none'}>
                                                            <Eye size={14} />
                                                        </button>
                                                        <button onClick={() => handleDownload(item)} title="Descargar" style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '6px', borderRadius: '4px', transition: 'all 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#eff6ff'} onMouseLeave={(e) => e.currentTarget.style.background = 'none'}>
                                                            <Download size={14} />
                                                        </button>
                                                        <button onClick={() => handleDeleteFile(item)} title="Eliminar" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '6px', borderRadius: '4px', transition: 'all 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#fef2f2'} onMouseLeave={(e) => e.currentTarget.style.background = 'none'}>
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            )
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
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
            {/* Custom Confirm Modal */}
            {confirmAction && (
                <div className="rag-modal-overlay" onClick={() => setConfirmAction(null)}>
                    <div className="rag-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="rag-modal-header">
                            <div className="rag-modal-icon" style={{ background: '#fef2f2', color: '#ef4444' }}>
                                <AlertCircle size={24} />
                            </div>
                            <h3>{confirmAction.title}</h3>
                            <button className="rag-modal-close" onClick={() => setConfirmAction(null)}>
                                <X size={16} />
                            </button>
                        </div>
                        <div className="rag-modal-body">
                            <div className="rag-modal-destination" style={{ border: 'none', background: 'transparent', padding: '16px 0', fontSize: '14px', color: '#475569' }}>
                                {confirmAction.message}
                            </div>
                        </div>
                        <div className="rag-modal-footer">
                            <button className="rag-modal-btn cancel" onClick={() => setConfirmAction(null)}>
                                Cancelar
                            </button>
                            <button className="rag-modal-btn confirm" style={{ background: '#ef4444', color: 'white' }} onClick={() => {
                                confirmAction.onConfirm();
                                setConfirmAction(null);
                            }}>
                                <Trash2 size={14} /> Confirmar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Document Preview Modal */}
            {previewItem && (
                <div className="rag-modal-overlay" onClick={() => setPreviewItem(null)}>
                    <div className="rag-preview-modal" onClick={(e) => e.stopPropagation()}>
                        {/* Header */}
                        <div className="rag-preview-header">
                            <div className="rag-preview-title-block">
                                <span className="rag-preview-icon">
                                    {FILE_ICONS[previewItem.file_type || ('.' + (previewItem.name || previewItem.filename || '').split('.').pop().toLowerCase())] || '📄'}
                                </span>
                                <div style={{ minWidth: 0 }}>
                                    <h3 className="rag-preview-filename" title={previewItem.name || previewItem.filename}>
                                        {previewItem.name || previewItem.filename}
                                    </h3>
                                    <div className="rag-preview-submeta">
                                        {previewItem.folder && <span className="badge neutral"><Folder size={10} /> {previewItem.folder}</span>}
                                        <span className="badge info">{previewData?.total_chunks ?? previewItem.total_chunks ?? 0} chunks</span>
                                        {previewItem.file_size > 0 && <span className="badge neutral">{formatFileSize(previewItem.file_size)}</span>}
                                        {previewItem.created_at && (
                                            <span className="badge neutral">
                                                <Calendar size={10} style={{ marginRight: 2 }} /> {formatFullDate(previewItem.created_at)}
                                            </span>
                                        )}
                                        {previewItem.tag && <span className="rag-doc-tag">{previewItem.tag}</span>}
                                    </div>
                                </div>
                            </div>
                            <div className="rag-preview-header-actions">
                                <button
                                    className="rag-modal-btn cancel"
                                    onClick={() => handleDownload(previewItem)}
                                    title="Descargar archivo original"
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px' }}
                                >
                                    <Download size={13} /> Descargar
                                </button>
                                <button className="rag-modal-close" onClick={() => setPreviewItem(null)} title="Cerrar vista previa">
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* View Switcher Tabs */}
                        <div className="rag-preview-tabs">
                            <button
                                className={`rag-preview-tab ${previewTab === 'visual' ? 'active' : ''}`}
                                onClick={() => setPreviewTab('visual')}
                            >
                                <Eye size={13} /> Documento Original
                            </button>
                            <button
                                className={`rag-preview-tab ${previewTab === 'chunks' ? 'active' : ''}`}
                                onClick={() => setPreviewTab('chunks')}
                            >
                                <FileText size={13} /> Texto Extraído / Chunks IA ({previewData?.chunks?.length || 0})
                            </button>
                        </div>

                        {/* Body */}
                        <div className="rag-preview-body">
                            {isPreviewLoading ? (
                                <div className="rag-preview-loading">
                                    <Loader2 size={28} className="rag-spin" style={{ color: '#3b82f6' }} />
                                    <span>Cargando vista previa...</span>
                                </div>
                            ) : previewTab === 'visual' ? (
                                previewData?.download_url ? (
                                    (() => {
                                        const fname = previewItem.name || previewItem.filename || '';
                                        const ext = previewItem.file_type || ('.' + fname.split('.').pop().toLowerCase());
                                        const url = previewData.download_url;

                                        if (['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'].includes(ext)) {
                                            return (
                                                <div className="rag-preview-image-container">
                                                    <img src={url} alt={fname} className="rag-preview-image" />
                                                </div>
                                            );
                                        }

                                        if (['.pdf', '.txt', '.md', '.html', '.htm', '.json', '.xml', '.csv'].includes(ext)) {
                                            return (
                                                <iframe
                                                    src={url}
                                                    title={fname}
                                                    className="rag-preview-iframe"
                                                />
                                            );
                                        }

                                        // Office documents or other formats (e.g. docx, xlsx)
                                        const officeExts = ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];
                                        if (officeExts.includes(ext)) {
                                            const officeViewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
                                            return (
                                                <iframe
                                                    src={officeViewerUrl}
                                                    title={fname}
                                                    className="rag-preview-iframe"
                                                />
                                            );
                                        }

                                        // Fallback for everything else
                                        const googleViewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
                                        return (
                                            <iframe
                                                src={googleViewerUrl}
                                                title={fname}
                                                className="rag-preview-iframe"
                                            />
                                        );
                                    })()
                                ) : (
                                    <div className="rag-preview-empty">
                                        <AlertCircle size={28} color="#f59e0b" />
                                        <p>No se pudo generar la URL directa de vista previa.</p>
                                        <button className="btn btn-primary" onClick={() => setPreviewTab('chunks')}>
                                            Ver texto extraído por la IA
                                        </button>
                                    </div>
                                )
                            ) : (
                                /* Chunks Tab */
                                <div className="rag-chunks-view">
                                    <div className="rag-chunks-search">
                                        <Search size={14} color="#94a3b8" />
                                        <input
                                            type="text"
                                            placeholder="Buscar texto en fragmentos..."
                                            value={chunkSearchQuery}
                                            onChange={(e) => setChunkSearchQuery(e.target.value)}
                                            className="rag-chunks-search-input"
                                        />
                                        {chunkSearchQuery && (
                                            <button className="rag-fm-btn-sm" onClick={() => setChunkSearchQuery('')}>
                                                <X size={12} />
                                            </button>
                                        )}
                                    </div>

                                    <div className="rag-chunks-list">
                                        {(() => {
                                            const filtered = (previewData?.chunks || []).filter(c =>
                                                !chunkSearchQuery || c.content.toLowerCase().includes(chunkSearchQuery.toLowerCase())
                                            );
                                            if (filtered.length === 0) {
                                                return (
                                                    <div className="rag-empty-state">
                                                        <FileText size={28} />
                                                        <p>No se encontraron fragmentos de texto</p>
                                                    </div>
                                                );
                                            }
                                            return filtered.map((chunk, idx) => (
                                                <div key={idx} className="rag-chunk-card">
                                                    <div className="rag-chunk-header">
                                                        <span className="badge info">Fragmento #{chunk.chunk_index}</span>
                                                        {chunk.metadata?.page && <span className="badge neutral">Pág. {chunk.metadata.page}</span>}
                                                    </div>
                                                    <div className="rag-chunk-content">
                                                        {chunk.content}
                                                    </div>
                                                </div>
                                            ));
                                        })()}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            
            {showHelp && <RAGHelp onClose={() => setShowHelp(false)} />}
        </div>
    )
}

