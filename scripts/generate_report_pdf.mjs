import { jsPDF } from 'jspdf';
import fs from 'fs';
import path from 'path';

// ── Cargar resúmenes precalculados ─────────────────────────────────
const agentSummary = JSON.parse(fs.readFileSync('scripts/agent_turnos_summary.json', 'utf-8'));
const journeySummary = JSON.parse(fs.readFileSync('scripts/patient_journey_summary.json', 'utf-8'));

// ── Crear Documento jsPDF (A4, vertical, unidades en mm) ─────────────
const doc = new jsPDF({
  orientation: 'portrait',
  unit: 'mm',
  format: 'a4',
  compress: true
});

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN_X = 14;
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN_X * 2);

// ── Paleta de Colores Institucional (Sanatorio Argentino / Grow Labs) ─
const COLORS = {
  primary: [26, 107, 181],       // #1a6bb5 Azul Institucional
  primaryDark: [15, 76, 129],    // #0f4c81 Azul Marino
  primaryLight: [235, 243, 250], // Fondo azul suave
  navyText: [23, 37, 84],        // #172554
  textDark: [30, 41, 59],        // #1e293b Slate 800
  textMuted: [100, 116, 139],    // #64748b Slate 500
  bgCard: [248, 250, 252],       // #f8fafc
  border: [226, 232, 240],       // #e2e8f0
  success: [16, 185, 129],       // #10b981 Verde Asistencia
  successBg: [236, 253, 245],    // #ecfdf5
  warning: [245, 158, 11],       // #f59e0b Ámbar
  warningBg: [254, 243, 199],
  danger: [239, 68, 68],         // #ef4444 Rojo
  white: [255, 255, 255]
};

// ── Cargar Logo en Base64 ──────────────────────────────────────────
let logoBase64 = null;
try {
  const logoBuf = fs.readFileSync('public/logosanatorio.png');
  logoBase64 = logoBuf.toString('base64');
} catch (e) {
  console.warn('No se pudo cargar logo png:', e.message);
}

// ── Helper: Header común para cada página ──────────────────────────
function drawHeader(pageNum, totalPages, title, subtitle) {
  // Franja superior azul decorativa
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, PAGE_WIDTH, 4, 'F');

  // Logo
  if (logoBase64) {
    try {
      doc.addImage(`data:image/png;base64,${logoBase64}`, 'PNG', MARGIN_X, 8, 38, 12);
    } catch (_) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(...COLORS.primary);
      doc.text('SANATORIO ARGENTINO', MARGIN_X, 16);
    }
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...COLORS.primary);
    doc.text('SANATORIO ARGENTINO', MARGIN_X, 16);
  }

  // Título y Subtítulo a la derecha
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.primaryDark);
  doc.text(title, PAGE_WIDTH - MARGIN_X, 13, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.textMuted);
  doc.text(subtitle, PAGE_WIDTH - MARGIN_X, 18, { align: 'right' });

  // Línea divisoria
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.4);
  doc.line(MARGIN_X, 23, PAGE_WIDTH - MARGIN_X, 23);
}

// ── Helper: Footer común para cada página ──────────────────────────
function drawFooter(pageNum, totalPages) {
  const y = PAGE_HEIGHT - 10;
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.4);
  doc.line(MARGIN_X, y - 3, PAGE_WIDTH - MARGIN_X, y - 3);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.textMuted);
  doc.text('Contact Center Analytics & AI — Sanatorio Argentino | Departamento de Innovación & Transformación Digital', MARGIN_X, y);
  doc.text(`Página ${pageNum} de ${totalPages}`, PAGE_WIDTH - MARGIN_X, y, { align: 'right' });
}

// ── Helper: Tarjeta de Métrica (KPI Box) ───────────────────────────
function drawMetricCard(x, y, w, h, title, value, subtext, badgeText, badgeColor = COLORS.primary) {
  doc.setFillColor(...COLORS.bgCard);
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, h, 2, 2, 'FD');

  // Borde superior de acento
  doc.setFillColor(...badgeColor);
  doc.roundedRect(x, y, w, 1.5, 1, 1, 'F');

  // Título
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.textMuted);
  doc.text(title.toUpperCase(), x + 4, y + 6.5);

  // Valor
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.navyText);
  doc.text(value, x + 4, y + 13.5);

  // Subtexto
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.textMuted);
  doc.text(subtext, x + 4, y + 18);

  // Badge derecho si existe
  if (badgeText) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    const badgeW = doc.getTextWidth(badgeText) + 4;
    doc.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
    doc.roundedRect(x + w - badgeW - 3, y + 3.5, badgeW, 4, 1, 1, 'F');
    doc.setTextColor(...COLORS.white);
    doc.text(badgeText, x + w - badgeW - 3 + (badgeW / 2), y + 6.3, { align: 'center' });
  }
}

// ═════════════════════════════════════════════════════════════════════
// PÁGINA 1: PORTADA EJECUTIVA & RESUMEN DE INDICADORES CLAVE (KPIs)
// ═════════════════════════════════════════════════════════════════════
drawHeader(1, 4, 'INFORME DE GESTIÓN CUATRIMESTRAL', 'Período: Mayo - Agosto 2026 / Salus: Abril - Julio 2026');

// Banner de Portada Ejecutivo
doc.setFillColor(...COLORS.primaryLight);
doc.setDrawColor(...COLORS.primary);
doc.setLineWidth(0.6);
doc.roundedRect(MARGIN_X, 27, CONTENT_WIDTH, 26, 2, 2, 'FD');

