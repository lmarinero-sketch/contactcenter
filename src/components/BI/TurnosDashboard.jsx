import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts'
import { Calendar, Users, Activity, Clock, TrendingUp, CheckCircle, XCircle } from 'lucide-react'

const COLORS = ['#1a6bb5', '#0d9488', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981', '#64748b']
const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const HEATMAP_HOURS = Array.from({ length: 24 }, (_, i) => i)

// Heatmap color logic identical to OverviewPanel
function getHeatmapColor(value, max) {
    if (value === 0) return '#f8fafc'
    const intensity = Math.min(value / Math.max(max, 1), 1)
    if (intensity < 0.25) return '#dbeafe'
    if (intensity < 0.5) return '#93c5fd'
    if (intensity < 0.75) return '#3b82f6'
    return '#1d4ed8'
}

export default function TurnosDashboard() {
  const [kpis, setKpis] = useState(null)
  const [heatmap, setHeatmap] = useState([])
  const [tendencia, setTendencia] = useState([])
  const [agentes, setAgentes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchBI() {
      try {
        const [resKpi, resHeatmap, resTendencia, resAgentes] = await Promise.all([
          supabase.from('bi_kpis_visitas').select('*').single(),
          supabase.from('bi_heatmap_creacion').select('*'),
          supabase.from('bi_tendencia_mensual').select('*'),
          supabase.from('bi_top_agentes').select('*')
        ])

        if (resKpi.data) setKpis(resKpi.data)
        if (resTendencia.data) {
          const formatted = resTendencia.data.map(d => {
            const date = new Date(d.mes)
            return {
              ...d,
              nombreMes: date.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' })
            }
          })
          setTendencia(formatted)
        }
        if (resAgentes.data) setAgentes(resAgentes.data)
        
        if (resHeatmap.data) {
          // Construir matriz 7x24 para el Heatmap (0=Lunes, 6=Domingo)
          const matrix = Array(7).fill(0).map(() => Array(24).fill(0))
          resHeatmap.data.forEach(d => {
            // d.dia_semana (1=Lunes, 7=Domingo). Restamos 1.
            if (d.dia_semana >= 1 && d.dia_semana <= 7 && d.hora >= 0 && d.hora <= 23) {
              matrix[d.dia_semana - 1][d.hora] = d.cantidad
            }
          })
          setHeatmap(matrix)
        }
      } catch (err) {
        console.error("Error cargando BI:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchBI()
  }, [])

  if (loading) {
    return (
      <div className="loading-spinner"><div className="spinner"></div></div>
    )
  }

  const maxHeatmapVal = Math.max(...heatmap.flat(), 1)
  const tasaAsistencia = kpis && kpis.total_turnos > 0 ? ((kpis.asistidos / kpis.total_turnos) * 100).toFixed(1) : 0

  return (
    <div className="fade-in">
      {/* ═══ EXECUTIVE SUMMARY (KPIs) ═══ */}
      <div className="exec-card" style={{ marginBottom: '20px' }}>
        <div className="exec-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={16} color="#1a6bb5" />
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>Resumen de Turnos y Eficiencia</h3>
            </div>
        </div>
        <div className="exec-kpis">
            <div className="exec-kpi">
                <div className="exec-kpi-value">{kpis?.total_turnos?.toLocaleString('es-AR') || 0}</div>
                <div className="exec-kpi-label">Total Turnos Otorgados</div>
            </div>
            <div className="exec-kpi">
                <div className="exec-kpi-value" style={{ color: '#10b981' }}>{kpis?.asistidos?.toLocaleString('es-AR') || 0}</div>
                <div className="exec-kpi-label">Turnos Asistidos</div>
            </div>
            <div className="exec-kpi">
                <div className="exec-kpi-value" style={{ color: '#ef4444' }}>{kpis?.ausentes?.toLocaleString('es-AR') || 0}</div>
                <div className="exec-kpi-label">Ausencias Injustificadas</div>
            </div>
            <div className="exec-kpi">
                <div className="exec-kpi-value">
                    <span className={`semaphore ${tasaAsistencia >= 60 ? 'green' : tasaAsistencia >= 40 ? 'yellow' : 'red'}`}></span>
                    {tasaAsistencia}%
                </div>
                <div className="exec-kpi-label">Tasa de Asistencia</div>
            </div>
        </div>
      </div>

      {/* ═══ HEATMAP DE DEMANDA ═══ */}
      <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={16} color="#0d9488" />
                  <h3 style={{ margin: 0 }}>Mapa de Calor — Horarios de Creación de Turnos</h3>
              </div>
          </div>
          <div className="card-body">
              <div className="heatmap-container" style={{ overflowX: 'auto', paddingBottom: '10px' }}>
                  <div className="heatmap-grid" style={{ gridTemplateColumns: '40px repeat(24, 1fr)', minWidth: '800px' }}>
                      <div className="heatmap-label"></div>
                      {HEATMAP_HOURS.map(h => (
                          <div key={h} className="heatmap-hour-label">{h}h</div>
                      ))}
                      {[0, 1, 2, 3, 4, 5, 6].map(dayIdx => (
                          <>
                              <div key={`label-${dayIdx}`} className="heatmap-day-label">{DAY_LABELS[dayIdx]}</div>
                              {HEATMAP_HOURS.map(h => {
                                  const val = heatmap[dayIdx]?.[h] || 0
                                  return (
                                      <div
                                          key={`${dayIdx}-${h}`}
                                          className="heatmap-cell"
                                          style={{ background: getHeatmapColor(val, maxHeatmapVal), transition: 'background 0.4s ease' }}
                                          title={`${DAY_LABELS[dayIdx]} a las ${h}h — ${val} turnos dados`}
                                      >
                                          {val > 0 && <span className="heatmap-cell-value" style={{ opacity: val / maxHeatmapVal > 0.5 ? 1 : 0, color: val / maxHeatmapVal > 0.6 ? '#fff' : '#1e293b' }}>{val}</span>}
                                      </div>
                                  )
                              })}
                          </>
                      ))}
                  </div>
                  <div className="heatmap-legend" style={{ marginTop: '15px' }}>
                      <span style={{ fontSize: '10px', color: '#94a3b8' }}>Menos turnos dados</span>
                      {['#f8fafc', '#dbeafe', '#93c5fd', '#3b82f6', '#1d4ed8'].map((c, i) => (
                          <div key={i} style={{ width: 16, height: 10, background: c, borderRadius: 2, border: '1px solid #e2e8f0' }} />
                      ))}
                      <span style={{ fontSize: '10px', color: '#94a3b8' }}>Más turnos dados</span>
                  </div>
              </div>
          </div>
      </div>

      {/* ═══ ROW 2: TENDENCIA MENSual + TOP AGENTES ═══ */}
      <div className="grid-2">
          {/* TENDENCIA MENSual */}
          <div className="card">
              <div className="card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <TrendingUp size={16} color="#1a6bb5" />
                      <h3 style={{ margin: 0 }}>Tendencia de Otorgamiento (Mensual)</h3>
                  </div>
              </div>
              <div className="card-body">
                  <div className="chart-container" style={{ height: '300px' }}>
                      <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={tendencia}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis dataKey="nombreMes" tick={{ fontSize: 11 }} />
                              <YAxis tick={{ fontSize: 11 }} />
                              <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                              <Legend wrapperStyle={{ fontSize: '12px' }} />
                              <Line type="monotone" name="Total Turnos" dataKey="cantidad" stroke="#1a6bb5" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} animationDuration={600} />
                              <Line type="monotone" name="Asistidos" dataKey="asistidos" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} animationDuration={600} />
                          </LineChart>
                      </ResponsiveContainer>
                  </div>
              </div>
          </div>

          {/* TOP AGENTES */}
          <div className="card">
              <div className="card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Users size={16} color="#8b5cf6" />
                      <h3 style={{ margin: 0 }}>Top 10 Agentes Generadores</h3>
                  </div>
              </div>
              <div className="card-body">
                  <div className="chart-container" style={{ height: '300px' }}>
                      {agentes && agentes.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={agentes} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                  <XAxis type="number" tick={{ fontSize: 11 }} />
                                  <YAxis dataKey="agente" type="category" tick={{ fontSize: 11 }} width={140} />
                                  <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                                  <Bar dataKey="cantidad" name="Turnos Generados" radius={[0, 4, 4, 0]} animationDuration={600}>
                                      {agentes.map((entry, index) => (
                                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                      ))}
                                  </Bar>
                              </BarChart>
                          </ResponsiveContainer>
                      ) : (
                          <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '20px' }}>Sin datos de agentes</div>
                      )}
                  </div>
              </div>
          </div>
      </div>
    </div>
  )
}
