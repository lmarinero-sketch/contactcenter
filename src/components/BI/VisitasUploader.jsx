import { useState, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import * as XLSX from 'xlsx'
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertTriangle,
  X, ChevronDown, ChevronUp, Loader2, Database, Trash2
} from 'lucide-react'

const BATCH_SIZE = 500

// ── Mapeo de columnas Excel → DB ─────────────────────────────────
const COLUMN_MAP = {
  'idVisita': 'id_visita',
  'IdPaciente': 'id_paciente',
  'Asistencia': 'asistencia',
  'Paciente': 'paciente',
  'NIF': 'nif',
  'telefono1': 'telefono',
  'email': 'email',
  'Comentarios': 'comentarios',
  'Grupo Agenda': 'grupo_agenda',
  'Cliente': 'cliente',
  'Sexo': 'sexo',
  'Edad': 'edad',
  'Poblacion': 'poblacion',
  'Responsable': 'responsable',
  'Tipo Visita': 'tipo_visita',
  'Fecha Visita': 'fecha_visita',
  'Hora Inicio Visita Formato Texto': 'hora_inicio',
  'Hora Fin Visita Formato Texto': 'hora_fin',
  'Centro': 'centro',
  'Fecha Hora Creacion': 'fecha_hora_creacion',
  'Usuario Creacion Nombre': 'usuario_creacion',
}

const EXPECTED_HEADERS = Object.keys(COLUMN_MAP)

// ── Helpers de transformación ────────────────────────────────────

function cleanValue(v) {
  if (v === undefined || v === null || v === '') return null
  if (typeof v === 'string' && v.trim().toUpperCase() === 'NULL') return null
  return v
}