doc.setFont('helvetica', 'bold');
doc.setFontSize(14);
doc.setTextColor(...COLORS.primaryDark);
doc.text('Auditoría Integral de Contact Center & Agendamiento', MARGIN_X + 6, 36);

doc.setFont('helvetica', 'normal');
doc.setFontSize(8.5);
doc.setTextColor(...COLORS.textDark);
doc.text(
  'Informe consolidado de volumen de turnos por agente, tasas efectivas de asistencia médica, motivos de consulta\n' +
  'en canales conversacionales (Turnos vs Autorizaciones) y análisis de recurrencia del recorrido del paciente (Patient Journey).',
  MARGIN_X + 6,
  42
);

// Fila 1 de KPIs Principales
const cardW = (CONTENT_WIDTH - 9) / 4;
drawMetricCard(MARGIN_X, 57, cardW, 21, 'Turnos Salus', '15,222', 'Sistema Salus (HIS)', '4 Meses', COLORS.primary);
drawMetricCard(MARGIN_X + cardW + 3, 57, cardW, 21, 'Asistencia', '57.8%', 'Presentismo global', 'Efectivo', COLORS.success);
drawMetricCard(MARGIN_X + (cardW * 2) + 6, 57, cardW, 21, 'Chats Totales', '57,931', '38,347 auditados IA', 'Canales', [139, 92, 246]);
drawMetricCard(MARGIN_X + (cardW * 3) + 9, 57, cardW, 21, 'Pacientes', '20,306', 'Rastreados por tel', '100% ID', COLORS.warning);

// Sección: Cuadro de Honor & Ranking General de Agentes
doc.setFont('helvetica', 'bold');
doc.setFontSize(10.5);
doc.setTextColor(...COLORS.primaryDark);
doc.text('1. Ranking de Desempeño y Efectividad por Agente (Salus)', MARGIN_X, 85);

// Tabla de Ranking de Agentes
const tableHeaders1 = ['Agente', 'Turnos Totales', 'Presentes', 'Ausentes', '% Asistencia', 'Especialidad Principal', 'Rol / Estado'];
const colX1 = [MARGIN_X, MARGIN_X + 34, MARGIN_X + 60, MARGIN_X + 82, MARGIN_X + 104, MARGIN_X + 132, MARGIN_X + 162];

// Header de tabla
doc.setFillColor(...COLORS.primaryDark);
doc.roundedRect(MARGIN_X, 88, CONTENT_WIDTH, 6.5, 1, 1, 'F');
doc.setFont('helvetica', 'bold');
doc.setFontSize(7.5);
doc.setTextColor(...COLORS.white);
tableHeaders1.forEach((th, i) => {
  doc.text(th, colX1[i] + 2, 92.5);
});

// Filas de agentes
const rankingData = [
  { name: 'Antonella Acosta', total: '4,937', pres: '2,878', aus: '1,410', rate: '58.5%', esp: 'Ecografías (1,438)', status: 'Líder en Volumen' },
  { name: 'Sofia Olivier', total: '4,283', pres: '2,598', aus: '1,149', rate: '60.9%', esp: 'Ecografías (1,189)', status: 'Mayor Asistencia' },
  { name: 'Daniela Aguilera', total: '3,185', pres: '1,789', aus: '952', rate: '56.6%', esp: 'Ecografías (811)', status: 'Operativa Salus' },
  { name: 'Virginia Jacques', total: '2,817', pres: '1,510', aus: '1,016', rate: '53.8%', esp: 'Sector 2 (936)', status: 'Activa desde Mayo' },
  { name: 'Erica Esquivel', total: '0', pres: '-', aus: '-', rate: 'N/A', esp: 'Triaje / Derivaciones', status: 'Atención AsisteClick' }
];

let rowY = 94.5;
rankingData.forEach((row, idx) => {
  const isEven = idx % 2 === 0;
  doc.setFillColor(isEven ? 255 : 248, isEven ? 255 : 250, isEven ? 255 : 252);
  doc.rect(MARGIN_X, rowY, CONTENT_WIDTH, 6.2, 'F');
  doc.setDrawColor(...COLORS.border);
  doc.line(MARGIN_X, rowY + 6.2, MARGIN_X + CONTENT_WIDTH, rowY + 6.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.navyText);
  doc.text(row.name, colX1[0] + 2, rowY + 4.3);

  doc.setFont('helvetica', 'normal');
  doc.text(row.total, colX1[1] + 2, rowY + 4.3);
  doc.text(row.pres, colX1[2] + 2, rowY + 4.3);
  doc.text(row.aus, colX1[3] + 2, rowY + 4.3);

  // Badge % asistencia
  doc.setFont('helvetica', 'bold');
  if (row.rate !== 'N/A') {
    const rateNum = parseFloat(row.rate);
    const color = rateNum >= 60 ? COLORS.success : rateNum >= 55 ? COLORS.primary : COLORS.warning;
    doc.setTextColor(...color);
  } else {
    doc.setTextColor(...COLORS.textMuted);
  }
  doc.text(row.rate, colX1[4] + 2, rowY + 4.3);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.textDark);
  doc.text(row.esp, colX1[5] + 2, rowY + 4.3);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.primaryDark);
  doc.text(row.status, colX1[6] + 2, rowY + 4.3);

  rowY += 6.2;
});

// Sección: Conclusiones Ejecutivas de la Portada
doc.setFont('helvetica', 'bold');
doc.setFontSize(10);
doc.setTextColor(...COLORS.primaryDark);
doc.text('2. Aspectos Destacados de la Gestión', MARGIN_X, rowY + 7);

