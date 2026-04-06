import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import {
    X, Download, Loader2, FileText, Users, Clock, TrendingUp,
    BarChart3, Smile, AlertTriangle, CheckCircle, ChevronDown
} from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, AreaChart, Area, RadarChart, Radar, PolarGrid,
    PolarAngleAxis, PolarRadiusAxis, Legend
} from 'recharts'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { format } from 'date-fns'

const SENTIMENT_COLORS = {
    positive: '#10b981',
    neutral: '#64748b',
    negative: '#ef4444',
    frustrated: '#dc2626',
}

const CHART_COLORS = ['#1a6bb5', '#0d9488', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16']

export default function AgentReportModal({ isOpen, onClose, stats, rawData, selectedAgent, dateFrom, dateTo }) {
    const [generating, setGenerating] = useState(false)
    const [aiInsights, setAiInsights] = useState(null)
    const [loadingAI, setLoadingAI] = useState(false)
    const reportRef = useRef(null)

    // Generate AI insights on open
    useEffect(() => {
        if (isOpen && stats) {
            generateAIInsights()
        }
        return () => {
            setAiInsights(null)
        }
    }, [isOpen])

    const agentLabel = selectedAgent || 'Todos los agentes'
    const dateRangeLabel = useMemo(() => {
        if (!dateFrom && !dateTo) return 'Todo el período'
        const from = dateFrom ? format(new Date(dateFrom), 'dd/MM/yyyy') : '—'
        const to = dateTo ? format(new Date(dateTo), 'dd/MM/yyyy') : 'Hoy'
        return `${from} → ${to}`
    }, [dateFrom, dateTo])

    // ─── AI Insights Generation ───
    const generateAIInsights = useCallback(async () => {
        if (!stats) return
        setLoadingAI(true)
        try {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

            // Build a compact data summary for the AI
            const dataSummary = {
                periodo: dateRangeLabel,
                agente: agentLabel,
                totalChats: stats.totalChats,
                totalTickets: stats.totalTickets,
                sentimientoPromedio: stats.avgSentiment,
                distribucionSentimiento: stats.sentimentDist,
                resolucionBot: stats.botResolutionRate,
                tiempoHandoffPromedio: stats.avgHandoffTime,
                variacionSemanal: stats.weeklyVariation,
                alertas: (stats.alerts || []).map(a => a.message),
                distribucionAgentes: (stats.agentDist || []).slice(0, 5),
                tendenciaSemanal: (stats.weeklyTrend || []).map(w => ({ semana: w.label, chats: w.chats })),
                chatsProblematicos: (stats.problematicChats || []).length,
                intenciones: Object.entries(stats.intentDist || {}).sort((a, b) => b[1] - a[1]).slice(0, 5),
                volumenDiario: (stats.dailyVolume || []).slice(-7),
                keywordsEmergentes: (stats.emergingKeywords || []).slice(0, 3),
                handoffCount: stats.handoffCount,
                chatsHoy: stats.totalToday,
            }

            const response = await fetch(`${supabaseUrl}/functions/v1/generate-report-insights`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseAnonKey}`,
                },
                body: JSON.stringify({ data: dataSummary })
            })

            if (response.ok) {
                const result = await response.json()
                setAiInsights(result)
            } else {
                // Fallback: generate local insights if edge function not available
                setAiInsights(generateLocalInsights(stats))
            }
        } catch (err) {
            console.warn('AI insights unavailable, using local analysis:', err.message)
            setAiInsights(generateLocalInsights(stats))
        } finally {
            setLoadingAI(false)
        }
    }, [stats, dateRangeLabel, agentLabel])

    // ─── Local Fallback Insights ───
    function generateLocalInsights(stats) {
        const sections = []

        // Executive summary
        let execSummary = `Durante el período analizado (${dateRangeLabel}), `
        if (selectedAgent) {
            execSummary += `el agente **${selectedAgent}** gestionó **${stats.totalChats}** chats únicos (${stats.totalTickets} conversaciones totales). `
        } else {
            execSummary += `el Contact Center procesó **${stats.totalChats}** chats únicos (${stats.totalTickets} conversaciones totales). `
        }
        execSummary += `El sentimiento promedio fue de **${stats.avgSentiment}** `
        execSummary += stats.avgSentiment >= 0.3 ? '(positivo), ' : stats.avgSentiment >= 0 ? '(neutro), ' : '(negativo), '
        execSummary += `con una tasa de resolución por bot del **${stats.botResolutionRate}%**.`

        if (stats.weeklyVariation !== 0) {
            execSummary += ` La variación respecto a la semana anterior fue de **${stats.weeklyVariation > 0 ? '+' : ''}${stats.weeklyVariation}%**.`
        }

        sections.push({
            title: '📊 Resumen Ejecutivo',
            content: execSummary
        })

        // Workload analysis
        if (stats.agentDist && stats.agentDist.length > 0) {
            const topAgent = stats.agentDist[0]
            const totalAgentChats = stats.agentDist.reduce((sum, a) => sum + a.chats, 0)
            let workloadText = `La distribución de carga muestra que **${topAgent.name}** lidera con **${topAgent.chats} chats** `
            workloadText += `(${((topAgent.chats / totalAgentChats) * 100).toFixed(0)}% del total). `

            if (stats.agentDist.length > 1) {
                const secondAgent = stats.agentDist[1]
                workloadText += `Le sigue **${secondAgent.name}** con **${secondAgent.chats} chats**. `
            }

            if (topAgent.chats / totalAgentChats > 0.4) {
                workloadText += `⚠️ Se detecta una **concentración significativa** de carga en un solo agente, lo que podría afectar la calidad de atención en períodos pico.`
            }
            sections.push({ title: '👥 Análisis de Carga de Trabajo', content: workloadText })
        }

        // Sentiment analysis
        const totalSentiment = Object.values(stats.sentimentDist).reduce((a, b) => a + b, 0)
        if (totalSentiment > 0) {
            const negRate = ((stats.sentimentDist.negative + stats.sentimentDist.frustrated) / totalSentiment * 100).toFixed(1)
            const posRate = (stats.sentimentDist.positive / totalSentiment * 100).toFixed(1)
            let sentText = `El análisis de sentimiento revela: **${posRate}%** interacciones positivas y **${negRate}%** negativas/frustradas. `

            if (parseFloat(negRate) > 20) {
                sentText += `🔴 El porcentaje de interacciones negativas supera el umbral recomendado del 20%. Se sugiere revisar los casos problemáticos y reforzar protocolos de atención.`
            } else if (parseFloat(negRate) < 10) {
                sentText += `🟢 Excelente nivel de satisfacción. El equipo mantiene un estándar alto de calidad en la comunicación.`
            } else {
                sentText += `🟡 El sentimiento se encuentra en niveles aceptables, pero se recomienda monitoreo continuo.`
            }
            sections.push({ title: '😊 Análisis de Sentimiento', content: sentText })
        }

        // Problematic chats
        if (stats.problematicChats && stats.problematicChats.length > 0) {
            let probText = `Se identificaron **${stats.problematicChats.length} conversaciones en riesgo**. `
            probText += `Los principales motivos incluyen: sentimiento negativo, frustración del paciente, o conversaciones excesivamente largas. `
            probText += `Se recomienda una **revisión individual** de estos casos para identificar patrones de mejora.`
            sections.push({ title: '⚠️ Chats Problemáticos', content: probText })
        }

        // Temporal patterns
        if (stats.hourlyDist) {
            const peakHour = stats.hourlyDist.indexOf(Math.max(...stats.hourlyDist))
            const totalByHour = stats.hourlyDist.reduce((a, b) => a + b, 0)
            let tempText = `El pico de actividad se concentra a las **${peakHour}:00 hs** `
            tempText += `(${((stats.hourlyDist[peakHour] / totalByHour) * 100).toFixed(0)}% del volumen diario). `

            if (stats.dailyDist) {
                const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
                const peakDay = stats.dailyDist.indexOf(Math.max(...stats.dailyDist))
                tempText += `El día de mayor demanda es **${DAY_LABELS[peakDay]}**. `
            }

            tempText += `Esta información es clave para **planificar la dotación de personal** en los horarios de mayor demanda.`
            sections.push({ title: '🕐 Patrones Temporales', content: tempText })
        }

        // Recommendations
        let recText = 'Basándonos en el análisis:\n'
        const recs = []
        if (stats.weeklyVariation > 20) recs.push('• **Crecimiento sostenido**: Considerar ampliar el equipo o redistribuir turnos para cubrir el aumento de demanda.')
        if (stats.avgSentiment < 0) recs.push('• **Sentimiento bajo**: Implementar capacitaciones de atención al paciente y revisión de protocolos.')
        if (stats.botResolutionRate < 15) recs.push('• **Bot subutilizado**: Optimizar el árbol de decisiones del chatbot para resolver más consultas automatizadamente.')
        if (stats.handoffCount > 0 && stats.avgHandoffTime > 300) recs.push('• **Handoff lento**: El tiempo de transición Bot→Agente supera los 5 minutos. Revisar la disponibilidad de agentes en horas pico.')
        if (stats.problematicChats?.length > 5) recs.push('• **Atención crítica**: Más de 5 chats problemáticos detectados. Programar sesión de coaching con el equipo.')
        if (recs.length === 0) recs.push('• **Rendimiento estable**: Mantener las prácticas actuales y continuar con el monitoreo semanal.')
        recText += recs.join('\n')
        sections.push({ title: '💡 Recomendaciones', content: recText })

        return {
            title: selectedAgent ? `Informe de Rendimiento — ${selectedAgent}` : 'Informe de Rendimiento — Contact Center',
            generatedAt: new Date().toISOString(),
            sections,
        }
    }

    // ─── PDF Export ───
    const handleExportPDF = async () => {
        if (!reportRef.current) return
        setGenerating(true)

        try {
            // Wait for charts to render
            await new Promise(r => setTimeout(r, 500))

            const canvas = await html2canvas(reportRef.current, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                windowWidth: 900,
            })

            const imgData = canvas.toDataURL('image/png')
            const pdf = new jsPDF('p', 'mm', 'a4')
            const pdfWidth = pdf.internal.pageSize.getWidth()
            const pdfHeight = pdf.internal.pageSize.getHeight()
            const imgWidth = pdfWidth - 20
            const imgHeight = (canvas.height * imgWidth) / canvas.width

            let heightLeft = imgHeight
            let position = 10

            // First page
            pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight)
            heightLeft -= (pdfHeight - 20)

            // Additional pages if needed
            while (heightLeft > 0) {
                position = -(pdfHeight - 20) + 10
                pdf.addPage()
                pdf.addImage(imgData, 'PNG', 10, position + (pdfHeight - 20) - heightLeft, imgWidth, imgHeight)
                heightLeft -= (pdfHeight - 20)
            }

            // Footer on all pages
            const totalPages = pdf.internal.getNumberOfPages()
            for (let i = 1; i <= totalPages; i++) {
                pdf.setPage(i)
                pdf.setFontSize(8)
                pdf.setTextColor(148, 163, 184)
                pdf.text(`Sanatorio Argentino — Contact Center Analytics | Página ${i} de ${totalPages}`, pdfWidth / 2, pdfHeight - 5, { align: 'center' })
            }

            const filename = selectedAgent
                ? `informe_${selectedAgent.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.pdf`
                : `informe_contact_center_${format(new Date(), 'yyyy-MM-dd')}.pdf`
            pdf.save(filename)
        } catch (err) {
            console.error('Error generating PDF:', err)
            alert('Error al generar el PDF. Intentá nuevamente.')
        } finally {
            setGenerating(false)
        }
    }

    if (!isOpen || !stats) return null

    // Chart data
    const sentimentData = Object.entries(stats.sentimentDist).map(([key, value]) => ({
        name: key.charAt(0).toUpperCase() + key.slice(1), value,
        color: SENTIMENT_COLORS[key],
    })).filter(d => d.value > 0)

    const agentData = (stats.agentDist || []).slice(0, 8)
    const intentData = Object.entries(stats.intentDist || {})
        .sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([name, value]) => ({ name, value }))

    const hourlyData = (stats.hourlyDist || []).map((count, hour) => ({
        hour: `${hour.toString().padStart(2, '0')}:00`, chats: count,
    })).filter(d => d.chats > 0)

    const trendData = (stats.weeklyTrend || []).map(w => ({
        name: w.label, chats: w.chats,
    }))

    const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
    const dailyData = [1, 2, 3, 4, 5, 6, 0].map(dayIndex => ({
        name: DAY_LABELS[dayIndex],
        chats: stats.dailyDist?.[dayIndex] || 0,
    }))

    const formatSeconds = (seconds) => {
        if (!seconds) return '—'
        if (seconds < 60) return `${seconds}s`
        const min = Math.floor(seconds / 60)
        const sec = seconds % 60
        return `${min}m ${sec}s`
    }

    return (
        <div className="report-modal-overlay" onClick={onClose}>
            <div className="report-modal" onClick={e => e.stopPropagation()}>
                {/* Modal Header */}
                <div className="report-modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <FileText size={20} color="#1a6bb5" />
                        <div>
                            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>
                                Informe de Rendimiento
                            </h2>
                            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                                {agentLabel} • {dateRangeLabel}
                            </span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={handleExportPDF}
                            disabled={generating || loadingAI}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            {generating ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
                            {generating ? 'Generando...' : 'Descargar PDF'}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={onClose} style={{ padding: '6px' }}>
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* Scrollable Report Content */}
                <div className="report-modal-body">
                    <div ref={reportRef} className="report-content">
                        {/* Report Title */}
                        <div className="report-title-block">
                            <div className="report-logo">
                                <div className="report-logo-icon">SA</div>
                                <div>
                                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b', letterSpacing: '-0.3px' }}>
                                        Sanatorio Argentino
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>
                                        Contact Center — Informe de Gestión
                                    </div>
                                </div>
                            </div>
                            <div className="report-meta">
                                <div className="report-meta-item">
                                    <Users size={13} /> {agentLabel}
                                </div>
                                <div className="report-meta-item">
                                    <Clock size={13} /> {dateRangeLabel}
                                </div>
                                <div className="report-meta-item">
                                    <FileText size={13} /> Generado: {format(new Date(), 'dd/MM/yyyy HH:mm')}
                                </div>
                            </div>
                        </div>

                        {/* KPI Summary Cards */}
                        <div className="report-kpi-grid">
                            <div className="report-kpi-card">
                                <div className="report-kpi-icon" style={{ background: '#eff6ff' }}>
                                    <Users size={18} color="#1a6bb5" />
                                </div>
                                <div className="report-kpi-value">{stats.totalChats}</div>
                                <div className="report-kpi-label">Chats Únicos</div>
                                {stats.totalTickets !== stats.totalChats && (
                                    <div className="report-kpi-sub">{stats.totalTickets} conversaciones</div>
                                )}
                            </div>
                            <div className="report-kpi-card">
                                <div className="report-kpi-icon" style={{ background: '#f0fdf4' }}>
                                    <Smile size={18} color="#10b981" />
                                </div>
                                <div className="report-kpi-value">{stats.avgSentiment}</div>
                                <div className="report-kpi-label">Sentimiento Prom.</div>
                            </div>
                            <div className="report-kpi-card">
                                <div className="report-kpi-icon" style={{ background: '#faf5ff' }}>
                                    <BarChart3 size={18} color="#8b5cf6" />
                                </div>
                                <div className="report-kpi-value">{stats.botResolutionRate}%</div>
                                <div className="report-kpi-label">Resolución Bot</div>
                            </div>
                            <div className="report-kpi-card">
                                <div className="report-kpi-icon" style={{ background: '#fff7ed' }}>
                                    <AlertTriangle size={18} color="#f59e0b" />
                                </div>
                                <div className="report-kpi-value">{stats.problematicChats?.length || 0}</div>
                                <div className="report-kpi-label">Chats en Riesgo</div>
                            </div>
                            {stats.handoffCount > 0 && (
                                <div className="report-kpi-card">
                                    <div className="report-kpi-icon" style={{ background: '#ecfdf5' }}>
                                        <TrendingUp size={18} color="#0d9488" />
                                    </div>
                                    <div className="report-kpi-value">{formatSeconds(stats.avgHandoffTime)}</div>
                                    <div className="report-kpi-label">Handoff Prom.</div>
                                </div>
                            )}
                        </div>

                        {/* AI Insights */}
                        <div className="report-section">
                            <div className="report-section-header">
                                <div className="report-section-icon ai">✨</div>
                                <h3>Análisis con Inteligencia Artificial</h3>
                            </div>
                            {loadingAI ? (
                                <div className="report-ai-loading">
                                    <Loader2 size={20} className="spin" />
                                    <span>Generando análisis inteligente...</span>
                                </div>
                            ) : aiInsights ? (
                                <div className="report-ai-sections">
                                    {aiInsights.sections.map((section, i) => (
                                        <div key={i} className="report-ai-block">
                                            <h4 className="report-ai-title">{section.title}</h4>
                                            <div className="report-ai-text">
                                                {section.content.split('\n').map((line, j) => (
                                                    <p key={j} dangerouslySetInnerHTML={{
                                                        __html: line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                                    }} />
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="report-ai-loading" style={{ color: '#94a3b8' }}>
                                    <AlertTriangle size={16} />
                                    <span>No se pudo generar el análisis automático</span>
                                </div>
                            )}
                        </div>

                        {/* Charts Grid */}
                        <div className="report-section">
                            <div className="report-section-header">
                                <div className="report-section-icon charts">📈</div>
                                <h3>Visualizaciones</h3>
                            </div>

                            <div className="report-charts-grid">
                                {/* Weekly Trend */}
                                {trendData.length > 0 && (
                                    <div className="report-chart-card">
                                        <h4>Tendencia Semanal</h4>
                                        <div style={{ width: '100%', height: 200 }}>
                                            <ResponsiveContainer>
                                                <AreaChart data={trendData}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                                    <YAxis tick={{ fontSize: 10 }} />
                                                    <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                                                    <Area type="monotone" dataKey="chats" stroke="#1a6bb5" fill="#1a6bb5"
                                                        fillOpacity={0.15} strokeWidth={2} name="Chats"
                                                        dot={{ r: 3, fill: '#1a6bb5' }} />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                )}

                                {/* Sentiment Distribution */}
                                {sentimentData.length > 0 && (
                                    <div className="report-chart-card">
                                        <h4>Distribución de Sentimiento</h4>
                                        <div style={{ width: '100%', height: 200 }}>
                                            <ResponsiveContainer>
                                                <PieChart>
                                                    <Pie data={sentimentData} cx="50%" cy="50%" innerRadius={45} outerRadius={75}
                                                        paddingAngle={3} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                                        labelLine={{ strokeWidth: 1 }}
                                                    >
                                                        {sentimentData.map((entry, i) => (
                                                            <Cell key={i} fill={entry.color} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                )}

                                {/* Hourly Distribution */}
                                {hourlyData.length > 0 && (
                                    <div className="report-chart-card">
                                        <h4>Distribución Horaria</h4>
                                        <div style={{ width: '100%', height: 200 }}>
                                            <ResponsiveContainer>
                                                <BarChart data={hourlyData}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                                    <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={2} />
                                                    <YAxis tick={{ fontSize: 10 }} />
                                                    <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                                                    <Bar dataKey="chats" fill="#0d9488" radius={[3, 3, 0, 0]} name="Chats" />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                )}

                                {/* Day of Week */}
                                <div className="report-chart-card">
                                    <h4>Chats por Día</h4>
                                    <div style={{ width: '100%', height: 200 }}>
                                        <ResponsiveContainer>
                                            <BarChart data={dailyData}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                                <YAxis tick={{ fontSize: 10 }} />
                                                <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                                                <Bar dataKey="chats" fill="#8b5cf6" radius={[3, 3, 0, 0]} name="Chats" />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Agent Distribution (only if not filtering by single agent) */}
                                {!selectedAgent && agentData.length > 0 && (
                                    <div className="report-chart-card report-chart-wide">
                                        <h4>Distribución por Agente</h4>
                                        <div style={{ width: '100%', height: 220 }}>
                                            <ResponsiveContainer>
                                                <BarChart data={agentData} layout="vertical">
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                                    <XAxis type="number" tick={{ fontSize: 10 }} />
                                                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={120} />
                                                    <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                                                    <Bar dataKey="chats" fill="#1a6bb5" radius={[0, 4, 4, 0]} name="Chats" />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                )}

                                {/* Intent Distribution */}
                                {intentData.length > 0 && (
                                    <div className="report-chart-card report-chart-wide">
                                        <h4>Intenciones Detectadas</h4>
                                        <div style={{ width: '100%', height: 200 }}>
                                            <ResponsiveContainer>
                                                <BarChart data={intentData} layout="vertical">
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                                    <XAxis type="number" tick={{ fontSize: 10 }} />
                                                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={130} />
                                                    <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                                                    <Bar dataKey="value" radius={[0, 4, 4, 0]} name="Cantidad">
                                                        {intentData.map((_, i) => (
                                                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Problematic Chats Table */}
                        {stats.problematicChats && stats.problematicChats.length > 0 && (
                            <div className="report-section">
                                <div className="report-section-header">
                                    <div className="report-section-icon danger">⚠️</div>
                                    <h3>Detalle de Chats en Riesgo ({stats.problematicChats.length})</h3>
                                </div>
                                <div className="report-table-container">
                                    <table className="report-table">
                                        <thead>
                                            <tr>
                                                <th>Ticket</th>
                                                <th>Cliente</th>
                                                <th>Agente</th>
                                                <th>Fecha</th>
                                                <th>Motivos</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stats.problematicChats.slice(0, 15).map(p => (
                                                <tr key={p.ticket_id}>
                                                    <td><code className="report-code">{p.ticket_id}</code></td>
                                                    <td>{p.customer_name || '—'}</td>
                                                    <td>{p.agent_name || 'Bot'}</td>
                                                    <td>{p.received_at ? format(new Date(p.received_at), 'dd/MM HH:mm') : '—'}</td>
                                                    <td>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                                                            {p.reasons.map((r, i) => (
                                                                <span key={i} className="report-reason-badge">{r}</span>
                                                            ))}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {stats.problematicChats.length > 15 && (
                                        <div style={{ textAlign: 'center', padding: '8px', fontSize: '11px', color: '#94a3b8' }}>
                                            ... y {stats.problematicChats.length - 15} casos más
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Footer */}
                        <div className="report-footer">
                            <div className="report-footer-line" />
                            <div className="report-footer-text">
                                <span>Sanatorio Argentino — Contact Center Analytics</span>
                                <span>Generado automáticamente por Grow Labs IA • {format(new Date(), 'dd/MM/yyyy HH:mm')}</span>
                                <span style={{ fontSize: '9px', color: '#cbd5e1' }}>Este informe es confidencial y para uso interno exclusivo.</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
