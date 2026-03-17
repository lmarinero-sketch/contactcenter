import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import {
    Plus, X, Save, Trash2, Edit3, Loader2,
    Bell, Lightbulb, AlertTriangle, HandHelping,
    ArrowLeftRight, Filter, Search, Calendar,
    Clock, User, ChevronDown
} from 'lucide-react'

const CATEGORIES = {
    novedad: { label: 'Novedad', icon: Bell, color: '#3b82f6', bg: '#eff6ff' },
    sugerencia: { label: 'Sugerencia', icon: Lightbulb, color: '#eab308', bg: '#fefce8' },
    problema: { label: 'Problema', icon: AlertTriangle, color: '#ef4444', bg: '#fef2f2' },
    peticion: { label: 'Petición', icon: HandHelping, color: '#8b5cf6', bg: '#f5f3ff' },
    cambio_turno: { label: 'Cambio de Turno', icon: ArrowLeftRight, color: '#14b8a6', bg: '#f0fdfa' },
}

function formatDateTime(isoStr) {
    const d = new Date(isoStr)
    const date = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    return { date, time }
}

function timeAgo(isoStr) {
    const now = new Date()
    const d = new Date(isoStr)
    const diff = Math.floor((now - d) / 1000)

    if (diff < 60) return 'Hace un momento'
    if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`
    if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`
    if (diff < 604800) return `Hace ${Math.floor(diff / 86400)} días`
    return formatDateTime(isoStr).date
}

