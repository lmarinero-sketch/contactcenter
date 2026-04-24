-- =====================================================
-- TABLA: salus_visitas
-- Almacena datos extraídos de VLISE_Visitas (SALUS)
-- Solo columnas Tier 1 + Tier 2 para analytics
-- =====================================================

CREATE TABLE IF NOT EXISTS salus_visitas (
    -- PK interna Supabase
    id                      BIGSERIAL PRIMARY KEY,

    -- Identificadores SALUS
    id_visita               BIGINT NOT NULL UNIQUE,
    id_paciente             BIGINT,

    -- Paciente
    paciente                TEXT,
    nhc                     TEXT,
    nif                     TEXT,
    fecha_nacimiento        DATE,
    sexo                    TEXT,
    edad                    SMALLINT,

    -- Ubicación paciente
    poblacion               TEXT,
    provincia               TEXT,
    cp                      TEXT,

    -- Visita (CORE)
    fecha_visita             DATE NOT NULL,
    hora_inicio              TEXT,          -- "10:00:00"
    hora_fin                 TEXT,          -- "10:10:00"
    tiempo_pred              SMALLINT,      -- minutos predeterminados
    tipo_visita              TEXT,          -- "(ENDO) CONSULTA ENDOCRINOLOGIA"
    especialidad             TEXT,          -- "ENDOCRINOLOGIA"
    motivo_visita            TEXT,
    procedencia              TEXT,          -- "Atención Telef", etc.

    -- Médico / Profesional
    responsable              TEXT,          -- "BELTRAN, ANA MARIA"
    responsable_abrev        TEXT,
    num_colegiado            TEXT,

    -- Obra Social
    cliente                  TEXT,          -- "005 - OSDE BINARIO"
    tipo_cliente             TEXT,          -- "Mutua"
    clasificacion_compania   TEXT,          -- "OBRAS SOCIALES"
    coseguro                 TEXT,

    -- Centro / Sede
    centro                   TEXT,          -- "SAN LUIS SUR"
    centro_creacion          TEXT,
    grupo_agenda             TEXT,          -- "ECOGRAFIAS", "SECTOR 1", etc.

    -- Timestamps operativos
    fecha_hora_creacion      TIMESTAMPTZ,   -- cuándo se sacó el turno
    fecha_hora_entrada       TIMESTAMPTZ,   -- entrada al consultorio
    fecha_hora_salida        TIMESTAMPTZ,   -- salida del consultorio
    usuario_creacion         TEXT,          -- operador que agendó

    -- Estado
    asistencia               TEXT,
    visita_ausente           TEXT,
    motivo_ausencia          TEXT,
    estado_reprogramacion    SMALLINT,      -- 0 o 1

    -- Metadata sync
    synced_at                TIMESTAMPTZ DEFAULT NOW(),

    -- Índices implícitos por UNIQUE ya cubren id_visita
    CONSTRAINT salus_visitas_id_visita_key UNIQUE (id_visita)
);

-- Índices para queries analíticas frecuentes
CREATE INDEX IF NOT EXISTS idx_salus_visitas_fecha ON salus_visitas (fecha_visita DESC);
CREATE INDEX IF NOT EXISTS idx_salus_visitas_centro ON salus_visitas (centro);
CREATE INDEX IF NOT EXISTS idx_salus_visitas_especialidad ON salus_visitas (especialidad);
CREATE INDEX IF NOT EXISTS idx_salus_visitas_responsable ON salus_visitas (responsable);
CREATE INDEX IF NOT EXISTS idx_salus_visitas_cliente ON salus_visitas (cliente);
CREATE INDEX IF NOT EXISTS idx_salus_visitas_paciente ON salus_visitas (id_paciente);

-- RLS: permitir lectura anónima para el dashboard
ALTER TABLE salus_visitas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública salus_visitas" ON salus_visitas
    FOR SELECT USING (true);

CREATE POLICY "Insert/Update via service role" ON salus_visitas
    FOR ALL USING (auth.role() = 'service_role');
