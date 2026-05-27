import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area,
  LineChart, Line, ReferenceLine
} from 'recharts'
import {
  Activity, TrendingUp, Users, Clock, Phone, Monitor, Building2,
  ArrowUpRight, ArrowDownRight, Minus, Loader2, XCircle,
  Lightbulb, AlertCircle, ChevronDown, ChevronUp, Info
} from 'lucide-react'
import DateFilter from '../DateFilter'

// ── Paleta por canal ──────────────────────────────────────────
const CANAL_COLORS = {
  'Contact Center': '#1a6bb5',
  'Recepciones': '#0d9488',
  'Turnos Online': '#8b5cf6',
}

const CANAL_ICONS = {
  'Contact Center': Phone,
  'Recepciones': Building2,
  'Turnos Online': Monitor,
}

const CANAL_BG = {
  'Contact Center': 'linear-gradient(135deg, #1a6bb5 0%, #2563eb 100%)',
  'Recepciones': 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
  'Turnos Online': 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
}

const RESPONSABLE_COLORS = [
  '#1a6bb5', '#0d9488', '#8b5cf6', '#f59e0b', '#ef4444',
  '#10b981', '#64748b', '#ec4899', '#3b82f6', '#f97316'
]

// ── Helpers ───────────────────────────────────────────────────
function formatMonth(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('es-AR', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function TrendBadge({ value }) {
  if (value === null || value === undefined) return null
  const isUp = value > 0
  const isFlat = value === 0
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '2px',
      fontSize: '11px', fontWeight: 600, padding: '2px 6px', borderRadius: '6px',
      background: isFlat ? '#f1f5f9' : isUp ? '#dcfce7' : '#fef2f2',
      color: isFlat ? '#64748b' : isUp ? '#16a34a' : '#dc2626',
    }}>
      {isFlat ? <Minus size={10} /> : isUp ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
      {Math.abs(value)}%
    </span>
  )
}

// ── Canal KPI Card ────────────────────────────────────────────
function CanalCard({ canal, total, asistidos, ausentes, ausentes_justificados, tasa_asistencia, tasa_ausentismo, globalTotal }) {
  const Icon = CANAL_ICONS[canal] || Activity
  const pct = globalTotal > 0 ? ((total / globalTotal) * 100).toFixed(1) : 0

  return (
    <div style={{
      background: '#fff', borderRadius: '16px', overflow: 'hidden',
      border: '1px solid #e2e8f0', transition: 'box-shadow 0.3s, transform 0.2s',
      cursor: 'default',
    }}
    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
    onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)' }}
    >
      {/* Gradient header */}
      <div style={{
        background: CANAL_BG[canal], padding: '20px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            background: 'rgba(255,255,255,0.2)', borderRadius: '12px',
            width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={22} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>{canal}</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)' }}>{pct}% del total</div>
          </div>
        </div>
        <div style={{ fontSize: '28px', fontWeight: 800, color: '#fff', letterSpacing: '-1px' }}>
          {total?.toLocaleString('es-AR') || 0}
        </div>
      </div>

      {/* Metrics */}
      <div style={{ padding: '16px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Asistidos</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#10b981' }}>{asistidos?.toLocaleString('es-AR') || 0}</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Ausentes</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#ef4444' }}>{ausentes?.toLocaleString('es-AR') || 0}</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Tasa Asist.</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>{tasa_asistencia ?? '—'}%</div>
        </div>
      </div>

      {/* Ausentismo bar */}
      <div style={{ padding: '0 24px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Tasa Ausentismo</span>
          <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: 700 }}>{tasa_ausentismo ?? '—'}%</span>
        </div>
        <div style={{ height: '6px', borderRadius: '3px', background: '#f1f5f9', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: '3px', width: `${Math.min(tasa_ausentismo || 0, 100)}%`,
            background: (tasa_ausentismo || 0) > 20 ? '#ef4444' : (tasa_ausentismo || 0) > 10 ? '#f59e0b' : '#10b981',
            transition: 'width 0.6s ease',
          }} />
        </div>
      </div>
    </div>
  )
}

