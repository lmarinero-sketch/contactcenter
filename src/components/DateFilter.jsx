import { Calendar } from 'lucide-react'

const PRESETS = [
    { label: 'Hoy', value: 'today' },
    { label: 'Ayer', value: 'yesterday' },
    { label: '7 días', value: '7d' },
    { label: '30 días', value: '30d' },
    { label: 'Todo', value: 'all' },
]

function getPresetDates(preset) {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    switch (preset) {
        case 'today':
            return { from: todayStart.toISOString(), to: now.toISOString() }
        case 'yesterday': {
            const yStart = new Date(todayStart)
            yStart.setDate(yStart.getDate() - 1)
            const yEnd = new Date(todayStart)
            yEnd.setMilliseconds(yEnd.getMilliseconds() - 1)
            return { from: yStart.toISOString(), to: yEnd.toISOString() }
        }
        case '7d': {
            const d = new Date(todayStart)
            d.setDate(d.getDate() - 7)
            return { from: d.toISOString(), to: now.toISOString() }
        }
        case '30d': {
            const d = new Date(todayStart)
            d.setDate(d.getDate() - 30)
            return { from: d.toISOString(), to: now.toISOString() }
        }
        default:
            return { from: null, to: null }
    }
}

export default function DateFilter({ dateFrom, dateTo, onChange }) {
    const activePreset = !dateFrom && !dateTo ? 'all' : null

    const handlePreset = (preset) => {
        const { from, to } = getPresetDates(preset)
        onChange(from, to)
    }

    const handleCustomDate = (type, value) => {
        if (type === 'from') {
            onChange(value ? new Date(value).toISOString() : null, dateTo)
        } else {
            onChange(dateFrom, value ? new Date(value + 'T23:59:59').toISOString() : null)
        }
    }

    return (
        <div className="date-filter">
            <Calendar size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
            <div className="date-presets">
                {PRESETS.map(p => (
                    <button
                        key={p.value}
                        className={`date-preset-btn ${(activePreset === p.value || (!activePreset && p.value === 'all' && !dateFrom)) ? 'active' : ''}`}
                        onClick={() => handlePreset(p.value)}
                    >
                        {p.label}
                    </button>
                ))}
            </div>
            <div className="date-custom">
                <input
                    type="date"
                    className="date-input"
                    value={dateFrom ? dateFrom.slice(0, 10) : ''}
                    onChange={(e) => handleCustomDate('from', e.target.value)}
                />
                <span style={{ color: '#94a3b8', fontSize: '12px' }}>—</span>
                <input
                    type="date"
                    className="date-input"
                    value={dateTo ? dateTo.slice(0, 10) : ''}
                    onChange={(e) => handleCustomDate('to', e.target.value)}
                />
            </div>
        </div>
    )
}
