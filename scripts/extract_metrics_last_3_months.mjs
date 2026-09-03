import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envContent = readFileSync('.env', 'utf-8');
const env = Object.fromEntries(
  envContent
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const [k, ...v] = l.split('=');
      return [k.trim(), v.join('=').trim()];
    })
);

const supabase = createClient(
  env.VITE_SUPABASE_URL,
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0am1ja2Jyb2ZldmdmcWJremxpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDcxNDExOCwiZXhwIjoyMDg2MjkwMTE4fQ.mths9S8UlKJOlyylkiTVMxnzjauY_tBdKEZDR7xsXMk'
);
const supabaseHub = createClient(env.VITE_HUB_SUPABASE_URL, env.VITE_HUB_SUPABASE_ANON_KEY);

const AGENT_KEYS = {
  Sofia: {
    cc_names: ['Sofia', 'Sofia Olivier'],
    salus_names: ['OLIVIER ESQUIVEL, SOFIA FERNANDA', 'OLIVIER SOFIA', 'SOFIA OLIVIER'],
    hub_pattern: '%OLIVIER%SOFIA%',
  },
  Antonella: {
    cc_names: ['Antonella', 'Antonella Acosta'],
    salus_names: ['ACOSTA ESQUIVEL, MARIA ANTONELLA', 'ACOSTA MARIA ANTONELLA', 'ANTONELLA ACOSTA'],
    hub_pattern: '%ACOSTA%ANTONELLA%',
  },
  Virginia: {
    cc_names: ['Virginia', 'Virginia Jacques'],
    salus_names: ['JACQUES SORIA, VIRGINIA', 'JACQUES VIRGINIA', 'VIRGINIA JACQUES'],
    hub_pattern: '%JACQUES%VIRGINIA%',
  },
  Daniela: {
    cc_names: ['Daniela', 'Daniela Aguilera'],
    salus_names: ['AGUILERA CARDOZO, DANIELA ROMINA', 'AGUILERA DANIELA', 'DANIELA AGUILERA'],
    hub_pattern: '%AGUILERA%DANIELA%',
  },
  Erica: {
    cc_names: ['Erica', 'Erica Esquivel'],
    salus_names: ['ESQUIVEL, ERICA', 'ESQUIVEL ERICA', 'ERICA ESQUIVEL'],
    hub_pattern: '%ESQUIVEL%ERICA%',
  },
};

const startIso = '2026-06-01T00:00:00.000Z';
const endIso = '2026-09-01T23:59:59.999Z';
const startDate = '2026-06-01';
const endDate = '2026-09-01';

async function fetchAll(queryFn) {
  let all = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const data = await queryFn(page * pageSize, (page + 1) * pageSize - 1);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < pageSize) break;
    page++;
  }
  return all;
}

