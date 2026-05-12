/**
 * Diagnóstico: ¿Por qué el Excel no impacta en las métricas del BI?
 * Verifica: tabla, RPC, y comparación de resultados.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// Leer .env manualmente
const envContent = readFileSync('.env', 'utf-8')
const envVars = {}
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/)
  if (match) envVars[match[1].trim()] = match[2].trim()
})

const supabaseUrl = envVars.VITE_SUPABASE_URL
const supabaseKey = envVars.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
  console.log("═══════════════════════════════════════════")
  console.log("  DIAGNÓSTICO BI - Visitas")
  console.log("═══════════════════════════════════════════\n")

  // 1. Contar registros en la tabla directamente
  console.log("1️⃣  Conteo directo de la tabla salus_visitas_historico:")
  const { count: totalRows, error: e1 } = await supabase
    .from('salus_visitas_historico')
    .select('*', { count: 'exact', head: true })
  
  if (e1) {
    console.error("   ❌ Error consultando tabla:", e1.message)
    console.log("   💡 ¿La tabla existe? ¿Se ejecutó 010_salus_visitas.sql?")
  } else {
    console.log(`   ✅ Total registros en tabla: ${totalRows}`)
  }

  // 2. Verificar un sample de los últimos registros insertados
  console.log("\n2️⃣  Últimos 5 registros insertados (por created_at):")
  const { data: lastRows, error: e2 } = await supabase
    .from('salus_visitas_historico')
    .select('id_visita, paciente, asistencia, fecha_visita, fecha_hora_creacion, created_at')
    .order('created_at', { ascending: false })
    .limit(5)
  
  if (e2) {
    console.error("   ❌ Error:", e2.message)
  } else {
    lastRows?.forEach(r => {
      console.log(`   id=${r.id_visita}, paciente=${r.paciente?.substring(0,25)}, asist=${r.asistencia}, fecha_visita=${r.fecha_visita}, creacion=${r.fecha_hora_creacion}, created_at=${r.created_at}`)
    })
  }

  // 3. Contar por asistencia directamente
  console.log("\n3️⃣  Desglose por tipo de asistencia (directo de tabla):")
  const { data: asistData, error: e3 } = await supabase
    .from('salus_visitas_historico')
    .select('asistencia')
  
  if (e3) {
    console.error("   ❌ Error:", e3.message)
  } else {
    const counts = {}
    asistData?.forEach(r => {
      const key = r.asistencia || '(NULL)'
      counts[key] = (counts[key] || 0) + 1
    })
    Object.entries(counts).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => {
      console.log(`   ${k}: ${v}`)
    })
    console.log(`   TOTAL: ${asistData?.length}`)
  }

  // 4. Llamar al RPC y comparar
  console.log("\n4️⃣  Resultado del RPC bi_visitas_dashboard_data (sin filtros):")
  const { data: rpcData, error: e4 } = await supabase.rpc('bi_visitas_dashboard_data', {
    start_date: null,
    end_date: null
  })

  if (e4) {
    console.error("   ❌ Error en RPC:", e4.message)
    console.log("   💡 ¿Se ejecutó 012_bi_visitas_rpc.sql en el SQL Editor de Supabase?")
  } else if (rpcData) {
    const kpis = rpcData.kpis
    console.log(`   Total Turnos (RPC): ${kpis?.total_turnos}`)
    console.log(`   Asistidos (RPC):    ${kpis?.asistidos}`)
    console.log(`   Ausentes (RPC):     ${kpis?.ausentes}`)
    console.log(`   Aus. Just. (RPC):   ${kpis?.ausentes_justificados}`)
    
    // Comparación
    console.log("\n5️⃣  COMPARACIÓN:")
    if (totalRows !== null && kpis) {
      if (totalRows === kpis.total_turnos) {
        console.log(`   ✅ COINCIDEN: Tabla=${totalRows}, RPC=${kpis.total_turnos}`)
      } else {
        console.log(`   ⚠️  DISCREPANCIA: Tabla=${totalRows} vs RPC=${kpis.total_turnos}`)
        console.log(`   💡 El RPC podría estar usando una versión vieja de la función.`)
        console.log(`   💡 Ejecutá el script 012_bi_visitas_rpc.sql en el SQL Editor de Supabase.`)
      }
    }
  } else {
    console.log("   ⚠️  RPC devolvió null/undefined")
  }

  // 5. Verificar si hay registros con fecha_hora_creacion NULL (que no entrarían en la tendencia)
  console.log("\n6️⃣  Registros con fecha_hora_creacion NULL (no aparecen en heatmap/tendencia):")
  const { count: nullCreacion } = await supabase
    .from('salus_visitas_historico')
    .select('*', { count: 'exact', head: true })
    .is('fecha_hora_creacion', null)
  console.log(`   Registros sin fecha_hora_creacion: ${nullCreacion}`)

  console.log("\n═══════════════════════════════════════════")
  console.log("  FIN DIAGNÓSTICO")
  console.log("═══════════════════════════════════════════")
}

main().catch(console.error)
