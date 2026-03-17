import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import {
    ChevronLeft, ChevronRight, Plus, X, Save,
    Trash2, Loader2, Sun, Moon, Clock,
    Palmtree, Coffee, Zap, Sparkles, Send,
    CalendarRange, Flag
} from 'lucide-react'

const AGENTS = ['Daniela', 'Sofia', 'Antonella', 'Refuerzo']

const SHIFT_TYPES = {
    M: { label: 'Mañana', short: 'M', color: '#e8f4fc', textColor: '#1a6bb5', icon: Sun },
    T: { label: 'Tarde', short: 'T', color: '#fef3c7', textColor: '#b45309', icon: Moon },
    I: { label: 'Intermedio', short: 'I', color: '#ede9fe', textColor: '#7c3aed', icon: Clock },
    V: { label: 'Vacaciones', short: 'V', color: '#d1fae5', textColor: '#059669', icon: Palmtree },
    F: { label: 'Franco', short: 'F', color: '#f1f5f9', textColor: '#64748b', icon: Coffee },
}

const MONTHS = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

// Feriados Nacionales Argentina 2025-2027
const HOLIDAYS = {
    // 2025
    '2025-01-01': 'Año Nuevo',
    '2025-03-03': 'Carnaval',
    '2025-03-04': 'Carnaval',
    '2025-03-24': 'Día de la Memoria',
    '2025-04-02': 'Día del Veterano',
    '2025-04-18': 'Viernes Santo',
    '2025-05-01': 'Día del Trabajador',
    '2025-05-25': 'Revolución de Mayo',
    '2025-06-16': 'Güemes',
    '2025-06-20': 'Belgrano',
    '2025-07-09': 'Día de la Independencia',
    '2025-08-17': 'San Martín',
    '2025-10-12': 'Diversidad Cultural',
    '2025-11-20': 'Soberanía Nacional',
    '2025-12-08': 'Inmaculada Concepción',
    '2025-12-25': 'Navidad',
    // 2026
    '2026-01-01': 'Año Nuevo',
    '2026-02-16': 'Carnaval',
    '2026-02-17': 'Carnaval',
    '2026-03-24': 'Día de la Memoria',
    '2026-04-02': 'Día del Veterano',
    '2026-04-03': 'Viernes Santo',
    '2026-05-01': 'Día del Trabajador',
    '2026-05-25': 'Revolución de Mayo',
    '2026-06-15': 'Güemes',
    '2026-06-20': 'Belgrano',
    '2026-07-09': 'Día de la Independencia',
    '2026-08-17': 'San Martín',
    '2026-10-12': 'Diversidad Cultural',
    '2026-11-20': 'Soberanía Nacional',
    '2026-12-08': 'Inmaculada Concepción',
    '2026-12-25': 'Navidad',
    // 2027
    '2027-01-01': 'Año Nuevo',
    '2027-02-08': 'Carnaval',
    '2027-02-09': 'Carnaval',
    '2027-03-24': 'Día de la Memoria',
    '2027-03-26': 'Viernes Santo',
    '2027-04-02': 'Día del Veterano',
    '2027-05-01': 'Día del Trabajador',
    '2027-05-25': 'Revolución de Mayo',
    '2027-06-20': 'Belgrano',
    '2027-06-21': 'Güemes',
    '2027-07-09': 'Día de la Independencia',
    '2027-08-17': 'San Martín',
    '2027-10-12': 'Diversidad Cultural',
    '2027-11-20': 'Soberanía Nacional',
    '2027-12-08': 'Inmaculada Concepción',
    '2027-12-25': 'Navidad',
}

function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate()
}

function getDayOfWeek(year, month, day) {
    return new Date(year, month, day).getDay()
}

