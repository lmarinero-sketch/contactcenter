import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('salus_visitas')
    .select('fecha_hora_creacion')
    .in('usuario_creacion', ['OLIVIER ESQUIVEL, SOFIA FERNANDA', 'ACOSTA ESQUIVEL, MARIA ANTONELLA', 'AGUILERA CARDOZO, DANIELA ROMINA'])
    .gte('fecha_hora_creacion', '2025-06-01')
    .limit(10);
    
  console.log("Supabase data:");
  console.log(data);
}

check();
