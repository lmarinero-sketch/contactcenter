import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Faltan variables VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el environment");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
});

async function main() {
  console.log("Limpiando base de datos (borrando todos los registros)...");
  // Delete all records to start fresh
  const { error } = await supabase.from('salus_visitas').delete().neq('id_visita', -9999999);
  if (error) {
    console.error("Error al borrar registros:", error);
    process.exit(1);
  }
  console.log("Base de datos limpia.");

  console.log("Ejecutando script de subida...");
  try {
    execSync('node --no-warnings --experimental-modules bulk_upload_visitas.mjs', { stdio: 'inherit', env: process.env });
    console.log("¡Carga completada!");
  } catch (e) {
    console.error("Error en la carga:", e);
  }
}

main();