export default function BitacoraPanel() {
    const { profile, canWriteLogbook, isCoordinador, user } = useAuth()
    const [entries, setEntries] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    // Filters
    const [filterCategory, setFilterCategory] = useState('all')
    const [filterSearch, setFilterSearch] = useState('')

    // Create/Edit modal
    const [modal, setModal] = useState(null)

    useEffect(() => {
        fetchEntries()
    }, [])

    const fetchEntries = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('cc_logbook')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200)

        if (error) {
            console.error('Error fetching logbook:', error)
        } else {
            setEntries(data || [])
        }
        setLoading(false)
    }

    const openNewEntry = () => {
        setModal({
            mode: 'create',
            category: 'novedad',
            title: '',
            description: '',
        })
    }

    const openEditEntry = (entry) => {
        setModal({
            mode: 'edit',
            id: entry.id,
            category: entry.category,
            title: entry.title,
            description: entry.description,
        })
    }

    const handleSave = async () => {
        if (!modal || !modal.title.trim()) return
        setSaving(true)

        if (modal.mode === 'create') {
            const { error } = await supabase
                .from('cc_logbook')
                .insert({
                    category: modal.category,
                    title: modal.title.trim(),
                    description: modal.description.trim(),
                    created_by: user?.id,
                    author_name: profile?.full_name || user?.email || 'Desconocido',
                })

            if (error) console.error('Error creating entry:', error)
        } else {
            const { error } = await supabase
                .from('cc_logbook')
                .update({
                    category: modal.category,
                    title: modal.title.trim(),
                    description: modal.description.trim(),
                })
                .eq('id', modal.id)

            if (error) console.error('Error updating entry:', error)
        }

        setSaving(false)
        setModal(null)
        fetchEntries()
    }

    const handleDelete = async (entryId) => {
        if (!confirm('¿Eliminar esta entrada de la bitácora?')) return

        const { error } = await supabase
            .from('cc_logbook')
            .delete()
            .eq('id', entryId)

        if (error) console.error('Error deleting entry:', error)
        fetchEntries()
    }

    // Filtered entries
    const filtered = entries.filter(e => {
        if (filterCategory !== 'all' && e.category !== filterCategory) return false
        if (filterSearch) {
            const q = filterSearch.toLowerCase()
            return (
                e.title.toLowerCase().includes(q) ||
                e.description?.toLowerCase().includes(q) ||
                e.author_name?.toLowerCase().includes(q)
            )
        }
        return true
    })

    // Group by date
    const grouped = {}
    filtered.forEach(e => {
        const dateKey = new Date(e.created_at).toLocaleDateString('es-AR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        })
        if (!grouped[dateKey]) grouped[dateKey] = []
        grouped[dateKey].push(e)
    })

    return (
        <div className="bitacora-panel">
            {/* Toolbar */}
            <div className="bitacora-toolbar">
                <div className="bitacora-filters">
                    {/* Search */}
                    <div className="bitacora-search-wrap">
                        <Search size={16} className="bitacora-search-icon" />
                        <input
                            className="bitacora-search"
                            placeholder="Buscar en la bitácora..."
                            value={filterSearch}
                            onChange={e => setFilterSearch(e.target.value)}
                        />
                    </div>

                    {/* Category filter */}
                    <div className="bitacora-cat-filter">
                        <button
                            className={`bitacora-cat-btn ${filterCategory === 'all' ? 'active' : ''}`}
                            onClick={() => setFilterCategory('all')}
                        >
                            Todas
                        </button>
                        {Object.entries(CATEGORIES).map(([key, cat]) => {
                            const Icon = cat.icon
                            return (
                                <button
                                    key={key}
                                    className={`bitacora-cat-btn ${filterCategory === key ? 'active' : ''}`}
                                    onClick={() => setFilterCategory(key)}
                                    style={filterCategory === key ? { background: cat.bg, color: cat.color, borderColor: cat.color + '44' } : {}}
                                >
                                    <Icon size={13} />
                                    {cat.label}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {canWriteLogbook && (
                    <button className="btn btn-primary" onClick={openNewEntry}>
                        <Plus size={16} />
                        Nueva Entrada
                    </button>
                )}
            </div>

            {/* Stats bar */}
            <div className="bitacora-stats-bar">
                {Object.entries(CATEGORIES).map(([key, cat]) => {
                    const count = entries.filter(e => e.category === key).length
                    return (
                        <div key={key} className="bitacora-stat" style={{ borderLeftColor: cat.color }}>
                            <span className="bitacora-stat-count" style={{ color: cat.color }}>{count}</span>
                            <span className="bitacora-stat-label">{cat.label}</span>
                        </div>
                    )
                })}
                <div className="bitacora-stat" style={{ borderLeftColor: '#334155' }}>
                    <span className="bitacora-stat-count" style={{ color: '#334155' }}>{entries.length}</span>
                    <span className="bitacora-stat-label">Total</span>
                </div>
            </div>

            {/* Timeline */}
            {loading ? (
                <div className="bitacora-loading">
                    <Loader2 size={24} className="spin" />
                    <span>Cargando bitácora...</span>
                </div>
            ) : filtered.length === 0 ? (
                <div className="bitacora-empty">
                    <Bell size={40} strokeWidth={1} />
                    <h4>Sin entradas</h4>
                    <p>{filterCategory !== 'all' || filterSearch ? 'No hay resultados para los filtros aplicados' : 'La bitácora está vacía. Creá la primera entrada.'}</p>
                </div>
            ) : (
                <div className="bitacora-timeline">
                    {Object.entries(grouped).map(([dateKey, entries]) => (
                        <div key={dateKey} className="bitacora-date-group">
                            <div className="bitacora-date-header">
                                <Calendar size={14} />
                                <span>{dateKey}</span>
                            </div>

                            {entries.map(entry => {
                                const cat = CATEGORIES[entry.category] || CATEGORIES.novedad
                                const Icon = cat.icon
                                const { time } = formatDateTime(entry.created_at)
                                const canModify = isCoordinador || entry.created_by === user?.id

                                return (
                                    <div key={entry.id} className="bitacora-entry">
                                        <div className="bitacora-entry-line" style={{ background: cat.color }} />
                                        <div className="bitacora-entry-card">
                                            <div className="bitacora-entry-header">
                                                <div className="bitacora-entry-badge" style={{ background: cat.bg, color: cat.color }}>
                                                    <Icon size={13} />
                                                    {cat.label}
                                                </div>
                                                <div className="bitacora-entry-meta">
                                                    <span className="bitacora-entry-time">
                                                        <Clock size={12} />
                                                        {time}
                                                    </span>
                                                    <span className="bitacora-entry-author">
                                                        <User size={12} />
                                                        {entry.author_name}
                                                    </span>
                                                </div>
                                            </div>
                                            <h4 className="bitacora-entry-title">{entry.title}</h4>
                                            {entry.description && (
                                                <p className="bitacora-entry-desc">{entry.description}</p>
                                            )}
                                            {canModify && (
                                                <div className="bitacora-entry-actions">
                                                    <button className="bitacora-action-btn" onClick={() => openEditEntry(entry)}>
                                                        <Edit3 size={13} />
                                                        Editar
                                                    </button>
                                                    <button className="bitacora-action-btn danger" onClick={() => handleDelete(entry.id)}>
                                                        <Trash2 size={13} />
                                                        Eliminar
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    ))}
                </div>
            )}

            {/* Create/Edit Modal */}
            {modal && (
                <div className="bitacora-modal-overlay" onClick={() => setModal(null)}>
                    <div className="bitacora-modal" onClick={e => e.stopPropagation()}>
                        <div className="bitacora-modal-header">
                            <h4>{modal.mode === 'create' ? 'Nueva Entrada' : 'Editar Entrada'}</h4>
                            <button className="shift-modal-close" onClick={() => setModal(null)}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="bitacora-modal-body">
                            <div className="bitacora-modal-field">
                                <label>Categoría</label>
                                <div className="bitacora-modal-categories">
                                    {Object.entries(CATEGORIES).map(([key, cat]) => {
                                        const Icon = cat.icon
                                        return (
                                            <button
                                                key={key}
                                                className={`bitacora-modal-cat ${modal.category === key ? 'selected' : ''}`}
                                                style={{
                                                    '--bm-bg': cat.bg,
                                                    '--bm-color': cat.color,
                                                }}
                                                onClick={() => setModal(m => ({ ...m, category: key }))}
                                            >
                                                <Icon size={15} />
                                                <span>{cat.label}</span>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            <div className="bitacora-modal-field">
                                <label>Título *</label>
                                <input
                                    className="bitacora-modal-input"
                                    placeholder="Título de la entrada..."
                                    value={modal.title}
                                    onChange={e => setModal(m => ({ ...m, title: e.target.value }))}
                                    autoFocus
                                />
                            </div>

                            <div className="bitacora-modal-field">
                                <label>Descripción</label>
                                <textarea
                                    className="bitacora-modal-textarea"
                                    placeholder="Descripción detallada..."
                                    value={modal.description}
                                    onChange={e => setModal(m => ({ ...m, description: e.target.value }))}
                                    rows={4}
                                />
                            </div>

                            {modal.mode === 'create' && (
                                <div className="bitacora-modal-auto">
                                    <div className="bitacora-auto-item">
                                        <User size={14} />
                                        <span>Responsable: <strong>{profile?.full_name || user?.email}</strong></span>
                                    </div>
                                    <div className="bitacora-auto-item">
                                        <Clock size={14} />
                                        <span>Fecha/hora: <strong>Se registra automáticamente</strong></span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="bitacora-modal-footer">
                            <button className="btn btn-secondary btn-sm" onClick={() => setModal(null)} disabled={saving}>
                                Cancelar
                            </button>
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={handleSave}
                                disabled={saving || !modal.title.trim()}
                            >
                                {saving ? (
                                    <Loader2 size={14} className="spin" />
                                ) : (
                                    <Save size={14} />
                                )}
                                {modal.mode === 'create' ? 'Registrar' : 'Guardar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
