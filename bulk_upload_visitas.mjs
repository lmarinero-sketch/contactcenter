import { createClient } from '@supabase/supabase-js';
import xlsx from 'xlsx';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Faltan variables VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el environment");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
});

async function run() {
  console.log("Cargando archivo Excel...");
  const workbook = xlsx.readFile('Visitas hasta 230425.xlsx', { cellFormula: false, cellHTML: false });
  const sheetName = workbook.SheetNames[0];
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { raw: false });
  console.log(`Total de filas a procesar: ${data.length}`);

  const batchSize = 1500;
  let totalInserted = 0;

  for (let i = 0; i < data.length; i += batchSize) {
    const chunk = data.slice(i, i + batchSize);
    
    let batch = [];
    for (const row of chunk) {
      batch.push({
        id_visita: parseInt(row['idVisita']) || null,
        id_paciente: parseInt(row['IdPaciente']) || null,
        asistencia: row['Asistencia'] || null,
        paciente: row['Paciente'] || null,
        nif: row['NIF'] || null,
        // telefono: row['telefono1'] || null,
        // email: row['email'] || null,
        // comentarios: row['Comentarios'] === 'NULL' ? null : row['Comentarios'],
        grupo_agenda: row['Grupo Agenda'] || null,
        cliente: row['Cliente'] || null,
        sexo: row['Sexo'] || null,
        edad: parseInt(row['Edad']) || null,
        poblacion: row['Poblacion'] || null,
        responsable: row['Responsable'] || null,
        tipo_visita: row['Tipo Visita'] || null,
        fecha_visita: row['Fecha Visita'] ? new Date(row['Fecha Visita']).toISOString() : null,
        hora_inicio: row['Hora Inicio Visita Formato Texto'] || null,
        hora_fin: row['Hora Fin Visita Formato Texto'] || null,
        centro: row['Centro'] || null,
        fecha_hora_creacion: row['Fecha Hora Creacion'] ? new Date(row['Fecha Hora Creacion']).toISOString() : null,
        usuario_creacion: row['Usuario Creacion Nombre'] || null
      });
    }

    console.log(`Subiendo lote de ${chunk.length} registros... (Progreso: ${Math.min(i + batchSize, data.length)}/${data.length})`);
    const { error } = await supabase
      .from('salus_visitas')
      .upsert(batch, { onConflict: 'id_visita', ignoreDuplicates: false });
      
    if (error) {
      console.error("❌ Error insertando lote:", error.message);
    } else {
      totalInserted += chunk.length;
    }
  }
  
  console.log(`\n✅ Proceso completado. Registros procesados (upsert): ${totalInserted}/${data.length}`);
}

run().catch(console.error);
