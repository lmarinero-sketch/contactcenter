import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie, AreaChart, Area, ReferenceLine
} from 'recharts'
import { Calendar, Users, Activity, Clock, TrendingUp, CheckCircle, XCircle, Briefcase, UserCheck, PieChart as PieChartIcon, AlertCircle, MapPin } from 'lucide-react'
import DateFilter from '../DateFilter'

const COLORS = ['#1a6bb5', '#0d9488', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981', '#64748b', '#ec4899', '#3b82f6', '#f97316']
const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const HEATMAP_HOURS = Array.from({ length: 24 }, (_, i) => i)

function getHeatmapColor(value, max) {
    if (value === 0) return '#f8fafc'
    const intensity = Math.min(value / Math.max(max, 1), 1)
    if (intensity < 0.25) return '#dbeafe'
    if (intensity < 0.5) return '#93c5fd'
    if (intensity < 0.75) return '#3b82f6'
    return '#1d4ed8'
}

const AusentismoChart = ({ data, title, icon }) => (
    <div className="card">
        <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {icon}
                <h3 style={{ margin: 0 }}>{title}</h3>
            </div>
        </div>
        <div className="card-body">
            <div className="chart-container" style={{ height: '450px' }}>
                {data && data.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={true} vertical={true} />
                            <XAxis type="number" tick={{ fontSize: 11 }} domain={[0, 'auto']} />
                            <YAxis dataKey="nombre" type="category" tick={{ fontSize: 10 }} width={200} interval={0} />
                            <RechartsTooltip 
                                contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                                formatter={(value, name) => name === 'Inasistencias' ? value : value}
                            />
                            <Bar dataKey="ausentes" name="Inasistencias" radius={[0, 4, 4, 0]} animationDuration={600} fill="#ef4444">
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[(index+5) % COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '20px' }}>Sin datos suficientes (Mín. 10 turnos)</div>
                )}
            </div>
        </div>
    </div>
)