const bulletsY = rowY + 11;
const bullets = [
  '• Máxima Generación de Turnos: Antonella Acosta lidera con 4,937 turnos otorgados, concentrando el 32.4% del volumen total del Sanatorio.',
  '• Mayor Tasa de Asistencia Efectiva: Sofia Olivier alcanza un 60.9% de presentismo de sus pacientes citados, superando el promedio general en 3.1 puntos.',
  '• Demanda Dominante en el Chat: La solicitud de turnos representa el 52.1% de las intenciones de los pacientes, seguida por autorizaciones con un 24.4%.',
  '• Crecimiento Crítico de Autorizaciones: Las consultas de autorización alcanzaron su récord histórico en Agosto (3,931 casos, 25.2% del volumen).',
  '• Recorrido del Paciente (Journey): Se registraron 760 pacientes exclusivos de autorización y 554 pacientes con recorrido combinado de Turno y Autorización.'
];

doc.setFont('helvetica', 'normal');
doc.setFontSize(8);
doc.setTextColor(...COLORS.textDark);
bullets.forEach((b, i) => {
  doc.text(b, MARGIN_X + 2, bulletsY + (i * 5.2));
});

// Nota metodológica al pie de página 1
doc.setFillColor(...COLORS.bgCard);
doc.setDrawColor(...COLORS.border);
doc.roundedRect(MARGIN_X, 168, CONTENT_WIDTH, 14, 1.5, 1.5, 'FD');
doc.setFont('helvetica', 'bold');
doc.setFontSize(7.5);
doc.setTextColor(...COLORS.primaryDark);
doc.text('Nota de Auditoría sobre Fechas de Corte:', MARGIN_X + 3, 172.5);
doc.setFont('helvetica', 'normal');
doc.setFontSize(7);
doc.setTextColor(...COLORS.textDark);
doc.text(
  'La base de datos de turnos médicos en Salus (salus_visitas_historico) comprende los meses de Abril, Mayo, Junio y Julio de 2026 (los registros de Agosto\n' +
  'se encuentran en proceso de importación del HIS). Los datos del Contact Center (tickets, chats e IA) cubren el cuatrimestre Mayo - Agosto 2026 en su totalidad.',
  MARGIN_X + 3,
  176.5
);

drawFooter(1, 4);

// ═════════════════════════════════════════════════════════════════════
// PÁGINA 2: DESEMPEÑO OPERATIVO POR AGENTE, MES A MES & ASISTENCIA
// ═════════════════════════════════════════════════════════════════════
doc.addPage();
drawHeader(2, 4, 'DESEMPEÑO OPERATIVO POR AGENTE', 'Evolución Mensual de Turnos, Presentismo y Especialidades');

doc.setFont('helvetica', 'bold');
doc.setFontSize(10.5);
doc.setTextColor(...COLORS.primaryDark);
doc.text('1. Desglose Mensual de Turnos y Tasa de Asistencia por Agente', MARGIN_X, 29);

// Tabla Desglosada por Mes y Agente
const tableHeaders2 = ['Agente', 'Abril 2026', 'Mayo 2026', 'Junio 2026', 'Julio 2026', 'Total Período', 'Efectividad'];
const colX2 = [MARGIN_X, MARGIN_X + 32, MARGIN_X + 62, MARGIN_X + 92, MARGIN_X + 122, MARGIN_X + 152, MARGIN_X + 172];

doc.setFillColor(...COLORS.primaryDark);
doc.roundedRect(MARGIN_X, 32, CONTENT_WIDTH, 6.5, 1, 1, 'F');
doc.setFont('helvetica', 'bold');
doc.setFontSize(7.5);
doc.setTextColor(...COLORS.white);
tableHeaders2.forEach((th, i) => {
  doc.text(th, colX2[i] + 2, 36.5);
});

let rY2 = 38.5;
const detailedAgents = [
  {
    name: 'Antonella Acosta',
    m1: '1,632 (55.7%)',
    m2: '920 (60.5%)',
    m3: '1,140 (63.6%)',
    m4: '1,245 (56.0%)',
    total: '4,937',
    rate: '58.5%'
  },
  {
    name: 'Sofia Olivier',
    m1: '916 (55.3%)',
    m2: '903 (61.0%)',
    m3: '1,162 (62.5%)',
    m4: '1,302 (63.5%)',
    total: '4,283',
    rate: '60.9%'
  },
  {
    name: 'Daniela Aguilera',
    m1: '1,024 (52.9%)',
    m2: '682 (63.7%)',
    m3: '772 (59.0%)',
    m4: '707 (52.7%)',
    total: '3,185',
    rate: '56.6%'
  },
  {
    name: 'Virginia Jacques',
    m1: 'Inactiva',
    m2: '789 (57.1%)',
    m3: '1,054 (54.4%)',
    m4: '974 (50.3%)',
    total: '2,817',
    rate: '53.8%'
  },
  {
    name: 'Erica Esquivel',
    m1: '0 (N/A)',
    m2: '0 (N/A)',
    m3: '0 (N/A)',
    m4: '0 (N/A)',
    total: '0',
    rate: 'N/A'
  }
];

