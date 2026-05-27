/**
 * Upload: visitas para estasticas totales.xlsx → salus_visitas_canales
 * 
 * Usa fetch directo al endpoint RPC de Supabase (bypassa bug del SDK con schema cache).
 * 
 * Uso:
 *   node upload_visitas_canales.mjs
 */
import fs from 'fs';
import xlsx from 'xlsx';

// ── Leer .env ──────────────────────────────────────────────────
const envFile = fs.readFileSync('.env', 'utf-8');
const env = Object.fromEntries(
  envFile.split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const eqIdx = line.indexOf('=');
      return [line.substring(0, eqIdx).trim(), line.substring(eqIdx + 1).trim()];
    })
);

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env");
  process.exit(1);
}

// ── Helpers ────────────────────────────────────────────────────

function clean(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'string' && v.trim().toUpperCase() === 'NULL') return null;
  return typeof v === 'string' ? v.trim() : v;
}

function parseDate(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    const d = new Date(value);
    if (!isNaN(d)) return d.toISOString().split('T')[0];
    return null;
  }
  if (typeof value === 'number') {
    const d = new Date((value - 25569) * 86400 * 1000);
    return d.toISOString().split('T')[0];
  }
  return null;
}

function parseTimestamp(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const d = new Date(value.replace(' ', 'T'));
    if (!isNaN(d)) return d.toISOString();
    return value;
  }
  if (typeof value === 'number') {
    const d = new Date((value - 25569) * 86400 * 1000);
    return d.toISOString();
  }
  return null;
}

function parseHora(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const match = value.match(/^(\d{1,2}):(\d{2})/);
    if (match) return `${match[1].padStart(2, '0')}:${match[2]}`;
    return value;
  }
  if (typeof value === 'number') {
    const totalMinutes = Math.round(value * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  return null;
}

function mapRow(row) {
  const idVisita = row['idVisita'];
  if (!idVisita) return null;

  return {
    id_visita: parseInt(idVisita),
    id_paciente: row['IdPaciente'] != null ? parseInt(row['IdPaciente']) : null,
    asistencia: clean(row['Asistencia']),
    paciente: clean(row['Paciente']),
    nif: row['NIF'] != null ? String(row['NIF']) : null,
    telefono: clean(row['telefono1']) != null ? String(clean(row['telefono1'])) : null,
    grupo_agenda: clean(row['Grupo Agenda']),
    cliente: clean(row['Cliente']),
    sexo: clean(row['Sexo']),
    edad: row['Edad'] != null ? (parseInt(row['Edad']) || null) : null,
    poblacion: clean(row['Poblacion']),
    responsable: clean(row['Responsable']),
    tipo_visita: clean(row['Tipo Visita']),
    fecha_visita: parseDate(row['Fecha Visita']),
    hora_inicio: parseHora(row['Hora Inicio Visita Formato Texto']),
    centro: clean(row['Centro']),
    fecha_hora_creacion: parseTimestamp(row['Fecha Hora Creacion']),
    usuario_creacion: clean(row['Usuario Creacion Nombre']),
    canal_creacion: clean(row['Canal Creacion']),
  };
}

// ── RPC via fetch (bypasses SDK schema cache bug) ──────────────

async function callRPC(batch) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/_bulk_insert_canales`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_data: batch }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errText}`);
  }

  return await response.json();
}

// ── Main ───────────────────────────────────────────────────────

const BATCH_SIZE = 500;
const FILE_NAME = 'visitas para estasticas totales.xlsx';

async function run() {
  console.log(`\n📂 Cargando archivo: ${FILE_NAME}`);
  console.log('   Leyendo Excel (15MB)...\n');

  const workbook = xlsx.readFile(FILE_NAME, { cellFormula: false, cellHTML: false });
  const sheetName = workbook.SheetNames[0];
  const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { raw: false });

  console.log(`📊 Filas en Excel: ${rawData.length.toLocaleString('es-AR')}`);

  const EXCLUDED_GROUPS = new Set([
    'GUARDIAS', 'GUARDIA CLINICA', 'QUIRÓFANOS CENTRALES', 'RADIOLOGIA', 
    'FERTILIDAD', 'LABORATORIO', 'VACUNATORIO', 'CITOLOGIA', 
    'HEMODINAMIA', 'CONTROL NEONATAL', 'QUIRÓFANOS HDD', 'CURACIONES', 'FUNDACION'
  ]);
  const mapped = rawData.map(mapRow).filter(r => {
    if (!r) return false;
    const ga = r.grupo_agenda ? r.grupo_agenda.toUpperCase().trim() : '';
    if (EXCLUDED_GROUPS.has(ga)) return false;
    return true;
  });
  console.log(`✅ Filas válidas (excluyendo Guardias y Agendas en verde): ${mapped.length.toLocaleString('es-AR')}`);

  // Distribución de canales
  const canalDist = {};
  mapped.forEach(r => {
    const c = r.canal_creacion || '(null)';
    canalDist[c] = (canalDist[c] || 0) + 1;
  });
  console.log('\n📡 Distribución por Canal:');
  Object.entries(canalDist).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`   ${k}: ${v.toLocaleString('es-AR')} (${(v / mapped.length * 100).toFixed(1)}%)`);
  });

  // Test connection
  console.log('\n🔧 Verificando conexión...');
  try {
    await callRPC([mapped[0]]);
    console.log('✅ Conexión OK — primer registro insertado.\n');
  } catch (err) {
    console.error('❌ Error de conexión:', err.message);
    process.exit(1);
  }

  // Upload en batches
  let totalInserted = 0;
  let totalErrors = 0;
  const totalBatches = Math.ceil(mapped.length / BATCH_SIZE);
  const startTime = Date.now();

  for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
    const batch = mapped.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const pct = Math.round((i + batch.length) / mapped.length * 100);

    process.stdout.write(`\r⬆️  Lote ${batchNum}/${totalBatches} (${(i + batch.length).toLocaleString('es-AR')}/${mapped.length.toLocaleString('es-AR')}) — ${pct}%   `);

    try {
      await callRPC(batch);
      totalInserted += batch.length;
    } catch (err) {
      totalErrors += batch.length;
      console.error(`\n❌ Error en lote ${batchNum}: ${err.message}`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\n${'═'.repeat(50)}`);
  console.log(`✅ Completado en ${elapsed}s`);
  console.log(`   Insertados/Actualizados: ${totalInserted.toLocaleString('es-AR')}`);
  if (totalErrors > 0) {
    console.log(`   ❌ Con errores: ${totalErrors.toLocaleString('es-AR')}`);
  }
  console.log(`${'═'.repeat(50)}\n`);
}

run().catch(err => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
