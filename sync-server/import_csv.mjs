/**
 * Importador CSV masivo: VLISE_Visitas → Supabase (salus_visitas)
 * ================================================================
 * Optimizado para 2.5M+ registros:
 *   - Streaming línea por línea (nunca todo en RAM)
 *   - Upserts en lotes de 500
 *   - Progreso cada 5,000 registros
 *   - Reintentos automáticos en caso de error
 *
 * Uso: node import_csv.mjs
 */

import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

const CSV_PATH = 'C:\\Users\\Sanatorio Argentino\\Documents\\visitas totales para cc.csv';
const BATCH_SIZE = 500;
const MAX_RETRIES = 3;
const TOTAL_EXPECTED = 2_513_588;

/**
 * Mapeo posicional de las 18 columnas del CSV (sin headers, separador ;)
 * Basado en la query:
 *   SELECT idVisita, IdPaciente, Asistencia, Paciente, NHC, NIF AS dni,
 *          [Grupo Agenda], Cliente, Sexo, Edad, Poblacion, Responsable,
 *          [Tipo Visita], CONVERT(VARCHAR(10),[Fecha Visita],103),
 *          [Hora Inicio Visita Formato Texto], Centro,
 *          Visita_Especialidad, [Usuario Creacion Nombre]
 */
const COL_MAP = [
    { idx: 0,  col: 'id_visita',        type: 'int' },
    { idx: 1,  col: 'id_paciente',      type: 'int' },
    { idx: 2,  col: 'asistencia',       type: 'text' },
    { idx: 3,  col: 'paciente',         type: 'text' },
    { idx: 4,  col: 'nhc',             type: 'text' },
    { idx: 5,  col: 'nif',             type: 'text' },
    { idx: 6,  col: 'grupo_agenda',     type: 'text' },
    { idx: 7,  col: 'cliente',          type: 'text' },
    { idx: 8,  col: 'sexo',            type: 'text' },
    { idx: 9,  col: 'edad',            type: 'int' },
    { idx: 10, col: 'poblacion',        type: 'text' },
    { idx: 11, col: 'responsable',      type: 'text' },
    { idx: 12, col: 'tipo_visita',      type: 'text' },
    { idx: 13, col: 'fecha_visita',     type: 'date' },  // dd/mm/yyyy → yyyy-mm-dd
    { idx: 14, col: 'hora_inicio',      type: 'text' },
    { idx: 15, col: 'centro',           type: 'text' },
    { idx: 16, col: 'especialidad',     type: 'text' },
    { idx: 17, col: 'usuario_creacion', type: 'text' },
];

/** Convierte dd/mm/yyyy → yyyy-mm-dd */
function parseDateDMY(val) {
    if (!val) return null;
    const m = val.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    // Ya en formato ISO?
    if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val.substring(0, 10);
    return null;
}

/** Parsea una línea CSV con separador ; (maneja comillas) */
function parseLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ';' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}

/** Limpia valor: NULL, vacío → null */
function clean(val) {
    if (!val || val === 'NULL' || val === 'null' || val.trim() === '') return null;
    return val.trim();
}

/** Construye registro Supabase desde array de valores */
function buildRecord(values) {
    const record = {};

    for (const { idx, col, type } of COL_MAP) {
        const raw = clean(values[idx]);

        if (raw === null) {
            record[col] = null;
            continue;
        }

        switch (type) {
            case 'int': {
                const n = parseInt(raw, 10);
                record[col] = isNaN(n) ? null : n;
                break;
            }
            case 'date':
                record[col] = parseDateDMY(raw);
                break;
            default:
                record[col] = raw;
        }
    }

    return record;
}

/** Upsert con reintentos */
async function upsertBatch(batch, attempt = 1) {
    const { data, error } = await supabase
        .from('salus_visitas')
        .upsert(batch, { onConflict: 'id_visita', ignoreDuplicates: false });

    if (error) {
        if (attempt < MAX_RETRIES) {
            // Esperar un poco antes de reintentar
            await new Promise(r => setTimeout(r, 1000 * attempt));
            return upsertBatch(batch, attempt + 1);
        }
        return { ok: false, error: error.message, count: batch.length };
    }
    return { ok: true, count: batch.length };
}

// ══════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════
async function main() {
    console.log(`\n🚀 Importador CSV → Supabase (salus_visitas)`);
    console.log(`   Archivo: ${CSV_PATH}`);
    console.log(`   Registros esperados: ~${TOTAL_EXPECTED.toLocaleString()}`);
    console.log(`   Lote: ${BATCH_SIZE} registros por upsert`);
    console.log(`   Reintentos: ${MAX_RETRIES}\n`);

    const startTime = Date.now();
    let batch = [];
    let processed = 0;
    let inserted = 0;
    let skipped = 0;
    let errors = 0;

    const rl = createInterface({
        input: createReadStream(CSV_PATH, { encoding: 'utf-8' }),
        crlfDelay: Infinity,
    });

    for await (const line of rl) {
        if (!line.trim()) continue;

        const values = parseLine(line);

        // Validar mínimo de columnas
        if (values.length < 18) {
            skipped++;
            continue;
        }

        const record = buildRecord(values);

        // Campos obligatorios
        if (!record.id_visita || !record.fecha_visita) {
            skipped++;
            continue;
        }

        batch.push(record);

        if (batch.length >= BATCH_SIZE) {
            // Deduplicar dentro del lote (último gana) para evitar
            // "ON CONFLICT DO UPDATE cannot affect row a second time"
            const deduped = new Map();
            for (const r of batch) deduped.set(r.id_visita, r);
            const uniqueBatch = [...deduped.values()];

            const result = await upsertBatch(uniqueBatch);
            if (result.ok) {
                inserted += result.count;
            } else {
                errors += result.count;
                // Log error pero solo cada tanto para no spamear
                if (errors % 5000 === 0) {
                    console.error(`\n   ⚠️ Error acumulado: ${result.error}`);
                }
            }
            batch = [];
            processed += BATCH_SIZE;

            // Progreso cada 5,000
            if (processed % 5000 === 0) {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
                const pct = ((processed / TOTAL_EXPECTED) * 100).toFixed(1);
                const rate = (processed / (elapsed || 1)).toFixed(0);
                process.stdout.write(
                    `\r   📥 ${processed.toLocaleString()} / ${TOTAL_EXPECTED.toLocaleString()} (${pct}%) | ✅ ${inserted.toLocaleString()} | ❌ ${errors} | ⏱️ ${elapsed}s | ${rate} reg/s`
                );
            }
        }
    }

    // Flush último lote
    if (batch.length > 0) {
        const deduped = new Map();
        for (const r of batch) deduped.set(r.id_visita, r);
        const uniqueBatch = [...deduped.values()];
        const result = await upsertBatch(uniqueBatch);
        if (result.ok) inserted += result.count;
        else errors += result.count;
        processed += batch.length;
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n\n🏁 Importación finalizada en ${totalTime}s`);
    console.log(`   📊 Procesados:   ${processed.toLocaleString()}`);
    console.log(`   ✅ Insertados:   ${inserted.toLocaleString()}`);
    console.log(`   ⏭️  Saltados:     ${skipped.toLocaleString()}`);
    console.log(`   ❌ Errores:      ${errors.toLocaleString()}`);
    console.log(`   ⚡ Velocidad:    ${(processed / (totalTime || 1)).toFixed(0)} reg/s\n`);
}

main().catch(err => {
    console.error('💥 Error fatal:', err);
    process.exit(1);
});