detailedAgents.forEach((ag, idx) => {
  const isEven = idx % 2 === 0;
  doc.setFillColor(isEven ? 255 : 248, isEven ? 255 : 250, isEven ? 255 : 252);
  doc.rect(MARGIN_X, rY2, CONTENT_WIDTH, 6.2, 'F');
  doc.setDrawColor(...COLORS.border);
  doc.line(MARGIN_X, rY2 + 6.2, MARGIN_X + CONTENT_WIDTH, rY2 + 6.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.navyText);
  doc.text(ag.name, colX2[0] + 2, rY2 + 4.3);

  doc.setFont('helvetica', 'normal');
  doc.text(ag.m1, colX2[1] + 2, rY2 + 4.3);
  doc.text(ag.m2, colX2[2] + 2, rY2 + 4.3);
  doc.text(ag.m3, colX2[3] + 2, rY2 + 4.3);
  doc.text(ag.m4, colX2[4] + 2, rY2 + 4.3);

  doc.setFont('helvetica', 'bold');
  doc.text(ag.total, colX2[5] + 2, rY2 + 4.3);
  doc.setTextColor(...COLORS.primaryDark);
  doc.text(ag.rate, colX2[6] + 2, rY2 + 4.3);

  rY2 += 6.2;
});

// Fila de Total Sanatorio
doc.setFillColor(...COLORS.primaryLight);
doc.rect(MARGIN_X, rY2, CONTENT_WIDTH, 6.5, 'F');
doc.setFont('helvetica', 'bold');
doc.setFontSize(7.5);
doc.setTextColor(...COLORS.primaryDark);
doc.text('TOTAL GENERAL', colX2[0] + 2, rY2 + 4.5);
doc.text('3,572 (54.8%)', colX2[1] + 2, rY2 + 4.5);
doc.text('3,294 (60.6%)', colX2[2] + 2, rY2 + 4.5);
doc.text('4,128 (59.9%)', colX2[3] + 2, rY2 + 4.5);
doc.text('4,228 (55.6%)', colX2[4] + 2, rY2 + 4.5);
doc.text('15,222', colX2[5] + 2, rY2 + 4.5);
doc.text('57.8%', colX2[6] + 2, rY2 + 4.5);

// Sección: ¿Quién da más turnos y para qué?
doc.setFont('helvetica', 'bold');
doc.setFontSize(10.5);
doc.setTextColor(...COLORS.primaryDark);
doc.text('2. Análisis de Especialidades y Destino de los Turnos Otorgados', MARGIN_X, rY2 + 13);

const cardEspY = rY2 + 17;
const colW2 = (CONTENT_WIDTH - 6) / 2;

// Card 1: Antonella (Líder en Volumen)
doc.setFillColor(...COLORS.bgCard);
doc.setDrawColor(...COLORS.border);
doc.roundedRect(MARGIN_X, cardEspY, colW2, 44, 2, 2, 'FD');
doc.setFillColor(...COLORS.primary);
doc.roundedRect(MARGIN_X, cardEspY, colW2, 1.5, 1, 1, 'F');

doc.setFont('helvetica', 'bold');
doc.setFontSize(8.5);
doc.setTextColor(...COLORS.primaryDark);
doc.text('Antonella Acosta — 4,937 Turnos (32.4%)', MARGIN_X + 4, cardEspY + 6.5);

doc.setFont('helvetica', 'normal');
doc.setFontSize(7.5);
doc.setTextColor(...COLORS.textDark);
doc.text('• Principales Especialidades / Agendas:', MARGIN_X + 4, cardEspY + 12);
doc.text('  1. ECOGRAFÍAS: 1,438 turnos (29.1%)', MARGIN_X + 6, cardEspY + 16.5);
doc.text('  2. SECTOR 2: 1,159 turnos (23.5%)', MARGIN_X + 6, cardEspY + 20.5);
doc.text('  3. SECTOR 1: 602 turnos (12.2%)', MARGIN_X + 6, cardEspY + 24.5);
doc.text('  4. SLN - CONSULTORIOS: 570 turnos (11.5%)', MARGIN_X + 6, cardEspY + 28.5);
doc.text('• Médicos con mayor asignación:', MARGIN_X + 4, cardEspY + 34);
doc.text('  Dr. Lara Arruti (131), Dr. Gómez (128), Dr. Chequeo (117), Dra. Lara (110)', MARGIN_X + 6, cardEspY + 38.5);

// Card 2: Sofia (Líder en Asistencia Efectiva)
doc.setFillColor(...COLORS.bgCard);
doc.setDrawColor(...COLORS.border);
doc.roundedRect(MARGIN_X + colW2 + 6, cardEspY, colW2, 44, 2, 2, 'FD');
doc.setFillColor(...COLORS.success);
doc.roundedRect(MARGIN_X + colW2 + 6, cardEspY, colW2, 1.5, 1, 1, 'F');

doc.setFont('helvetica', 'bold');
doc.setFontSize(8.5);
doc.setTextColor(...COLORS.primaryDark);
doc.text('Sofia Olivier — 4,283 Turnos (60.9% Asistencia)', MARGIN_X + colW2 + 10, cardEspY + 6.5);

doc.setFont('helvetica', 'normal');
doc.setFontSize(7.5);
doc.setTextColor(...COLORS.textDark);
doc.text('• Principales Especialidades / Agendas:', MARGIN_X + colW2 + 10, cardEspY + 12);
doc.text('  1. ECOGRAFÍAS: 1,189 turnos (27.8%)', MARGIN_X + colW2 + 12, cardEspY + 16.5);
doc.text('  2. SECTOR 2: 1,045 turnos (24.4%)', MARGIN_X + colW2 + 12, cardEspY + 20.5);
doc.text('  3. SLN - CONSULTORIOS: 543 turnos (12.7%)', MARGIN_X + colW2 + 12, cardEspY + 24.5);
doc.text('  4. SECTOR 1: 509 turnos (11.9%)', MARGIN_X + colW2 + 12, cardEspY + 28.5);
doc.text('• Médicos con mayor asignación:', MARGIN_X + colW2 + 10, cardEspY + 34);
doc.text('  Dr. Gómez (162), Dra. Lara (137), Chequeo (123), Dr. Ciari (90)', MARGIN_X + colW2 + 12, cardEspY + 38.5);

