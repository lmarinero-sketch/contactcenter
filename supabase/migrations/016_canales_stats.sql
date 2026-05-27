-- ============================================
-- Contact Center Analytics - Estadísticas por Canal
-- Proyecto: Sanatorio Argentino
-- Fecha: 2026-05-27
-- 
-- SEGURIDAD: 100% safe, puede ejecutarse múltiples veces:
--   ✅ CREATE TABLE IF NOT EXISTS — no falla si ya existe
--   ✅ CREATE INDEX IF NOT EXISTS — no falla si ya existe
--   ✅ DROP POLICY IF EXISTS antes de CREATE POLICY
--   ✅ DROP FUNCTION IF EXISTS antes de CREATE
--   ✅ NO toca la tabla salus_visitas_historico
--   ✅ NO borra datos de ninguna tabla existente
--   ✅ NO altera columnas de tablas existentes
-- ============================================

-- ═══════════════════════════════════════════
-- PARTE 1: Tabla nueva (independiente)
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS salus_visitas_canales (
  id_visita BIGINT PRIMARY KEY,
  id_paciente BIGINT,
  asistencia TEXT,
  paciente TEXT,
  nif TEXT,
  telefono TEXT,
  grupo_agenda TEXT,
  cliente TEXT,
  sexo TEXT,
  edad INTEGER,
  poblacion TEXT,
  responsable TEXT,
  tipo_visita TEXT,
  fecha_visita DATE,
  hora_inicio TEXT,
  centro TEXT,
  fecha_hora_creacion TIMESTAMP,
  usuario_creacion TEXT,
  canal_creacion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices (safe — IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_canales_fecha ON salus_visitas_canales(fecha_visita);
CREATE INDEX IF NOT EXISTS idx_canales_canal ON salus_visitas_canales(canal_creacion);
CREATE INDEX IF NOT EXISTS idx_canales_asistencia ON salus_visitas_canales(asistencia);
CREATE INDEX IF NOT EXISTS idx_canales_responsable ON salus_visitas_canales(responsable);
CREATE INDEX IF NOT EXISTS idx_canales_creacion ON salus_visitas_canales(fecha_hora_creacion);
CREATE INDEX IF NOT EXISTS idx_canales_usuario ON salus_visitas_canales(usuario_creacion);

-- RLS (safe — DROP IF EXISTS antes de CREATE)
ALTER TABLE salus_visitas_canales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "canales_read" ON salus_visitas_canales;
DROP POLICY IF EXISTS "canales_insert" ON salus_visitas_canales;
DROP POLICY IF EXISTS "canales_update" ON salus_visitas_canales;
CREATE POLICY "canales_read" ON salus_visitas_canales FOR SELECT USING (true);
CREATE POLICY "canales_insert" ON salus_visitas_canales FOR INSERT WITH CHECK (true);
CREATE POLICY "canales_update" ON salus_visitas_canales FOR UPDATE USING (true);

-- ═══════════════════════════════════════════
-- PARTE 2: RPC para el dashboard de canales
-- (función NUEVA, no toca bi_visitas_dashboard_data)
-- ═══════════════════════════════════════════

DROP FUNCTION IF EXISTS bi_canales_dashboard_data(timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION bi_canales_dashboard_data(start_date timestamptz DEFAULT NULL, end_date timestamptz DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  WITH fv AS MATERIALIZED (
    SELECT *
    FROM salus_visitas_canales
    WHERE (start_date IS NULL OR fecha_hora_creacion >= start_date)
      AND (end_date IS NULL OR fecha_hora_creacion <= end_date)
      AND (grupo_agenda IS NULL OR UPPER(TRIM(grupo_agenda)) NOT IN ('GUARDIAS', 'GUARDIA CLINICA'))
  )
  SELECT json_build_object(

    -- KPIs globales
    'kpis_global', (
      SELECT json_build_object(
        'total', COUNT(*),
        'asistidos', SUM(CASE WHEN asistencia = 'Presente' THEN 1 ELSE 0 END),
        'ausentes', SUM(CASE WHEN asistencia = 'Ausencia injustificada' AND fecha_visita < CURRENT_DATE THEN 1 ELSE 0 END),
        'ausentes_justificados', SUM(CASE WHEN asistencia = 'Ausencia justificada' AND fecha_visita < CURRENT_DATE THEN 1 ELSE 0 END)
      )
      FROM fv
    ),

    -- KPIs por canal
    'kpis_por_canal', COALESCE((
      SELECT json_agg(row_to_json(sub))
      FROM (
        SELECT 
          canal_creacion as canal,
          COUNT(*) as total,
          SUM(CASE WHEN asistencia = 'Presente' THEN 1 ELSE 0 END) as asistidos,
          SUM(CASE WHEN asistencia = 'Ausencia injustificada' AND fecha_visita < CURRENT_DATE THEN 1 ELSE 0 END) as ausentes,
          SUM(CASE WHEN asistencia = 'Ausencia justificada' AND fecha_visita < CURRENT_DATE THEN 1 ELSE 0 END) as ausentes_justificados,
          ROUND(
            SUM(CASE WHEN asistencia = 'Presente' THEN 1 ELSE 0 END) * 100.0 / 
            NULLIF(SUM(CASE WHEN asistencia IN ('Presente','Ausencia injustificada','Ausencia justificada') AND fecha_visita < CURRENT_DATE THEN 1 ELSE 0 END), 0)
          , 1) as tasa_asistencia,
          ROUND(
            SUM(CASE WHEN asistencia = 'Ausencia injustificada' AND fecha_visita < CURRENT_DATE THEN 1 ELSE 0 END) * 100.0 / 
            NULLIF(SUM(CASE WHEN asistencia IN ('Presente','Ausencia injustificada','Ausencia justificada') AND fecha_visita < CURRENT_DATE THEN 1 ELSE 0 END), 0)
          , 1) as tasa_ausentismo
        FROM fv
        WHERE canal_creacion IS NOT NULL
        GROUP BY canal_creacion
        ORDER BY total DESC
      ) sub
    ), '[]'::json),

    -- Tendencia mensual por canal (para stacked area chart)
    'tendencia_por_canal', COALESCE((
      SELECT json_agg(row_to_json(sub))
      FROM (
        SELECT 
          DATE_TRUNC('month', fecha_hora_creacion) as mes,
          SUM(CASE WHEN canal_creacion = 'Contact Center' THEN 1 ELSE 0 END) as contact_center,
          SUM(CASE WHEN canal_creacion = 'Recepciones' THEN 1 ELSE 0 END) as recepciones,
          SUM(CASE WHEN canal_creacion = 'Turnos Online' THEN 1 ELSE 0 END) as turnos_online,
          COUNT(*) as total
        FROM fv
        WHERE fecha_hora_creacion IS NOT NULL
        GROUP BY 1 ORDER BY 1
      ) sub
    ), '[]'::json),

    -- Ausentismo mensual por canal
    'ausentismo_por_canal_mes', COALESCE((
      SELECT json_agg(row_to_json(sub))
      FROM (
        SELECT 
          DATE_TRUNC('month', fecha_visita) as mes,
          SUM(CASE WHEN canal_creacion = 'Contact Center' AND asistencia = 'Ausencia injustificada' THEN 1 ELSE 0 END) as cc_ausentes,
          SUM(CASE WHEN canal_creacion = 'Recepciones' AND asistencia = 'Ausencia injustificada' THEN 1 ELSE 0 END) as rec_ausentes,
          SUM(CASE WHEN canal_creacion = 'Turnos Online' AND asistencia = 'Ausencia injustificada' THEN 1 ELSE 0 END) as online_ausentes
        FROM fv
        WHERE fecha_visita IS NOT NULL AND fecha_visita < CURRENT_DATE
        GROUP BY 1 ORDER BY 1
      ) sub
    ), '[]'::json),

    -- Top 10 responsables por cada canal
    'top_responsables_cc', COALESCE((
      SELECT json_agg(row_to_json(sub))
      FROM (
        SELECT responsable as nombre, COUNT(*) as total,
               SUM(CASE WHEN asistencia = 'Presente' THEN 1 ELSE 0 END) as asistidos,
               SUM(CASE WHEN asistencia = 'Ausencia injustificada' AND fecha_visita < CURRENT_DATE THEN 1 ELSE 0 END) as ausentes
        FROM fv WHERE canal_creacion = 'Contact Center' AND responsable IS NOT NULL AND TRIM(responsable) != ''
        GROUP BY 1 ORDER BY total DESC LIMIT 10
      ) sub
    ), '[]'::json),

    'top_responsables_rec', COALESCE((
      SELECT json_agg(row_to_json(sub))
      FROM (
        SELECT responsable as nombre, COUNT(*) as total,
               SUM(CASE WHEN asistencia = 'Presente' THEN 1 ELSE 0 END) as asistidos,
               SUM(CASE WHEN asistencia = 'Ausencia injustificada' AND fecha_visita < CURRENT_DATE THEN 1 ELSE 0 END) as ausentes
        FROM fv WHERE canal_creacion = 'Recepciones' AND responsable IS NOT NULL AND TRIM(responsable) != ''
        GROUP BY 1 ORDER BY total DESC LIMIT 10
      ) sub
    ), '[]'::json),

    'top_responsables_online', COALESCE((
      SELECT json_agg(row_to_json(sub))
      FROM (
        SELECT responsable as nombre, COUNT(*) as total,
               SUM(CASE WHEN asistencia = 'Presente' THEN 1 ELSE 0 END) as asistidos,
               SUM(CASE WHEN asistencia = 'Ausencia injustificada' AND fecha_visita < CURRENT_DATE THEN 1 ELSE 0 END) as ausentes
        FROM fv WHERE canal_creacion = 'Turnos Online' AND responsable IS NOT NULL AND TRIM(responsable) != ''
        GROUP BY 1 ORDER BY total DESC LIMIT 10
      ) sub
    ), '[]'::json),

    -- Top creadores (usuarios) por canal
    'top_creadores_por_canal', COALESCE((
      SELECT json_agg(row_to_json(sub))
      FROM (
        SELECT 
          usuario_creacion as nombre,
          canal_creacion as canal,
          COUNT(*) as total,
          SUM(CASE WHEN asistencia = 'Ausencia injustificada' AND fecha_visita < CURRENT_DATE THEN 1 ELSE 0 END) as ausentes
        FROM fv 
        WHERE usuario_creacion IS NOT NULL AND TRIM(usuario_creacion) != ''
        GROUP BY 1, 2
        ORDER BY total DESC LIMIT 30
      ) sub
    ), '[]'::json),

    -- Especialidades (grupo agenda) por canal
    'especialidades_por_canal', COALESCE((
      SELECT json_agg(row_to_json(sub))
      FROM (
        SELECT 
          grupo_agenda as especialidad,
          SUM(CASE WHEN canal_creacion = 'Contact Center' THEN 1 ELSE 0 END) as contact_center,
          SUM(CASE WHEN canal_creacion = 'Recepciones' THEN 1 ELSE 0 END) as recepciones,
          SUM(CASE WHEN canal_creacion = 'Turnos Online' THEN 1 ELSE 0 END) as turnos_online,
          COUNT(*) as total
        FROM fv
        WHERE grupo_agenda IS NOT NULL AND TRIM(grupo_agenda) != ''
        GROUP BY 1 ORDER BY total DESC LIMIT 15
      ) sub
    ), '[]'::json),

    -- Distribución horaria por canal
    'heatmap_por_canal', COALESCE((
      SELECT json_agg(row_to_json(sub))
      FROM (
        SELECT 
          EXTRACT(HOUR FROM fecha_hora_creacion AT TIME ZONE 'America/Argentina/Buenos_Aires') as hora,
          SUM(CASE WHEN canal_creacion = 'Contact Center' THEN 1 ELSE 0 END) as contact_center,
          SUM(CASE WHEN canal_creacion = 'Recepciones' THEN 1 ELSE 0 END) as recepciones,
          SUM(CASE WHEN canal_creacion = 'Turnos Online' THEN 1 ELSE 0 END) as turnos_online
        FROM fv
        WHERE fecha_hora_creacion IS NOT NULL
        GROUP BY 1 ORDER BY 1
      ) sub
    ), '[]'::json)

  ) INTO result;

  RETURN result;
END;
$$;

-- Forzar recarga del schema de PostgREST
NOTIFY pgrst, 'reload schema';