function dateKey(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function isSunday(year, month, day) {
    return getDayOfWeek(year, month, day) === 0
}

function getHoliday(year, month, day) {
    return HOLIDAYS[dateKey(year, month, day)] || null
}

function isNonWorking(year, month, day) {
    return isSunday(year, month, day) || !!getHoliday(year, month, day)
}

// ====== AI PARSER ======
function parseAICommand(text, year, month) {
    const results = []
    const lines = text.split(/[.\n;]+/).filter(l => l.trim())

    for (const line of lines) {
        const l = line.toLowerCase().trim()

        // Find agent
        let agent = null
        for (const a of AGENTS) {
            if (l.includes(a.toLowerCase())) {
                agent = a
                break
            }
        }
        if (!agent) continue

        // Find shift type
        let shiftType = null
        if (/\bma[ñn]ana\b/.test(l) || /\bturno\s*m\b/i.test(l) || /\b(?:^|\s)m(?:\s|$)/i.test(l)) shiftType = 'M'
        else if (/\btarde\b/.test(l) || /\bturno\s*t\b/i.test(l)) shiftType = 'T'
        else if (/\bintermedio\b/.test(l) || /\bturno\s*i\b/i.test(l)) shiftType = 'I'
        else if (/\bvacacion/i.test(l) || /\bturno\s*v\b/i.test(l)) shiftType = 'V'
        else if (/\bfranco\b/.test(l) || /\bturno\s*f\b/i.test(l) || /\blibre\b/.test(l)) shiftType = 'F'

        if (!shiftType) continue

        // Find date range
        // Pattern: "del X al Y"
        const rangeMatch = l.match(/del?\s+(\d{1,2})\s+al?\s+(\d{1,2})/)
        if (rangeMatch) {
            const from = parseInt(rangeMatch[1])
            const to = parseInt(rangeMatch[2])
            const daysInMonth = getDaysInMonth(year, month)
            for (let d = from; d <= Math.min(to, daysInMonth); d++) {
                if (!isNonWorking(year, month, d)) {
                    results.push({ agent, day: d, shiftType })
                }
            }
            continue
        }

        // Pattern: single day or comma-separated "1, 2, 3"
        const dayMatches = l.match(/\b(\d{1,2})\b/g)
        if (dayMatches) {
            for (const dm of dayMatches) {
                const d = parseInt(dm)
                if (d >= 1 && d <= 31 && !isNonWorking(year, month, d)) {
                    results.push({ agent, day: d, shiftType })
                }
            }
        }
    }

    return results
}

// ====== EYE ICON (inline) ======
function EyeIcon({ size = 24, ...props }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    )
}