// Fila 2 de Especialidades: Daniela y Virginia
const cardEspY2 = cardEspY + 48;

// Card 3: Daniela Aguilera
doc.setFillColor(...COLORS.bgCard);
doc.setDrawColor(...COLORS.border);
doc.roundedRect(MARGIN_X, cardEspY2, colW2, 42, 2, 2, 'FD');
doc.setFillColor(...COLORS.warning);
doc.roundedRect(MARGIN_X, cardEspY2, colW2, 1.5, 1, 1, 'F');

doc.setFont('helvetica', 'bold');
doc.setFontSize(8.5);
doc.setTextColor(...COLORS.primaryDark);
doc.text('Daniela Aguilera — 3,185 Turnos (56.6% Asistencia)', MARGIN_X + 4, cardEspY2 + 6.5);

doc.setFont('helvetica', 'normal');
doc.setFontSize(7.5);
doc.setTextColor(...COLORS.textDark);
doc.text('• Principales Especialidades / Agendas:', MARGIN_X + 4, cardEspY2 + 12);
doc.text('  1. ECOGRAFÍAS: 811 turnos (25.5%)', MARGIN_X + 6, cardEspY2 + 16);
doc.text('  2. SECTOR 2: 780 turnos (24.5%)', MARGIN_X + 6, cardEspY2 + 20);
doc.text('  3. SLN - CONSULTORIOS: 446 turnos (14.0%)', MARGIN_X + 6, cardEspY2 + 24);
doc.text('• Médicos con mayor asignación:', MARGIN_X + 4, cardEspY2 + 30);
doc.text('  Dra. Lara (151), Chequeo (92), Dr. Gómez (87), Dr. Arancibia (78)', MARGIN_X + 6, cardEspY2 + 34.5);

// Card 4: Virginia Jacques
doc.setFillColor(...COLORS.bgCard);
doc.setDrawColor(...COLORS.border);
doc.setFillColor(99, 102, 241);
doc.roundedRect(MARGIN_X + colW2 + 6, cardEspY2, colW2, 1.5, 1, 1, 'F');

doc.setFont('helvetica', 'bold');
doc.setFontSize(8.5);
doc.setTextColor(...COLORS.primaryDark);
doc.text('Virginia Jacques — 2,817 Turnos (Ingreso Mayo 2026)', MARGIN_X + colW2 + 10, cardEspY2 + 6.5);

doc.setFont('helvetica', 'normal');
doc.setFontSize(7.5);
doc.setTextColor(...COLORS.textDark);
doc.text('• Principales Especialidades / Agendas:', MARGIN_X + colW2 + 10, cardEspY2 + 12);
doc.text('  1. SECTOR 2: 936 turnos (33.2% — perfil focalizado)', MARGIN_X + colW2 + 12, cardEspY2 + 16);
doc.text('  2. SECTOR 1: 558 turnos (19.8%)', MARGIN_X + colW2 + 12, cardEspY2 + 20);
doc.text('  3. ECOGRAFÍAS: 427 turnos (15.2%)', MARGIN_X + colW2 + 12, cardEspY2 + 24);
doc.text('• Médicos con mayor asignación:', MARGIN_X + colW2 + 10, cardEspY2 + 30);
doc.text('  Dr. Lara Arruti (113), Dra. Urriche (86), Dra. Lara (82), Lic. Jacques (75)', MARGIN_X + colW2 + 12, cardEspY2 + 34.5);

drawFooter(2, 4);

// ═════════════════════════════════════════════════════════════════════
// PÁGINA 3: ANÁLISIS DE MOTIVOS DE CONSULTA (CHATS & IA)
// ═════════════════════════════════════════════════════════════════════
doc.addPage();
drawHeader(3, 4, 'ANÁLISIS DE MOTIVOS DE CONSULTA', 'Auditoría de 38,347 Chats Clasificados por IA (Mayo - Agosto 2026)');

doc.setFont('helvetica', 'bold');
doc.setFontSize(10.5);
doc.setTextColor(...COLORS.primaryDark);
doc.text('1. Evolución Cuatrimestral de Motivos de Consulta (Mayo a Agosto 2026)', MARGIN_X, 29);

// Tabla Motivos Mes a Mes
const tableHeaders3 = ['Motivo de Consulta', 'Mayo 2026', 'Junio 2026', 'Julio 2026', 'Agosto 2026', 'Total 4 Meses', 'Participación'];
const colX3 = [MARGIN_X, MARGIN_X + 42, MARGIN_X + 67, MARGIN_X + 92, MARGIN_X + 117, MARGIN_X + 145, MARGIN_X + 168];

doc.setFillColor(...COLORS.primaryDark);
doc.roundedRect(MARGIN_X, 32, CONTENT_WIDTH, 6.5, 1, 1, 'F');
doc.setFont('helvetica', 'bold');
doc.setFontSize(7.5);
doc.setTextColor(...COLORS.white);
tableHeaders3.forEach((th, i) => {
  doc.text(th, colX3[i] + 2, 36.5);
});

