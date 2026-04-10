import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const envContent = readFileSync('.env', 'utf-8')
const env = Object.fromEntries(envContent.split('\n').filter(l => l.includes('=')).map(l => { const [k,...v] = l.split('='); return [k.trim(), v.join('=').trim()] }))


const supabase = createClient(
    env.VITE_SUPABASE_URL,
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0am1ja2Jyb2ZldmdmcWJremxpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDcxNDExOCwiZXhwIjoyMDg2MjkwMTE4fQ.mths9S8UlKJOlyylkiTVMxnzjauY_tBdKEZDR7xsXMk'
)

const today = '2026-04-10'
const dayStart = `${today}T00:00:00.000Z`
const dayEnd = `${today}T23:59:59.999Z`

// 1. Get today's OUT messages
const { data: outMsgs } = await supabase
    .from('cc_messages')
    .select('ticket_id, action, message, message_timestamp, sender_name')
    .eq('action', 'OUT')
    .gte('message_timestamp', dayStart)
    .lte('message_timestamp', dayEnd)
    .order('message_timestamp')

console.log(`Total OUT messages today: ${outMsgs.length}`)

// 2. Get ticket agents
const ticketIds = [...new Set(outMsgs.map(m => m.ticket_id))]
const { data: tickets } = await supabase
    .from('cc_tickets')
    .select('ticket_id, agent_name, transferred_to_agent')
    .in('ticket_id', ticketIds)

const ticketMap = {}
tickets.forEach(t => { ticketMap[t.ticket_id] = t })

// 3. Check Sofia's tickets specifically
const sofiaTickets = tickets.filter(t => t.agent_name === 'Sofia')
console.log(`\n=== SOFIA (on vacation) ===`)
console.log(`Tickets with agent_name='Sofia': ${sofiaTickets.length}`)
console.log(`Transferred: ${sofiaTickets.filter(t => t.transferred_to_agent).length}`)

// Show first 3 Sofia ticket messages
for (const t of sofiaTickets.slice(0, 3)) {
    const ticketMsgs = outMsgs.filter(m => m.ticket_id === t.ticket_id)
    console.log(`\n  Ticket ${t.ticket_id}: ${ticketMsgs.length} OUT msgs`)
    ticketMsgs.forEach((m, i) => {
        const prevTs = i > 0 ? new Date(ticketMsgs[i-1].message_timestamp).getTime() : null
        const currTs = new Date(m.message_timestamp).getTime()
        const gap = prevTs ? ((currTs - prevTs) / 1000).toFixed(0) : '-'
        const short = (m.message || '').substring(0, 80)
        console.log(`    [${i}] gap=${gap}s | ${m.message_timestamp.substring(11,19)} | ${short}`)
    })
}

// 4. Check Daniela + Antonella first messages
console.log(`\n=== DANIELA (should start ~09:00) ===`)
const danielaMsgs = outMsgs.filter(m => ticketMap[m.ticket_id]?.agent_name === 'Daniela')
console.log(`Total OUT msgs in Daniela tickets: ${danielaMsgs.length}`)
const first5 = danielaMsgs.slice(0, 10)
for (const m of first5) {
    const short = (m.message || '').substring(0, 80)
    console.log(`  ${m.message_timestamp.substring(11,19)} | ticket=${m.ticket_id} | ${short}`)
}

console.log(`\n=== ANTONELLA (should start ~13:20) ===`)
const antMsgs = outMsgs.filter(m => ticketMap[m.ticket_id]?.agent_name === 'Antonella')
console.log(`Total OUT msgs in Antonella tickets: ${antMsgs.length}`)
const first5a = antMsgs.slice(0, 10)
for (const m of first5a) {
    const short = (m.message || '').substring(0, 80)
    console.log(`  ${m.message_timestamp.substring(11,19)} | ticket=${m.ticket_id} | ${short}`)
}

// 5. Check how many tickets have the handoff phrase
let handoffCount = 0
for (const tid of ticketIds.slice(0, 200)) {
    const { data: allTicketMsgs } = await supabase
        .from('cc_messages')
        .select('message')
        .eq('ticket_id', tid)
        .eq('action', 'OUT')
    
    const hasHandoff = allTicketMsgs?.some(m => 
        m.message?.toLowerCase().includes('en breve un operador')
    )
    if (hasHandoff) handoffCount++
}
console.log(`\n=== HANDOFF PHRASE CHECK ===`)
console.log(`Tickets checked: ${Math.min(ticketIds.length, 200)}`)
console.log(`Tickets with "en breve un operador": ${handoffCount}`)
