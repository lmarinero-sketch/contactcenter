import { useState, useEffect, useRef } from 'react'
import {
    Send, Loader2, Sparkles, AlertCircle, X,
    Brain, ThumbsUp, ThumbsDown
} from 'lucide-react'
import {
    sendRAGMessage, checkRAGHealth, fetchSuggestions, submitFeedback
} from '../api/ragClient'

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
    
    // 3. Parse blockquotes / alerts
    html = html.replace(/^&gt;\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n([\s\S]*?)(?=\n\n|\n&gt;|\n\n|$)/gm, (match, type, content) => {
        return `<div class="markdown-alert markdown-alert-${type.toLowerCase()}"><strong>${type}</strong>:<br/>${content.trim()}</div>`;
    });
    html = html.replace(/^&gt;\s*(.*)/gm, '<blockquote class="markdown-blockquote">$1</blockquote>');
    
    // 3.5. Parse Headers
    html = html.replace(/^### (.*$)/gm, '<h3 class="markdown-h3">$1</h3>');
    html = html.replace(/^## (.*$)/gm, '<h2 class="markdown-h2">$1</h2>');
    html = html.replace(/^# (.*$)/gm, '<h1 class="markdown-h1">$1</h1>');
    
    // 4. Parse Tables
    const tableRegex = /((?:^\|.+\|(?:\r?\n|$))+)/gm;
    html = html.replace(tableRegex, (match) => {
        const rows = match.trim().split('\n');
        if (rows.length < 2) return match;
        let tableHtml = '<div class="markdown-table-wrapper"><table class="markdown-table">';
        rows.forEach((row, rowIndex) => {
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
    
    // 5. Parse bold and italics
    html = html
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    // 6. Parse bulleted lists
    html = html.replace(/^\s*-\s+(.*)/gm, '<li>$1</li>');
    html = html.replace(/((?:<li>.*<\/li>(?:\r?\n|$))+)/g, '<ul class="markdown-list">$1</ul>');
    
    // 7. Parse numbered lists
    html = html.replace(/^\s*(\d+)\.\s+(.*)/gm, '<li class="num-li" data-num="$1">$2</li>');
    html = html.replace(/((?:<li class="num-li".*<\/li>(?:\r?\n|$))+)/g, '<ol class="markdown-num-list">$1</ol>');
    
    // 8. Replace line breaks
    html = html.replace(/\n/g, '<br/>');
    
    // Restore clean tags
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

export default function PublicSimonChat() {
    // State
    const [messages, setMessages] = useState([])
    const [inputValue, setInputValue] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState(null)
    const [backendOnline, setBackendOnline] = useState(null)
    const [activeConversation, setActiveConversation] = useState(null)
    
    // Smart Guidance Layer
    const [suggestions, setSuggestions] = useState({ categories: [], top_queries: [] })
    
    // Session state (simplified)
    useEffect(() => {
        // Initialize public conversation ID on mount
        if (!activeConversation) {
            const tempId = 'pub_' + Date.now().toString(36) + Math.random().toString(36).substr(2)
            setActiveConversation(tempId)
        }
        
        // Silently check health to wake up backend if asleep
        checkRAGHealth().then(online => setBackendOnline(online)).catch(() => setBackendOnline(false))
    }, [])

    // Feedback state
    const [feedbackState, setFeedbackState] = useState({})

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

    const messagesEndRef = useRef(null)

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        
        if (window.mermaid && messages.length > 0) {
            setTimeout(() => {
                try {
                    window.mermaid.init(undefined, document.querySelectorAll('.mermaid'));
                } catch (e) {}
            }, 100);
        }
    }, [messages])

    useEffect(() => {
        fetchSuggestions().then(data => setSuggestions(data)).catch(() => {})
    }, [])

    function handleSend(e) {
        e?.preventDefault()
        if (!inputValue.trim() || isLoading) return

        const question = inputValue.trim()
        setInputValue('')
        setError(null)

        const userMsg = { role: 'user', content: question, created_at: new Date().toISOString() }
        setMessages(prev => [...prev, userMsg])
        setIsLoading(true)

        sendRAGMessage(question, activeConversation)
            .then(result => {
                if (result.conversation_id && !activeConversation.startsWith('pub_')) {
                    // Update if backend assigned a real ID (though public usually means we don't care)
                }
                const assistantMsg = { 
                    role: 'assistant', 
                    content: result.answer || result.message || 'Sin respuesta',
                    sources: result.sources || [],
                    created_at: new Date().toISOString(),
                    type: result.type,
                    suggestions: result.suggestions,
                    pipeline_info: result.pipeline_info
                }
                setMessages(prev => [...prev, assistantMsg])
            })
            .catch(err => {
                setError(err.message)
            })
            .finally(() => {
                setIsLoading(false)
            })
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
                    const assistantMsg = { 
                        role: 'assistant', 
                        content: result.answer || result.message || 'Sin respuesta',
                        sources: result.sources || [],
                        created_at: new Date().toISOString(),
                        type: result.type,
                        suggestions: result.suggestions,
                        pipeline_info: result.pipeline_info
                    }
                    setMessages(prev => [...prev, assistantMsg])
                })
                .catch(err => {
                    setError(err.message)
                })
                .finally(() => {
                    setIsLoading(false)
                })
        }, 100)
    }

    async function handleFeedback(messageIndex, isCorrect) {
        const assistantIndex = messages
            .slice(0, messageIndex + 1)
            .filter(m => m.role === 'assistant' && m.type !== 'clarification')
            .length - 1
            
        const fbKey = `${activeConversation}-${assistantIndex}`
        setFeedbackState(prev => ({ ...prev, [fbKey]: 'loading' }))
        
        try {
            await submitFeedback(activeConversation, assistantIndex, isCorrect)
            setFeedbackState(prev => ({ ...prev, [fbKey]: isCorrect ? 'correct' : 'incorrect' }))
        } catch (e) {
            console.error('Feedback error:', e)
            setFeedbackState(prev => {
                const next = {...prev}
                delete next[fbKey]
                return next
            })
        }
    }



    return (
        <div className="simon-modern-container">
            <div className="simon-chat-area" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', position: 'relative' }}>
                <div className="simon-glass-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div className="rag-header-logo">
                            <Brain size={20} color="#3b82f6" />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                Simon IA <span className="rag-beta-badge">Público</span>
                            </h2>
                            <p style={{ fontSize: '0.875rem', color: 'var(--simon-text-muted)', margin: 0 }}>Consultá sobre procedimientos y reglas</p>
                        </div>
                    </div>
                    <button className="simon-theme-toggle" onClick={() => setIsDarkMode(!isDarkMode)}>
                        {isDarkMode ? '☀️' : '🌙'}
                    </button>
                </div>

                <div className="simon-messages-container">
                    {messages.length === 0 ? (
                        <div className="rag-chat-empty" style={{ paddingTop: '10vh' }}>
                            <div className="rag-empty-icon" style={{ background: 'transparent' }}>
                                <Brain size={56} color="var(--blue-500)" />
                            </div>
                            <h2 style={{ fontSize: '24px', fontWeight: 600 }}>¡Hola! Soy Simon IA</h2>
                            <p style={{ color: 'var(--simon-text-muted)', fontSize: '16px' }}>Estoy acá para responder preguntas basadas en la base de datos documental del Sanatorio.</p>
                            
                            {(suggestions.categories.length > 0 || suggestions.top_queries.length > 0) && (
                                <div className="rag-suggestions-container" style={{ maxWidth: '800px', margin: '40px auto 0' }}>
                                    <div className="rag-suggestions-grid">
                                        {suggestions.categories.slice(0, 4).map((cat, i) => (
                                            <button key={i} className="rag-suggestion-card" onClick={() => handleSuggestionClick(cat.query)}>
                                                <span className="rag-suggestion-emoji">{cat.emoji}</span>
                                                <div className="rag-suggestion-text">
                                                    <h4 style={{ color: 'var(--simon-text-main)' }}>{cat.label}</h4>
                                                </div>
                                            </button>
                                        ))}
                                        {suggestions.top_queries.slice(0, 4).map((q, i) => (
                                            <button key={i} className="rag-suggestion-card" onClick={() => handleSuggestionClick(q)}>
                                                <span className="rag-suggestion-emoji">💡</span>
                                                <div className="rag-suggestion-text">
                                                    <h4 style={{ color: 'var(--simon-text-main)' }}>{q}</h4>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        messages.map((msg, i) => (
                            <div key={i} className={`simon-message-band ${msg.role}`}>
                                <div className="simon-message-inner">
                                    <div className={`simon-message-avatar ${msg.role}`}>
                                        {msg.role === 'assistant' ? <Brain size={16} /> : <span>SA</span>}
                                    </div>
                                    <div className="simon-message-content">
                                        {msg.type === 'clarification' ? (
                                            <div className="rag-clarification-notice">
                                                <Sparkles size={16} />
                                                <span>{msg.content}</span>
                                            </div>
                                        ) : (
                                            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                                        )}

                                        {msg.type === 'clarification' && msg.suggestions && msg.suggestions.length > 0 && (
                                            <div className="rag-suggestion-chips">
                                                {msg.suggestions.map((suggestion, j) => (
                                                    <button key={j} className="rag-suggestion-chip" onClick={() => handleSuggestionClick(suggestion)}>
                                                        {suggestion}
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {msg.sources && msg.sources.length > 0 && (
                                            <div className="rag-message-sources">
                                                <div className="rag-sources-label">Fuentes consultadas:</div>
                                                <div className="rag-sources-list">
                                                    {msg.sources.map((src, j) => (
                                                        <div key={j} className="rag-source-item">
                                                            <div className="rag-source-header">
                                                                <span className="rag-source-name" title={src.filename}>
                                                                    {src.filename}
                                                                </span>
                                                                <span className="rag-source-meta">
                                                                    {src.similarity ? `${Math.round(src.similarity * 100)}% certeza` : 'Documento'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        
                                        {msg.role === 'assistant' && msg.type !== 'clarification' && (() => {
                                            const assistantIndex = messages.slice(0, i + 1).filter(m => m.role === 'assistant' && m.type !== 'clarification').length - 1;
                                            const fbKey = `${activeConversation}-${assistantIndex}`
                                            const fbState = feedbackState[fbKey]
                                            const resolved = fbState || msg.feedback
                                            
                                            return (
                                                <div className={`rag-feedback-bar ${resolved ? 'resolved' : ''}`}>
                                                    {resolved === 'loading' ? (
                                                        <span className="rag-feedback-loading"><Loader2 size={12} className="rag-spin" /> Guardando...</span>
                                                    ) : resolved === 'correct' ? (
                                                        <span className="rag-feedback-resolved positive"><ThumbsUp size={12} /> Correcto</span>
                                                    ) : resolved === 'incorrect' ? (
                                                        <span className="rag-feedback-resolved negative"><ThumbsDown size={12} /> Incorrecto</span>
                                                    ) : (
                                                        <>
                                                            <span className="rag-feedback-question">¿Fue útil esta respuesta?</span>
                                                            <button className="rag-fb-btn positive" onClick={() => handleFeedback(i, true)} title="Sí, la respuesta es correcta">
                                                                <ThumbsUp size={14} />
                                                            </button>
                                                            <button className="rag-fb-btn negative" onClick={() => handleFeedback(i, false)} title="No, la respuesta es incorrecta o inventada">
                                                                <ThumbsDown size={14} />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            )
                                        })()}
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
                                        <div className="rag-dot" style={{ background: 'var(--blue-500)' }}></div>
                                        <div className="rag-dot" style={{ background: 'var(--blue-500)' }}></div>
                                        <div className="rag-dot" style={{ background: 'var(--blue-500)' }}></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <div className="simon-floating-input-wrapper">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '760px' }}>
                        {error && (
                            <div className="rag-error-banner" style={{ background: '#fef2f2', color: '#ef4444', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><AlertCircle size={14} /> <span style={{ fontSize: '13px' }}>{error}</span></div>
                                <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><X size={14} /></button>
                            </div>
                        )}
                        
                        <form onSubmit={handleSend} className="simon-floating-input">
                            <textarea
                                value={inputValue}
                                onChange={(e) => {
                                    setInputValue(e.target.value);
                                    e.target.style.height = 'auto';
                                    e.target.style.height = (e.target.scrollHeight) + 'px';
                                }}
                                placeholder="Consultá a Simon..."
                                className="simon-input-textarea"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault()
                                        handleSend(e)
                                    }
                                }}
                            />
                            <button
                                type="submit"
                                disabled={!inputValue.trim() || isLoading}
                                className="simon-btn-send"
                            >
                                {isLoading ? <Loader2 size={18} className="rag-spin" /> : <Send size={16} />}
                            </button>
                        </form>
                        <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--simon-text-muted)', marginTop: '8px' }}>
                            Simon IA puede cometer errores. Considerá verificar la información importante.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