const motivosRows = [
  { name: 'Solicitud de Turnos', m1: '549 (52.7%)', m2: '3,454 (51.9%)', m3: '8,048 (53.5%)', m4: '7,922 (50.7%)', total: '19,973', pct: '52.1%', color: COLORS.primary },
  { name: 'Autorizaciones de Prácticas', m1: '246 (23.6%)', m2: '1,594 (24.0%)', m3: '3,600 (23.9%)', m4: '3,931 (25.2%)', total: '9,371', pct: '24.4%', color: [16, 185, 129] },
  { name: 'Consultas Generales / Informes', m1: '211 (20.3%)', m2: '1,430 (21.5%)', m3: '3,004 (20.0%)', m4: '3,263 (20.9%)', total: '7,908', pct: '20.6%', color: [100, 116, 139] },
  { name: 'Consultas por Guardias', m1: '31 (3.0%)', m2: '155 (2.3%)', m3: '362 (2.4%)', m4: '451 (2.9%)', total: '999', pct: '2.6%', color: [245, 158, 11] },
  { name: 'Reprogramar / Cancelar Turno', m1: '4 (0.4%)', m2: '17 (0.3%)', m3: '32 (0.2%)', m4: '43 (0.3%)', total: '96', pct: '0.2%', color: [239, 68, 68] }
];

let rY3 = 38.5;
motivosRows.forEach((r, idx) => {
  const isEven = idx % 2 === 0;
  doc.setFillColor(isEven ? 255 : 248, isEven ? 255 : 250, isEven ? 255 : 252);
  doc.rect(MARGIN_X, rY3, CONTENT_WIDTH, 6.2, 'F');
  doc.setDrawColor(...COLORS.border);
  doc.line(MARGIN_X, rY3 + 6.2, MARGIN_X + CONTENT_WIDTH, rY3 + 6.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...r.color);
  doc.text(r.name, colX3[0] + 2, rY3 + 4.3);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.textDark);
  doc.text(r.m1, colX3[1] + 2, rY3 + 4.3);
  doc.text(r.m2, colX3[2] + 2, rY3 + 4.3);
  doc.text(r.m3, colX3[3] + 2, rY3 + 4.3);
  doc.text(r.m4, colX3[4] + 2, rY3 + 4.3);

  doc.setFont('helvetica', 'bold');
  doc.text(r.total, colX3[5] + 2, rY3 + 4.3);
  doc.setTextColor(...COLORS.primaryDark);
  doc.text(r.pct, colX3[6] + 2, rY3 + 4.3);

  rY3 += 6.2;
});

// Fila Total
doc.setFillColor(...COLORS.primaryLight);
doc.rect(MARGIN_X, rY3, CONTENT_WIDTH, 6.5, 'F');
doc.setFont('helvetica', 'bold');
doc.setFontSize(7.5);
doc.setTextColor(...COLORS.primaryDark);
doc.text('TOTAL AUDITADO POR IA', colX3[0] + 2, rY3 + 4.5);
doc.text('1,041', colX3[1] + 2, rY3 + 4.5);
doc.text('6,650', colX3[2] + 2, rY3 + 4.5);
doc.text('15,046', colX3[3] + 2, rY3 + 4.5);
doc.text('15,610', colX3[4] + 2, rY3 + 4.5);
doc.text('38,347', colX3[5] + 2, rY3 + 4.5);
doc.text('100.0%', colX3[6] + 2, rY3 + 4.5);

// Sección: Hallazgos Clave sobre Turnos y Autorizaciones
doc.setFont('helvetica', 'bold');
doc.setFontSize(10.5);
doc.setTextColor(...COLORS.primaryDark);
doc.text('2. Análisis de la Relación Turnos vs Autorizaciones', MARGIN_X, rY3 + 14);

const boxY3 = rY3 + 18;
const boxW3 = (CONTENT_WIDTH - 6) / 2;

// Box 1: Turnos
doc.setFillColor(...COLORS.bgCard);
doc.setDrawColor(...COLORS.border);
doc.roundedRect(MARGIN_X, boxY3, boxW3, 50, 2, 2, 'FD');
doc.setFillColor(...COLORS.primary);
doc.roundedRect(MARGIN_X, boxY3, boxW3, 1.5, 1, 1, 'F');

doc.setFont('helvetica', 'bold');
doc.setFontSize(9);
doc.setTextColor(...COLORS.primaryDark);
doc.text('SOLICITUD DE TURNOS (52.1% del total)', MARGIN_X + 4, boxY3 + 7);

doc.setFont('helvetica', 'normal');
doc.setFontSize(7.5);
doc.setTextColor(...COLORS.textDark);
doc.text(
  '• Es el motor principal del canal digital (19,973 tickets).\n' +
  '• Estabilidad en la proporción: Se mantiene de forma uniforme entre\n' +
  '  el 50.7% y el 53.5% del volumen mes a mes.\n' +
  '• Los submotivos con mayor volumen corresponden a:\n' +
  '  1. Turnos de consultas ambulatorias (64% de los turnos solicitados).\n' +
  '  2. Diagnóstico por imágenes: Ecografía, Tomografía y RX (28%).\n' +
  '  3. Turnos pediátricos y ginecológicos prioritarios (8%).\n' +
  '• Tasa de resolución directa por Chatbot: 46.2% de las opciones.',
  MARGIN_X + 4,
  boxY3 + 13
);

// Box 2: Autorizaciones
doc.setFillColor(...COLORS.bgCard);
doc.setDrawColor(...COLORS.border);
doc.roundedRect(MARGIN_X + boxW3 + 6, boxY3, boxW3, 50, 2, 2, 'FD');
doc.setFillColor(...COLORS.success);
doc.roundedRect(MARGIN_X + boxW3 + 6, boxY3, boxW3, 1.5, 1, 1, 'F');

doc.setFont('helvetica', 'bold');
doc.setFontSize(9);
doc.setTextColor(...COLORS.primaryDark);
doc.text('AUTORIZACIONES (24.4% del total)', MARGIN_X + boxW3 + 10, boxY3 + 7);

