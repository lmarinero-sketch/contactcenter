/**
 * Ejecuta la migración para crear la tabla salus_visitas en Supabase
 * Uso: node run_migration.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
);

const SQL = `
CREATE TABLE IF NOT EXISTS salus_visitas (
    id                      BIGSERIAL PRIMARY KEY,
    id_visita               BIGINT NOT NULL,
    id_paciente             BIGINT,
    paciente                TEXT,
    nhc                     TEXT,
    nif                     TEXT,
    fecha_nacimiento        DATE,
    sexo                    TEXT,
    edad                    SMALLINT,
    poblacion               TEXT,
    provincia               TEXT,
    cp                      TEXT,
    fecha_visita             DATE NOT NULL,
    hora_inicio              TEXT,
    hora_fin                 TEXT,
    tiempo_pred              SMALLINT,
    tipo_visita              TEXT,
    especialidad             TEXT,
    motivo_visita            TEXT,
    procedencia              TEXT,
    responsable              TEXT,
    responsable_abrev        TEXT,
    num_colegiado            TEXT,
    cliente                  TEXT,
    tipo_cliente             TEXT,
    clasificacion_compania   TEXT,
    coseguro                 TEXT,
    centro                   TEXT,
    centro_creacion          TEXT,
    grupo_agenda             TEXT,
    fecha_hora_creacion      TIMESTAMPTZ,
    fecha_hora_entrada       TIMESTAMPTZ,
    fecha_hora_salida        TIMESTAMPTZ,
    usuario_creacion         TEXT,
    asistencia               TEXT,
    visita_ausente           TEXT,
    motivo_ausencia          TEXT,
    estado_reprogramacion    SMALLINT,
    synced_at                TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT salus_visitas_id_visita_key UNIQUE (id_visita)
);
`;

async function run() {
    console.log('🔧 Ejecutando migración...');
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: SQL });
    
    if (error) {
        // Si no existe la función exec_sql, probamos insertar un registro de prueba
        // para verificar si la tabla ya existe
        console.log('⚠️  No se puede ejecutar SQL directo via anon key.');
        console.log('   Necesitás ejecutar el SQL manualmente en Supabase Dashboard:');
        console.log('   https://supabase.com/dashboard/project/dtjmckbrofevgfqbkzli/sql/new');
        console.log('\n   O copiá el archivo: sync-server/migration_visitas.sql');
        console.log('\n   Error:', error.message);
        
        // Verificar si la tabla ya existe intentando un select
        const { data: testData, error: testError } = await supabase
            .from('salus_visitas')
            .select('id')
            .limit(1);
        
        if (!testError) {
            console.log('\n✅ ¡La tabla salus_visitas YA EXISTE! Podés proceder con el sync.');
        } else if (testError.message.includes('does not exist')) {
            console.log('\n❌ La tabla NO existe. Ejecutá el SQL manualmente.');
        } else {
            console.log('\n🔍 Estado tabla:', testError.message);
        }
    } else {
        console.log('✅ Migración ejecutada correctamente.');
    }
}

run();