async function main() {
  console.log('================================================================');
  console.log('📊 REPORTE DE MÉTRICAS — ÚLTIMOS 3 MESES (01/06/2026 - 01/09/2026)');
  console.log('================================================================\n');

  // 1. TICKETS
  console.log('⏳ 1. Descargando TODOS los tickets en el período...');
  const allTickets = await fetchAll(async (from, to) => {
    const { data } = await supabase
      .from('cc_tickets')
      .select('ticket_id, agent_name, status, chat_started_at, received_at')
      .gte('chat_started_at', startIso)
      .lte('chat_started_at', endIso)
      .range(from, to);
    return data;
  });
  console.log(`   Total tickets encontrados en el período: ${allTickets.length}`);

  const ticketStats = {};
  for (const [key, conf] of Object.entries(AGENT_KEYS)) {
    const matched = allTickets.filter(
      (t) =>
        t.agent_name &&
        conf.cc_names.map((n) => n.toLowerCase()).includes(t.agent_name.toLowerCase())
    );
    const closed = matched.filter((t) => t.status === 'CLOSED');
    ticketStats[key] = {
      total: matched.length,
      closed: closed.length,
      open: matched.length - closed.length,
    };
  }

  // 2. MENSAJES OUT
  console.log('⏳ 2. Descargando mensajes salientes (OUT)...');
  const allOutMessages = await fetchAll(async (from, to) => {
    const { data } = await supabase
      .from('cc_messages')
      .select('ticket_id, sender_name, message_timestamp, action')
      .eq('action', 'OUT')
      .gte('message_timestamp', startIso)
      .lte('message_timestamp', endIso)
      .range(from, to);
    return data;
  });
  console.log(`   Total mensajes OUT encontrados: ${allOutMessages.length}`);

  const msgStats = {};
  for (const [key, conf] of Object.entries(AGENT_KEYS)) {
    const matched = allOutMessages.filter(
      (m) =>
        m.sender_name &&
        conf.cc_names.map((n) => n.toLowerCase()).includes(m.sender_name.toLowerCase())
    );
    msgStats[key] = matched.length;
  }

  // 3. SALUS VISITAS HISTORICO
  console.log('⏳ 3. Descargando histórico completo de Salus...');
  const allSalusAllTime = await fetchAll(async (from, to) => {
    const { data } = await supabase
      .from('salus_visitas_historico')
      .select('usuario_creacion, asistencia, fecha_visita, fecha_hora_creacion')
      .range(from, to);
    return data;
  });
  console.log(`   Total registros históricos Salus: ${allSalusAllTime.length}`);

  // Also check salus_visitas_canales for additional turnos
  const allSalusCanales = await fetchAll(async (from, to) => {
    const { data } = await supabase
      .from('salus_visitas_canales')
      .select('usuario_creacion, asistencia, fecha_visita, fecha_hora_creacion')
      .not('usuario_creacion', 'is', null)
      .range(from, to);
    return data;
  });
  console.log(`   Total registros con usuario en canales Salus: ${allSalusCanales.length}`);

  const salusStats = {};
  for (const [key, conf] of Object.entries(AGENT_KEYS)) {
    // Check in historico last 3 months
    const matchedPeriodo = allSalusAllTime.filter(
      (v) =>
        v.fecha_hora_creacion &&
        v.fecha_hora_creacion >= startDate &&
        v.fecha_hora_creacion <= endDate &&
        v.usuario_creacion &&
        conf.salus_names.some((n) => v.usuario_creacion.toLowerCase().includes(n.toLowerCase()))
    );

    const presentes = matchedPeriodo.filter((v) => v.asistencia === 'Presente').length;
    const ausentes = matchedPeriodo.filter((v) => v.asistencia === 'Ausencia injustificada').length;
    const ausJust = matchedPeriodo.filter((v) => v.asistencia === 'Ausencia justificada').length;
    const evalPeriodo = presentes + ausentes + ausJust;
    const tasaPeriodo = evalPeriodo > 0 ? ((presentes / evalPeriodo) * 100).toFixed(1) : 'N/A';

    // Historico All Time
    const matchedAll = allSalusAllTime.filter(
      (v) =>
        v.usuario_creacion &&
        conf.salus_names.some((n) => v.usuario_creacion.toLowerCase().includes(n.toLowerCase()))
    );
    const presAll = matchedAll.filter((v) => v.asistencia === 'Presente').length;
    const ausAll = matchedAll.filter((v) => v.asistencia === 'Ausencia injustificada').length;
    const ausJustAll = matchedAll.filter((v) => v.asistencia === 'Ausencia justificada').length;
    const evalAll = presAll + ausAll + ausJustAll;
    const tasaAll = evalAll > 0 ? ((presAll / evalAll) * 100).toFixed(1) : 'N/A';

    salusStats[key] = {
      periodo: {
        turnos_brindados: matchedPeriodo.length,
        presentes,
        ausentes,
        ausentes_just: ausJust,
        tasa_asistencia: tasaPeriodo === 'N/A' ? 'N/A' : `${tasaPeriodo}%`,
      },
      historico_total: {
        turnos_brindados: matchedAll.length,
        presentes: presAll,
        ausentes: ausAll,
        tasa_asistencia: tasaAll === 'N/A' ? 'N/A' : `${tasaAll}%`,
      },
    };
  }

  // 4. FICHADAS EN HUB
  console.log('⏳ 4. Consultando colaboradores en Hub...');
  const { data: todosColabs } = await supabaseHub
    .from('fichadas_colaboradores')
    .select('id, nombre_completo');
  console.log('   Colaboradores en Hub encontrados:', todosColabs?.map((c) => c.nombre_completo));

  const fichadasStats = {};
  for (const [key, conf] of Object.entries(AGENT_KEYS)) {
    const colab = todosColabs?.find((c) =>
      conf.salus_names.some((n) => c.nombre_completo.toLowerCase().includes(n.toLowerCase())) ||
      c.nombre_completo.toLowerCase().includes(key.toLowerCase())
    );

    if (colab) {
      const fichadas = await fetchAll(async (from, to) => {
        const { data } = await supabaseHub
          .from('fichadas_registros')
          .select('*')
          .eq('colaborador_id', colab.id)
          .gte('fecha', startDate)
          .lte('fecha', endDate)
          .range(from, to);
        return data;
      });

      const totalRegistros = fichadas.length;
      const asistio = fichadas.filter((f) => f.fichada_entrada).length;
      const tarde = fichadas.filter((f) => f.tarde).length;
      const pctAsistencia =
        totalRegistros > 0 ? ((asistio / totalRegistros) * 100).toFixed(1) : '100.0';

      fichadasStats[key] = {
        colaborador: colab.nombre_completo,
        dias_laborales: totalRegistros,
        dias_asistidos: asistio,
        llegadas_tarde: tarde,
        pct_presentismo: `${pctAsistencia}%`,
      };
    } else {
      fichadasStats[key] = {
        colaborador: 'No encontrado en nómina de fichadas',
        dias_laborales: 0,
        dias_asistidos: 0,
        llegadas_tarde: 0,
        pct_presentismo: 'N/A',
      };
    }
  }

  // 5. RESUMEN MENSUAL DESGLOSADO (Junio, Julio, Agosto 2026)
  const meses = [
    { name: 'Junio 2026', start: '2026-06-01', end: '2026-06-30T23:59:59.999Z' },
    { name: 'Julio 2026', start: '2026-07-01', end: '2026-07-31T23:59:59.999Z' },
    { name: 'Agosto 2026', start: '2026-08-01', end: '2026-08-31T23:59:59.999Z' },
  ];

  const breakdownMensual = {};
  for (const agent of ['Sofia', 'Antonella', 'Virginia', 'Daniela', 'Erica']) {
    breakdownMensual[agent] = meses.map((m) => {
      const ticketsMes = allTickets.filter(
        (t) =>
          t.chat_started_at >= m.start &&
          t.chat_started_at <= m.end &&
          t.agent_name &&
          AGENT_KEYS[agent].cc_names.map((n) => n.toLowerCase()).includes(t.agent_name.toLowerCase())
      );
      const closedMes = ticketsMes.filter((t) => t.status === 'CLOSED').length;
      const msgsMes = allOutMessages.filter(
        (msg) =>
          msg.message_timestamp >= m.start &&
          msg.message_timestamp <= m.end &&
          msg.sender_name &&
          AGENT_KEYS[agent].cc_names.map((n) => n.toLowerCase()).includes(msg.sender_name.toLowerCase())
      ).length;

      const salusMes = allSalusAllTime.filter(
        (v) =>
          v.fecha_hora_creacion >= m.start.substring(0, 10) &&
          v.fecha_hora_creacion <= m.end.substring(0, 10) &&
          v.usuario_creacion &&
          AGENT_KEYS[agent].salus_names.some((n) => v.usuario_creacion.toLowerCase().includes(n.toLowerCase()))
      );
      const presMes = salusMes.filter((v) => v.asistencia === 'Presente').length;
      const ausMes = salusMes.filter((v) => v.asistencia === 'Ausencia injustificada').length;
      const justMes = salusMes.filter((v) => v.asistencia === 'Ausencia justificada').length;
      const evalMes = presMes + ausMes + justMes;
      const tasaMes = evalMes > 0 ? ((presMes / evalMes) * 100).toFixed(1) : 'N/A';

      return {
        mes: m.name,
        tickets_totales: ticketsMes.length,
        tickets_cerrados: closedMes,
        mensajes_out: msgsMes,
        turnos_salus: salusMes.length,
        turnos_presentes: presMes,
        tasa_asistencia_turnos: tasaMes === 'N/A' ? 'N/A' : `${tasaMes}%`,
      };
    });
  }

  console.log('\n================================================================');
  console.log('📌 RESUMEN POR AGENTE — ÚLTIMOS 3 MESES (JUNIO / JULIO / AGOSTO 2026)');
  console.log('================================================================\n');

  for (const agent of ['Sofia', 'Antonella', 'Virginia', 'Daniela', 'Erica']) {
    console.log(`================================================================`);
    console.log(`👤 AGENTE: ${agent.toUpperCase()}`);
    console.log(`================================================================`);
    console.log(`📊 TOTALES 3 MESES:`);
    console.log(`   - Turnos creados (Salus): ${salusStats[agent].periodo.turnos_brindados} (Histórico total registrado: ${salusStats[agent].historico_total.turnos_brindados})`);
    console.log(`   - % Asistencia a los turnos que brindó: ${salusStats[agent].periodo.tasa_asistencia} (Histórico total: ${salusStats[agent].historico_total.tasa_asistencia})`);
    console.log(`   - Tickets asignados/atendidos: ${ticketStats[agent].total}`);
    console.log(`   - Tickets cerrados (status=CLOSED): ${ticketStats[agent].closed}`);
    console.log(`   - Mensajes respondidos (OUT): ${msgStats[agent]}`);
    console.log(`   - Presentismo laboral en Sanatorio: ${fichadasStats[agent].pct_presentismo} (${fichadasStats[agent].colaborador})`);
    console.log(`\n📅 DESGLOSE MENSUAL:`);
    console.table(breakdownMensual[agent]);
    console.log('\n');
  }
}

main().catch(console.error);