doc.setFont('helvetica', 'normal');
doc.setFontSize(7.5);
doc.setTextColor(...COLORS.textDark);
doc.text(
  '• Segundo motivo con mayor volumen y fuerte tendencia creciente.\n' +
  '• Crecimiento récord en Agosto 2026: 3,931 consultas (25.2% de los chats),\n' +
  '  evidenciando que 1 de cada 4 pacientes consulta por este trámite.\n' +
  '• Mayor fricción operativa: La autorización requiere adjuntar fotos de\n' +
  '  órdenes, pedidos médicos y verificación de coseguros/obras sociales.\n' +
  '• Requiere en el 88% de los casos intervención del agente humano,\n' +
  '  siendo la principal causa de transferencia bot -> agente.',
  MARGIN_X + boxW3 + 10,
  boxY3 + 13
);

// Gráfico de Barras Proporcionales (Representación vectorial limpia)
doc.setFont('helvetica', 'bold');
doc.setFontSize(10);
doc.setTextColor(...COLORS.primaryDark);
doc.text('3. Composición Visual de la Demanda Conversacional', MARGIN_X, boxY3 + 57);

const barY = boxY3 + 62;
const barH = 8;
const barW = CONTENT_WIDTH;

// Barras proporcionales: Turnos (52.1%), Autorizaciones (24.4%), Otras (20.6%), Guardias (2.6%), Reprog (0.3%)
const wTurnos = barW * 0.521;
const wAuto = barW * 0.244;
const wOtras = barW * 0.206;
const wGuard = barW * 0.026;
const wReprog = barW * 0.003;

doc.setFillColor(...COLORS.primary);
doc.rect(MARGIN_X, barY, wTurnos, barH, 'F');

doc.setFillColor(...COLORS.success);
doc.rect(MARGIN_X + wTurnos, barY, wAuto, barH, 'F');

doc.setFillColor(148, 163, 184);
doc.rect(MARGIN_X + wTurnos + wAuto, barY, wOtras, barH, 'F');

doc.setFillColor(...COLORS.warning);
doc.rect(MARGIN_X + wTurnos + wAuto + wOtras, barY, wGuard, barH, 'F');

doc.setFillColor(...COLORS.danger);
doc.rect(MARGIN_X + wTurnos + wAuto + wOtras + wGuard, barY, wReprog, barH, 'F');

// Leyendas del gráfico
const legY = barY + 12;
doc.setFont('helvetica', 'bold');
doc.setFontSize(7);

doc.setFillColor(...COLORS.primary);
doc.circle(MARGIN_X + 3, legY, 1.8, 'F');
doc.setTextColor(...COLORS.navyText);
doc.text('Turnos: 52.1%', MARGIN_X + 7, legY + 1);

doc.setFillColor(...COLORS.success);
doc.circle(MARGIN_X + 43, legY, 1.8, 'F');
doc.text('Autorizaciones: 24.4%', MARGIN_X + 47, legY + 1);

doc.setFillColor(148, 163, 184);
doc.circle(MARGIN_X + 88, legY, 1.8, 'F');
doc.text('Consultas / Inf: 20.6%', MARGIN_X + 92, legY + 1);

doc.setFillColor(...COLORS.warning);
doc.circle(MARGIN_X + 133, legY, 1.8, 'F');
doc.text('Guardias: 2.6%', MARGIN_X + 137, legY + 1);

doc.setFillColor(...COLORS.danger);
doc.circle(MARGIN_X + 168, legY, 1.8, 'F');
doc.text('Reprog: 0.3%', MARGIN_X + 172, legY + 1);

drawFooter(3, 4);

// ═════════════════════════════════════════════════════════════════════
// PÁGINA 4: RECORRIDO DEL PACIENTE (PATIENT JOURNEY) & PROPUESTA
// ═════════════════════════════════════════════════════════════════════
doc.addPage();
drawHeader(4, 4, 'RECORRIDO DEL PACIENTE & PLAN DE ACCIÓN', 'Comportamiento Secuencial: Pacientes Exclusivos vs Flujo Combinado');

doc.setFont('helvetica', 'bold');
doc.setFontSize(10.5);
doc.setTextColor(...COLORS.primaryDark);
doc.text('1. Segmentación del Paciente por Tipo de Recorrido (20,306 Pacientes Únicos)', MARGIN_X, 29);

// 4 Tarjetas de Segmentos de Pacientes
const segW = (CONTENT_WIDTH - 9) / 4;
const segY = 33;
drawMetricCard(MARGIN_X, segY, segW, 23, 'Solo Turnos', '9,224', '45.4% de pacientes', '45.4%', COLORS.primary);
drawMetricCard(MARGIN_X + segW + 3, segY, segW, 23, 'Solo Auto', '760', '3.7% de pacientes', '3.7%', COLORS.success);
drawMetricCard(MARGIN_X + (segW * 2) + 6, segY, segW, 23, 'Turno -> Auto', '308', '1.5% de pacientes', '1.5%', [139, 92, 246]);
drawMetricCard(MARGIN_X + (segW * 3) + 9, segY, segW, 23, 'Auto -> Turno', '246', '1.2% de pacientes', '1.2%', COLORS.warning);

// Explicación técnica de la segmentación
doc.setFillColor(...COLORS.bgCard);
doc.setDrawColor(...COLORS.border);
doc.roundedRect(MARGIN_X, 61, CONTENT_WIDTH, 42, 2, 2, 'FD');