/** Convierte fracción decimal del día → "HH:MM" */
function decimalToTime(decimal) {
  if (decimal === null || decimal === undefined || decimal === '') return null
  const num = parseFloat(decimal)
  if (isNaN(num)) return typeof decimal === 'string' ? decimal : null
  const totalMinutes = Math.round(num * 24 * 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/** Parsea fecha (string "2025-06-06 00:00:00.000" o serial Excel) → "YYYY-MM-DD" */
function parseDate(value) {
  if (!value) return null
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
    if (match) return match[1]
    const d = new Date(value)
    if (!isNaN(d)) return d.toISOString().split('T')[0]
    return null
  }
  if (typeof value === 'number') {
    // Excel serial date → JS Date
    const d = new Date((value - 25569) * 86400 * 1000)
    return d.toISOString().split('T')[0]
  }
  if (value instanceof Date) return value.toISOString().split('T')[0]
  return null
}

/** Parsea timestamp completo → ISO string */
function parseTimestamp(value) {
  if (!value) return null
  if (typeof value === 'string') {
    const d = new Date(value.replace(' ', 'T'))
    if (!isNaN(d)) return d.toISOString()
    return value
  }
  if (typeof value === 'number') {
    const d = new Date((value - 25569) * 86400 * 1000)
    return d.toISOString()
  }
  if (value instanceof Date) return value.toISOString()
  return null
}

/** Mapea una fila del Excel al formato de la tabla */
function mapRow(row) {
  const idVisita = row['idVisita']
  if (!idVisita) return null // skip rows sin ID

  return {
    id_visita: parseInt(idVisita),
    id_paciente: row['IdPaciente'] != null ? parseInt(row['IdPaciente']) : null,
    asistencia: cleanValue(row['Asistencia']),
    paciente: cleanValue(row['Paciente']),
    nif: row['NIF'] != null ? String(row['NIF']) : null,
    telefono: cleanValue(row['telefono1']) != null ? String(cleanValue(row['telefono1'])) : null,
    email: cleanValue(row['email']),
    comentarios: cleanValue(row['Comentarios']),
    grupo_agenda: cleanValue(row['Grupo Agenda']),
    cliente: cleanValue(row['Cliente']),
    sexo: cleanValue(row['Sexo']),
    edad: row['Edad'] != null ? (parseInt(row['Edad']) || null) : null,
    poblacion: cleanValue(row['Poblacion']),
    responsable: cleanValue(row['Responsable']),
    tipo_visita: cleanValue(row['Tipo Visita']),
    fecha_visita: parseDate(row['Fecha Visita']),
    hora_inicio: decimalToTime(row['Hora Inicio Visita Formato Texto']),
    hora_fin: decimalToTime(row['Hora Fin Visita Formato Texto']),
    centro: cleanValue(row['Centro']),
    fecha_hora_creacion: parseTimestamp(row['Fecha Hora Creacion']),
    usuario_creacion: cleanValue(row['Usuario Creacion Nombre']),
  }
}

// ── Estilos ──────────────────────────────────────────────────────

const styles = {
  card: {
    marginBottom: '20px',
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
    background: '#fff',
    overflow: 'hidden',
    transition: 'box-shadow 0.3s ease',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'background 0.2s',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  headerTitle: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 600,
    color: '#1e293b',
  },
  badge: {
    fontSize: '11px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '10px',
    background: '#dbeafe',
    color: '#1a6bb5',
  },
  body: {
    padding: '0 20px 20px',
  },
  dropzone: (isDragOver) => ({
    border: `2px dashed ${isDragOver ? '#1a6bb5' : '#cbd5e1'}`,
    borderRadius: '10px',
    padding: '40px 20px',
    textAlign: 'center',
    background: isDragOver ? '#eff6ff' : '#f8fafc',
    transition: 'all 0.3s ease',
    cursor: 'pointer',
  }),
  dropzoneIcon: {
    margin: '0 auto 12px',
    color: '#94a3b8',
  },
  dropzoneText: {
    color: '#64748b',
    fontSize: '14px',
    margin: '0 0 4px',
  },
  dropzoneHint: {
    color: '#94a3b8',
    fontSize: '12px',
    margin: 0,
  },
  fileInfo: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    background: '#f0fdf4',
    borderRadius: '10px',
    border: '1px solid #bbf7d0',
  },
  fileInfoLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  fileInfoName: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#166534',
  },
  fileInfoMeta: {
    fontSize: '12px',
    color: '#16a34a',
  },
  previewTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '11px',
    marginTop: '16px',
  },
  previewTh: {
    padding: '8px 6px',
    textAlign: 'left',
    borderBottom: '2px solid #e2e8f0',
    color: '#475569',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    background: '#f8fafc',
  },
  previewTd: {
    padding: '6px',
    borderBottom: '1px solid #f1f5f9',
    color: '#334155',
    maxWidth: '120px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: '16px',
    gap: '12px',
    flexWrap: 'wrap',
  },
  btnUpload: (disabled) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 24px',
    background: disabled ? '#94a3b8' : '#1a6bb5',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 0.2s',
    boxShadow: disabled ? 'none' : '0 2px 8px rgba(26,107,181,0.25)',
  }),
  btnReset: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    background: 'transparent',
    color: '#64748b',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  progressContainer: {
    marginTop: '16px',
  },
  progressBar: {
    height: '8px',
    borderRadius: '4px',
    background: '#e2e8f0',
    overflow: 'hidden',
    marginBottom: '8px',
  },
  progressFill: (pct) => ({
    height: '100%',
    width: `${pct}%`,
    borderRadius: '4px',
    background: 'linear-gradient(90deg, #1a6bb5, #0d9488)',
    transition: 'width 0.4s ease',
  }),
  progressText: {
    fontSize: '12px',
    color: '#64748b',
    textAlign: 'center',
  },
  resultCard: (isError) => ({
    marginTop: '16px',
    padding: '16px',
    borderRadius: '10px',
    border: `1px solid ${isError ? '#fecaca' : '#bbf7d0'}`,
    background: isError ? '#fef2f2' : '#f0fdf4',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  }),
  resultTitle: (isError) => ({
    fontSize: '14px',
    fontWeight: 600,
    color: isError ? '#dc2626' : '#166534',
    margin: '0 0 4px',
  }),
  resultDetail: {
    fontSize: '12px',
    color: '#475569',
    margin: '2px 0',
  },
  validationWarning: {
    marginTop: '12px',
    padding: '12px 16px',
    borderRadius: '8px',
    background: '#fffbeb',
    border: '1px solid #fde68a',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: '#92400e',
  },
}

// ── Componente Principal ─────────────────────────────────────────