export default function ShiftCalendar() {
    const { canEditShifts, profile } = useAuth()
    const now = new Date()
    const [year, setYear] = useState(now.getFullYear())
    const [month, setMonth] = useState(now.getMonth())
    const [shifts, setShifts] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    // Modal states
    const [modal, setModal] = useState(null)
    const [bulkModal, setBulkModal] = useState(false)
    const [aiInput, setAiInput] = useState('')
    const [aiParsed, setAiParsed] = useState(null)
    const [aiProcessing, setAiProcessing] = useState(false)
    const [showAI, setShowAI] = useState(false)

    // Bulk fill state
    const [bulkAgent, setBulkAgent] = useState(AGENTS[0])
    const [bulkFrom, setBulkFrom] = useState(1)
    const [bulkTo, setBulkTo] = useState(5)
    const [bulkType, setBulkType] = useState('M')

    const daysInMonth = getDaysInMonth(year, month)
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

    useEffect(() => { fetchShifts() }, [year, month])

    const fetchShifts = async () => {
        setLoading(true)
        const startDate = dateKey(year, month, 1)
        const endDate = dateKey(year, month, daysInMonth)

        const { data, error } = await supabase
            .from('cc_shifts')
            .select('*')
            .gte('shift_date', startDate)
            .lte('shift_date', endDate)

        if (error) console.error('Error fetching shifts:', error)
        else setShifts(data || [])
        setLoading(false)
    }

    const shiftMap = useMemo(() => {
        const map = {}
        shifts.forEach(s => {
            const d = new Date(s.shift_date)
            map[`${s.agent_name}-${d.getUTCDate()}`] = s
        })
        return map
    }, [shifts])

    const getShift = (agent, day) => shiftMap[`${agent}-${day}`]

    const handleCellClick = (agent, day) => {
        if (!canEditShifts) return
        if (isNonWorking(year, month, day)) return
        const existing = getShift(agent, day)
        setModal({
            agent, day, existing,
            shiftType: existing?.shift_type || 'M',
            notes: existing?.notes || '',
        })
    }

    const handleSave = async () => {
        if (!modal) return
        setSaving(true)
        const dt = dateKey(year, month, modal.day)

        if (modal.existing) {
            await supabase.from('cc_shifts').update({
                shift_type: modal.shiftType, notes: modal.notes,
                updated_at: new Date().toISOString(),
            }).eq('id', modal.existing.id)
        } else {
            await supabase.from('cc_shifts').insert({
                agent_name: modal.agent, shift_date: dt,
                shift_type: modal.shiftType, notes: modal.notes,
                created_by: (await supabase.auth.getUser()).data.user?.id,
            })
        }
        setSaving(false)
        setModal(null)
        fetchShifts()
    }

    const handleDelete = async () => {
        if (!modal?.existing) return
        setSaving(true)
        await supabase.from('cc_shifts').delete().eq('id', modal.existing.id)
        setSaving(false)
        setModal(null)
        fetchShifts()
    }

    // ====== BULK FILL ======
    const handleBulkFill = async () => {
        setSaving(true)
        const userId = (await supabase.auth.getUser()).data.user?.id
        const inserts = []

        for (let d = bulkFrom; d <= Math.min(bulkTo, daysInMonth); d++) {
            if (isNonWorking(year, month, d)) continue
            inserts.push({
                agent_name: bulkAgent,
                shift_date: dateKey(year, month, d),
                shift_type: bulkType,
                notes: '',
                created_by: userId,
            })
        }

        if (inserts.length > 0) {
            const { error } = await supabase
                .from('cc_shifts')
                .upsert(inserts, { onConflict: 'agent_name,shift_date' })
            if (error) console.error('Bulk insert error:', error)
        }

        setSaving(false)
        setBulkModal(false)
        fetchShifts()
    }

    // ====== AI PROCESS ======
    const handleAIProcess = () => {
        const parsed = parseAICommand(aiInput, year, month)
        setAiParsed(parsed)
    }

    const handleAIApply = async () => {
        if (!aiParsed || aiParsed.length === 0) return
        setAiProcessing(true)
        const userId = (await supabase.auth.getUser()).data.user?.id

        const inserts = aiParsed.map(r => ({
            agent_name: r.agent,
            shift_date: dateKey(year, month, r.day),
            shift_type: r.shiftType,
            notes: '',
            created_by: userId,
        }))

        const { error } = await supabase
            .from('cc_shifts')
            .upsert(inserts, { onConflict: 'agent_name,shift_date' })

        if (error) console.error('AI apply error:', error)

        setAiProcessing(false)
        setAiParsed(null)
        setAiInput('')
        setShowAI(false)
        fetchShifts()
    }

    // Navigation
    const goToPrevMonth = () => {
        if (month === 0) { setMonth(11); setYear(y => y - 1) }
        else setMonth(m => m - 1)
    }
    const goToNextMonth = () => {
        if (month === 11) { setMonth(0); setYear(y => y + 1) }
        else setMonth(m => m + 1)
    }
    const goToToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth()) }
    const isToday = (day) => year === now.getFullYear() && month === now.getMonth() && day === now.getDate()
    const isWeekend = (day) => { const dow = getDayOfWeek(year, month, day); return dow === 0 || dow === 6 }

    return (
        <div className="shift-calendar">
            {/* Header */}
            <div className="shift-calendar-header">
                <div className="shift-calendar-nav">
                    <button className="btn btn-secondary btn-sm" onClick={goToPrevMonth}><ChevronLeft size={16} /></button>
                    <h3 className="shift-calendar-title">{MONTHS[month]} {year}</h3>
                    <button className="btn btn-secondary btn-sm" onClick={goToNextMonth}><ChevronRight size={16} /></button>
                    <button className="btn btn-ghost btn-sm" onClick={goToToday} style={{ marginLeft: 8 }}>Hoy</button>
                </div>
                <div className="shift-calendar-actions">
                    {canEditShifts && (
                        <>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowAI(!showAI)}>
                                <Sparkles size={14} />
                                IA
                            </button>
                            <button className="btn btn-secondary btn-sm" onClick={() => setBulkModal(true)}>
                                <CalendarRange size={14} />
                                Carga Rápida
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Legend */}
            <div className="shift-calendar-legend-bar">
                <div className="shift-calendar-legend">
                    {Object.entries(SHIFT_TYPES).map(([key, val]) => (
                        <div key={key} className="shift-legend-item">
                            <span className="shift-legend-dot" style={{ background: val.color, color: val.textColor, borderColor: val.textColor + '33' }}>
                                {val.short}
                            </span>
                            <span className="shift-legend-label">{val.label}</span>
                        </div>
                    ))}
                    <div className="shift-legend-item">
                        <span className="shift-legend-dot" style={{ background: '#fee2e2', color: '#dc2626', borderColor: '#dc262633' }}>🏛</span>
                        <span className="shift-legend-label">Feriado</span>
                    </div>
                    <div className="shift-legend-item">
                        <span className="shift-legend-dot" style={{ background: '#e2e8f0', color: '#64748b', borderColor: '#64748b33' }}>D</span>
                        <span className="shift-legend-label">Domingo</span>
                    </div>
                </div>
            </div>

            {/* AI Input Bar */}
            {showAI && canEditShifts && (
                <div className="shift-ai-bar">
                    <div className="shift-ai-header">
                        <Sparkles size={16} />
                        <span>Carga por IA — Escribí en lenguaje natural para {MONTHS[month]} {year}</span>
                        <button className="shift-modal-close" onClick={() => { setShowAI(false); setAiParsed(null); setAiInput('') }}>
                            <X size={16} />
                        </button>
                    </div>
                    <div className="shift-ai-body">
                        <textarea
                            className="shift-ai-input"
                            placeholder={`Ejemplos:\n• Sofia del 1 al 6 turno M, 7 franco\n• Daniela del 10 al 14 tarde\n• Antonella del 1 al 5 mañana. Antonella 6 y 7 franco\n• Refuerzo del 1 al 3 mañana`}
                            value={aiInput}
                            onChange={e => { setAiInput(e.target.value); setAiParsed(null) }}
                            rows={3}
                        />
                        <div className="shift-ai-actions">
                            <button className="btn btn-secondary btn-sm" onClick={handleAIProcess} disabled={!aiInput.trim()}>
                                <Zap size={14} />
                                Interpretar
                            </button>
                        </div>
                    </div>

                    {/* Parsed preview */}
                    {aiParsed && (
                        <div className="shift-ai-preview">
                            <div className="shift-ai-preview-header">
                                <span>{aiParsed.length} turno{aiParsed.length !== 1 ? 's' : ''} detectado{aiParsed.length !== 1 ? 's' : ''} (domingos y feriados excluidos)</span>
                            </div>
                            {aiParsed.length > 0 ? (
                                <>
                                    <div className="shift-ai-preview-grid">
                                        {aiParsed.map((r, i) => (
                                            <div key={i} className="shift-ai-preview-item">
                                                <span className="shift-ai-preview-agent">{r.agent}</span>
                                                <span className="shift-ai-preview-day">Día {r.day}</span>
                                                <span className="shift-cell-badge" style={{
                                                    background: SHIFT_TYPES[r.shiftType].color,
                                                    color: SHIFT_TYPES[r.shiftType].textColor,
                                                    border: `1px solid ${SHIFT_TYPES[r.shiftType].textColor}22`,
                                                    width: 24, height: 24, fontSize: 10,
                                                }}>
                                                    {r.shiftType}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="shift-ai-actions">
                                        <button className="btn btn-primary btn-sm" onClick={handleAIApply} disabled={aiProcessing}>
                                            {aiProcessing ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
                                            Aplicar {aiParsed.length} turnos
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <p className="shift-ai-no-results">No se detectaron turnos válidos. Revisá el formato del texto.</p>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Read-only banner */}
            {!canEditShifts && (
                <div className="shift-readonly-banner">
                    <EyeIcon size={14} />
                    Modo lectura — Solo el Coordinador puede modificar turnos
                </div>
            )}

            {/* Grid */}
            {loading ? (
                <div className="shift-loading">
                    <Loader2 size={24} className="spin" />
                    <span>Cargando turnos...</span>
                </div>
            ) : (
                <div className="shift-grid-wrapper">
                    <div className="shift-grid" style={{ gridTemplateColumns: `140px repeat(${daysInMonth}, 1fr)` }}>
                        {/* Header row */}
                        <div className="shift-grid-corner"><span>Agente</span></div>
                        {days.map(day => {
                            const holiday = getHoliday(year, month, day)
                            const sunday = isSunday(year, month, day)
                            return (
                                <div
                                    key={day}
                                    className={`shift-grid-day-header ${isToday(day) ? 'today' : ''} ${sunday ? 'sunday' : ''} ${holiday ? 'holiday' : ''} ${isWeekend(day) ? 'weekend' : ''}`}
                                    title={holiday || (sunday ? 'Domingo' : '')}
                                >
                                    <span className="shift-day-name">{DAY_NAMES[getDayOfWeek(year, month, day)]}</span>
                                    <span className="shift-day-num">{day}</span>
                                    {holiday && <span className="shift-day-flag" title={holiday}>🏛</span>}
                                </div>
                            )
                        })}

                        {/* Agent rows */}
                        {AGENTS.map(agent => (
                            <>
                                <div key={`label-${agent}`} className="shift-grid-agent">
                                    <span className="shift-agent-name">{agent}</span>
                                    {agent === 'Refuerzo' && <span className="shift-agent-info">L-M-X 08-12</span>}
                                </div>
                                {days.map(day => {
                                    const shift = getShift(agent, day)
                                    const type = shift ? SHIFT_TYPES[shift.shift_type] : null
                                    const sunday = isSunday(year, month, day)
                                    const holiday = getHoliday(year, month, day)
                                    const nonWorking = sunday || !!holiday
                                    const today = isToday(day)
                                    const weekend = isWeekend(day)

                                    return (
                                        <div
                                            key={`${agent}-${day}`}
                                            className={`shift-grid-cell ${canEditShifts && !nonWorking ? 'editable' : ''} ${weekend ? 'weekend' : ''} ${today ? 'today' : ''} ${sunday ? 'sunday' : ''} ${holiday ? 'holiday' : ''}`}
                                            onClick={() => handleCellClick(agent, day)}
                                            title={
                                                holiday ? `${holiday} — No laborable`
                                                : sunday ? 'Domingo — No laborable'
                                                : type ? `${type.label}${shift.notes ? ` — ${shift.notes}` : ''}`
                                                : canEditShifts ? 'Click para asignar turno' : ''
                                            }
                                        >
                                            {nonWorking && !type ? (
                                                <span className={`shift-cell-nonwork ${holiday ? 'is-holiday' : 'is-sunday'}`}>
                                                    {holiday ? '🏛' : 'D'}
                                                </span>
                                            ) : type ? (
                                                <span className="shift-cell-badge" style={{
                                                    background: type.color, color: type.textColor,
                                                    border: `1px solid ${type.textColor}22`,
                                                }}>
                                                    {type.short}
                                                </span>
                                            ) : null}
                                        </div>
                                    )
                                })}
                            </>
                        ))}
                    </div>
                </div>
            )}

            {/* Stats */}
            {!loading && (
                <div className="shift-stats">
                    {AGENTS.map(agent => {
                        const agentShifts = shifts.filter(s => s.agent_name === agent)
                        const counts = {}
                        agentShifts.forEach(s => { counts[s.shift_type] = (counts[s.shift_type] || 0) + 1 })
                        return (
                            <div key={agent} className="shift-stat-card">
                                <span className="shift-stat-agent">{agent}</span>
                                <div className="shift-stat-counts">
                                    {Object.entries(SHIFT_TYPES).map(([key, val]) => (
                                        <span key={key} className="shift-stat-item" style={{ color: val.textColor }}>
                                            {val.short}: <strong>{counts[key] || 0}</strong>
                                        </span>
                                    ))}
                                    <span className="shift-stat-item" style={{ color: '#334155', fontWeight: 700 }}>
                                        Total: <strong>{agentShifts.length}</strong>
                                    </span>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* ====== CELL EDIT MODAL ====== */}
            {modal && (
                <div className="shift-modal-overlay" onClick={() => setModal(null)}>
                    <div className="shift-modal" onClick={e => e.stopPropagation()}>
                        <div className="shift-modal-header">
                            <h4>{modal.existing ? 'Editar Turno' : 'Asignar Turno'}</h4>
                            <button className="shift-modal-close" onClick={() => setModal(null)}><X size={18} /></button>
                        </div>
                        <div className="shift-modal-body">
                            <div className="shift-modal-info">
                                <span className="shift-modal-agent">{modal.agent}</span>
                                <span className="shift-modal-date">{modal.day} de {MONTHS[month]} {year}</span>
                            </div>
                            <div className="shift-modal-field">
                                <label>Tipo de turno</label>
                                <div className="shift-type-selector">
                                    {Object.entries(SHIFT_TYPES).map(([key, val]) => {
                                        const Icon = val.icon
                                        return (
                                            <button key={key}
                                                className={`shift-type-option ${modal.shiftType === key ? 'selected' : ''}`}
                                                style={{ '--st-bg': val.color, '--st-color': val.textColor, '--st-border': val.textColor + '33' }}
                                                onClick={() => setModal(m => ({ ...m, shiftType: key }))}
                                            >
                                                <Icon size={16} /><span>{val.label}</span>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                            <div className="shift-modal-field">
                                <label>Notas (opcional)</label>
                                <textarea className="shift-modal-textarea" placeholder="Agregar notas..." value={modal.notes}
                                    onChange={e => setModal(m => ({ ...m, notes: e.target.value }))} rows={2} />
                            </div>
                        </div>
                        <div className="shift-modal-footer">
                            {modal.existing && (
                                <button className="btn btn-danger btn-sm" onClick={handleDelete} disabled={saving}>
                                    <Trash2 size={14} /> Eliminar
                                </button>
                            )}
                            <div style={{ flex: 1 }} />
                            <button className="btn btn-secondary btn-sm" onClick={() => setModal(null)} disabled={saving}>Cancelar</button>
                            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                                {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ====== BULK FILL MODAL ====== */}
            {bulkModal && (
                <div className="shift-modal-overlay" onClick={() => setBulkModal(false)}>
                    <div className="shift-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
                        <div className="shift-modal-header">
                            <h4><CalendarRange size={18} style={{ marginRight: 8 }} /> Carga Rápida</h4>
                            <button className="shift-modal-close" onClick={() => setBulkModal(false)}><X size={18} /></button>
                        </div>
                        <div className="shift-modal-body">
                            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                                Asigná un turno a un rango de días. Los domingos y feriados se excluyen automáticamente.
                            </p>

                            <div className="shift-modal-field">
                                <label>Agente</label>
                                <div className="shift-bulk-agents">
                                    {AGENTS.map(a => (
                                        <button key={a}
                                            className={`shift-type-option ${bulkAgent === a ? 'selected' : ''}`}
                                            style={{ '--st-bg': '#e8f4fc', '--st-color': '#1a6bb5', '--st-border': '#1a6bb533' }}
                                            onClick={() => setBulkAgent(a)}
                                        >{a}</button>
                                    ))}
                                </div>
                            </div>

                            <div className="shift-modal-field">
                                <label>Rango de días</label>
                                <div className="shift-bulk-range">
                                    <span>Del día</span>
                                    <input type="number" min={1} max={daysInMonth} value={bulkFrom}
                                        onChange={e => setBulkFrom(Math.max(1, parseInt(e.target.value) || 1))}
                                        className="shift-bulk-input" />
                                    <span>al día</span>
                                    <input type="number" min={1} max={daysInMonth} value={bulkTo}
                                        onChange={e => setBulkTo(Math.min(daysInMonth, parseInt(e.target.value) || daysInMonth))}
                                        className="shift-bulk-input" />
                                    <span className="shift-bulk-hint">
                                        ({(() => {
                                            let count = 0
                                            for (let d = bulkFrom; d <= Math.min(bulkTo, daysInMonth); d++) {
                                                if (!isNonWorking(year, month, d)) count++
                                            }
                                            return count
                                        })()} días laborables)
                                    </span>
                                </div>
                            </div>

                            <div className="shift-modal-field">
                                <label>Tipo de turno</label>
                                <div className="shift-type-selector">
                                    {Object.entries(SHIFT_TYPES).map(([key, val]) => {
                                        const Icon = val.icon
                                        return (
                                            <button key={key}
                                                className={`shift-type-option ${bulkType === key ? 'selected' : ''}`}
                                                style={{ '--st-bg': val.color, '--st-color': val.textColor, '--st-border': val.textColor + '33' }}
                                                onClick={() => setBulkType(key)}
                                            >
                                                <Icon size={16} /><span>{val.label}</span>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                        <div className="shift-modal-footer">
                            <div style={{ flex: 1 }} />
                            <button className="btn btn-secondary btn-sm" onClick={() => setBulkModal(false)}>Cancelar</button>
                            <button className="btn btn-primary btn-sm" onClick={handleBulkFill} disabled={saving}>
                                {saving ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}
                                Aplicar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
