import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const envContent = readFileSync('.env', 'utf-8')
const env = Object.fromEntries(envContent.split('\n').filter(l => l.includes('=')).map(l => { const [k,...v] = l.split('='); return [k.trim(), v.join('=').trim()] }))

const supabaseHub = createClient(env.VITE_HUB_SUPABASE_URL, env.VITE_HUB_SUPABASE_ANON_KEY)
const supabase = createClient(env.VITE_SUPABASE_URL,
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0am1ja2Jyb2ZldmdmcWJremxpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDcxNDExOCwiZXhwIjoyMDg2MjkwMTE4fQ.mths9S8UlKJOlyylkiTVMxnzjauY_tBdKEZDR7xsXMk'
)

const AGENT_MAP = {
    'Sofia': '%OLIVIER%SOFIA%',
    'Antonella': '%ESQUIVEL%ANTONELL%',
    'Daniela': '%AGUILERA%DANIELA%',
}

console.log('=== 1. FICHADA LOOKUP ===')
for (const [ccName, pattern] of Object.entries(AGENT_MAP)) {
    const { data, error } = await supabaseHub
        .from('fichadas_colaboradores')
        .select('id, nombre_completo')
        .ilike('nombre_completo', pattern)
        .limit(1)
        .maybeSingle()
    
    console.log(`  ${ccName}: ${data ? `FOUND → id=${data.id}, name="${data.nombre_completo}"` : `NOT FOUND (error: ${error?.message})`}`)
}

console.log('\n=== 2. TODAY FICHADAS (2026-04-10) ===')
const today = '2026-04-10'

// Get all colaboradores first
const colabIds = {}
for (const [ccName, pattern] of Object.entries(AGENT_MAP)) {
    const { data } = await supabaseHub
        .from('fichadas_colaboradores')
        .select('id, nombre_completo')
        .ilike('nombre_completo', pattern)
        .limit(1)
        .maybeSingle()
    if (data) colabIds[data.id] = ccName
}

const ids = Object.keys(colabIds)
if (ids.length > 0) {
    const { data: registros, error } = await supabaseHub
        .from('fichadas_registros')
        .select('*')
        .in('colaborador_id', ids)
        .eq('fecha', today)
    
    console.log(`  Found ${registros?.length || 0} fichadas for today`)
    registros?.forEach(r => {
        const name = colabIds[r.colaborador_id]
        console.log(`  ${name}: entrada=${r.fichada_entrada || 'N/A'} salida=${r.fichada_salida || 'N/A'} tarde=${r.tarde}`)
    })
    if (error) console.log(`  Error: ${error.message}`)
} else {
    console.log('  No colaboradores found!')
}

// 3. Quick check: how many OUT messages does each agent actually have today?
console.log('\n=== 3. MESSAGES AFTER FICHADA TIMES ===')
const dayStart = `${today}T00:00:00.000Z`
const dayEnd = `${today}T23:59:59.999Z`

// Fetch ALL out messages (paginated)
let allOut = []
let offset = 0
while (true) {
    const { data } = await supabase
        .from('cc_messages')
        .select('ticket_id, message_timestamp, message, action')
        .eq('action', 'OUT')
        .gte('message_timestamp', dayStart)
        .lte('message_timestamp', dayEnd)
        .range(offset, offset + 999)
    allOut = allOut.concat(data || [])
    if (!data || data.length < 1000) break
    offset += 1000
}
console.log(`  Total OUT messages today: ${allOut.length}`)

// Get ALL ticket agents
const tids = [...new Set(allOut.map(m => m.ticket_id))]
let allTickets = []
for (let i = 0; i < tids.length; i += 500) {
    const batch = tids.slice(i, i + 500)
    const { data } = await supabase
        .from('cc_tickets')
        .select('ticket_id, agent_name, transferred_to_agent')
        .in('ticket_id', batch)
    allTickets = allTickets.concat(data || [])
}
const tmap = {}
allTickets.forEach(t => { tmap[t.ticket_id] = t })

// Count per agent
const agentCounts = {}
allOut.forEach(m => {
    const agent = tmap[m.ticket_id]?.agent_name
    if (agent) {
        if (!agentCounts[agent]) agentCounts[agent] = 0
        agentCounts[agent]++
    }
})
console.log('  Messages per agent (ALL, unfiltered):')
Object.entries(agentCounts).sort((a,b) => b[1]-a[1]).forEach(([name, count]) => {
    console.log(`    ${name}: ${count}`)
})