// ── Responsables Table ────────────────────────────────────────
function ResponsablesTable({ data, canal, color }) {
  if (!data || data.length === 0) return <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '20px' }}>Sin datos</div>

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr>
            <th style={{ padding: '8px 6px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 700, fontSize: '11px' }}>#</th>
            <th style={{ padding: '8px 6px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 700, fontSize: '11px' }}>Responsable</th>
            <th style={{ padding: '8px 6px', textAlign: 'right', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 700, fontSize: '11px' }}>Total</th>
            <th style={{ padding: '8px 6px', textAlign: 'right', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 700, fontSize: '11px' }}>Asistidos</th>
            <th style={{ padding: '8px 6px', textAlign: 'right', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 700, fontSize: '11px' }}>Ausentes</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => (
            <tr key={i} style={{ transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <td style={{ padding: '7px 6px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, color }}>{i + 1}</td>
              <td style={{ padding: '7px 6px', borderBottom: '1px solid #f1f5f9', color: '#334155', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nombre}</td>
              <td style={{ padding: '7px 6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{r.total?.toLocaleString('es-AR')}</td>
              <td style={{ padding: '7px 6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: '#10b981' }}>{r.asistidos?.toLocaleString('es-AR')}</td>
              <td style={{ padding: '7px 6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: '#ef4444' }}>{r.ausentes?.toLocaleString('es-AR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────────
export default function CanalesDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [dateFrom, setDateFrom] = useState(null)
  const [dateTo, setDateTo] = useState(null)
  const [showInsights, setShowInsights] = useState(true)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setError(null)
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('bi_canales_dashboard_data', {
          start_date: dateFrom,
          end_date: dateTo,
        })
        if (rpcError) throw new Error(rpcError.message)
        setData(rpcData)
      } catch (err) {
        console.error('Error fetching canal data:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [dateFrom, dateTo])

  if (error) {
    return (
      <div className="empty-state" style={{ padding: '40px', textAlign: 'center' }}>
        <XCircle size={48} color="#ef4444" style={{ margin: '0 auto 16px' }} />
        <h3>Error de Conexión</h3>
        <p style={{ color: '#ef4444', fontWeight: 500 }}>{error}</p>
        <p style={{ marginTop: '16px', color: '#64748b' }}>
          ⚠️ Asegurate de haber ejecutado el script SQL <b>016_canales_stats.sql</b> en el SQL Editor de Supabase.
        </p>
      </div>
    )
  }

  const kpisGlobal = data?.kpis_global
  const kpisPorCanal = data?.kpis_por_canal || []
  const tendencia = (data?.tendencia_por_canal || []).map(d => ({
    ...d,
    mes: formatMonth(d.mes)
  }))
  const ausentismoMes = (data?.ausentismo_por_canal_mes || []).map(d => ({
    ...d,
    mes: formatMonth(d.mes)
  }))
  const especialidades = data?.especialidades_por_canal || []
  const heatmapCanal = data?.heatmap_por_canal || []
  const topCC = data?.top_responsables_cc || []
  const topRec = data?.top_responsables_rec || []
  const topOnline = data?.top_responsables_online || []

  // Pie chart data
  const pieData = kpisPorCanal.map(c => ({
    name: c.canal,
    value: c.total,
    fill: CANAL_COLORS[c.canal] || '#64748b'
  }))

  return (
    <div className="fade-in">
      {/* ═══ FILTROS ═══ */}
      <div style={{ marginBottom: '24px' }}>
        <DateFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={(from, to) => { setDateFrom(from); setDateTo(to) }}
        />
      </div>

      {loading && !data ? (
        <div className="loading-spinner"><div className="spinner"></div></div>
      ) : (
        <>
          {/* ═══ AUDITORÍA DE AUSENTISMO (INSIGHTS) ═══ */}
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            marginBottom: '24px',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}>
            {/* Header / Toggle */}
            <div 
              onClick={() => setShowInsights(!showInsights)}
              style={{
                padding: '16px 24px',
                background: '#f8fafc',
                borderBottom: showInsights ? '1px solid #e2e8f0' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                userSelect: 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Lightbulb size={20} color="#f59e0b" style={{ fill: '#fef3c7' }} />
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>
                  Auditoría de Citas: Revelando la Tasa Real de Ausentismo Web
                </h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b' }}>
                <span style={{ fontSize: '12px', fontWeight: 500 }}>
                  {showInsights ? 'Ocultar análisis' : 'Ver análisis completo'}
                </span>
                {showInsights ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </div>

            {/* Content */}
            {showInsights && (
              <div style={{ padding: '24px' }}>
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '20px' 
                }}>
                  {/* Summary alert */}
                  <div style={{
                    background: '#eff6ff',
                    borderLeft: '4px solid #1a6bb5',
                    borderRadius: '8px',
                    padding: '16px',
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'flex-start'
                  }}>
                    <Info size={20} color="#1a6bb5" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '13.5px', lineHeight: '1.5', color: '#1e3a8a' }}>
                      <strong>Hallazgo Operacional Crítico:</strong> La aparente tasa de ausentismo del <strong>71.3%</strong> en el canal de <strong>Turnos Online</strong> no representa inasistencias reales. Se trata de un <strong>sesgo del proceso de check-in</strong>: los pacientes sí asisten, pero Recepción registra su llegada abriendo un nuevo turno duplicado en lugar de procesar la reserva web.
                    </div>
                  </div>

                  {/* Grid metrics */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '16px',
                    margin: '10px 0'
                  }}>
                    {/* Stat 1 */}
                    <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                      <div style={{ fontSize: '28px', fontWeight: 800, color: '#8b5cf6', marginBottom: '4px' }}>78.5%</div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>Coincidencia el Mismo Día</div>
                      <div style={{ fontSize: '11px', color: '#64748b', lineHeight: '1.4' }}>
                        De los pacientes marcados como "Ausentes" online, un 78.5% registra una atención efectiva presencial el mismo día.
                      </div>
                    </div>
                    {/* Stat 2 */}
                    <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                      <div style={{ fontSize: '28px', fontWeight: 800, color: '#1a6bb5', marginBottom: '4px' }}>75.0%</div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>Mismo Médico y Especialidad</div>
                      <div style={{ fontSize: '11px', color: '#64748b', lineHeight: '1.4' }}>
                        El turno duplicado en mostrador se abrió exactamente para el mismo profesional y especialidad de la reserva original.
                      </div>
                    </div>
                    {/* Stat 3 */}
                    <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                      <div style={{ fontSize: '28px', fontWeight: 800, color: '#0d9488', marginBottom: '4px' }}>99.6%</div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>Inmediatez en Recepción</div>
                      <div style={{ fontSize: '11px', color: '#64748b', lineHeight: '1.4' }}>
                        Los turnos de Recepción son 99.6% creados en el acto (walk-ins), confirmando que opera para documentar arribos.
                      </div>
                    </div>
                    {/* Stat 4 */}
                    <div style={{ background: '#f0fdf4', padding: '16px', borderRadius: '12px', border: '1px solid #bbf7d0', textAlign: 'center' }}>
                      <div style={{ fontSize: '28px', fontWeight: 800, color: '#16a34a', marginBottom: '4px' }}>~78.4%</div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#14532d', marginBottom: '4px' }}>Asistencia Real Estimada</div>
                      <div style={{ fontSize: '11px', color: '#166534', lineHeight: '1.4' }}>
                        Tasa de asistencia real del canal online si se vinculan los arribos registrados bajo duplicados de Recepción.
                      </div>
                    </div>
                  </div>

                  {/* Bullet points breakdown */}
                  <div style={{ fontSize: '13px', lineHeight: '1.6', color: '#475569' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#1e293b', fontSize: '14px', fontWeight: 700 }}>Origen y Consecuencias del Fenómeno:</h4>
                    <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <li>
                        <strong>Fricción Operativa en Mostrador:</strong> Al llegar el paciente, por costumbre o lentitud en las pantallas de búsqueda, los recepcionistas suelen presionar "Nuevo Turno" para darle ingreso en lugar de localizar su turno web preexistente y marcar "Presente".
                      </li>
                      <li>
                        <strong>Distorsión de la Productividad por Canal:</strong> Este comportamiento infla artificialmente el volumen y efectividad asignada a Recepciones, mientras que devalúa el retorno de la inversión y adopción tecnológica de Turnos Online (mostrando un ausentismo falso del 71.3%).
                      </li>
                      <li>
                        <strong>Recomendación Clave:</strong> Configurar el sistema de Recepciones para alertar visualmente cuando un paciente que llega a mostrador ya cuenta con un turno online agendado para el mismo día, facilitando un check-in en un solo clic.
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ═══ CANAL KPI CARDS ═══ */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '20px', marginBottom: '24px',
            opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s',
          }}>
            {kpisPorCanal.map(canal => (
              <CanalCard
                key={canal.canal}
                {...canal}
                globalTotal={kpisGlobal?.total || 0}
              />
            ))}
          </div>

          {/* ═══ ROW: DISTRIBUCIÓN PIE + TENDENCIA ═══ */}
          <div className="grid-2" style={{ marginBottom: '24px', opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s' }}>
            {/* Pie */}
            <div className="card">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Activity size={16} color="#f59e0b" />
                  <h3 style={{ margin: 0 }}>Distribución de Turnos por Canal</h3>
                </div>
              </div>
              <div className="card-body">
                <div className="chart-container" style={{ height: '320px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={70}
                          outerRadius={110}
                          paddingAngle={4}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                          labelLine={true}
                          animationDuration={800}
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          formatter={(value) => value.toLocaleString('es-AR')}
                          contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '13px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ color: '#94a3b8', fontSize: '13px' }}>Sin datos</div>
                  )}
                </div>
              </div>
            </div>

            {/* Tendencia Stacked Area */}
            <div className="card">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TrendingUp size={16} color="#1a6bb5" />
                  <h3 style={{ margin: 0 }}>Evolución Mensual por Canal</h3>
                </div>
              </div>
              <div className="card-body">
                <div className="chart-container" style={{ height: '320px' }}>
                  {tendencia.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={tendencia} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gradCC" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#1a6bb5" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#1a6bb5" stopOpacity={0.05} />
                          </linearGradient>
                          <linearGradient id="gradRec" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#0d9488" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#0d9488" stopOpacity={0.05} />
                          </linearGradient>
                          <linearGradient id="gradOnline" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="mes" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <RechartsTooltip
                          contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Area type="monotone" name="Recepciones" dataKey="recepciones" stroke="#0d9488" strokeWidth={2} fill="url(#gradRec)" stackId="1" />
                        <Area type="monotone" name="Contact Center" dataKey="contact_center" stroke="#1a6bb5" strokeWidth={2} fill="url(#gradCC)" stackId="1" />
                        <Area type="monotone" name="Turnos Online" dataKey="turnos_online" stroke="#8b5cf6" strokeWidth={2} fill="url(#gradOnline)" stackId="1" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '20px' }}>Sin datos</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ═══ ROW: AUSENTISMO POR CANAL MENSUAL + DISTRIBUCIÓN HORARIA ═══ */}
          <div className="grid-2" style={{ marginBottom: '24px', opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s' }}>
            {/* Ausentismo mensual por canal */}
            <div className="card">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Activity size={16} color="#ef4444" />
                  <h3 style={{ margin: 0 }}>Ausentismo Mensual por Canal</h3>
                </div>
              </div>
              <div className="card-body">
                <div className="chart-container" style={{ height: '320px' }}>
                  {ausentismoMes.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={ausentismoMes} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="mes" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <RechartsTooltip
                          contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Line type="monotone" name="Contact Center" dataKey="cc_ausentes" stroke="#1a6bb5" strokeWidth={3} dot={{ r: 4, fill: '#1a6bb5' }} activeDot={{ r: 6 }} />
                        <Line type="monotone" name="Recepciones" dataKey="rec_ausentes" stroke="#0d9488" strokeWidth={3} dot={{ r: 4, fill: '#0d9488' }} activeDot={{ r: 6 }} />
                        <Line type="monotone" name="Turnos Online" dataKey="online_ausentes" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4, fill: '#8b5cf6' }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '20px' }}>Sin datos</div>
                  )}
                </div>
              </div>
            </div>

            {/* Distribución horaria por canal */}
            <div className="card">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={16} color="#f59e0b" />
                  <h3 style={{ margin: 0 }}>Distribución Horaria por Canal</h3>
                </div>
              </div>
              <div className="card-body">
                <div className="chart-container" style={{ height: '320px' }}>
                  {heatmapCanal.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={heatmapCanal} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis
                          dataKey="hora"
                          tick={{ fill: '#64748b', fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(h) => `${h}h`}
                        />
                        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <RechartsTooltip
                          contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px' }}
                          labelFormatter={(h) => `${h}:00 hs`}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Bar name="Recepciones" dataKey="recepciones" stackId="a" fill="#0d9488" radius={[0, 0, 0, 0]} />
                        <Bar name="Contact Center" dataKey="contact_center" stackId="a" fill="#1a6bb5" />
                        <Bar name="Turnos Online" dataKey="turnos_online" stackId="a" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '20px' }}>Sin datos</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ═══ ROW: ESPECIALIDADES POR CANAL (GROUPED BAR) ═══ */}
          <div className="card" style={{ marginBottom: '24px', opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s' }}>
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={16} color="#ec4899" />
                <h3 style={{ margin: 0 }}>Top Especialidades por Canal</h3>
              </div>
            </div>
            <div className="card-body">
              <div className="chart-container" style={{ height: '420px' }}>
                {especialidades.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={especialidades.slice(0, 12)} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis dataKey="especialidad" type="category" tick={{ fontSize: 10 }} width={180} interval={0} />
                      <RechartsTooltip
                        contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar name="Recepciones" dataKey="recepciones" fill="#0d9488" radius={[0, 2, 2, 0]} />
                      <Bar name="Contact Center" dataKey="contact_center" fill="#1a6bb5" radius={[0, 2, 2, 0]} />
                      <Bar name="Turnos Online" dataKey="turnos_online" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '20px' }}>Sin datos</div>
                )}
              </div>
            </div>
          </div>

          {/* ═══ ROW: TOP RESPONSABLES POR CANAL ═══ */}
          <div style={{ marginBottom: '24px', opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s' }}>
            <div style={{
              padding: '16px 0 12px', borderBottom: '1px solid #e2e8f0', marginBottom: '16px',
              display: 'flex', alignItems: 'center', gap: '8px'
            }}>
              <Users size={18} color="#1e293b" />
              <h2 style={{ fontSize: '16px', color: '#1e293b', margin: 0, fontWeight: 700 }}>
                Top 10 Responsables por Canal
              </h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
              {/* Contact Center */}
              <div className="card">
                <div className="card-header" style={{ borderLeft: `4px solid ${CANAL_COLORS['Contact Center']}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Phone size={15} color={CANAL_COLORS['Contact Center']} />
                    <h3 style={{ margin: 0, fontSize: '13px' }}>Contact Center</h3>
                  </div>
                </div>
                <div className="card-body" style={{ padding: '12px 16px' }}>
                  <ResponsablesTable data={topCC} canal="Contact Center" color={CANAL_COLORS['Contact Center']} />
                </div>
              </div>

              {/* Recepciones */}
              <div className="card">
                <div className="card-header" style={{ borderLeft: `4px solid ${CANAL_COLORS['Recepciones']}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Building2 size={15} color={CANAL_COLORS['Recepciones']} />
                    <h3 style={{ margin: 0, fontSize: '13px' }}>Recepciones</h3>
                  </div>
                </div>
                <div className="card-body" style={{ padding: '12px 16px' }}>
                  <ResponsablesTable data={topRec} canal="Recepciones" color={CANAL_COLORS['Recepciones']} />
                </div>
              </div>

              {/* Turnos Online */}
              <div className="card">
                <div className="card-header" style={{ borderLeft: `4px solid ${CANAL_COLORS['Turnos Online']}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Monitor size={15} color={CANAL_COLORS['Turnos Online']} />
                    <h3 style={{ margin: 0, fontSize: '13px' }}>Turnos Online</h3>
                  </div>
                </div>
                <div className="card-body" style={{ padding: '12px 16px' }}>
                  <ResponsablesTable data={topOnline} canal="Turnos Online" color={CANAL_COLORS['Turnos Online']} />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