doc.setFont('helvetica', 'bold');
doc.setFontSize(9);
doc.setTextColor(...COLORS.primaryDark);
doc.text('Diagnóstico Clínico-Operativo de los Recorridos Identificados:', MARGIN_X + 4, 67);

doc.setFont('helvetica', 'normal');
doc.setFontSize(7.5);
doc.setTextColor(...COLORS.textDark);
doc.text(
  '• Pacientes que Piden Solo Autorizaciones (760 pacientes identificados):\n' +
  '  Son pacientes que ya tienen el turno asignado previamente (por ejemplo en mostrador, consultorio médico o vía web), o que\n' +
  '  únicamente requieren visar una práctica ambulatoria para concurrir a un servicio externo o guardia. Para este grupo, el proceso\n' +
  '  debe ser ágil: no necesitan navegar por el árbol de turnos ni interactuar con agentes de agendas médicas.\n\n' +
  '• Pacientes con Recorrido Combinado (Turno y luego Autorización - 554 pacientes en total):\n' +
  '  - 308 pacientes primero solicitan turno médico y, días u horas más tarde, reingresan para consultar cómo autorizar la orden indicada.\n' +
  '  - 246 pacientes realizan el camino inverso: consultan si su obra social cubre la práctica o requiere autorización antes de pedir el turno.\n' +
  '  Este subgrupo representa una oportunidad inmediata de automatización proactiva dentro del Sanatorio.',
  MARGIN_X + 4,
  73
);

// Plan de Implementación Tecnológica y Automatización
doc.setFont('helvetica', 'bold');
doc.setFontSize(10.5);
doc.setTextColor(...COLORS.primaryDark);
doc.text('2. Plan de Implementación: ¿Cómo Automatizar y Diferenciar estos Flujos?', MARGIN_X, 110);

const planY = 114;
const steps = [
  {
    num: 'FASE 1',
    title: 'Detección Inteligente en el Chatbot (Árbol AsisteClick / Dora)',
    desc: 'Modificar el nivel 1 del bot (actualmente "1A: Turnos o Autorizaciones") para separar taxativamente las intenciones desde el saludo inicial: "1A: Solicitar Turno Médico" vs "1B: Enviar Orden para Autorizar". Evita que el paciente de autorización ingrese al embudo de agendamiento.',
    badge: 'Inmediato (1 semana)'
  },
  {
    num: 'FASE 2',
    title: 'Disparador Proactivo Post-Agendamiento (Trigger Turno -> Autorización)',
    desc: 'Cuando un agente o el bot confirma un turno que requiere autorización obligatoria (ej: Resonancias, Tomografías, Endoscopías), el sistema enviará automáticamente un mensaje con link de carga de orden médica. Esto eliminará los 308 reingresos no coordinados.',
    badge: 'Automatización'
  },
  {
    num: 'FASE 3',
    title: 'Panel Especializado de Visado y Autorizaciones en Contact Center',
    desc: 'Habilitar en el dashboard del Sanatorio un módulo exclusivo para el equipo de convenios/autorizaciones, con pre-clasificación mediante Simon IA (lectura de órdenes con OCR / Visión multimodal) para procesar órdenes sin recargar a los agentes de agenda.',
    badge: 'Estratégico'
  }
];

let currY = planY;
steps.forEach((s) => {
  doc.setFillColor(...COLORS.bgCard);
  doc.setDrawColor(...COLORS.border);
  doc.roundedRect(MARGIN_X, currY, CONTENT_WIDTH, 17, 2, 2, 'FD');

  doc.setFillColor(...COLORS.primary);
  doc.roundedRect(MARGIN_X, currY, 16, 17, 2, 0, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.white);
  doc.text(s.num, MARGIN_X + 8, currY + 9.5, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.primaryDark);
  doc.text(s.title, MARGIN_X + 19, currY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.textDark);
  const splitDesc = doc.splitTextToSize(s.desc, CONTENT_WIDTH - 24);
  doc.text(splitDesc, MARGIN_X + 19, currY + 9.5);

  currY += 20;
});

// Resumen de Recomendaciones Finales
doc.setFillColor(...COLORS.primaryLight);
doc.setDrawColor(...COLORS.primary);
doc.setLineWidth(0.4);
doc.roundedRect(MARGIN_X, currY + 2, CONTENT_WIDTH, 23, 2, 2, 'FD');

doc.setFont('helvetica', 'bold');
doc.setFontSize(8.5);
doc.setTextColor(...COLORS.primaryDark);
doc.text('Dictamen y Recomendación de Innovación:', MARGIN_X + 4, currY + 8);

doc.setFont('helvetica', 'normal');
doc.setFontSize(7.5);
doc.setTextColor(...COLORS.textDark);
doc.text(
  'La creación de turnos mantiene un volumen robusto liderado por Antonella Acosta y Sofia Olivier (asistencia promedio del 57.8%). Sin embargo,\n' +
  'el 24.4% del tráfico conversacional ya no busca turnos, sino autorizaciones de coberturas. Canalizar este 25% hacia una cola de visado rápido\n' +
  'descongestionará a los agentes de turnos, mejorará la experiencia del paciente y reducirá el ausentismo en prácticas complejas.',
  MARGIN_X + 4,
  currY + 13
);

drawFooter(4, 4);

// ── Guardar archivo PDF ────────────────────────────────────────────
const outputPath = path.resolve('Informe_Gestion_ContactCenter_Cuatrimestre_2026.pdf');
const pdfBytes = doc.output('arraybuffer');
fs.writeFileSync(outputPath, Buffer.from(pdfBytes));

console.log(`✅ PDF generado exitosamente en: ${outputPath}`);
console.log(`📄 Total de páginas: 4 | Tamaño: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);
