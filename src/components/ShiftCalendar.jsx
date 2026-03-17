import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import {
    ChevronLeft, ChevronRight, Plus, X, Save,
    Trash2, Edit3, Loader2, Sun, Moon, Clock,
    Palmtree, Coffee
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

function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate()
}

function getDayOfWeek(year, month, day) {
    return new Date(year, month, day).getDay()
}

export default function ShiftCalendar() {
    const { canEditShifts, profile } = useAuth()
    const now = new Date()
    const [year, setYear] = useState(now.getFullYear())
    const [month, setMonth] = useState(now.getMonth())
    const [shifts, setShifts] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    // Modal state
    const [modal, setModal] = useState(null) // { agent, day, existing? }

    const daysInMonth = getDaysInMonth(year, month)
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

    // Fetch shifts
    useEffect(() => {
        fetchShifts()
    }, [year, month])

    const fetchShifts = async () => {
        setLoading(true)
        const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
        const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

        const { data, error } = await supabase
            .from('cc_shifts')
            .select('*')
            .gte('shift_date', startDate)
            .lte('shift_date', endDate)

        if (error) {
            console.error('Error fetching shifts:', error)
        } else {
            setShifts(data || [])
        }
        setLoading(false)
    }

    // Build lookup map: "agent-day" -> shift
    const shiftMap = useMemo(() => {
        const map = {}
        shifts.forEach(s => {
            const d = new Date(s.shift_date)
            const key = `${s.agent_name}-${d.getUTCDate()}`
            map[key] = s
        })
        return map
    }, [shifts])

    const getShift = (agent, day) => shiftMap[`${agent}-${day}`]

    const handleCellClick = (agent, day) => {
        if (!canEditShifts) return
        const existing = getShift(agent, day)
        setModal({
            agent,
            day,
            existing,
            shiftType: existing?.shift_type || 'M',
            notes: existing?.notes || '',
        })
    }

    const handleSave = async () => {
        if (!modal) return
        setSaving(true)

        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(modal.day).padStart(2, '0')}`

        if (modal.existing) {
            // Update
            const { error } = await supabase
                .from('cc_shifts')
                .update({
                    shift_type: modal.shiftType,
                    notes: modal.notes,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', modal.existing.id)

            if (error) console.error('Error updating shift:', error)
        } else {
            // Insert
            const { error } = await supabase
                .from('cc_shifts')
                .insert({
                    agent_name: modal.agent,
                    shift_date: dateStr,
                    shift_type: modal.shiftType,
                    notes: modal.notes,
                    created_by: (await supabase.auth.getUser()).data.user?.id,
                })

            if (error) console.error('Error inserting shift:', error)
        }

        setSaving(false)
        setModal(null)
        fetchShifts()
    }

    const handleDelete = async () => {
        if (!modal?.existing) return
        setSaving(true)

        const { error } = await supabase
            .from('cc_shifts')
            .delete()
            .eq('id', modal.existing.id)

        if (error) console.error('Error deleting shift:', error)

        setSaving(false)
        setModal(null)
        fetchShifts()
    }

    const goToPrevMonth = () => {
        if (month === 0) {
            setMonth(11)
            setYear(y => y - 1)
        } else {
            setMonth(m => m - 1)
        }
    }

    const goToNextMonth = () => {
        if (month === 11) {
            setMonth(0)
            setYear(y => y + 1)
        } else {
            setMonth(m => m + 1)
        }
    }

    const goToToday = () => {
        setYear(now.getFullYear())
        setMonth(now.getMonth())
    }

    const isToday = (day) => {
        return year === now.getFullYear() && month === now.getMonth() && day === now.getDate()
    }

    const isWeekend = (day) => {
        const dow = getDayOfWeek(year, month, day)
        return dow === 0 || dow === 6
    }

    return (
        <div className="shift-calendar">
            {/* Header with nav */}
            <div className="shift-calendar-header">
                <div className="shift-calendar-nav">
                    <button className="btn btn-secondary btn-sm" onClick={goToPrevMonth}>
                        <ChevronLeft size={16} />
                    </button>
                    <h3 className="shift-calendar-title">
                        {MONTHS[month]} {year}
                    </h3>
                    <button className="btn btn-secondary btn-sm" onClick={goToNextMonth}>
                        <ChevronRight size={16} />
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={goToToday} style={{ marginLeft: 8 }}>
                        Hoy
                    </button>
                </div>
                <div className="shift-calendar-legend">
                    {Object.entries(SHIFT_TYPES).map(([key, val]) => (
                        <div key={key} className="shift-legend-item">
                            <span
                                className="shift-legend-dot"
                                style={{ background: val.color, color: val.textColor, borderColor: val.textColor + '33' }}
                            >
                                {val.short}
                            </span>
                            <span className="shift-legend-label">{val.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Role indicator */}
            {!canEditShifts && (
                <div className="shift-readonly-banner">
                    <Eye size={14} />
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
                        {/* Header row: Day numbers */}
                        <div className="shift-grid-corner">
                            <span>Agente</span>
                        </div>
                        {days.map(day => (
                            <div
                                key={day}
                                className={`shift-grid-day-header ${isToday(day) ? 'today' : ''} ${isWeekend(day) ? 'weekend' : ''}`}
                            >
                                <span className="shift-day-name">{DAY_NAMES[getDayOfWeek(year, month, day)]}</span>
                                <span className="shift-day-num">{day}</span>
                            </div>
                        ))}

                        {/* Agent rows */}
                        {AGENTS.map(agent => (
                            <>
                                <div key={`label-${agent}`} className="shift-grid-agent">
                                    <span className="shift-agent-name">{agent}</span>
                                    {agent === 'Refuerzo' && (
                                        <span className="shift-agent-info">L-M-X 08-12</span>
                                    )}
                                </div>
                                {days.map(day => {
                                    const shift = getShift(agent, day)
                                    const type = shift ? SHIFT_TYPES[shift.shift_type] : null
                                    const weekend = isWeekend(day)
                                    const today = isToday(day)

                                    return (
                                        <div
                                            key={`${agent}-${day}`}
                                            className={`shift-grid-cell ${canEditShifts ? 'editable' : ''} ${weekend ? 'weekend' : ''} ${today ? 'today' : ''}`}
                                            onClick={() => handleCellClick(agent, day)}
                                            title={type ? `${type.label}${shift.notes ? ` — ${shift.notes}` : ''}` : canEditShifts ? 'Click para asignar turno' : ''}
                                        >
                                            {type && (
                                                <span
                                                    className="shift-cell-badge"
                                                    style={{
                                                        background: type.color,
                                                        color: type.textColor,
                                                        border: `1px solid ${type.textColor}22`,
                                                    }}
                                                >
                                                    {type.short}
                                                </span>
                                            )}
                                        </div>
                                    )
                                })}
                            </>
                        ))}
                    </div>
                </div>
            )}

            {/* Stats summary */}
            {!loading && (
                <div className="shift-stats">
                    {AGENTS.map(agent => {
                        const agentShifts = shifts.filter(s => s.agent_name === agent)
                        const counts = {}
                        agentShifts.forEach(s => {
                            counts[s.shift_type] = (counts[s.shift_type] || 0) + 1
                        })
                        return (
                            <div key={agent} className="shift-stat-card">
                                <span className="shift-stat-agent">{agent}</span>
                                <div className="shift-stat-counts">
                                    {Object.entries(SHIFT_TYPES).map(([key, val]) => (
                                        <span key={key} className="shift-stat-item" style={{ color: val.textColor }}>
                                            {val.short}: <strong>{counts[key] || 0}</strong>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Modal */}
            {modal && (
                <div className="shift-modal-overlay" onClick={() => setModal(null)}>
                    <div className="shift-modal" onClick={e => e.stopPropagation()}>
                        <div className="shift-modal-header">
                            <h4>
                                {modal.existing ? 'Editar Turno' : 'Asignar Turno'}
                            </h4>
                            <button className="shift-modal-close" onClick={() => setModal(null)}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="shift-modal-body">
                            <div className="shift-modal-info">
                                <span className="shift-modal-agent">{modal.agent}</span>
                                <span className="shift-modal-date">
                                    {modal.day} de {MONTHS[month]} {year}
                                </span>
                            </div>

                            <div className="shift-modal-field">
                                <label>Tipo de turno</label>
                                <div className="shift-type-selector">
                                    {Object.entries(SHIFT_TYPES).map(([key, val]) => {
                                        const Icon = val.icon
                                        return (
                                            <button
                                                key={key}
                                                className={`shift-type-option ${modal.shiftType === key ? 'selected' : ''}`}
                                                style={{
                                                    '--st-bg': val.color,
                                                    '--st-color': val.textColor,
                                                    '--st-border': val.textColor + '33',
                                                }}
                                                onClick={() => setModal(m => ({ ...m, shiftType: key }))}
                                            >
                                                <Icon size={16} />
                                                <span>{val.label}</span>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            <div className="shift-modal-field">
                                <label>Notas (opcional)</label>
                                <textarea
                                    className="shift-modal-textarea"
                                    placeholder="Agregar notas..."
                                    value={modal.notes}
                                    onChange={e => setModal(m => ({ ...m, notes: e.target.value }))}
                                    rows={2}
                                />
                            </div>
                        </div>

                        <div className="shift-modal-footer">
                            {modal.existing && (
                                <button
                                    className="btn btn-danger btn-sm"
                                    onClick={handleDelete}
                                    disabled={saving}
                                >
                                    <Trash2 size={14} />
                                    Eliminar
                                </button>
                            )}
                            <div style={{ flex: 1 }} />
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setModal(null)}
                                disabled={saving}
                            >
                                Cancelar
                            </button>
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={handleSave}
                                disabled={saving}
                            >
                                {saving ? (
                                    <Loader2 size={14} className="spin" />
                                ) : (
                                    <Save size={14} />
                                )}
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// We need Eye icon for the readonly banner - importing inline
function Eye({ size = 24, ...props }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            {...props}
        >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    )
}
