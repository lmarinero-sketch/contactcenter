import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.rpc('bi_visitas_dashboard_data', {
    start_date: null,
    end_date: null
  });
  if (error) console.error(error);
  
  // Just print the heatmap hours that have data
  const heatmap = data.heatmap.filter(d => d.cantidad > 0);
  console.log('Heatmap Data Samples:', heatmap.slice(0, 10));
}

test();
