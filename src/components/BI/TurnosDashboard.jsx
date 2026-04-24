import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';
import { Calendar, Users, Activity, Clock, TrendingUp, CheckCircle, XCircle } from 'lucide-react';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];

export default function TurnosDashboard() {
  const [kpis, setKpis] = useState(null);
  const [heatmap, setHeatmap] = useState([]);
  const [tendencia, setTendencia] = useState([]);
  const [agentes, setAgentes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBI() {
      try {
        const [resKpi, resHeatmap, resTendencia, resAgentes] = await Promise.all([
          supabase.from('bi_kpis_visitas').select('*').single(),
          supabase.from('bi_heatmap_creacion').select('*'),
          supabase.from('bi_tendencia_mensual').select('*'),
          supabase.from('bi_top_agentes').select('*')
        ]);

        if (resKpi.data) setKpis(resKpi.data);
        if (resTendencia.data) {
          // Formatear meses para el gráfico
          const formatted = resTendencia.data.map(d => {
            const date = new Date(d.mes);
            return {
              ...d,
              nombreMes: date.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' })
            };
          });
          setTendencia(formatted);
        }
        if (resAgentes.data) setAgentes(resAgentes.data);
        
        if (resHeatmap.data) {
          // Construir matriz 7x24 para el Heatmap
          const matrix = Array(7).fill(0).map(() => Array(24).fill(0));
          resHeatmap.data.forEach(d => {
            // ISODOW: 1=Lunes, 7=Domingo. Restamos 1 para array (0-6)
            if (d.dia_semana >= 1 && d.dia_semana <= 7 && d.hora >= 0 && d.hora <= 23) {
              matrix[d.dia_semana - 1][d.hora] = d.cantidad;
            }
          });
          setHeatmap(matrix);
        }

      } catch (err) {
        console.error("Error cargando BI:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchBI();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const maxHeatmapVal = Math.max(...heatmap.flat());
  const diasSemana = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  // Función para calcular intensidad de color (escala de azules)
  const getHeatmapColor = (val) => {
    if (val === 0) return 'bg-slate-100';
    const intensity = Math.max(0.1, val / maxHeatmapVal);
    // Usamos rgba para ir desde un azul muy claro hasta uno muy oscuro
    return `rgba(37, 99, 235, ${intensity})`; // blue-600
  };

  const tasaAsistencia = kpis ? ((kpis.asistidos / kpis.total_turnos) * 100).toFixed(1) : 0;

  return (
    <div className="p-8 bg-slate-50 min-h-screen font-sans">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
          <Activity className="text-blue-600" size={32} />
          Contact Center Analytics: Inteligencia de Turnos
        </h1>
        <p className="text-slate-500 mt-2">Visión integral de agendamiento y demanda operativa.</p>
      </div>

      {/* KPIs Level */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-100 border-l-4 border-l-blue-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">Total Turnos Otorgados</p>
              <h3 className="text-3xl font-bold text-slate-800 mt-2">{kpis?.total_turnos?.toLocaleString('es-AR')}</h3>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
              <Calendar size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-100 border-l-4 border-l-emerald-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">Turnos Asistidos</p>
              <h3 className="text-3xl font-bold text-slate-800 mt-2">{kpis?.asistidos?.toLocaleString('es-AR')}</h3>
            </div>
            <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600">
              <CheckCircle size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-100 border-l-4 border-l-rose-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">Ausencias Injustificadas</p>
              <h3 className="text-3xl font-bold text-slate-800 mt-2">{kpis?.ausentes?.toLocaleString('es-AR')}</h3>
            </div>
            <div className="p-3 bg-rose-50 rounded-lg text-rose-600">
              <XCircle size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-100 border-l-4 border-l-indigo-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">Tasa de Asistencia</p>
              <h3 className="text-3xl font-bold text-slate-800 mt-2">{tasaAsistencia}%</h3>
            </div>
            <div className="p-3 bg-indigo-50 rounded-lg text-indigo-600">
              <TrendingUp size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Heatmap de Demanda (Innovación solicitada) */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-8 border border-slate-100">
        <div className="flex items-center gap-2 mb-6">
          <Clock className="text-slate-400" />
          <h2 className="text-xl font-bold text-slate-800">Mapa de Calor: Horarios Pico de Creación de Turnos</h2>
        </div>
        <div className="overflow-x-auto pb-4">
          <div className="min-w-[800px]">
            <div className="flex">
              <div className="w-16"></div>
              {Array(24).fill(0).map((_, i) => (
                <div key={i} className="flex-1 text-center text-xs font-medium text-slate-400">{i}h</div>
              ))}
            </div>
            {heatmap.map((row, dayIdx) => (
              <div key={dayIdx} className="flex items-center mt-2 gap-1">
                <div className="w-16 text-sm font-medium text-slate-600">{diasSemana[dayIdx]}</div>
                {row.map((val, hourIdx) => (
                  <div 
                    key={hourIdx} 
                    className="flex-1 h-10 rounded-sm cursor-pointer transition-transform hover:scale-110 flex items-center justify-center group relative"
                    style={{ backgroundColor: val > 0 ? getHeatmapColor(val) : '' }}
                    title={`${val} turnos dados el ${diasSemana[dayIdx]} a las ${hourIdx}h`}
                  >
                    {/* Tooltip on hover (CSS only approach for speed) */}
                    <div className="absolute opacity-0 group-hover:opacity-100 bottom-full mb-2 bg-slate-800 text-white text-xs py-1 px-2 rounded pointer-events-none z-10 whitespace-nowrap">
                      {val} turnos
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end items-center gap-2 mt-4 text-xs text-slate-500">
          <span>Menos turnos</span>
          <div className="w-24 h-3 rounded bg-gradient-to-r from-blue-100 to-blue-700"></div>
          <span>Más turnos</span>
        </div>
      </div>

      {/* Gráficos Secundarios */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Tendencia Lineal */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-100">
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp className="text-slate-400" />
            <h2 className="text-xl font-bold text-slate-800">Tendencia Histórica</h2>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tendencia}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="nombreMes" axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                <RechartsTooltip 
                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
                <Legend />
                <Line type="monotone" name="Turnos Otorgados" dataKey="cantidad" stroke="#2563eb" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                <Line type="monotone" name="Asistidos" dataKey="asistidos" stroke="#10b981" strokeWidth={3} dot={{r: 4}} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Agentes */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-100">
          <div className="flex items-center gap-2 mb-6">
            <Users className="text-slate-400" />
            <h2 className="text-xl font-bold text-slate-800">Top Agentes (Generadores)</h2>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agentes} layout="vertical" margin={{top: 5, right: 30, left: 20, bottom: 5}}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                <XAxis type="number" hide />
                <YAxis dataKey="agente" type="category" axisLine={false} tickLine={false} width={150} tick={{fill: '#475569', fontSize: 12}} />
                <RechartsTooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
                <Bar dataKey="cantidad" name="Turnos Generados" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                  {agentes.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
