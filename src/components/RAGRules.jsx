/**
 * RAGRules — Panel de Reglas y Conocimiento Manual para Simon
 * Permite ingresar, editar y eliminar reglas por texto o voz que Simon usará en sus respuestas
 */
import { useState, useEffect, useRef } from 'react'
import {
    Mic, MicOff, Send, Trash2, Loader2, BookOpen,
    Tag, Clock, AlertCircle, CheckCircle, Plus,
    Shield, Sparkles, Volume2, X, Pencil, Save, RotateCcw
} from 'lucide-react'

const RAG_API_BASE = import.meta.env.VITE_RAG_API_URL || '/rag-api'

const CATEGORY_LABELS = {
    obra_social: { label: 'Obra Social', color: '#3b82f6', bg: '#eff6ff' },
    precios: { label: 'Precios', color: '#10b981', bg: '#ecfdf5' },
    protocolo: { label: 'Protocolo', color: '#f59e0b', bg: '#fffbeb' },
    administrativo: { label: 'Administrativo', color: '#8b5cf6', bg: '#f5f3ff' },
    medico: { label: 'Médico', color: '#ef4444', bg: '#fef2f2' },
    general: { label: 'General', color: '#64748b', bg: '#f8fafc' },
}

export default function RAGRules() {
    const [rules, setRules] = useState([])
    const [ruleText, setRuleText] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isListening, setIsListening] = useState(false)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)
    const [isLoading, setIsLoading] = useState(true)

    // Edit state
    const [editingRuleId, setEditingRuleId] = useState(null)
    const [editText, setEditText] = useState('')
    const [isSavingEdit, setIsSavingEdit] = useState(false)

    // Delete confirmation
    const [deletingRuleId, setDeletingRuleId] = useState(null)

    const recognitionRef = useRef(null)
    const textareaRef = useRef(null)
    const editTextareaRef = useRef(null)

    // Load rules on mount
    useEffect(() => {
        loadRules()
    }, [])

    // Focus edit textarea when editing starts
    useEffect(() => {
        if (editingRuleId && editTextareaRef.current) {
            editTextareaRef.current.focus()
            // Move cursor to end
            const len = editTextareaRef.current.value.length
            editTextareaRef.current.setSelectionRange(len, len)
        }
    }, [editingRuleId])

    async function loadRules() {
        setIsLoading(true)
        try {
            const resp = await fetch(`${RAG_API_BASE}/rules`)
            if (resp.ok) {
                const data = await resp.json()
                setRules(data.rules || [])
            }
        } catch (e) {
            console.error('Error loading rules:', e)
        }
        setIsLoading(false)
    }

    async function handleSubmitRule() {
        if (!ruleText.trim() || ruleText.trim().length < 5) {
            setError('Escribí una regla más completa (mínimo 5 caracteres)')
            return
        }

        setIsSubmitting(true)
        setError(null)
        setSuccess(null)

        try {
            const resp = await fetch(`${RAG_API_BASE}/rules`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: ruleText.trim() })
            })

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}))
                throw new Error(err.detail || 'Error al guardar regla')
            }

            const result = await resp.json()
            setSuccess(`✅ Regla guardada: "${result.title}" — Categoría: ${result.category}`)
            setRuleText('')
            loadRules()
            setTimeout(() => setSuccess(null), 5000)
        } catch (e) {
            setError(e.message)
        }
        setIsSubmitting(false)
    }

    async function handleDeleteRule(ruleId) {
        setDeletingRuleId(null)
        try {
            const resp = await fetch(`${RAG_API_BASE}/rules/${ruleId}`, { method: 'DELETE' })
            if (resp.ok) {
                setSuccess('✅ Regla eliminada correctamente')
                setTimeout(() => setSuccess(null), 3000)
            }
            loadRules()
        } catch (e) {
            setError('Error al eliminar regla')
        }
    }

    function startEditing(rule) {
        setEditingRuleId(rule.id)
        setEditText(rule.original_text || rule.processed_text || '')
        setError(null)
    }

    function cancelEditing() {
        setEditingRuleId(null)
        setEditText('')
    }

    async function handleSaveEdit(ruleId) {
        if (!editText.trim() || editText.trim().length < 5) {
            setError('El texto de la regla debe tener al menos 5 caracteres')
            return
        }

        setIsSavingEdit(true)
        setError(null)

        try {
            const resp = await fetch(`${RAG_API_BASE}/rules/${ruleId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: editText.trim() })
            })

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}))
                throw new Error(err.detail || 'Error al actualizar regla')
            }

            const result = await resp.json()
            setSuccess(`✅ Regla actualizada: "${result.title}"`)
            setEditingRuleId(null)
            setEditText('')
            loadRules()
            setTimeout(() => setSuccess(null), 5000)
        } catch (e) {
            setError(e.message)
        }
        setIsSavingEdit(false)
    }

    // Speech-to-text
    function toggleListening() {
        if (isListening) {
            stopListening()
        } else {
            startListening()
        }
    }

    function startListening() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
        if (!SpeechRecognition) {
            setError('Tu navegador no soporta reconocimiento de voz. Usá Chrome.')
            return
        }

        const recognition = new SpeechRecognition()
        recognition.lang = 'es-AR'
        recognition.continuous = true
        recognition.interimResults = true

        recognition.onresult = (event) => {
            let finalTranscript = ''
            let interimTranscript = ''

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript
                if (event.results[i].isFinal) {
                    finalTranscript += transcript
                } else {
                    interimTranscript += transcript
                }
            }

            if (finalTranscript) {
                setRuleText(prev => prev + (prev ? ' ' : '') + finalTranscript)
            }
        }

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error)
            if (event.error === 'no-speech') {
                setError('No se detectó voz. Intentá de nuevo.')
            }
            setIsListening(false)
        }

        recognition.onend = () => {
            setIsListening(false)
        }

        recognition.start()
        recognitionRef.current = recognition
        setIsListening(true)
        setError(null)
    }

    function stopListening() {
        if (recognitionRef.current) {
            recognitionRef.current.stop()
            recognitionRef.current = null
        }
        setIsListening(false)
    }

    function handleKeyPress(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmitRule()
        }
    }

    function handleEditKeyPress(e, ruleId) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSaveEdit(ruleId)
        }
        if (e.key === 'Escape') {
            cancelEditing()
        }
    }

    function getCategoryStyle(category) {
        return CATEGORY_LABELS[category] || CATEGORY_LABELS.general
    }

    function formatDate(dateStr) {
        if (!dateStr) return ''
        try {
            const d = new Date(dateStr)
            return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        } catch { return dateStr }
    }

    return (
        <div className="rag-rules-panel">
            {/* Header */}
            <div className="rag-rules-header">
                <div className="rag-rules-header-info">
                    <Shield size={18} />
                    <div>
                        <h3>Reglas y Conocimiento</h3>
                        <p>Ingresá información que Simon debe recordar</p>
                    </div>
                </div>
                <span className="badge info">{rules.length} regla{rules.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Input area */}
            <div className="rag-rules-input-area">
                <div className="rag-rules-input-wrap">
                    <textarea
                        ref={textareaRef}
                        className="rag-rules-textarea"
                        value={ruleText}
                        onChange={(e) => setRuleText(e.target.value)}
                        onKeyDown={handleKeyPress}
                        placeholder='Ej: "Cuando pregunten por obra social Provincia, el plus al día de la fecha es de $2000"'
                        rows={3}
                        disabled={isSubmitting}
                    />
                    <div className="rag-rules-input-actions">
                        <button
                            className={`rag-rules-mic-btn ${isListening ? 'listening' : ''}`}
                            onClick={toggleListening}
                            title={isListening ? 'Detener grabación' : 'Dictar regla por voz'}
                            disabled={isSubmitting}
                        >
                            {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                            {isListening && <span className="rag-rules-mic-pulse" />}
                        </button>
                        <button
                            className="rag-rules-submit-btn"
                            onClick={handleSubmitRule}
                            disabled={isSubmitting || !ruleText.trim()}
                            title="Guardar regla"
                        >
                            {isSubmitting ? <Loader2 size={16} className="rag-spin" /> : <Send size={16} />}
                            Guardar
                        </button>
                    </div>
                </div>

                {isListening && (
                    <div className="rag-rules-listening-indicator">
                        <Volume2 size={14} />
                        Escuchando... hablá claro y pausado
                    </div>
                )}

                {error && (
                    <div className="rag-rules-alert error">
                        <AlertCircle size={14} />
                        {error}
                        <button onClick={() => setError(null)}><X size={12} /></button>
                    </div>
                )}

                {success && (
                    <div className="rag-rules-alert success">
                        <CheckCircle size={14} />
                        {success}
                    </div>
                )}
            </div>

            {/* Rules list */}
            <div className="rag-rules-list">
                {isLoading ? (
                    <div className="rag-rules-empty">
                        <Loader2 size={20} className="rag-spin" />
                        Cargando reglas...
                    </div>
                ) : rules.length === 0 ? (
                    <div className="rag-rules-empty">
                        <BookOpen size={24} />
                        <p>No hay reglas cargadas</p>
                        <span>Escribí o dictá información que Simon debe recordar</span>
                    </div>
                ) : (
                    rules.map(rule => {
                        const catStyle = getCategoryStyle(rule.category)
                        const isEditing = editingRuleId === rule.id
                        const isDeleting = deletingRuleId === rule.id
                        return (
                            <div key={rule.id} className={`rag-rule-item ${isEditing ? 'editing' : ''}`}>
                                <div className="rag-rule-header">
                                    <span
                                        className="rag-rule-category"
                                        style={{ color: catStyle.color, background: catStyle.bg }}
                                    >
                                        {catStyle.label}
                                    </span>
                                    <span className="rag-rule-date">
                                        <Clock size={10} />
                                        {formatDate(rule.created_at)}
                                    </span>
                                </div>

                                {isEditing ? (
                                    /* ── Edit Mode ── */
                                    <div className="rag-rule-edit-area">
                                        <textarea
                                            ref={editTextareaRef}
                                            className="rag-rule-edit-textarea"
                                            value={editText}
                                            onChange={(e) => setEditText(e.target.value)}
                                            onKeyDown={(e) => handleEditKeyPress(e, rule.id)}
                                            rows={4}
                                            disabled={isSavingEdit}
                                            placeholder="Editá el texto de la regla..."
                                        />
                                        <div className="rag-rule-edit-actions">
                                            <button
                                                className="rag-rule-edit-save"
                                                onClick={() => handleSaveEdit(rule.id)}
                                                disabled={isSavingEdit || !editText.trim()}
                                                title="Guardar cambios (Enter)"
                                            >
                                                {isSavingEdit
                                                    ? <Loader2 size={13} className="rag-spin" />
                                                    : <Save size={13} />
                                                }
                                                {isSavingEdit ? 'Procesando...' : 'Guardar'}
                                            </button>
                                            <button
                                                className="rag-rule-edit-cancel"
                                                onClick={cancelEditing}
                                                disabled={isSavingEdit}
                                                title="Cancelar (Esc)"
                                            >
                                                <RotateCcw size={13} />
                                                Cancelar
                                            </button>
                                        </div>
                                        <div className="rag-rule-edit-hint">
                                            💡 Al guardar, Simon re-procesará la regla con IA (categoría, keywords y fechas actualizadas)
                                        </div>
                                    </div>
                                ) : (
                                    /* ── View Mode ── */
                                    <>
                                        <div className="rag-rule-title">{rule.title}</div>
                                        <div className="rag-rule-processed">{rule.processed_text}</div>
                                        {rule.original_text !== rule.processed_text && (
                                            <div className="rag-rule-original">
                                                <Sparkles size={10} />
                                                Original: "{rule.original_text}"
                                            </div>
                                        )}
                                        {rule.keywords && rule.keywords.length > 0 && (
                                            <div className="rag-rule-keywords">
                                                {rule.keywords.map((kw, i) => (
                                                    <span key={i} className="rag-rule-keyword">
                                                        <Tag size={9} /> {kw}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* ── Action buttons ── */}
                                {!isEditing && (
                                    <div className="rag-rule-actions">
                                        <button
                                            className="rag-rule-action-btn edit"
                                            onClick={() => startEditing(rule)}
                                            title="Editar regla"
                                        >
                                            <Pencil size={12} />
                                            Editar
                                        </button>

                                        {isDeleting ? (
                                            <div className="rag-rule-delete-confirm">
                                                <span>¿Eliminar?</span>
                                                <button
                                                    className="rag-rule-delete-yes"
                                                    onClick={() => handleDeleteRule(rule.id)}
                                                >
                                                    Sí
                                                </button>
                                                <button
                                                    className="rag-rule-delete-no"
                                                    onClick={() => setDeletingRuleId(null)}
                                                >
                                                    No
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                className="rag-rule-action-btn delete"
                                                onClick={() => setDeletingRuleId(rule.id)}
                                                title="Eliminar regla"
                                            >
                                                <Trash2 size={12} />
                                                Eliminar
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    )
}
