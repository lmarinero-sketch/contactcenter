import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envFile = fs.readFileSync('.env', 'utf-8');
const env = Object.fromEntries(envFile.split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split('=').map(part => part.trim())));
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Fetching all from salus_visitas...");
  let allData = [];
  let from = 0;
  let to = 999;
  while (true) {
    const { data, error } = await supabase.from('salus_visitas').select('*').range(from, to);
    if (error) { console.error(error); break; }
    if (!data || data.length === 0) break;
    allData = allData.concat(data);
    from += 1000;
    to += 1000;
  }
  console.log("Fetched", allData.length, "rows");

  let existingIdsData = [];
  from = 0;
  to = 999;
  while(true) {
     const { data, error } = await supabase.from('salus_visitas_historico').select('id_visita').range(from, to);
     if (error) { console.error(error); break; }
     if (!data || data.length === 0) break;
     existingIdsData = existingIdsData.concat(data);
     from += 1000;
     to += 1000;
  }
  const existingIds = new Set(existingIdsData.map(d => d.id_visita));

  const toInsert = allData
    .filter(row => !existingIds.has(row.id_visita))
    .map(row => ({
      id_visita: row.id_visita,
      id_paciente: row.id_paciente,
      asistencia: row.asistencia,
      paciente: row.paciente,
      nif: row.nif,
      grupo_agenda: row.grupo_agenda,
      cliente: row.cliente,
      sexo: row.sexo,
      edad: row.edad,
      poblacion: row.poblacion,
      responsable: row.responsable,
      tipo_visita: row.tipo_visita,
      fecha_visita: row.fecha_visita,
      hora_inicio: row.hora_inicio,
      hora_fin: row.hora_fin,
      centro: row.centro,
      fecha_hora_creacion: row.fecha_hora_creacion,
      usuario_creacion: row.usuario_creacion
    }));

  console.log("To insert:", toInsert.length);

  for (let i = 0; i < toInsert.length; i += 1000) {
    const batch = toInsert.slice(i, i + 1000);
    const { error } = await supabase.from('salus_visitas_historico').insert(batch);
    if (error) console.error("Batch error:", error.message);
    else console.log("Inserted batch", i, "to", i + batch.length);
  }
  console.log("Done");
}
run();
