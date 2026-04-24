/**
 * Contact Center — SALUS Sync Server (ETL autónomo)
 * ==================================================
 * Servidor Express que:
 *   1. Conecta a SQL Server SALUS (red local del Sanatorio)
 *   2. Ejecuta queries paginadas contra VLISE_Visitas
 *   3. Inserta/actualiza datos en Supabase (tabla salus_visitas)
 *   4. Sirve endpoints REST para analytics del dashboard
 *
 * ⚠️ OPTIMIZACIÓN RAM:
 *    - Streaming por lotes de 500 registros (nunca todo en RAM)
 *    - Query por defecto: MES EN CURSO solamente
 *    - Los datos viven en Supabase, no en memoria
 *
 * Puerto: 3457 (independiente del 3456 de ADM-QUI)
 * Uso: cd sync-server && npm install && npm start
 */

import express from 'express';
import cors from 'cors';
import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Cargar .env del proyecto padre (Contact Center)
config({ path: resolve(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.SYNC_PORT || 3457;

// —— Supabase Client ——
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// —— SQL Server Config (mismo SALUS que ADM-QUI) ——
const SQL_CONFIG = {
    server: '128.223.16.29',
    port: 2450,
    user: 'SalusConsulta',
    password: 'ConsultaSALUS1234',
    database: 'SALUS',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        requestTimeout: 300000,    // 5min para queries pesadas
        connectionTimeout: 15000,
        tdsVersion: '7_4',
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};

// —— Pool de conexiones ——
let pool = null;
async function getPool() {
    if (!pool || !pool.connected) {
        console.log('🔌 Conectando a SQL Server SALUS...');
        pool = await sql.connect(SQL_CONFIG);
        console.log('✅ Conectado a SALUS');
    }
    return pool;
}

// —— Middleware ——
app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(express.json());

// —— Helpers ——
function formatDate(val) {
    if (!val) return null;
    if (val instanceof Date) {
        const y = val.getUTCFullYear();
        const m = String(val.getUTCMonth() + 1).padStart(2, '0');
        const d = String(val.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    const str = String(val);
    const isoMatch = str.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) return isoMatch[1];
    return str;
}

function formatDateTime(val) {
    if (!val) return null;
    if (val instanceof Date) return val.toISOString();
    return String(val);
}

/** Obtener primer día del mes en curso: "2026-04-01" */
function primerDiaMesActual() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
}

/**
 * Transforma un registro crudo de SALUS a la estructura limpia de Supabase.
 * Solo extrae las columnas Tier 1 + Tier 2.
 */
function mapRow(r) {
    return {
        id_visita:               r.idVisita,
        id_paciente:             r.IdPaciente || null,
        paciente:                r.Paciente?.trim() || null,
        nhc:                     r.NHC?.trim() || null,
        nif:                     r.NIF?.trim() || null,
        fecha_nacimiento:        formatDate(r.fechaNacimiento),
        sexo:                    r.Sexo?.trim() || null,
        edad:                    r.Edad != null ? Number(r.Edad) : null,
        poblacion:               r.Poblacion?.trim() || null,
        provincia:               r.Provincia?.trim() || null,
        cp:                      r.CP?.trim() || null,
        fecha_visita:            formatDate(r['Fecha Visita']),
        hora_inicio:             r['Hora Inicio Visita Formato Texto']?.trim() || null,
        hora_fin:                r['Hora Fin Visita Formato Texto']?.trim() || null,
        tiempo_pred:             r.TiempoPred != null ? Number(r.TiempoPred) : null,
        tipo_visita:             r['Tipo Visita']?.trim() || null,
        especialidad:            r.Visita_Especialidad?.trim() || null,
        motivo_visita:           r['Motivo Visita']?.trim() || null,
        procedencia:             r.Procedencia?.trim() || null,
        responsable:             r.Responsable?.trim() || null,
        responsable_abrev:       r.ResponsableAbrev?.trim() || null,
        num_colegiado:           r['Num. Colegiado']?.trim() || null,
        cliente:                 r.Cliente?.trim() || null,
        tipo_cliente:            r['Tipo Cliente']?.trim() || null,
        clasificacion_compania:  r['Clasificacion compañia']?.trim() || null,
        coseguro:                r.Coseguro?.trim() || null,
        centro:                  r.Centro?.trim() || null,
        centro_creacion:         r.CentroCreacion?.trim() || null,
        grupo_agenda:            r['Grupo Agenda']?.trim() || null,
        fecha_hora_creacion:     formatDateTime(r['Fecha Hora Creacion']),
        fecha_hora_entrada:      formatDateTime(r['Fecha Hora Entrada']),
        fecha_hora_salida:       formatDateTime(r['Fecha Hora Salida']),
        usuario_creacion:        r['Usuario Creacion Nombre']?.trim() || null,
        asistencia:              r.Asistencia?.trim() || null,
        visita_ausente:          r.Visita_Ausente?.trim() || null,
        motivo_ausencia:         r.Motivo_Ausencia?.trim() || null,
        estado_reprogramacion:   r.EstadoReprogramacion != null ? Number(r.EstadoReprogramacion) : null,
        synced_at:               new Date().toISOString(),
    };
}


// ══════════════════════════════════════════════════════
// SYNC VISITAS — SQL Server → Supabase (streaming by batch)
// ══════════════════════════════════════════════════════
async function syncVisitas(db, fechaDesde, fechaHasta) {
    const desde = fechaDesde || primerDiaMesActual();
    const hasta = fechaHasta || null;

    console.log(`📋 Sincronizando visitas SALUS → Supabase`);
    console.log(`   Rango: ${desde} → ${hasta || 'hoy'}`);

    // 1. Contar total para reporting
    const countReq = db.request().input('desde', sql.VarChar, desde);
    let countQuery = `SELECT COUNT(*) AS total FROM VLISE_Visitas WHERE [Fecha Visita] >= @desde`;
    if (hasta) {
        countReq.input('hasta', sql.VarChar, hasta + ' 23:59:59');
        countQuery += ` AND [Fecha Visita] <= @hasta`;
    }
    const countResult = await countReq.query(countQuery);
    const totalRows = countResult.recordset[0].total;
    console.log(`   📊 Total registros a sincronizar: ${totalRows.toLocaleString()}`);

    if (totalRows === 0) {
        return { total: 0, inserted: 0, updated: 0, skipped: 0 };
    }

    // 2. Procesar en lotes paginados (OFFSET/FETCH) para no explotar RAM
    const PAGE_SIZE = 500;   // Registros por página de SQL Server
    const UPSERT_BATCH = 100; // Registros por upsert a Supabase
    let inserted = 0, updated = 0, skipped = 0;
    let offset = 0;

    while (offset < totalRows) {
        // Traer página de SQL Server
        const pageReq = db.request().input('desde', sql.VarChar, desde);
        let pageQuery = `
            SELECT * FROM VLISE_Visitas
            WHERE [Fecha Visita] >= @desde
        `;
        if (hasta) {
            pageReq.input('hasta', sql.VarChar, hasta + ' 23:59:59');
            pageQuery += ` AND [Fecha Visita] <= @hasta`;
        }
        pageQuery += `
            ORDER BY [Fecha Visita] DESC
            OFFSET ${offset} ROWS FETCH NEXT ${PAGE_SIZE} ROWS ONLY
        `;

        const pageResult = await pageReq.query(pageQuery);
        const rows = pageResult.recordset;

        if (rows.length === 0) break;

        // Mapear a estructura limpia
        const mapped = rows.map(mapRow).filter(r => r.id_visita && r.fecha_visita);

        // Upsert en sub-lotes a Supabase
        for (let i = 0; i < mapped.length; i += UPSERT_BATCH) {
            const batch = mapped.slice(i, i + UPSERT_BATCH);

            const { data, error } = await supabase
                .from('salus_visitas')
                .upsert(batch, { onConflict: 'id_visita', ignoreDuplicates: false })
                .select('id_visita');

            if (error) {
                console.error(`   ❌ Batch error (offset ${offset + i}):`, error.message);
                skipped += batch.length;
            } else if (data) {
                inserted += data.length;
            }
        }

        offset += rows.length;
        const pct = Math.round((offset / totalRows) * 100);
        process.stdout.write(`\r   📥 Progreso: ${offset.toLocaleString()}/${totalRows.toLocaleString()} (${pct}%)`);
    }

    console.log(''); // salto de línea después del progreso
    const summary = { total: totalRows, inserted, updated, skipped, desde, hasta };
    console.log(`   ✅ Sync completo: ${inserted} upserted, ${skipped} errores`);
    return summary;
}


// ══════════════════════════════════════════════════════
// ENDPOINTS
// ══════════════════════════════════════════════════════

// Health check
app.get('/api/health', async (req, res) => {
    try {
        const db = await getPool();
        const { count } = await supabase
            .from('salus_visitas')
            .select('id', { count: 'exact', head: true });

        res.json({
            status: 'ok',
            service: 'Contact Center SALUS Sync Server',
            sqlConnected: db.connected,
            supabaseRecords: count || 0,
        });
    } catch (err) {
        res.json({ status: 'degraded', error: err.message });
    }
});

// ─── Sincronizar: SALUS → Supabase ───
// Por defecto sincroniza el mes en curso.
// POST body opcional: { "fecha_desde": "2025-06-01", "fecha_hasta": "2025-06-30" }
app.post('/api/salus/sync', async (req, res) => {
    const { fecha_desde, fecha_hasta } = req.body || {};
    console.log('\n🚀 Sincronización iniciada...');
    try {
        const db = await getPool();
        const report = await syncVisitas(db, fecha_desde, fecha_hasta);
        console.log('🏁 Sincronización completa.\n');
        res.json({ success: true, report });
    } catch (error) {
        console.error('💥 Error en sincronización:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Leer visitas desde Supabase (paginado) ───
app.get('/api/visitas', async (req, res) => {
    try {
        const {
            limit = 500,
            offset = 0,
            fecha_desde,
            fecha_hasta,
            centro,
            especialidad,
            responsable,
            cliente,
            usuario_creacion,
        } = req.query;

        let query = supabase
            .from('salus_visitas')
            .select('*', { count: 'exact' });

        if (fecha_desde) query = query.gte('fecha_visita', fecha_desde);
        if (fecha_hasta) query = query.lte('fecha_visita', fecha_hasta);
        if (centro) query = query.eq('centro', centro);
        if (especialidad) query = query.eq('especialidad', especialidad);
        if (responsable) query = query.ilike('responsable', `%${responsable}%`);
        if (cliente) query = query.ilike('cliente', `%${cliente}%`);
        if (usuario_creacion) query = query.ilike('usuario_creacion', `%${usuario_creacion}%`);

        query = query
            .order('fecha_visita', { ascending: false })
            .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

        const { data, error, count } = await query;

        if (error) throw error;

        res.json({
            success: true,
            total: count,
            offset: parseInt(offset),
            limit: parseInt(limit),
            data,
        });
    } catch (error) {
        console.error('❌ Error leyendo visitas:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Estadísticas agregadas (desde Supabase) ───
app.get('/api/visitas/stats', async (req, res) => {
    try {
        const { fecha_desde, fecha_hasta } = req.query;

        // Construir filtro base
        let baseFilter = supabase.from('salus_visitas').select('*', { count: 'exact', head: true });
        if (fecha_desde) baseFilter = baseFilter.gte('fecha_visita', fecha_desde);
        if (fecha_hasta) baseFilter = baseFilter.lte('fecha_visita', fecha_hasta);

        const { count: total } = await baseFilter;

        // Para agregaciones usamos queries RPC o traemos datos agrupados
        // Como Supabase no soporta GROUP BY nativo en la API,
        // hacemos queries directas contra SALUS (más eficiente)
        const db = await getPool();
        const desde = fecha_desde || primerDiaMesActual();
        const hastaClause = fecha_hasta ? `AND [Fecha Visita] <= '${fecha_hasta} 23:59:59'` : '';

        const [porFecha, porCentro, porEspecialidad, porCliente, porGrupo] = await Promise.all([
            db.request().query(`
                SELECT CAST([Fecha Visita] AS DATE) AS fecha, COUNT(*) AS cantidad
                FROM VLISE_Visitas
                WHERE [Fecha Visita] >= '${desde}' ${hastaClause}
                GROUP BY CAST([Fecha Visita] AS DATE)
                ORDER BY fecha DESC
            `),
            db.request().query(`
                SELECT Centro AS label, COUNT(*) AS cantidad
                FROM VLISE_Visitas
                WHERE [Fecha Visita] >= '${desde}' ${hastaClause}
                GROUP BY Centro ORDER BY cantidad DESC
            `),
            db.request().query(`
                SELECT Visita_Especialidad AS label, COUNT(*) AS cantidad
                FROM VLISE_Visitas
                WHERE [Fecha Visita] >= '${desde}' ${hastaClause}
                  AND Visita_Especialidad IS NOT NULL
                GROUP BY Visita_Especialidad ORDER BY cantidad DESC
            `),
            db.request().query(`
                SELECT Cliente AS label, COUNT(*) AS cantidad
                FROM VLISE_Visitas
                WHERE [Fecha Visita] >= '${desde}' ${hastaClause}
                  AND Cliente IS NOT NULL
                GROUP BY Cliente ORDER BY cantidad DESC
            `),
            db.request().query(`
                SELECT [Grupo Agenda] AS label, COUNT(*) AS cantidad
                FROM VLISE_Visitas
                WHERE [Fecha Visita] >= '${desde}' ${hastaClause}
                GROUP BY [Grupo Agenda] ORDER BY cantidad DESC
            `),
        ]);

        res.json({
            success: true,
            stats: {
                total: total || 0,
                porFecha: porFecha.recordset.map(r => ({ fecha: formatDate(r.fecha), cantidad: r.cantidad })),
                porCentro: porCentro.recordset,
                porEspecialidad: porEspecialidad.recordset,
                porCliente: porCliente.recordset,
                porGrupoAgenda: porGrupo.recordset,
            },
        });
    } catch (error) {
        console.error('❌ Error stats:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Top responsables ───
app.get('/api/visitas/stats/responsables', async (req, res) => {
    try {
        const db = await getPool();
        const { fecha_desde, fecha_hasta, top = 50 } = req.query;
        const desde = fecha_desde || primerDiaMesActual();
        const hastaClause = fecha_hasta ? `AND [Fecha Visita] <= '${fecha_hasta} 23:59:59'` : '';

        const result = await db.request().query(`
            SELECT TOP ${parseInt(top)}
                Responsable,
                Visita_Especialidad AS especialidad,
                COUNT(*) AS cantidad,
                COUNT(DISTINCT IdPaciente) AS pacientes_unicos
            FROM VLISE_Visitas
            WHERE [Fecha Visita] >= '${desde}' ${hastaClause}
              AND Responsable IS NOT NULL
            GROUP BY Responsable, Visita_Especialidad
            ORDER BY cantidad DESC
        `);

        res.json({ success: true, data: result.recordset });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Stats exclusivas de operadoras de Contact Center ───
app.get('/api/visitas/stats/contact-center', async (req, res) => {
    try {
        const db = await getPool();
        const { fecha_desde, fecha_hasta } = req.query;
        const desde = fecha_desde || '2023-01-01'; // Default desde inicio
        const hastaClause = fecha_hasta ? `AND [Fecha Visita] <= '${fecha_hasta} 23:59:59'` : '';

        // Las 3 chicas
        const operadoras = [
            'ACOSTA ESQUIVEL, MARIA ANTONELLA',
            'AGUILERA CARDOZO, DANIELA ROMINA',
            'OLIVIER ESQUIVEL, SOFIA FERNANDA'
        ].map(n => `'${n}'`).join(',');

        const query = `
            SELECT 
                [Usuario Creacion Nombre] as operadora,
                CAST(YEAR([Fecha Visita]) as VARCHAR) + '-' + RIGHT('0' + CAST(MONTH([Fecha Visita]) as VARCHAR), 2) as mes,
                COUNT(*) AS cantidad,
                COUNT(DISTINCT IdPaciente) AS pacientes_unicos
            FROM VLISE_Visitas
            WHERE [Fecha Visita] >= '${desde}' ${hastaClause}
              AND [Usuario Creacion Nombre] IN (${operadoras})
            GROUP BY [Usuario Creacion Nombre], YEAR([Fecha Visita]), MONTH([Fecha Visita])
            ORDER BY operadora, mes DESC
        `;
        
        const result = await db.request().query(query);

        // Agrupar la data de manera amigable
        const dataPorOperadora = {};
        const dataGlobal = {};
        let totalCC = 0;

        result.recordset.forEach(r => {
            const { operadora, mes, cantidad, pacientes_unicos } = r;
            
            // Total CC Global (todas juntas)
            if(!dataGlobal[mes]) dataGlobal[mes] = { cantidad: 0, pacientes_unicos: 0 };
            dataGlobal[mes].cantidad += cantidad;
            dataGlobal[mes].pacientes_unicos += pacientes_unicos; // aproximación, podría haber solapamiento
            
            // Por operadora individual
            if(!dataPorOperadora[operadora]) {
                dataPorOperadora[operadora] = { total: 0, meses: [] };
            }
            dataPorOperadora[operadora].total += cantidad;
            dataPorOperadora[operadora].meses.push({ mes, cantidad, pacientes_unicos });
            
            totalCC += cantidad;
        });

        res.json({ 
            success: true, 
            contact_center_global: {
                total_agendado: totalCC,
                por_mes: Object.entries(dataGlobal).map(([mes, stats]) => ({ mes, ...stats })).sort((a,b) => b.mes.localeCompare(a.mes))
            },
            por_operadora: dataPorOperadora
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Columnas disponibles ───
app.get('/api/salus/columns', async (req, res) => {
    try {
        const db = await getPool();
        const result = await db.request().query(`SELECT TOP 1 * FROM VLISE_Visitas WHERE [Fecha Visita] >= '2026-01-01'`);
        const columns = result.recordset.length > 0 ? Object.keys(result.recordset[0]) : [];
        res.json({ success: true, columns });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Query ad-hoc (solo SELECT, con TOP forzado) ───
app.post('/api/salus/query', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false, error: 'Se requiere campo "query"' });

    const trimmed = query.trim().toUpperCase();
    if (!trimmed.startsWith('SELECT')) {
        return res.status(403).json({ success: false, error: 'Solo se permiten consultas SELECT' });
    }

    // Forzar TOP si no tiene para evitar OOM
    let safeQuery = query;
    if (!/SELECT\s+TOP\s*\(/i.test(query) && !/OFFSET\s+\d+/i.test(query)) {
        safeQuery = query.replace(/^SELECT/i, 'SELECT TOP 5000');
    }

    try {
        console.log(`🔍 Query: ${safeQuery.substring(0, 120)}...`);
        const db = await getPool();
        const result = await db.request().query(safeQuery);
        const columns = result.recordset.length > 0 ? Object.keys(result.recordset[0]) : [];
        const data = result.recordset.map(row => {
            const mapped = {};
            for (const [key, val] of Object.entries(row)) {
                mapped[key] = val instanceof Date ? val.toISOString() : val;
            }
            return mapped;
        });
        res.json({ success: true, total: data.length, columns, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ══════════════════════════════════════════════════════
// ARRANQUE
// ══════════════════════════════════════════════════════
app.listen(PORT, '0.0.0.0', async () => {
    const mesActual = primerDiaMesActual();
    console.log(`\n🚀 Contact Center SALUS Sync Server`);
    console.log(`   Puerto: ${PORT}`);
    console.log(`   Supabase: ${supabaseUrl}`);
    console.log(`   SALUS: ${SQL_CONFIG.server}:${SQL_CONFIG.port}`);
    console.log(`   Filtro default: mes en curso (${mesActual})`);
    console.log(`\n📡 Endpoints:`);
    console.log(`   GET  /api/health`);
    console.log(`   POST /api/salus/sync         → ETL: SALUS → Supabase (mes en curso)`);
    console.log(`   GET  /api/visitas             → Leer desde Supabase (paginado)`);
    console.log(`   GET  /api/visitas/stats        → Estadísticas agregadas`);
    console.log(`   GET  /api/visitas/stats/responsables`);
    console.log(`   GET  /api/salus/columns`);
    console.log(`   POST /api/salus/query          → Query ad-hoc a SALUS`);

    // Test de conexión
    try {
        const db = await getPool();
        const test = await db.request().query(
            `SELECT COUNT(*) AS total FROM VLISE_Visitas WHERE [Fecha Visita] >= '${mesActual}'`
        );
        console.log(`\n✅ SALUS operativo. Visitas del mes en curso: ${test.recordset[0].total.toLocaleString()}`);
    } catch (err) {
        console.error(`\n⚠️  No se pudo conectar a SALUS: ${err.message}`);
    }

    // Verificar tabla en Supabase
    const { count, error } = await supabase
        .from('salus_visitas')
        .select('id', { count: 'exact', head: true });

    if (error) {
        console.log(`\n⚠️  Tabla salus_visitas NO encontrada en Supabase.`);
        console.log(`   Ejecutá migration_visitas.sql en el SQL Editor de Supabase antes de sincronizar.`);
    } else {
        console.log(`✅ Tabla salus_visitas OK. ${(count || 0).toLocaleString()} registros en Supabase.`);
    }
    console.log('');
});