export default function TurnosDashboard() {
  const [data, setData] = useState({
      kpis: null,
      heatmap: [],
      heatmapBrindados: [],
      tendencia: [],
      tendenciaBrindados: [],
      ausentismoDiaMes: [],
      agentes: [],
      especialidades: [],
      responsables: [],
      poblaciones: [],
      ausentismoAnalisis: null
  })
  
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  
  // Filtros
  const [dateFrom, setDateFrom] = useState(null)
  const [dateTo, setDateTo] = useState(null)

  useEffect(() => {
    async function fetchBI() {
      setLoading(true)
      setLoadError(null)
      try {
        const { data: rpcData, error } = await supabase.rpc('bi_visitas_dashboard_data', {
            start_date: dateFrom,
            end_date: dateTo
        })

        if (error) throw new Error(error.message)

        if (rpcData) {
            console.log("Datos del RPC:", rpcData);
            // Formatear Tendencia
            const tendenciaFormateada = rpcData.tendencia.map(d => {
                const date = new Date(d.mes)
                return {
                ...d,
                nombreMes: date.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' })
                }
            })

            // Formatear Tendencia Brindados
            const tendenciaBrindadosFormateada = rpcData.tendencia_brindados ? rpcData.tendencia_brindados.map(d => {
                const date = new Date(d.mes)
                return {
                ...d,
                nombreMes: date.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' })
                }
            }) : []

            // Formatear Ausentismo Dia Mes
            const ausentismoFormateado = rpcData.ausentismo_dia_mes ? rpcData.ausentismo_dia_mes.map(t => {
                return {
                    diaOriginal: t.dia,
                    dia: `Día ${t.dia}`,
                    Ausentes: t.cantidad
                }
            }) : []

            // Formatear Heatmap (Matriz 7x24) - Creados
            const matrix = Array(7).fill(0).map(() => Array(24).fill(0))
            rpcData.heatmap.forEach(d => {
                if (d.dia_semana >= 1 && d.dia_semana <= 7 && d.hora >= 0 && d.hora <= 23) {
                    matrix[d.dia_semana - 1][d.hora] = d.cantidad
                }
            })

            // Formatear Heatmap Brindados
            const matrixBrindados = Array(7).fill(0).map(() => Array(24).fill(0))
            if (rpcData.heatmap_brindados) {
                rpcData.heatmap_brindados.forEach(d => {
                    if (d.dia_semana >= 1 && d.dia_semana <= 7 && d.hora >= 0 && d.hora <= 23) {
                        matrixBrindados[d.dia_semana - 1][d.hora] = d.cantidad
                    }
                })
            }

            setData({
                kpis: rpcData.kpis,
                tendencia: tendenciaFormateada,
                tendenciaBrindados: tendenciaBrindadosFormateada,
                ausentismoDiaMes: ausentismoFormateado,
                heatmap: matrix,
                heatmapBrindados: matrixBrindados,
                agentes: rpcData.top_agentes,
                especialidades: rpcData.top_especialidades,
                responsables: rpcData.top_responsables,
                poblaciones: rpcData.top_poblacion,
                ausentismoAnalisis: rpcData.ausentismo_analisis
            })
        }
      } catch (err) {
        console.error("Error cargando BI RPC:", err)
        setLoadError(err.message || 'Error desconocido al cargar datos')
      } finally {
        setLoading(false)
      }
    }

    fetchBI()
  }, [dateFrom, dateTo])

  if (loadError) {
    return (
      <div className="empty-state" style={{ padding: '40px', textAlign: 'center' }}>
        <XCircle size={48} color="#ef4444" style={{ margin: '0 auto 16px' }} />
        <h3>Error de Conexión con Supabase</h3>
        <p style={{ color: '#ef4444', fontWeight: 500 }}>{loadError}</p>
        <p style={{ marginTop: '16px', color: '#64748b' }}>
          ⚠️ Asegurate de haber ejecutado el script SQL <b>012_bi_visitas_rpc.sql</b> en el SQL Editor de tu Supabase.
        </p>
      </div>
    )
  }

  const { kpis, heatmap, heatmapBrindados, tendencia, tendenciaBrindados, ausentismoDiaMes, agentes, especialidades, responsables, poblaciones, ausentismoAnalisis } = data
  const maxHeatmapVal = Math.max(...heatmap.flat(), 1)
  const maxHeatmapBrindadosVal = heatmapBrindados ? Math.max(...heatmapBrindados.flat(), 1) : 1
  
  // Promedios para los gráficos de línea
  const avgBrindados = tendenciaBrindados && tendenciaBrindados.length > 0 
      ? Math.round(tendenciaBrindados.reduce((acc, curr) => acc + curr.cantidad, 0) / tendenciaBrindados.length) 
      : 0;
      
  const avgAusentismo = ausentismoDiaMes && ausentismoDiaMes.length > 0 
      ? Math.round(ausentismoDiaMes.reduce((acc, curr) => acc + curr.Ausentes, 0) / ausentismoDiaMes.length) 
      : 0;

  // Tasa de asistencia solo sobre los turnos cerrados (Asistidos + Ausentes Injustificados + Ausentes Justificados)
  const totalCerrados = kpis ? (kpis.asistidos + kpis.ausentes + kpis.ausentes_justificados) : 0
  const tasaAsistencia = totalCerrados > 0 ? ((kpis.asistidos / totalCerrados) * 100).toFixed(1) : 0

  // Data para el gráfico de torta de asistencia
  const asistenciaData = [
      { name: 'Asistidos', value: kpis?.asistidos || 0, fill: '#10b981' },
      { name: 'Ausentes', value: kpis?.ausentes || 0, fill: '#ef4444' },
      { name: 'Ausentes Justificados', value: kpis?.ausentes_justificados || 0, fill: '#f59e0b' }
  ].filter(d => d.value > 0)

  return (
    <div className="fade-in">
      {/* ═══ BARRA DE FILTROS ═══ */}
      <div className="overview-filters-bar" style={{ marginBottom: '20px' }}>
          <DateFilter dateFrom={dateFrom} dateTo={dateTo} onChange={(from, to) => { setDateFrom(from); setDateTo(to); }} />
      </div>

      {loading && !kpis ? (
          <div className="loading-spinner"><div className="spinner"></div></div>
      ) : (
          <>
            {/* ═══ EXECUTIVE SUMMARY (KPIs) ═══ */}
            <div className="exec-card" style={{ marginBottom: '20px', opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s' }}>
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
                        <div className="exec-kpi-label">Tasa de Asistencia Global</div>
                    </div>
                </div>
            </div>

            {/* ═══ ROW 1: ASISTENCIA PIE CHART & HEATMAP ═══ */}
            <div className="grid-2" style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s' }}>
                {/* GRAFICO ASISTENCIA */}
                <div className="card">
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <PieChartIcon size={16} color="#f59e0b" />
                            <h3 style={{ margin: 0 }}>Proporción de Asistencia</h3>
                        </div>
                    </div>
                    <div className="card-body">
                        <div className="chart-container" style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {asistenciaData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={asistenciaData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={100}
                                            paddingAngle={5}
                                            dataKey="value"
                                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                        />
                                        <RechartsTooltip formatter={(value) => value.toLocaleString('es-AR')} />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div style={{ color: '#94a3b8', fontSize: '13px' }}>Sin datos de asistencia</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* HEATMAP */}
                <div className="card">
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Clock size={16} color="#0d9488" />
                            <h3 style={{ margin: 0 }}>Demanda: Horarios de Turnos</h3>
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
                                                    title={`${DAY_LABELS[dayIdx]} a las ${h}h — ${val} turnos`}
                                                >
                                                    {val > 0 && <span className="heatmap-cell-value" style={{ color: val / maxHeatmapVal > 0.4 ? '#fff' : '#334155', fontWeight: 600, fontSize: '11px' }}>{val}</span>}
                                                </div>
                                            )
                                        })}
                                    </>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* HEATMAP BRINDADOS */}
            <div className="card" style={{ marginBottom: '20px', opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s' }}>
                <div className="card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Clock size={16} color="#8b5cf6" />
                        <h3 style={{ margin: 0 }}>Horarios de los Turnos Brindados (Cita del Paciente)</h3>
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
                                    <div key={`label-brin-${dayIdx}`} className="heatmap-day-label">{DAY_LABELS[dayIdx]}</div>
                                    {HEATMAP_HOURS.map(h => {
                                        const val = heatmapBrindados ? (heatmapBrindados[dayIdx]?.[h] || 0) : 0
                                        return (
                                            <div
                                                key={`brin-${dayIdx}-${h}`}
                                                className="heatmap-cell"
                                                style={{ background: getHeatmapColor(val, maxHeatmapBrindadosVal), transition: 'background 0.4s ease' }}
                                                title={`${DAY_LABELS[dayIdx]} a las ${h}h — ${val} turnos asignados`}
                                            >
                                                {val > 0 && <span className="heatmap-cell-value" style={{ color: val / maxHeatmapBrindadosVal > 0.4 ? '#fff' : '#334155', fontWeight: 600, fontSize: '11px' }}>{val}</span>}
                                            </div>
                                        )
                                    })}
                                </>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ ROW 3: CRECIMIENTO BRINDADOS + AUSENTISMO DIA MES ═══ */}
            <div className="grid-2" style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s', marginBottom: '20px' }}>
                <div className="card">
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <TrendingUp size={16} color="#8b5cf6" />
                            <h3 style={{ margin: 0 }}>Crecimiento Turnos Brindados (Histórico)</h3>
                        </div>
                    </div>
                    <div className="card-body">
                        <div className="chart-container" style={{ height: '300px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={tendenciaBrindados} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorBrindados" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="nombreMes" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                                    <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} />
                                    {avgBrindados > 0 && (
                                        <ReferenceLine y={avgBrindados} stroke="#64748b" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: `Promedio: ${avgBrindados}`, fill: '#64748b', fontSize: 11 }} />
                                    )}
                                    <Area type="monotone" name="Turnos" dataKey="cantidad" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorBrindados)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <AlertCircle size={16} color="#ef4444" />
                            <h3 style={{ margin: 0 }}>Evolución de Ausentismo por Día del Mes</h3>
                        </div>
                    </div>
                    <div className="card-body">
                        <div className="chart-container" style={{ height: '300px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={ausentismoDiaMes} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="dia" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                                    <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} labelFormatter={(label) => label} />
                                    {avgAusentismo > 0 && (
                                        <ReferenceLine y={avgAusentismo} stroke="#f87171" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: `Promedio: ${avgAusentismo}`, fill: '#f87171', fontSize: 11 }} />
                                    )}
                                    <Line type="monotone" name="Ausentes" dataKey="Ausentes" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, fill: '#ef4444', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ ROW 4: TENDENCIA + TOP ESPECIALIDADES ═══ */}
            <div className="grid-2" style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s', marginBottom: '20px' }}>
                {/* TENDENCIA */}
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

                {/* ESPECIALIDADES */}
                <div className="card">
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Briefcase size={16} color="#ec4899" />
                            <h3 style={{ margin: 0 }}>Top 10 Especialidades</h3>
                        </div>
                    </div>
                    <div className="card-body">
                        <div className="chart-container" style={{ height: '300px' }}>
                            {especialidades && especialidades.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={especialidades} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis type="number" tick={{ fontSize: 11 }} />
                                        <YAxis dataKey="especialidad" type="category" tick={{ fontSize: 11 }} width={140} />
                                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                                        <Bar dataKey="cantidad" name="Turnos" radius={[0, 4, 4, 0]} animationDuration={600}>
                                            {especialidades.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '20px' }}>Sin datos de especialidades</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ ROW 3: TOP RESPONSABLES + TOP AGENTES ═══ */}
            <div className="grid-2" style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s', paddingBottom: '30px' }}>
                {/* RESPONSABLES */}
                <div className="card">
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <UserCheck size={16} color="#3b82f6" />
                            <h3 style={{ margin: 0 }}>Top 10 Responsables Asignados</h3>
                        </div>
                    </div>
                    <div className="card-body">
                        <div className="chart-container" style={{ height: '300px' }}>
                            {responsables && responsables.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={responsables} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis type="number" tick={{ fontSize: 11 }} />
                                        <YAxis dataKey="nombre" type="category" tick={{ fontSize: 11 }} width={140} />
                                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                                        <Bar dataKey="cantidad" name="Turnos" radius={[0, 4, 4, 0]} animationDuration={600}>
                                            {responsables.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[(index+3) % COLORS.length]} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '20px' }}>Sin datos de responsables</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* AGENTES */}
                <div className="card">
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Users size={16} color="#8b5cf6" />
                            <h3 style={{ margin: 0 }}>Top 10 Agentes Creadores</h3>
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
                                        <Bar dataKey="cantidad" name="Turnos Creados" radius={[0, 4, 4, 0]} animationDuration={600}>
                                            {agentes.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[(index+5) % COLORS.length]} />
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
            {/* ═══ ROW 5: TOP POBLACIONES ═══ */}
            <div className="grid-2" style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s', paddingBottom: '30px' }}>
                <div className="card">
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <MapPin size={16} color="#f97316" />
                            <h3 style={{ margin: 0 }}>Top 10 Localidades (Población)</h3>
                        </div>
                    </div>
                    <div className="card-body">
                        <div className="chart-container" style={{ height: '300px' }}>
                            {poblaciones && poblaciones.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={poblaciones} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis type="number" tick={{ fontSize: 11 }} />
                                        <YAxis dataKey="poblacion" type="category" tick={{ fontSize: 11 }} width={140} />
                                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                                        <Bar dataKey="cantidad" name="Pacientes" radius={[0, 4, 4, 0]} animationDuration={600}>
                                            {poblaciones.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[(index+7) % COLORS.length]} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '20px' }}>Sin datos de localidades</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ ROW 6: ANALISIS DE AUSENTISMO ═══ */}
            {ausentismoAnalisis && (
            <div className="fade-in">
                <div style={{ padding: '20px 0 15px', borderBottom: '1px solid #e2e8f0', marginBottom: '20px' }}>
                    <h2 style={{ fontSize: '18px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 5px' }}>
                        <AlertCircle color="#ef4444" />
                        Análisis Detallado de Inasistencias (Cantidad Neta)
                    </h2>
                    <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>Volumen total de ausencias injustificadas en turnos de fecha pasada, rankeados de mayor a menor.</p>
                </div>

                <div className="grid-2" style={{ marginBottom: '20px' }}>
                    <AusentismoChart data={ausentismoAnalisis.por_responsable} title="Responsables con más Ausentismo" icon={<UserCheck size={16} color="#ef4444"/>} />
                    <AusentismoChart data={ausentismoAnalisis.por_grupo_agenda} title="Grupo Agenda con más Ausentismo" icon={<Calendar size={16} color="#ef4444"/>} />
                </div>
                <div className="grid-2" style={{ marginBottom: '20px' }}>
                    <AusentismoChart data={ausentismoAnalisis.por_tipo_visita} title="Tipo de Visita con más Ausentismo" icon={<Briefcase size={16} color="#ef4444"/>} />
                    <AusentismoChart data={ausentismoAnalisis.por_obra_social} title="Obras Sociales con más Ausentismo" icon={<Activity size={16} color="#ef4444"/>} />
                </div>
                <div className="grid-2" style={{ marginBottom: '30px' }}>
                    <AusentismoChart data={ausentismoAnalisis.por_centro} title="Centros con más Ausentismo" icon={<MapPin size={16} color="#ef4444"/>} />
                    <AusentismoChart data={ausentismoAnalisis.por_usuario_creacion} title="Creadores con más Ausentismo" icon={<Users size={16} color="#ef4444"/>} />
                </div>
            </div>
            )}
          </>
      )}
    </div>
  )
}
