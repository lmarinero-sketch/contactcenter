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

    // Smart Guidance Layer
    const [suggestions, setSuggestions] = useState({ categories: [], top_queries: [] })
    const [showAutocomplete, setShowAutocomplete] = useState(false)

    // Session state â€” Simon boot sequence
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
    
    // Custom confirm modal state
    const [confirmAction, setConfirmAction] = useState(null)

    // Feedback state: { [msgIndex]: 'correct' | 'incorrect' | 'loading' }
    const [feedbackState, setFeedbackState] = useState({})

    // Document Previewer state
    const [previewItem, setPreviewItem] = useState(null)
    const [previewData, setPreviewData] = useState(null)
    const [isPreviewLoading, setIsPreviewLoading] = useState(false)
    const [previewTab, setPreviewTab] = useState('visual') // 'visual' | 'chunks'
    const [chunkSearchQuery, setChunkSearchQuery] = useState('')

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

    // Scroll to bottom on new messages and render mermaid diagrams
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

    // Load suggestions for Smart Guidance Layer
    useEffect(() => {
        fetchSuggestions().then(data => setSuggestions(data)).catch(() => {})
    }, [])

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
    const SUPPORTED_EXTS = ['.pdf', '.docx', '.xlsx', '.xls', '.csv', '.txt', '.md', '.json', '.xml', '.html', '.htm', '.png', '.jpg', '.jpeg', '.webp']

    // Handle file selection â€” show confirmation modal
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
            if (SUPPORTED_EXTS.includes(ext) && !file.name.startsWith('~$') && !file.name.startsWith('.')) {
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
                setUploadProgress(`âœ… "${supportedFiles[0].name}" â€” ${result.total_chunks} chunks`)
                setTimeout(() => setUploadProgress(''), 4000)
            } catch (e) {
                setError(e.message || 'Error al subir documento')
                setUploadProgress('')
            }
        } else {
            try {
                const result = await uploadRAGBatch(supportedFiles, currentFolder, uploadTag, (p) => {
                    const retryLabel = p.retrying ? ' ðŸ”„ Reintentando...' : ''
                    const statusParts = [`Subiendo ${p.current}/${p.total}: "${p.filename}"${retryLabel}`]
                    if (p.processed > 0) statusParts.push(`âœ… ${p.processed}`)
                    if (p.failed > 0) statusParts.push(`âŒ ${p.failed}`)
                    setUploadProgress(statusParts.join(' Â· '))
                })
                loadFiles()
                const parts = [`âœ… ${result.processed} procesados`, `${result.total_chunks} chunks`]
                if (result.failed > 0) parts.push(`âŒ ${result.failed} fallidos`)
                if (result.skipped > 0) parts.push(`â­ ${result.skipped} omitidos`)
                setUploadProgress(parts.join(' Â· '))
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
        setConfirmAction({
            title: 'Eliminar Archivo',
            message: `Â¿EstÃ¡s seguro de que deseÃ¡s eliminar "${item.name}"?`,
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

    // Delete folder
    async function handleDeleteFolder(item) {
        setConfirmAction({
            title: 'Eliminar Carpeta',
            message: `Â¿Eliminar la carpeta "${item.name}" y todo su contenido? Esta acciÃ³n no se puede deshacer.`,
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
            const path = item.storage_path || `${item.folder}/${item.name || item.filename}`.replace(/^\//, '')
            await downloadRAGFile(path)
        } catch (e) {
            setError(e.message)
        }
    }

    // Open document previewer (inline without downloading)
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

    // Delete conversation
    async function handleDeleteConversation(convId, e) {
        e.stopPropagation()
        setConfirmAction({
            title: 'Eliminar ConversaciÃ³n',
            message: 'Â¿EstÃ¡s seguro de que querÃ©s eliminar esta conversaciÃ³n del historial?',
            onConfirm: async () => {
                try {
                    await deleteRAGConversation(convId)
                    if (activeConversation === convId) {
                        startNewConversation()
                    }
                    loadConversations()
                } catch (err) {
                    setError(err.message)
                }
            }
        });
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

    // Feedback handler
    async function handleFeedback(assistantMsgIndex, isCorrect) {
        if (!activeConversation) return
        const key = `${activeConversation}-${assistantMsgIndex}`
        
        // Optimistic UI
        setFeedbackState(prev => ({
            ...prev,
            [key]: 'loading'
        }))
        
        try {
            await submitFeedback(activeConversation, assistantMsgIndex, isCorrect)
            setFeedbackState(prev => ({
                ...prev,
                [key]: isCorrect ? 'correct' : 'incorrect'
            }))
        } catch (e) {
            console.error('Feedback error:', e)
            setFeedbackState(prev => {
                const next = { ...prev }
                delete next[key]
                return next
            })
            setError('Error al enviar feedback')
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
        if (!bytes) return 'â€”'
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

    // Format full date with time
    function formatFullDate(dateStr) {
        if (!dateStr) return ''
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) return ''
        return d.toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    const FILE_ICONS = {
        '.pdf': 'ðŸ“„', '.docx': 'ðŸ“', '.xlsx': 'ðŸ“Š', '.xls': 'ðŸ“Š',
        '.csv': 'ðŸ“‹', '.txt': 'ðŸ“ƒ', '.md': 'ðŸ“ƒ', '.json': 'ðŸ”§',
        '.xml': 'ðŸ”§', '.html': 'ðŸŒ', '.htm': 'ðŸŒ',
        '.png': 'ðŸ–¼ï¸', '.jpg': 'ðŸ–¼ï¸', '.jpeg': 'ðŸ–¼ï¸', '.webp': 'ðŸ–¼ï¸',
    }

    // === WELCOME / BOOT SCREEN ===
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
                    <p className="simon-desc">
                        ConsultÃ¡ documentos del Sanatorio Argentino con inteligencia artificial.
                        Respuestas precisas con citaciÃ³n de fuentes.
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
                                    demora entre <strong>30â€“60 seg</strong> en volver a encenderse
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
                                    <span>Â¡Simon estÃ¡ listo!</span>
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
                                <p>El servidor puede estar en mantenimiento. IntentÃ¡ de nuevo en unos minutos.</p>
                            </div>
                            <button className="simon-retry-btn" onClick={() => { setBootPhase('idle'); setSessionStarted(false); }}>
                                Reintentar
                            </button>
                        </div>
                    )}
                </div>

                <div className="simon-welcome-footer">
                    Sanatorio Argentino Â· Powered by GPT-4o + RAG Pipeline V3.2
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
                            {isUploading ? <Loader2 size={14} className="rag-spin" style={{ color: '#3b82f6' }} /> : <FileText size={14} />}
                            Archivos ({totalFiles})
                        </button>
                    </div>

                    {/* Conversation list */}
                    {activeTab === 'chat' && (
                        <div className="rag-conv-list">
                            {conversations.length === 0 ? (
                                <div className="rag-empty-state">
                                    <Brain size={32} />
                                    <p>No hay conversaciones aÃºn</p>
                                    <span>HacÃ© una pregunta para comenzar</span>
                                </div>
                            ) : (
                                conversations.map(conv => (
                                    <div
                                        key={conv.id}
                                        className={`rag-conv-item ${activeConversation === conv.id ? 'active' : ''}`}
                                        onClick={() => selectConversation(conv)}
                                    >
                                        <div className="rag-conv-item-content">
                                            <span className="rag-conv-title">{conv.title || 'Sin tÃ­tulo'}</span>
                                            <span className="rag-conv-time">
                                                <Clock size={10} />
                                                {formatTime(conv.updated_at)}
                                            </span>
                                        </div>
                                        <button
                                            className="rag-conv-delete"
                                            onClick={(e) => handleDeleteConversation(conv.id, e)}
                                            title="Eliminar conversaciÃ³n"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* File Manager placeholder in sidebar */}
                    {activeTab === 'documents' && (
                        <div className="rag-empty-state" style={{ margin: '16px', padding: '24px', background: 'white', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                            <FolderOpen size={24} style={{ color: '#94a3b8', marginBottom: '8px' }} />
                            <p style={{ fontSize: '13px', color: '#64748b' }}>GestiÃ³n de documentos abierta en el panel principal.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Right: Main Area */}
            <div className="rag-main-area" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                <div className="rag-chat-area" style={{ display: activeTab === 'chat' ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
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
                        <img src="/simonminutes.webp" alt="Simon" className="rag-simon-mini" />
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
                            title="Â¿CÃ³mo funciona?"
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
                                <img src="/simonminutes.webp" alt="Simon" style={{ width: 64, height: 64, borderRadius: 16, objectFit: 'cover' }} />
                            </div>
                            <h3>Simon</h3>
                            <p>PreguntÃ¡ lo que necesites sobre los documentos cargados. Las respuestas incluyen citaciÃ³n de fuentes.</p>
                            <div className="rag-welcome-features">
                                <div className="rag-feature">
                                    <Search size={18} />
                                    <span>BÃºsqueda HÃ­brida</span>
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
                                    <span>CitaciÃ³n Obligatoria</span>
                                </div>
                            </div>

                            {/* Smart Guidance: Pre-chat suggestions */}
                            {(suggestions.categories.length > 0 || suggestions.top_queries.length > 0) && (
                                <div className="sg-prechat">
                                    {suggestions.categories.length > 0 && (
                                        <div className="sg-section">
                                            <div className="sg-section-title"><Tag size={13} /> Temas disponibles</div>
                                            <div className="sg-chips">
                                                {suggestions.categories.slice(0, 8).map((cat, i) => (
                                                    <button key={i} className="sg-chip category"
                                                        onClick={() => { setInputValue(`Â¿QuÃ© informaciÃ³n hay sobre ${cat.name}?`); }}
                                                    >
                                                        <FolderOpen size={12} />
                                                        {cat.name}
                                                        {cat.count > 1 && <span className="sg-chip-count">{cat.count}</span>}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {suggestions.top_queries.length > 0 && (
                                        <div className="sg-section">
                                            <div className="sg-section-title"><Sparkles size={13} /> Preguntas frecuentes</div>
                                            <div className="sg-chips">
                                                {suggestions.top_queries.slice(0, 6).map((q, i) => (
                                                    <button key={i} className="sg-chip query"
                                                        onClick={() => { setInputValue(q.text); }}
                                                    >
                                                        <MessageSquare size={12} />
                                                        {q.text.length > 60 ? q.text.slice(0, 57) + '...' : q.text}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        messages.map((msg, i) => (
                            <div key={i} className={`rag-message ${msg.role}`}>
                                <div className="rag-message-avatar">
                                    {msg.role === 'user' ? (
                                        <div className="rag-avatar-user-badge">U</div>
                                    ) : (
                                        <div className="rag-avatar-simon-container">
                                            <img src="/simonminutes.webp" alt="Simon" className="rag-avatar-simon-img" />
                                            <div className="rag-avatar-simon-status" />
                                        </div>
                                    )}
                                </div>
                                <div className="rag-message-content">
                                    {(() => {
                                        // Parse related questions from Simon's response
                                        const parts = (msg.content || '').split(/---\s*\nðŸ’¡/);
                                        const mainContent = parts[0];
                                        let relatedQuestions = [];
                                        if (msg.role === 'assistant' && parts.length > 1) {
                                            const rqSection = parts[1];
                                            const matches = rqSection.match(/- Â¿([^?]+)\?/g) || [];
                                            relatedQuestions = matches.map(m => m.replace(/^- /, '').trim());
                                        }
                                        return (
                                            <>
                                                <div
                                                    className="rag-message-text"
                                                    dangerouslySetInnerHTML={{ __html: renderMarkdown(mainContent) }}
                                                />
                                                {relatedQuestions.length > 0 && (
                                                    <div className="sg-related">
                                                        <div className="sg-related-title">
                                                            <Lightbulb size={13} />
                                                            TambiÃ©n podrÃ­as preguntar:
                                                        </div>
                                                        <div className="sg-related-chips">
                                                            {relatedQuestions.map((rq, ri) => (
                                                                <button key={ri} className="sg-chip query small"
                                                                    onClick={() => { setInputValue(rq); }}
                                                                >
                                                                    {rq}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
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
                                                        {src.source_type === 'chat_history' ? 'ðŸ§ ' : (FILE_ICONS[src.file_type] || 'ðŸ“„')}
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
                                                        <div style={{ display: 'flex', gap: 2 }}>
                                                            <button
                                                                className="rag-source-download"
                                                                onClick={() => handleOpenPreview({ storage_path: src.storage_path, name: src.filename, file_type: src.file_type || ('.' + src.filename.split('.').pop()) })}
                                                                title={`Visualizar ${src.filename}`}
                                                            >
                                                                <Eye size={11} />
                                                            </button>
                                                            <button
                                                                className="rag-source-download"
                                                                onClick={() => downloadRAGFile(src.storage_path)}
                                                                title={`Descargar ${src.filename}`}
                                                            >
                                                                <Download size={11} />
                                                            </button>
                                                        </div>
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
                                                <span style={{ color: '#f59e0b' }}>ðŸ¤” DesambiguaciÃ³n</span>
                                            )}
                                            <span>HyDE: {msg.pipeline_info.hyde_generated ? 'âœ“' : 'âœ—'}</span>
                                            <span>Queries: {(msg.pipeline_info.multi_queries || 0) + 1}</span>
                                            <span>Buscados: {msg.pipeline_info.total_searched}</span>
                                            <span>Ãšnicos: {msg.pipeline_info.unique_results}</span>
                                            {msg.pipeline_info.entity_detected && msg.pipeline_info.entity_detected.length > 0 && (
                                                <span style={{ color: '#3b82f6' }}>
                                                    ðŸŽ¯ {msg.pipeline_info.entity_detected.join(', ')}
                                                    {msg.pipeline_info.entity_filter === 'strict' ? ' (estricto)' : ''}
                                                </span>
                                            )}
                                            <span>Usados: {msg.pipeline_info.reranked_kept}</span>
                                            {msg.pipeline_info.chat_learning && (
                                                <span style={{ color: '#7c3aed' }}>ðŸ“š Aprendido</span>
                                            )}
                                        </div>
                                    )}
                                    {/* Feedback buttons for assistant messages */}
                                    {msg.role === 'assistant' && msg.type !== 'clarification' && (() => {
                                        // Calculate the assistant-only index for this message
                                        const assistantIndex = messages
                                            .slice(0, i + 1)
                                            .filter(m => m.role === 'assistant' && m.type !== 'clarification')
                                            .length - 1
                                        const fbKey = `${activeConversation}-${assistantIndex}`
                                        const fbState = feedbackState[fbKey]
                                        const fbFromMsg = msg.feedback // from DB if loaded
                                        const resolved = fbState || fbFromMsg
                                        
                                        return (
                                            <div className={`rag-feedback-bar ${resolved ? 'resolved' : ''}`}>
                                                {resolved === 'loading' ? (
                                                    <span className="rag-feedback-loading">
                                                        <Loader2 size={12} className="rag-spin" />
                                                        Guardando...
                                                    </span>
                                                ) : resolved === 'correct' ? (
                                                    <span className="rag-feedback-result correct">
                                                        <ThumbsUp size={12} />
                                                        Marcada como correcta
                                                    </span>
                                                ) : resolved === 'incorrect' ? (
                                                    <span className="rag-feedback-result incorrect">
                                                        <ThumbsDown size={12} />
                                                        Marcada como incorrecta
                                                    </span>
                                                ) : (
                                                    <>
                                                        <span className="rag-feedback-label">Â¿Fue Ãºtil esta respuesta?</span>
                                                        <div className="rag-feedback-buttons">
                                                            <button
                                                                className="rag-feedback-btn correct"
                                                                onClick={() => handleFeedback(assistantIndex, true)}
                                                                title="Respuesta correcta"
                                                            >
                                                                <ThumbsUp size={13} />
                                                            </button>
                                                            <button
                                                                className="rag-feedback-btn incorrect"
                                                                onClick={() => handleFeedback(assistantIndex, false)}
                                                                title="Respuesta incorrecta"
                                                            >
                                                                <ThumbsDown size={13} />
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        )
                                    })()}
                                </div>
                            </div>
                        ))
                    )}

                    {/* Loading state */}
                    {isLoading && (
                        <div className="rag-message assistant">
                            <div className="rag-message-avatar">
                                <div className="rag-avatar-simon-container">
                                    <img src="/simonminutes.webp" alt="Simon" className="rag-avatar-simon-img pulsing" />
                                    <div className="rag-avatar-simon-status calculating" />
                                </div>
                            </div>
                            <div className="rag-message-content">
                                <div className="rag-thinking-skeleton">
                                    <div className="rag-thinking-pulse-line header" />
                                    <div className="rag-thinking-pulse-line body-1" />
                                    <div className="rag-thinking-pulse-line body-2" />
                                    <div className="rag-thinking-status">
                                        <Sparkles size={13} className="rag-sparkle-spin" />
                                        <span>Simon estÃ¡ procesando y comparando las reglas del Sanatorio...</span>
                                    </div>
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

                {/* Input with Autocomplete */}
                <div className="rag-input-area">
                    {/* Quick Actions / Smart Prompts */}
                    <div className="rag-quick-actions" style={{ display: 'flex', gap: '8px', marginBottom: '12px', overflowX: 'auto', paddingBottom: '4px' }}>
                        <button 
                            className="rag-quick-action-btn"
                            onClick={() => setInputValue('Genera un mapa conceptual sobre las reglas de este documento. IMPORTANTE: Envuelve el cÃ³digo del diagrama EXCLUSIVAMENTE dentro de un bloque markdown tipo mermaid (empezando con ```mermaid y terminando con ```). Usa saltos de lÃ­nea para cada nodo.')}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 12px', borderRadius: '16px', background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                            ðŸ“Š Mapa Conceptual
                        </button>
                        <button 
                            className="rag-quick-action-btn"
                            onClick={() => setInputValue('Escribe un resumen estructurado con viÃ±etas sobre los puntos mÃ¡s importantes.')}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 12px', borderRadius: '16px', background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                            ðŸ“ Resumen Estructurado
                        </button>
                    </div>

                    <div className="rag-input-wrapper" style={{ position: 'relative' }}>
                        <textarea
                            className="rag-input"
                            value={inputValue}
                            onChange={(e) => {
                                setInputValue(e.target.value);
                                setShowAutocomplete(e.target.value.trim().length >= 2);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') setShowAutocomplete(false);
                                handleKeyPress(e);
                            }}
                            onBlur={() => setTimeout(() => setShowAutocomplete(false), 200)}
                            onFocus={() => { if (inputValue.trim().length >= 2) setShowAutocomplete(true); }}
                            placeholder="EscribÃ­ tu pregunta sobre los documentos..."
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

                        {/* Autocomplete dropdown */}
                        {showAutocomplete && inputValue.trim().length >= 2 && (() => {
                            const query = inputValue.toLowerCase();
                            const matches = (suggestions.top_queries || []).filter(q =>
                                q.text.toLowerCase().includes(query)
                            ).slice(0, 5);
                            if (matches.length === 0) return null;
                            return (
                                <div className="sg-autocomplete">
                                    {matches.map((m, i) => (
                                        <button key={i} className="sg-autocomplete-item"
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                setInputValue(m.text);
                                                setShowAutocomplete(false);
                                            }}
                                        >
                                            <Search size={13} />
                                            <span>{m.text}</span>
                                        </button>
                                    ))}
                                </div>
                            );
                        })()}
                    </div>
                    <div className="rag-input-hint">
                        Respuestas basadas exclusivamente en documentos cargados Â· Enter para enviar
                    </div>
                </div>
                {/* End of rag-chat-area */}

                {/* Documents Area */}
                <div className="rag-documents-area" style={{ display: activeTab === 'documents' ? 'flex' : 'none', flex: 1, flexDirection: 'column', background: '#f8fafc', overflow: 'hidden' }}>
                    <div className="rag-doc-header" style={{ padding: '24px 32px 16px', background: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#0f172a', margin: 0 }}>GestiÃ³n de Archivos</h2>
                            <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '4px 0 0' }}>AdministrÃ¡ los documentos disponibles para Simon IA</p>
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
                                <p style={{ fontSize: '16px', fontWeight: 500, color: '#334155', margin: '0 0 8px 0' }}>{currentFolder ? 'Carpeta vacÃ­a' : 'No hay archivos'}</p>
                                <span style={{ fontSize: '14px' }}>SubÃ­ archivos para que la IA pueda consultarlos</span>
                            </div>
                        ) : (
                            <div className="rag-doc-table-container" style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                <table className="rag-doc-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                                            <th style={{ padding: '12px 16px', fontWeight: 600 }}>Nombre</th>
                                            <th style={{ padding: '12px 16px', fontWeight: 600, width: '120px' }}>TamaÃ±o</th>
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
                                                    <td style={{ padding: '12px 16px', color: '#94a3b8' }}>â€”</td>
                                                    <td style={{ padding: '12px 16px', color: '#94a3b8' }}>â€”</td>
                                                    <td style={{ padding: '12px 16px', color: '#94a3b8' }}>â€”</td>
                                                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteFolder(item) }} title="Eliminar carpeta" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '6px', borderRadius: '4px', transition: 'all 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#fef2f2'} onMouseLeave={(e) => e.currentTarget.style.background = 'none'}>
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ) : (
                                                <tr key={item.name} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.background = 'white'}>
                                                    <td style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', color: '#334155', fontWeight: 500 }}>
                                                        <span style={{ fontSize: '18px' }}>{FILE_ICONS[item.file_type] || 'ðŸ“„'}</span> {item.name}
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
                                            <span className="rag-modal-stat-label">tamaÃ±o total</span>
                                        </div>
                                    </div>
                                </div>

                                {/* File types breakdown */}
                                <div className="rag-modal-types">
                                    <span className="rag-modal-types-label">Tipos de archivo:</span>
                                    <div className="rag-modal-type-chips">
                                        {Object.entries(summary.typeCounts).map(([ext, count]) => (
                                            <span key={ext} className="rag-modal-type-chip">
                                                {FILE_ICONS[ext] || 'ðŸ“„'} {ext} ({count})
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {/* Unsupported files warning */}
                                {summary.unsupported.length > 0 && (
                                    <div className="rag-modal-warning">
                                        <FileWarning size={14} />
                                        <span>
                                            <strong>{summary.unsupported.length}</strong> archivo(s) no soportado(s) serÃ¡n omitidos
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
                                        Destino: <strong>{currentFolder || 'RaÃ­z'}</strong>
                                        {uploadTag && <> Â· Tag: <strong>{uploadTag}</strong></>}
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
                                    {FILE_ICONS[previewItem.file_type || ('.' + (previewItem.name || previewItem.filename || '').split('.').pop().toLowerCase())] || 'ðŸ“„'}
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
                                <FileText size={13} /> Texto ExtraÃ­do / Chunks IA ({previewData?.chunks?.length || 0})
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
                                            Ver texto extraÃ­do por la IA
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
                                                        {chunk.metadata?.page && <span className="badge neutral">PÃ¡g. {chunk.metadata.page}</span>}
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

