import { useState } from 'react'
import { Upload, FileText, AlertCircle, Save, Brain, Info, CheckCircle2, BookOpen, FileDigit, Type, Loader2 } from 'lucide-react'

const RAG_API_BASE = import.meta.env.VITE_RAG_API_URL || '/rag-api'

export default function DataEntryPanel() {
    const [files, setFiles] = useState([])
    const [dataType, setDataType] = useState('visitas')
    const [entryMode, setEntryMode] = useState('file') // 'file' or 'text'
    const [textEntry, setTextEntry] = useState('')
    const [isDragging, setIsDragging] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const [statusMessage, setStatusMessage] = useState({ type: '', text: '' })
    const [uploadLogs, setUploadLogs] = useState([])

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            setFiles(Array.from(e.target.files))
            setUploadLogs([])
        }
    }

    const handleDragOver = (e) => {
        e.preventDefault()
        setIsDragging(true)
    }

    const handleDragLeave = (e) => {
        e.preventDefault()
        setIsDragging(false)
    }

    const handleDrop = (e) => {
        e.preventDefault()
        setIsDragging(false)
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            setFiles(Array.from(e.dataTransfer.files))
            setStatusMessage({ type: '', text: '' })
            setUploadLogs([])
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setIsUploading(true)
        setStatusMessage({ type: '', text: '' })

        try {
            if (entryMode === 'file') {
                const logs = []
                let successCount = 0
                
                const SUPPORTED_EXTS = ['.pdf', '.docx', '.xlsx', '.xls', '.csv', '.txt', '.md', '.json', '.xml', '.html', '.htm', '.png', '.jpg', '.jpeg', '.webp'];
                const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
                
                const validFiles = [];
                for (const file of files) {
                    const ext = '.' + file.name.split('.').pop().toLowerCase();
                    if (!SUPPORTED_EXTS.includes(ext)) {
                        logs.push({ name: file.name, status: 'error', message: `Formato no soportado (${ext}). Convertir a PDF o DOCX.` });
                    } else if (file.size > MAX_FILE_SIZE) {
                        logs.push({ name: file.name, status: 'error', message: `El archivo supera el límite de 50MB.` });
                    } else {
                        validFiles.push(file);
                    }
                }

                for (const file of validFiles) {
                    const formData = new FormData()
                    formData.append('file', file)
                    formData.append('folder', dataType)
                    formData.append('tag', dataType)

                    try {
                        const res = await fetch(`${RAG_API_BASE}/upload`, {
                            method: 'POST',
                            body: formData,
                        })

                        if (!res.ok) {
                            const errData = await res.json()
                            throw new Error(errData.detail || 'Error al subir el documento')
                        }
                        
                        logs.push({ name: file.name, status: 'success', message: 'OK' })
                        successCount++
                    } catch (err) {
                        let errMsg = err.message;
                        if (errMsg && (errMsg.toLowerCase().includes('failed to fetch') || errMsg.toLowerCase().includes('networkerror'))) {
                            errMsg = 'Error de conexión: Servidor no responde. Informar al responsable.';
                        }
                        logs.push({ name: file.name, status: 'error', message: errMsg })
                    }
                }
                
                setUploadLogs(logs)

                if (successCount === files.length) {
                    setStatusMessage({ type: 'success', text: `¡Todos los documentos vectorizados exitosamente!` })
                    setFiles([])
                } else if (successCount > 0) {
                    setStatusMessage({ type: 'warning', text: `Se subieron ${successCount} documentos, pero hubo errores.` })
                } else {
                    setStatusMessage({ type: 'error', text: `Ningún documento pudo ser vectorizado.` })
                }
            } else {
                const res = await fetch(`${RAG_API_BASE}/rules`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: textEntry, created_by: 'operador_ui' }),
                })

                if (!res.ok) {
                    const errData = await res.json()
                    throw new Error(errData.detail || 'Error al procesar la regla')
                }

                setStatusMessage({ type: 'success', text: `¡Regla inyectada en el cerebro de Simon!` })
                setTextEntry('')
            }
        } catch (error) {
            console.error('Upload Error:', error)
            let errMsg = error.message;
            if (errMsg && (errMsg.toLowerCase().includes('failed to fetch') || errMsg.toLowerCase().includes('networkerror'))) {
                errMsg = 'Error de conexión: Servidor no responde. Informar al responsable.';
            }
            setStatusMessage({ type: 'error', text: errMsg || 'Error de conexión con el backend.' })
        } finally {
            setIsUploading(false)
        }
    }

    const isSubmitDisabled = isUploading || (entryMode === 'file' ? files.length === 0 : textEntry.trim().length === 0);

    return (
        <div style={{ padding: '32px', maxWidth: '1100px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            
            {/* Header Section */}
            <div style={{ marginBottom: '32px', borderBottom: '1px solid #e5e7eb', paddingBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <div style={{ backgroundColor: '#eff6ff', padding: '12px', borderRadius: '12px' }}>
                        <Brain size={28} style={{ color: '#2563eb' }} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#111827', margin: 0 }}>
                            Base de Conocimiento de Simon IA
                        </h2>
                        <p style={{ color: '#6b7280', margin: '4px 0 0 0', fontSize: '1rem' }}>
                            Módulo de entrenamiento y vectorización de datos (RAG).
                        </p>
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                
                {/* Left Column: Form */}
                <div style={{ flex: '1 1 600px' }}>
                    <div style={{ 
                        backgroundColor: '#ffffff', 
                        borderRadius: '16px', 
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)', 
                        border: '1px solid #f3f4f6', 
                        padding: '32px' 
                    }}>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                            
                            {/* Modo de Carga (Tabs) */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '12px' }}>
                                    1. Método de Ingesta
                                </label>
                                <div style={{ display: 'flex', gap: '8px', backgroundColor: '#f3f4f6', padding: '6px', borderRadius: '12px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setEntryMode('file')}
                                        style={{
                                            flex: 1, padding: '12px', borderRadius: '8px', fontWeight: 600, transition: 'all 0.2s', fontSize: '0.9rem',
                                            backgroundColor: entryMode === 'file' ? '#ffffff' : 'transparent',
                                            color: entryMode === 'file' ? '#2563eb' : '#6b7280',
                                            border: 'none',
                                            boxShadow: entryMode === 'file' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                            cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                                        }}
                                    >
                                        <FileText size={18} /> Subir Documento
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEntryMode('text')}
                                        style={{
                                            flex: 1, padding: '12px', borderRadius: '8px', fontWeight: 600, transition: 'all 0.2s', fontSize: '0.9rem',
                                            backgroundColor: entryMode === 'text' ? '#ffffff' : 'transparent',
                                            color: entryMode === 'text' ? '#2563eb' : '#6b7280',
                                            border: 'none',
                                            boxShadow: entryMode === 'text' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                            cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                                        }}
                                    >
                                        <Type size={18} /> Escribir Regla Rápida
                                    </button>
                                </div>
                            </div>

                            {/* Tipo de Dato */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
                                    2. Categoría de la Información
                                </label>
                                <select 
                                    value={dataType} 
                                    onChange={(e) => setDataType(e.target.value)}
                                    style={{ 
                                        width: '100%', padding: '14px', border: '1px solid #d1d5db', 
                                        borderRadius: '10px', backgroundColor: '#ffffff', color: '#1f2937',
                                        outline: 'none', fontSize: '0.95rem', cursor: 'pointer',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                                    }}
                                >
                                    <option value="visitas">Registro de Visitas / Interacciones Históricas</option>
                                    <option value="turnos">Diagrama y Reglas de Turnos</option>
                                    <option value="convenios">Obras Sociales, Aranceles y Convenios</option>
                                    <option value="procedimientos">Manuales y Procedimientos Internos</option>
                                    <option value="otros">Otros Datos Clínicos/Administrativos</option>
                                </select>
                            </div>

                            {/* Contenido (Archivo o Texto) */}
                            {entryMode === 'file' ? (
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
                                        3. Seleccionar Archivo
                                    </label>
                                    <div 
                                        onDragOver={handleDragOver}
                                        onDragLeave={handleDragLeave}
                                        onDrop={handleDrop}
                                        style={{ 
                                            border: isDragging ? '2px dashed #2563eb' : '2px dashed #cbd5e1', 
                                            borderRadius: '12px', 
                                            padding: '40px', 
                                            display: 'flex', 
                                            flexDirection: 'column', 
                                            alignItems: 'center', 
                                            justifyContent: 'center',
                                            position: 'relative',
                                            backgroundColor: isDragging ? '#eff6ff' : '#f8fafc',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <input 
                                            type="file" 
                                            multiple
                                            onChange={handleFileChange}
                                            accept=".csv, .pdf, .docx, .png, .jpg, .jpeg, .webp, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                                        />
                                        {files.length > 0 ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: '#2563eb' }}>
                                                <div style={{ backgroundColor: '#dbeafe', padding: '16px', borderRadius: '50%' }}>
                                                    <CheckCircle2 size={36} />
                                                </div>
                                                <div style={{ textAlign: 'center' }}>
                                                    <span style={{ display: 'block', fontWeight: 600, fontSize: '1rem', color: '#1e40af' }}>{files.length} archivo(s) seleccionado(s)</span>
                                                    <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0 0', fontSize: '0.85rem', color: '#3b82f6', maxHeight: '100px', overflowY: 'auto' }}>
                                                        {files.map((f, i) => (
                                                            <li key={i}>{f.name} ({(f.size / 1024).toFixed(1)} KB)</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: '#64748b' }}>
                                                <div style={{ backgroundColor: '#f1f5f9', padding: '16px', borderRadius: '50%' }}>
                                                    <Upload size={36} />
                                                </div>
                                                <div style={{ textAlign: 'center' }}>
                                                    <span style={{ display: 'block', fontWeight: 600, fontSize: '1rem', color: '#334155' }}>Hacé clic o arrastrá un archivo aquí</span>
                                                    <span style={{ fontSize: '0.85rem', marginTop: '4px', display: 'block' }}>Formatos permitidos: Excel, CSV, PDF, Word, Imágenes</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
                                        3. Redactar Directiva
                                    </label>
                                    <textarea
                                        value={textEntry}
                                        onChange={(e) => setTextEntry(e.target.value)}
                                        placeholder="Ej: A partir de hoy, los turnos de ginecología se agendan con 48hs de anticipación mínima. El Dr. Pérez atiende solo los martes..."
                                        rows={8}
                                        style={{
                                            width: '100%', padding: '16px', border: '1px solid #d1d5db', borderRadius: '12px',
                                            resize: 'vertical', outline: 'none', backgroundColor: '#ffffff', color: '#1f2937',
                                            fontFamily: 'inherit', fontSize: '0.95rem', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)',
                                            lineHeight: '1.5'
                                        }}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                                        <span style={{ fontSize: '0.75rem', color: textEntry.length > 10 ? '#2563eb' : '#9ca3af' }}>
                                            {textEntry.length} caracteres
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Mensajes de Estado */}
                            {statusMessage.text && (
                                <div style={{
                                    marginTop: '16px', padding: '12px 16px', borderRadius: '12px', display: 'flex', alignItems: 'flex-start', gap: '12px',
                                    backgroundColor: statusMessage.type === 'error' ? '#fef2f2' : (statusMessage.type === 'warning' ? '#fffbeb' : '#f0fdf4'),
                                    color: statusMessage.type === 'error' ? '#991b1b' : (statusMessage.type === 'warning' ? '#b45309' : '#166534'),
                                    border: `1px solid ${statusMessage.type === 'error' ? '#fca5a5' : (statusMessage.type === 'warning' ? '#fcd34d' : '#bbf7d0')}`
                                }}>
                                    <AlertCircle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                                    <span>{statusMessage.text}</span>
                                </div>
                            )}

                            {uploadLogs.length > 0 && (
                                <div style={{ marginTop: '16px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.875rem', color: '#475569' }}>Detalle de Subida</h4>
                                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.875rem' }}>
                                        {uploadLogs.map((log, idx) => (
                                            <li key={idx} style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ fontWeight: 500, color: '#334155' }}>{log.name}</span>
                                                {log.status === 'success' ? (
                                                    <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={14}/> OK</span>
                                                ) : (
                                                    <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}><AlertCircle size={14}/> Error: {log.message}</span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Submit Button */}
                            <div style={{ paddingTop: '16px' }}>
                                <button 
                                    type="submit" 
                                    disabled={isSubmitDisabled}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                        width: '100%', padding: '16px', borderRadius: '12px', fontWeight: 600, fontSize: '1rem',
                                        cursor: isSubmitDisabled ? 'not-allowed' : 'pointer',
                                        backgroundColor: isSubmitDisabled ? '#e2e8f0' : '#2563eb',
                                        color: isSubmitDisabled ? '#94a3b8' : '#ffffff',
                                        border: 'none',
                                        boxShadow: isSubmitDisabled ? 'none' : '0 4px 6px -1px rgba(37, 99, 235, 0.2)',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {isUploading ? <Loader2 size={20} className="spin" style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={20} />}
                                    {isUploading ? 'Procesando en Vector DB...' : 'Iniciar Vectorización (RAG)'}
                                </button>
                                <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
                            </div>
                        </form>
                    </div>
                </div>

                {/* Right Column: Guide & Tips */}
                <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    {/* Guía de Uso */}
                    <div style={{ backgroundColor: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem', fontWeight: 600, color: '#0f172a', margin: '0 0 16px 0' }}>
                            <BookOpen size={20} style={{ color: '#3b82f6' }} />
                            ¿Cómo entrenar a Simon?
                        </h3>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                <div style={{ backgroundColor: '#dbeafe', color: '#1d4ed8', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}>1</div>
                                <div>
                                    <h4 style={{ fontWeight: 600, fontSize: '0.9rem', color: '#334155', margin: 0 }}>Elegí el formato</h4>
                                    <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '2px 0 0 0', lineHeight: 1.4 }}>Para grandes volúmenes (Excel/PDF) usá "Subir Documento". Para órdenes directas, usá "Escribir Regla Rápida".</p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                <div style={{ backgroundColor: '#dbeafe', color: '#1d4ed8', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}>2</div>
                                <div>
                                    <h4 style={{ fontWeight: 600, fontSize: '0.9rem', color: '#334155', margin: 0 }}>Categorizá la información</h4>
                                    <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '2px 0 0 0', lineHeight: 1.4 }}>Seleccionar la categoría correcta mejora el proceso de búsqueda semántica (reranking).</p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                <div style={{ backgroundColor: '#dbeafe', color: '#1d4ed8', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}>3</div>
                                <div>
                                    <h4 style={{ fontWeight: 600, fontSize: '0.9rem', color: '#334155', margin: 0 }}>Procesamiento RAG</h4>
                                    <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '2px 0 0 0', lineHeight: 1.4 }}>Al guardar, el modelo <strong style={{color: '#0f172a'}}>text-embedding-3-large</strong> fragmentará y guardará el texto en la base vectorial.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Alerta de Calidad */}
                    <div style={{ backgroundColor: '#eff6ff', borderRadius: '16px', border: '1px solid #bfdbfe', padding: '20px' }}>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <AlertCircle style={{ color: '#2563eb', flexShrink: 0, marginTop: '2px' }} size={20} />
                            <div>
                                <h4 style={{ color: '#1e40af', fontWeight: 600, fontSize: '0.9rem', margin: 0 }}>Tip para Inteligencia Artificial</h4>
                                <p style={{ color: '#1e40af', fontSize: '0.85rem', margin: '6px 0 0 0', lineHeight: 1.5, opacity: 0.9 }}>
                                    Simon comprende mejor el lenguaje natural. Si subís un Excel, asegurate de que las columnas tengan títulos claros (ej: "Médico", "Especialidad", "Días").
                                </p>
                            </div>
                        </div>
                    </div>

                    <div style={{ backgroundColor: '#f0fdf4', borderRadius: '16px', border: '1px solid #bbf7d0', padding: '20px' }}>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <FileDigit style={{ color: '#16a34a', flexShrink: 0, marginTop: '2px' }} size={20} />
                            <div>
                                <h4 style={{ color: '#166534', fontWeight: 600, fontSize: '0.9rem', margin: 0 }}>Formatos Soportados</h4>
                                                <ul style={{ color: '#166534', fontSize: '0.85rem', margin: '6px 0 0 0', paddingLeft: '20px', lineHeight: 1.5, opacity: 0.9 }}>
                                                    <li><strong>.XLSX / .CSV</strong>: Para bases de datos y grillas.</li>
                                                    <li><strong>.PDF / .DOCX</strong>: Para normativas y manuales.</li>
                                                    <li><strong>.PNG / .JPG / .JPEG / .WEBP</strong>: Para imágenes y capturas.</li>
                                                    <li><strong>Texto Libre</strong>: Para órdenes inmediatas.</li>
                                                </ul>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    )
}
