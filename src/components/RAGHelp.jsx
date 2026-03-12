/**
 * RAGHelp — Panel de Ayuda Visual del Sistema RAG
 * Sanatorio Argentino - Contact Center
 * Explica gráficamente cómo funciona el pipeline de IA documental
 */
import { useState } from 'react'
import {
    X, FileText, Brain, Search, Layers, Sparkles,
    ArrowRight, ArrowDown, CheckCircle, Zap,
    GraduationCap, HelpCircle, Upload, Database,
    MessageSquare, BarChart3, BookOpen, Lightbulb,
    Shield, Target, GitBranch
} from 'lucide-react'

export default function RAGHelp({ onClose }) {
    const [activeSection, setActiveSection] = useState('overview')

    const sections = [
        { id: 'overview', label: '¿Qué es?', icon: Brain },
        { id: 'embeddings', label: 'Embeddings', icon: Database },
        { id: 'pipeline', label: 'Pipeline IA', icon: GitBranch },
        { id: 'learning', label: 'Aprendizaje', icon: GraduationCap },
        { id: 'tips', label: 'Consejos', icon: Lightbulb },
    ]

    return (
        <div className="rag-help-overlay" onClick={onClose}>
            <div className="rag-help-modal" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="rag-help-header">
                    <div className="rag-help-header-info">
                        <div className="rag-help-icon-main">
                            <BookOpen size={22} />
                        </div>
                        <div>
                            <h2>¿Cómo funciona Simon?</h2>
                            <p>Guía visual del sistema RAG — Sanatorio Argentino</p>
                        </div>
                    </div>
                    <button className="rag-help-close" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                {/* Navigation */}
                <div className="rag-help-nav">
                    {sections.map(sec => (
                        <button
                            key={sec.id}
                            className={`rag-help-nav-btn ${activeSection === sec.id ? 'active' : ''}`}
                            onClick={() => setActiveSection(sec.id)}
                        >
                            <sec.icon size={14} />
                            {sec.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="rag-help-content">

                    {/* === OVERVIEW === */}
                    {activeSection === 'overview' && (
                        <div className="rag-help-section">
                            <h3>RAG — Retrieval Augmented Generation</h3>
                            <p className="rag-help-desc">
                                El sistema permite hacer <strong>preguntas en lenguaje natural</strong> sobre los documentos
                                cargados (PDFs, Excel, Word, etc.) y obtener respuestas precisas con cita de fuente.
                            </p>

                            {/* Visual flow */}
                            <div className="rag-help-flow">
                                <div className="rag-help-flow-step">
                                    <div className="rag-help-flow-icon upload">
                                        <Upload size={20} />
                                    </div>
                                    <span className="rag-help-flow-label">Subís documentos</span>
                                    <span className="rag-help-flow-desc">PDFs, Excel, Word, CSV</span>
                                </div>
                                <ArrowRight size={20} className="rag-help-flow-arrow" />
                                <div className="rag-help-flow-step">
                                    <div className="rag-help-flow-icon process">
                                        <Zap size={20} />
                                    </div>
                                    <span className="rag-help-flow-label">Se procesan</span>
                                    <span className="rag-help-flow-desc">Texto → Chunks → Embeddings</span>
                                </div>
                                <ArrowRight size={20} className="rag-help-flow-arrow" />
                                <div className="rag-help-flow-step">
                                    <div className="rag-help-flow-icon search">
                                        <Search size={20} />
                                    </div>
                                    <span className="rag-help-flow-label">Hacés preguntas</span>
                                    <span className="rag-help-flow-desc">En lenguaje natural</span>
                                </div>
                                <ArrowRight size={20} className="rag-help-flow-arrow" />
                                <div className="rag-help-flow-step">
                                    <div className="rag-help-flow-icon answer">
                                        <MessageSquare size={20} />
                                    </div>
                                    <span className="rag-help-flow-label">Respuesta precisa</span>
                                    <span className="rag-help-flow-desc">Con cita de fuente</span>
                                </div>
                            </div>

                            <div className="rag-help-cards">
                                <div className="rag-help-card">
                                    <Shield size={18} />
                                    <h4>Datos Privados</h4>
                                    <p>Solo usa la información de <strong>tus documentos</strong>. No inventa ni usa conocimiento externo.</p>
                                </div>
                                <div className="rag-help-card">
                                    <FileText size={18} />
                                    <h4>Cita Fuentes</h4>
                                    <p>Cada respuesta incluye el <strong>nombre del archivo</strong> de donde extrajo la información.</p>
                                </div>
                                <div className="rag-help-card">
                                    <GraduationCap size={18} />
                                    <h4>Aprende</h4>
                                    <p>El sistema <strong>mejora con cada conversación</strong>, recordando respuestas anteriores.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* === EMBEDDINGS === */}
                    {activeSection === 'embeddings' && (
                        <div className="rag-help-section">
                            <h3>¿Qué es un Embedding?</h3>
                            <p className="rag-help-desc">
                                Un embedding es la <strong>representación numérica del significado</strong> de un texto.
                                Es como traducir palabras a coordenadas en un espacio matemático donde
                                textos similares quedan <strong>cerca entre sí</strong>.
                            </p>

                            {/* Embedding visualization */}
                            <div className="rag-help-embedding-viz">
                                <div className="rag-help-embedding-title">
                                    <Database size={16} />
                                    Espacio Vectorial (simplificado a 2D)
                                </div>
                                <div className="rag-help-embedding-space">
                                    {/* Axis */}
                                    <div className="rag-help-axis-x" />
                                    <div className="rag-help-axis-y" />

                                    {/* Cluster: Medical */}
                                    <div className="rag-help-dot medical" style={{ left: '20%', top: '25%' }} title="Criterios de admisión UTI">
                                        <span>📋</span>
                                    </div>
                                    <div className="rag-help-dot medical" style={{ left: '25%', top: '20%' }} title="Protocolo internación">
                                        <span>🏥</span>
                                    </div>
                                    <div className="rag-help-dot medical" style={{ left: '18%', top: '32%' }} title="Normas quirúrgicas">
                                        <span>⚕️</span>
                                    </div>
                                    <div className="rag-help-dot-label" style={{ left: '8%', top: '12%' }}>
                                        Documentos Médicos
                                    </div>

                                    {/* Cluster: Billing */}
                                    <div className="rag-help-dot billing" style={{ left: '70%', top: '60%' }} title="Valores OSDE">
                                        <span>💰</span>
                                    </div>
                                    <div className="rag-help-dot billing" style={{ left: '75%', top: '55%' }} title="Facturación PAMI">
                                        <span>📊</span>
                                    </div>
                                    <div className="rag-help-dot billing" style={{ left: '68%', top: '68%' }} title="Precios prácticas">
                                        <span>💲</span>
                                    </div>
                                    <div className="rag-help-dot-label" style={{ left: '60%', top: '47%' }}>
                                        Facturación / Precios
                                    </div>

                                    {/* Cluster: Admin */}
                                    <div className="rag-help-dot admin" style={{ left: '55%', top: '20%' }} title="Autorización OSDE">
                                        <span>📝</span>
                                    </div>
                                    <div className="rag-help-dot admin" style={{ left: '60%', top: '25%' }} title="Trámites obras sociales">
                                        <span>📄</span>
                                    </div>
                                    <div className="rag-help-dot-label" style={{ left: '48%', top: '10%' }}>
                                        Autorizaciones
                                    </div>

                                    {/* Query point */}
                                    <div className="rag-help-dot query" style={{ left: '72%', top: '63%' }} title="Tu pregunta">
                                        <span>❓</span>
                                    </div>
                                    <div className="rag-help-dot-label query-label" style={{ left: '78%', top: '60%' }}>
                                        Tu pregunta
                                    </div>

                                    {/* Connection lines (search radius) */}
                                    <svg className="rag-help-svg" viewBox="0 0 400 250">
                                        <circle cx="290" cy="157" r="60" className="rag-help-search-radius" />
                                    </svg>
                                </div>

                                <div className="rag-help-embedding-legend">
                                    <span><span className="rag-help-legend-dot medical" /> Docs médicos</span>
                                    <span><span className="rag-help-legend-dot billing" /> Facturación</span>
                                    <span><span className="rag-help-legend-dot admin" /> Autorizaciones</span>
                                    <span><span className="rag-help-legend-dot query" /> Tu pregunta</span>
                                </div>
                            </div>

                            <div className="rag-help-insight">
                                <Sparkles size={16} />
                                <p>
                                    Cuando hacés una pregunta, se convierte en un embedding (punto ❓) y se buscan
                                    los documentos <strong>más cercanos</strong> en el espacio vectorial. 
                                    Por eso preguntar <em>"precios de consultas"</em> encuentra documentos de facturación
                                    aunque no digan exactamente esas palabras.
                                </p>
                            </div>

                            {/* Vector example */}
                            <div className="rag-help-vector-example">
                                <div className="rag-help-vector-row">
                                    <span className="rag-help-vector-text">"criterios admisión UTI"</span>
                                    <ArrowRight size={14} />
                                    <code className="rag-help-vector-nums">[0.82, -0.15, 0.44, 0.91, ..., -0.23]</code>
                                    <span className="rag-help-vector-dim">1536 dimensiones</span>
                                </div>
                                <div className="rag-help-vector-row">
                                    <span className="rag-help-vector-text">"requisitos para entrar a terapia"</span>
                                    <ArrowRight size={14} />
                                    <code className="rag-help-vector-nums">[0.80, -0.13, 0.46, 0.89, ..., -0.25]</code>
                                    <span className="rag-help-vector-dim">¡Muy similar!</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* === PIPELINE === */}
                    {activeSection === 'pipeline' && (
                        <div className="rag-help-section">
                            <h3>Pipeline de 8 Etapas</h3>
                            <p className="rag-help-desc">
                                Cada pregunta pasa por <strong>8 etapas inteligentes</strong> para garantizar
                                la máxima precisión en la respuesta.
                            </p>

                            <div className="rag-help-pipeline">
                                <div className="rag-help-pipe-step">
                                    <div className="rag-help-pipe-num">0</div>
                                    <div className="rag-help-pipe-content">
                                        <div className="rag-help-pipe-title">
                                            <HelpCircle size={14} /> Desambiguación
                                        </div>
                                        <p>Si tu pregunta es muy vaga (ej: "horarios"), te sugiere preguntas más específicas antes de buscar.</p>
                                    </div>
                                </div>

                                <div className="rag-help-pipe-connector" />

                                <div className="rag-help-pipe-step">
                                    <div className="rag-help-pipe-num">1</div>
                                    <div className="rag-help-pipe-content">
                                        <div className="rag-help-pipe-title">
                                            <Sparkles size={14} /> HyDE
                                        </div>
                                        <p>La IA genera una <strong>respuesta hipotética</strong> para buscar documentos similares. Esto mejora drásticamente la búsqueda.</p>
                                    </div>
                                </div>

                                <div className="rag-help-pipe-connector" />

                                <div className="rag-help-pipe-step">
                                    <div className="rag-help-pipe-num">2</div>
                                    <div className="rag-help-pipe-content">
                                        <div className="rag-help-pipe-title">
                                            <Layers size={14} /> Multi-Query
                                        </div>
                                        <p>Tu pregunta se reformula en <strong>3 versiones diferentes</strong> que mantienen las entidades clave para cubrir más ángulos sin perder el foco.</p>
                                    </div>
                                </div>

                                <div className="rag-help-pipe-connector" />

                                <div className="rag-help-pipe-step">
                                    <div className="rag-help-pipe-num">3</div>
                                    <div className="rag-help-pipe-content">
                                        <div className="rag-help-pipe-title">
                                            <Search size={14} /> Búsqueda Híbrida
                                        </div>
                                        <p>Combina <strong>búsqueda semántica</strong> (por significado) + <strong>búsqueda textual</strong> (por palabras exactas). Lo mejor de ambos mundos.</p>
                                    </div>
                                </div>

                                <div className="rag-help-pipe-connector" />

                                <div className="rag-help-pipe-step">
                                    <div className="rag-help-pipe-num">4</div>
                                    <div className="rag-help-pipe-content">
                                        <div className="rag-help-pipe-title">
                                            <Target size={14} /> Deduplicación
                                        </div>
                                        <p>Elimina resultados duplicados de las múltiples búsquedas paralelas.</p>
                                    </div>
                                </div>

                                <div className="rag-help-pipe-connector" />

                                <div className="rag-help-pipe-step highlight">
                                    <div className="rag-help-pipe-num">4.5</div>
                                    <div className="rag-help-pipe-content">
                                        <div className="rag-help-pipe-title">
                                            <Target size={14} /> Filtro por Entidad
                                        </div>
                                        <p>Si preguntás por una entidad específica (ej: <strong>"OSDE"</strong>), filtra los resultados para <strong>excluir documentos de otras entidades</strong> y enfocarse solo en la que mencionaste.</p>
                                    </div>
                                </div>

                                <div className="rag-help-pipe-connector" />

                                <div className="rag-help-pipe-step highlight">
                                    <div className="rag-help-pipe-num">5</div>
                                    <div className="rag-help-pipe-content">
                                        <div className="rag-help-pipe-title">
                                            <BarChart3 size={14} /> Re-ranking IA
                                        </div>
                                        <p>Un segundo modelo de IA <strong>evalúa cada fragmento del 1 al 10</strong> según su relevancia. Penaliza fragmentos que hablan de entidades diferentes a la que preguntaste.</p>
                                    </div>
                                </div>

                                <div className="rag-help-pipe-connector" />

                                <div className="rag-help-pipe-step final">
                                    <div className="rag-help-pipe-num">6</div>
                                    <div className="rag-help-pipe-content">
                                        <div className="rag-help-pipe-title">
                                            <Brain size={14} /> Generación GPT-4o
                                        </div>
                                        <p>Con los fragmentos más relevantes como contexto, <strong>GPT-4o</strong> genera una respuesta precisa citando las fuentes.</p>
                                    </div>
                                </div>

                                <div className="rag-help-pipe-connector" />

                                <div className="rag-help-pipe-step learn">
                                    <div className="rag-help-pipe-num">7</div>
                                    <div className="rag-help-pipe-content">
                                        <div className="rag-help-pipe-title">
                                            <GraduationCap size={14} /> Aprendizaje
                                        </div>
                                        <p>El par pregunta/respuesta se indexa en background para mejorar futuras consultas.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* === LEARNING === */}
                    {activeSection === 'learning' && (
                        <div className="rag-help-section">
                            <h3>Aprendizaje Continuo</h3>
                            <p className="rag-help-desc">
                                El sistema <strong>aprende automáticamente</strong> de cada conversación para mejorar sus respuestas futuras.
                            </p>

                            <div className="rag-help-learning-flow">
                                <div className="rag-help-learn-step">
                                    <div className="rag-help-learn-icon">
                                        <MessageSquare size={20} />
                                    </div>
                                    <div>
                                        <strong>1. Conversación</strong>
                                        <p>Hacés una pregunta y la IA responde usando documentos</p>
                                    </div>
                                </div>
                                <ArrowDown size={20} className="rag-help-learn-arrow" />
                                <div className="rag-help-learn-step">
                                    <div className="rag-help-learn-icon">
                                        <Database size={20} />
                                    </div>
                                    <div>
                                        <strong>2. Indexación</strong>
                                        <p>El par Q&A se convierte en un embedding y se guarda en el vector store</p>
                                    </div>
                                </div>
                                <ArrowDown size={20} className="rag-help-learn-arrow" />
                                <div className="rag-help-learn-step">
                                    <div className="rag-help-learn-icon">
                                        <Search size={20} />
                                    </div>
                                    <div>
                                        <strong>3. Búsqueda futura</strong>
                                        <p>Cuando alguien hace una pregunta similar, la IA encuentra la respuesta previa como contexto adicional</p>
                                    </div>
                                </div>
                                <ArrowDown size={20} className="rag-help-learn-arrow" />
                                <div className="rag-help-learn-step">
                                    <div className="rag-help-learn-icon highlight">
                                        <CheckCircle size={20} />
                                    </div>
                                    <div>
                                        <strong>4. Respuesta mejorada</strong>
                                        <p>La IA combina documentos originales + respuestas aprendidas para dar una respuesta más completa</p>
                                    </div>
                                </div>
                            </div>

                            <div className="rag-help-insight">
                                <Sparkles size={16} />
                                <p>
                                    Las respuestas aprendidas se muestran con el ícono 🧠 y la etiqueta <strong>"Aprendido"</strong> en las fuentes.
                                    Los documentos originales siempre tienen <strong>prioridad</strong> — las respuestas aprendidas son referencia complementaria.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* === TIPS === */}
                    {activeSection === 'tips' && (
                        <div className="rag-help-section">
                            <h3>Consejos para mejores resultados</h3>

                            <div className="rag-help-tips">
                                <div className="rag-help-tip good">
                                    <CheckCircle size={16} />
                                    <div>
                                        <strong>Sé específico</strong>
                                        <p>"¿Cuáles son los criterios de admisión a UTI según OSDE?" es mejor que "criterios"</p>
                                    </div>
                                </div>
                                <div className="rag-help-tip good">
                                    <CheckCircle size={16} />
                                    <div>
                                        <strong>Mencioná la obra social</strong>
                                        <p>"¿Cómo autorizar una práctica en Swiss Medical?" da resultados precisos</p>
                                    </div>
                                </div>
                                <div className="rag-help-tip good">
                                    <CheckCircle size={16} />
                                    <div>
                                        <strong>Hacé preguntas de seguimiento</strong>
                                        <p>Podés profundizar: "¿Y para prácticas bioquímicas?" después de una consulta general</p>
                                    </div>
                                </div>
                                <div className="rag-help-tip good">
                                    <CheckCircle size={16} />
                                    <div>
                                        <strong>Usá el buscador de archivos</strong>
                                        <p>Podés descargar el archivo original desde las fuentes citadas para verificar</p>
                                    </div>
                                </div>
                                <div className="rag-help-tip warn">
                                    <Lightbulb size={16} />
                                    <div>
                                        <strong>Si dice "no tengo información"</strong>
                                        <p>Puede ser que el documento no esté cargado. Verificá en la pestaña Archivos</p>
                                    </div>
                                </div>
                            </div>

                            <div className="rag-help-formats">
                                <h4>Formatos soportados</h4>
                                <div className="rag-help-format-grid">
                                    <span>📄 PDF</span>
                                    <span>📝 Word (.docx)</span>
                                    <span>📊 Excel (.xlsx/.xls)</span>
                                    <span>📋 CSV</span>
                                    <span>📃 Texto (.txt/.md)</span>
                                    <span>🔧 JSON / XML</span>
                                    <span>🌐 HTML</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="rag-help-footer">
                    <span>Sanatorio Argentino · Sistema RAG V3.2</span>
                    <span>Powered by OpenAI GPT-4o + Entity-Aware Pipeline</span>
                </div>
            </div>
        </div>
    )
}