export default function VisitasUploader({ onUploadComplete }) {
  const [expanded, setExpanded] = useState(false)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null) // { headers, rows }
  const [totalRows, setTotalRows] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [validation, setValidation] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)
  const parsedDataRef = useRef(null)

  // ── Parseo del archivo Excel ──
  const handleFile = useCallback((selectedFile) => {
    if (!selectedFile) return
    setError(null)
    setResult(null)
    setValidation(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null })

        if (!jsonData || jsonData.length === 0) {
          setError('El archivo no contiene datos.')
          return
        }

        // Validar headers
        const fileHeaders = Object.keys(jsonData[0])
        const missingHeaders = EXPECTED_HEADERS.filter(h => !fileHeaders.includes(h))
        if (missingHeaders.length > 0) {
          setValidation(`Columnas faltantes: ${missingHeaders.join(', ')}`)
        }

        // Mapear datos
        const mappedRows = jsonData.map(mapRow).filter(Boolean)
        parsedDataRef.current = mappedRows

        // Preview (primeras 5 filas del Excel original)
        const previewHeaders = ['idVisita', 'Paciente', 'Asistencia', 'Fecha Visita', 'Responsable', 'Tipo Visita', 'Centro']
        const previewRows = jsonData.slice(0, 5).map(row =>
          previewHeaders.map(h => {
            const val = row[h]
            if (h === 'Fecha Visita') return parseDate(val) || ''
            if (val === null || val === undefined) return ''
            return String(val).substring(0, 40)
          })
        )

        setFile(selectedFile)
        setTotalRows(mappedRows.length)
        setPreview({ headers: previewHeaders, rows: previewRows })
      } catch (err) {
        console.error('Error parsing Excel:', err)
        setError(`Error al leer el archivo: ${err.message}`)
      }
    }
    reader.readAsArrayBuffer(selectedFile)
  }, [])

  // ── Upload a Supabase (batch upsert) ──
  const handleUpload = async () => {
    const rows = parsedDataRef.current
    if (!rows || rows.length === 0) return

    setUploading(true)
    setError(null)
    setResult(null)

    const totalBatches = Math.ceil(rows.length / BATCH_SIZE)
    let inserted = 0
    let errors = 0
    let errorMessages = []

    try {
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE)
        const batchNum = Math.floor(i / BATCH_SIZE) + 1
        setProgress({ current: batchNum, total: totalBatches, rows: Math.min(i + BATCH_SIZE, rows.length) })

        const { error: upsertError } = await supabase
          .from('salus_visitas_historico')
          .upsert(batch, { onConflict: 'id_visita', ignoreDuplicates: false })

        if (upsertError) {
          errors += batch.length
          errorMessages.push(`Lote ${batchNum}: ${upsertError.message}`)
          console.error(`Batch ${batchNum} error:`, upsertError)
        } else {
          inserted += batch.length
        }
      }

      setResult({
        success: errors === 0,
        inserted,
        errors,
        errorMessages,
        total: rows.length,
      })

      if (errors === 0 && onUploadComplete) {
        onUploadComplete()
      }
    } catch (err) {
      console.error('Upload error:', err)
      setError(`Error crítico: ${err.message}`)
    } finally {
      setUploading(false)
    }
  }

  // ── Reset ──
  const handleReset = () => {
    setFile(null)
    setPreview(null)
    setTotalRows(0)
    setResult(null)
    setError(null)
    setValidation(null)
    setProgress({ current: 0, total: 0 })
    parsedDataRef.current = null
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Drag & Drop handlers ──
  const onDragOver = (e) => { e.preventDefault(); setDragOver(true) }
  const onDragLeave = () => setDragOver(false)
  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const droppedFile = e.dataTransfer.files?.[0]
    if (droppedFile && (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls'))) {
      handleFile(droppedFile)
    } else {
      setError('Solo se aceptan archivos .xlsx o .xls')
    }
  }

  const progressPct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

  return (
    <div style={styles.card}>
      {/* ── Header (siempre visible) ── */}
      <div
        style={styles.header}
        onClick={() => setExpanded(!expanded)}
        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <div style={styles.headerLeft}>
          <Database size={18} color="#1a6bb5" />
          <h3 style={styles.headerTitle}>Actualizar Base de Datos</h3>
          <span style={styles.badge}>Excel → Supabase</span>
        </div>
        {expanded ? <ChevronUp size={18} color="#64748b" /> : <ChevronDown size={18} color="#64748b" />}
      </div>

      {/* ── Body (colapsable) ── */}
      {expanded && (
        <div style={styles.body} className="fade-in">

          {/* ── Dropzone o FileInfo ── */}
          {!file ? (
            <div
              style={styles.dropzone(dragOver)}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={36} style={styles.dropzoneIcon} />
              <p style={styles.dropzoneText}>
                <strong>Arrastrá el archivo Excel</strong> o hacé click para seleccionarlo
              </p>
              <p style={styles.dropzoneHint}>
                Formato: .xlsx o .xls — Mismo formato que "Visitas hasta..."
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
          ) : (
            <div style={styles.fileInfo}>
              <div style={styles.fileInfoLeft}>
                <FileSpreadsheet size={22} color="#16a34a" />
                <div>
                  <div style={styles.fileInfoName}>{file.name}</div>
                  <div style={styles.fileInfoMeta}>
                    {totalRows.toLocaleString('es-AR')} registros listos • {(file.size / (1024 * 1024)).toFixed(1)} MB
                  </div>
                </div>
              </div>
              <button style={styles.btnReset} onClick={handleReset} title="Quitar archivo">
                <X size={14} />
              </button>
            </div>
          )}

          {/* ── Validación warning ── */}
          {validation && (
            <div style={styles.validationWarning}>
              <AlertTriangle size={16} color="#f59e0b" />
              <span>{validation}</span>
            </div>
          )}

          {/* ── Preview ── */}
          {preview && (
            <div style={{ overflowX: 'auto', marginTop: '16px' }}>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 8px', fontWeight: 600 }}>
                Vista previa (primeras 5 filas):
              </p>
              <table style={styles.previewTable}>
                <thead>
                  <tr>
                    {preview.headers.map(h => (
                      <th key={h} style={styles.previewTh}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j} style={styles.previewTd}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Acciones ── */}
          {file && !result && (
            <div style={styles.actions}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                Se hará <strong>UPSERT</strong> — los registros existentes se actualizarán, los nuevos se insertarán.
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button style={styles.btnReset} onClick={handleReset} disabled={uploading}>
                  <Trash2 size={14} /> Cancelar
                </button>
                <button
                  style={styles.btnUpload(uploading)}
                  onClick={handleUpload}
                  disabled={uploading || totalRows === 0}
                >
                  {uploading ? (
                    <><Loader2 size={16} className="spin" /> Subiendo...</>
                  ) : (
                    <><Upload size={16} /> Subir {totalRows.toLocaleString('es-AR')} registros</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── Progress ── */}
          {uploading && (
            <div style={styles.progressContainer}>
              <div style={styles.progressBar}>
                <div style={styles.progressFill(progressPct)} />
              </div>
              <p style={styles.progressText}>
                Lote {progress.current} de {progress.total} ({progress.rows?.toLocaleString('es-AR') || 0} filas procesadas) — {progressPct}%
              </p>
            </div>
          )}

          {/* ── Error global ── */}
          {error && (
            <div style={styles.resultCard(true)}>
              <AlertTriangle size={20} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <p style={styles.resultTitle(true)}>Error</p>
                <p style={styles.resultDetail}>{error}</p>
              </div>
            </div>
          )}

          {/* ── Resultado final ── */}
          {result && (
            <div style={styles.resultCard(!result.success)}>
              {result.success ? (
                <CheckCircle2 size={22} color="#16a34a" style={{ flexShrink: 0, marginTop: 2 }} />
              ) : (
                <AlertTriangle size={22} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
              )}
              <div>
                <p style={styles.resultTitle(!result.success)}>
                  {result.success ? '¡Carga completada!' : 'Carga parcial con errores'}
                </p>
                <p style={styles.resultDetail}>
                  ✅ {result.inserted.toLocaleString('es-AR')} registros insertados/actualizados
                </p>
                {result.errors > 0 && (
                  <p style={styles.resultDetail}>
                    ❌ {result.errors.toLocaleString('es-AR')} con errores
                  </p>
                )}
                {result.errorMessages?.length > 0 && (
                  <div style={{ marginTop: '8px', fontSize: '11px', color: '#ef4444' }}>
                    {result.errorMessages.slice(0, 3).map((msg, i) => (
                      <p key={i} style={{ margin: '2px 0' }}>• {msg}</p>
                    ))}
                  </div>
                )}
                <button
                  style={{ ...styles.btnReset, marginTop: '12px' }}
                  onClick={handleReset}
                >
                  <Upload size={14} /> Subir otro archivo
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
