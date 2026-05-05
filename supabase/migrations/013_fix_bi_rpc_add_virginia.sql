-- ============================================
-- Contact Center Analytics - FIX BI + Nueva Agente Virginia
-- Proyecto: Sanatorio Argentino
-- Fecha: 2026-05-05
-- 
-- SEGURIDAD: Este script es 100% safe:
--   ✅ DROP FUNCTION IF EXISTS — no falla si no existe
--   ✅ CREATE INDEX IF NOT EXISTS — no falla si ya existen
--   ✅ INSERT ON CONFLICT DO UPDATE — no duplica datos
--   ✅ No borra datos, no altera tablas
-- ============================================

-- ══════════════════════════════════════════════
-- PARTE 1: Agregar Virginia como agente del CC
-- ══════════════════════════════════════════════
INSERT INTO cc_agent_config (agent_name, role, display_name) VALUES
  ('Virginia', 'human', 'Virginia')
ON CONFLICT (agent_name) DO UPDATE SET
  role = EXCLUDED.role,
  display_name = EXCLUDED.display_name;

-- ══════════════════════════════════════════════
-- PARTE 2: Re-crear la función RPC del BI
-- (Fix: los datos nuevos del Excel no se reflejaban)
-- ══════════════════════════════════════════════

-- 1. Borrar función vieja (safe — IF EXISTS)
DROP FUNCTION IF EXISTS bi_visitas_dashboard_data(timestamptz, timestamptz);

-- 2. Índices para performance (safe — IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_salus_visitas_hist_creacion ON salus_visitas_historico(fecha_hora_creacion);
CREATE INDEX IF NOT EXISTS idx_salus_visitas_hist_usuario ON salus_visitas_historico(usuario_creacion);
CREATE INDEX IF NOT EXISTS idx_salus_visitas_hist_fecha_visita ON salus_visitas_historico(fecha_visita);

-- 3. Crear función RPC con VOLATILE (nunca cachea resultados)
CREATE OR REPLACE FUNCTION bi_visitas_dashboard_data(start_date timestamptz DEFAULT NULL, end_date timestamptz DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  WITH filtered_visitas AS MATERIALIZED (
    SELECT *
    FROM salus_visitas_historico
    WHERE (start_date IS NULL OR fecha_hora_creacion >= start_date)
      AND (end_date IS NULL OR fecha_hora_creacion <= end_date)
  )
  SELECT json_build_object(
    'kpis', (
      SELECT json_build_object(
        'total_turnos', COUNT(*),
        'asistidos', SUM(CASE WHEN asistencia = 'Presente' THEN 1 ELSE 0 END),
        'ausentes', SUM(CASE WHEN asistencia = 'Ausencia injustificada' AND fecha_visita < CURRENT_DATE THEN 1 ELSE 0 END),
        'ausentes_justificados', SUM(CASE WHEN asistencia = 'Ausencia justificada' AND fecha_visita < CURRENT_DATE THEN 1 ELSE 0 END)
      )
      FROM filtered_visitas
    ),
    'heatmap', COALESCE((
      SELECT json_agg(json_build_object('dia_semana', dia_semana, 'hora', hora, 'cantidad', cantidad))
      FROM (
        SELECT EXTRACT(ISODOW FROM (fecha_hora_creacion - INTERVAL '6 hours') AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires') as dia_semana, 
               EXTRACT(HOUR FROM (fecha_hora_creacion - INTERVAL '6 hours') AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires') as hora, 
               COUNT(*) as cantidad
        FROM filtered_visitas
        GROUP BY 1, 2
      ) sub
    ), '[]'::json),
    'heatmap_brindados', COALESCE((
      SELECT json_agg(json_build_object('dia_semana', dia_semana, 'hora', hora, 'cantidad', cantidad))
      FROM (
        SELECT EXTRACT(ISODOW FROM fecha_visita) as dia_semana, 
               CAST(SPLIT_PART(hora_inicio, ':', 1) AS integer) as hora, 
               COUNT(*) as cantidad
        FROM filtered_visitas
        WHERE fecha_visita IS NOT NULL
          AND hora_inicio ~ '^[0-9]{1,2}:'
        GROUP BY 1, 2
      ) sub
    ), '[]'::json),
    'ausentismo_dia_mes', COALESCE((
      SELECT json_agg(json_build_object('dia', dia, 'cantidad', cantidad))
      FROM (
        SELECT 
          EXTRACT(DAY FROM fecha) as dia, 
          ROUND(AVG(ausentes), 1) as cantidad
        FROM (
          SELECT DATE_TRUNC('day', fecha_visita) as fecha, COUNT(*) as ausentes
          FROM filtered_visitas
          WHERE fecha_visita IS NOT NULL
            AND fecha_visita < CURRENT_DATE
            AND asistencia = 'Ausencia injustificada'
          GROUP BY 1
        ) daily
        GROUP BY 1 ORDER BY 1
      ) sub
    ), '[]'::json),
    'tendencia_brindados', COALESCE((
      SELECT json_agg(json_build_object('mes', mes, 'cantidad', cantidad))
      FROM (
        SELECT DATE_TRUNC('month', fecha_visita) as mes, COUNT(*) as cantidad
        FROM filtered_visitas
        WHERE fecha_visita IS NOT NULL
        GROUP BY 1 ORDER BY 1
      ) sub
    ), '[]'::json),
    'tendencia', COALESCE((
      SELECT json_agg(json_build_object('mes', mes, 'cantidad', cantidad, 'asistidos', asistidos))
      FROM (
        SELECT DATE_TRUNC('month', fecha_hora_creacion) as mes, COUNT(*) as cantidad, SUM(CASE WHEN asistencia = 'Presente' THEN 1 ELSE 0 END) as asistidos
        FROM filtered_visitas
        GROUP BY 1 ORDER BY 1
      ) sub
    ), '[]'::json),
    'top_agentes', COALESCE((
      SELECT json_agg(json_build_object('agente', agente, 'cantidad', cantidad))
      FROM (
        SELECT usuario_creacion as agente, COUNT(*) as cantidad
        FROM filtered_visitas
        GROUP BY 1 ORDER BY 2 DESC LIMIT 10
      ) sub
    ), '[]'::json),
    'top_especialidades', COALESCE((
      SELECT json_agg(json_build_object('especialidad', especialidad, 'cantidad', cantidad))
      FROM (
        SELECT grupo_agenda as especialidad, COUNT(*) as cantidad
        FROM filtered_visitas
        WHERE grupo_agenda IS NOT NULL AND grupo_agenda != 'NULL'
        GROUP BY 1 ORDER BY 2 DESC LIMIT 10
      ) sub
    ), '[]'::json),
    'top_responsables', COALESCE((
      SELECT json_agg(json_build_object('nombre', nombre, 'cantidad', cantidad))
      FROM (
        SELECT responsable as nombre, COUNT(*) as cantidad
        FROM filtered_visitas
        WHERE responsable IS NOT NULL AND responsable != 'NULL'
        GROUP BY 1 ORDER BY 2 DESC LIMIT 10
      ) sub
    ), '[]'::json),
    'top_poblacion', COALESCE((
      SELECT json_agg(json_build_object('poblacion', poblacion, 'cantidad', cantidad))
      FROM (
        SELECT poblacion, COUNT(*) as cantidad
        FROM filtered_visitas
        WHERE poblacion IS NOT NULL AND poblacion != 'NULL' AND TRIM(poblacion) != ''
        GROUP BY 1 ORDER BY 2 DESC LIMIT 10
      ) sub
    ), '[]'::json),
    'ausentismo_analisis', (
      SELECT json_build_object(
        'por_responsable', COALESCE((
          SELECT json_agg(json_build_object('nombre', nombre, 'tasa', tasa, 'total', total, 'ausentes', ausentes))
          FROM (
            SELECT responsable as nombre, 
                   COUNT(*) FILTER (WHERE fecha_visita < CURRENT_DATE) as total,
                   COUNT(*) FILTER (WHERE asistencia = 'Ausencia injustificada' AND fecha_visita < CURRENT_DATE) as ausentes,
                   ROUND(COUNT(*) FILTER (WHERE asistencia = 'Ausencia injustificada' AND fecha_visita < CURRENT_DATE) * 100.0 / NULLIF(COUNT(*) FILTER (WHERE fecha_visita < CURRENT_DATE), 0), 1) as tasa
            FROM filtered_visitas
            WHERE responsable IS NOT NULL AND TRIM(responsable) != ''
            GROUP BY 1 HAVING COUNT(*) FILTER (WHERE asistencia = 'Ausencia injustificada' AND fecha_visita < CURRENT_DATE) > 0
            ORDER BY ausentes DESC LIMIT 10
          ) sub
        ), '[]'::json),
        'por_grupo_agenda', COALESCE((
          SELECT json_agg(json_build_object('nombre', nombre, 'tasa', tasa, 'total', total, 'ausentes', ausentes))
          FROM (
            SELECT grupo_agenda as nombre, 
                   COUNT(*) FILTER (WHERE fecha_visita < CURRENT_DATE) as total,
                   COUNT(*) FILTER (WHERE asistencia = 'Ausencia injustificada' AND fecha_visita < CURRENT_DATE) as ausentes,
                   ROUND(COUNT(*) FILTER (WHERE asistencia = 'Ausencia injustificada' AND fecha_visita < CURRENT_DATE) * 100.0 / NULLIF(COUNT(*) FILTER (WHERE fecha_visita < CURRENT_DATE), 0), 1) as tasa
            FROM filtered_visitas
            WHERE grupo_agenda IS NOT NULL AND TRIM(grupo_agenda) != '' AND grupo_agenda != 'NULL'
            GROUP BY 1 HAVING COUNT(*) FILTER (WHERE asistencia = 'Ausencia injustificada' AND fecha_visita < CURRENT_DATE) > 0
            ORDER BY ausentes DESC LIMIT 10
          ) sub
        ), '[]'::json),
        'por_tipo_visita', COALESCE((
          SELECT json_agg(json_build_object('nombre', nombre, 'tasa', tasa, 'total', total, 'ausentes', ausentes))
          FROM (
            SELECT tipo_visita as nombre, 
                   COUNT(*) FILTER (WHERE fecha_visita < CURRENT_DATE) as total,
                   COUNT(*) FILTER (WHERE asistencia = 'Ausencia injustificada' AND fecha_visita < CURRENT_DATE) as ausentes,
                   ROUND(COUNT(*) FILTER (WHERE asistencia = 'Ausencia injustificada' AND fecha_visita < CURRENT_DATE) * 100.0 / NULLIF(COUNT(*) FILTER (WHERE fecha_visita < CURRENT_DATE), 0), 1) as tasa
            FROM filtered_visitas
            WHERE tipo_visita IS NOT NULL AND TRIM(tipo_visita) != ''
            GROUP BY 1 HAVING COUNT(*) FILTER (WHERE asistencia = 'Ausencia injustificada' AND fecha_visita < CURRENT_DATE) > 0
            ORDER BY ausentes DESC LIMIT 10
          ) sub
        ), '[]'::json),
        'por_obra_social', COALESCE((
          SELECT json_agg(json_build_object('nombre', nombre, 'tasa', tasa, 'total', total, 'ausentes', ausentes))
          FROM (
            SELECT cliente as nombre, 
                   COUNT(*) FILTER (WHERE fecha_visita < CURRENT_DATE) as total,
                   COUNT(*) FILTER (WHERE asistencia = 'Ausencia injustificada' AND fecha_visita < CURRENT_DATE) as ausentes,
                   ROUND(COUNT(*) FILTER (WHERE asistencia = 'Ausencia injustificada' AND fecha_visita < CURRENT_DATE) * 100.0 / NULLIF(COUNT(*) FILTER (WHERE fecha_visita < CURRENT_DATE), 0), 1) as tasa
            FROM filtered_visitas
            WHERE cliente IS NOT NULL AND TRIM(cliente) != ''
            GROUP BY 1 HAVING COUNT(*) FILTER (WHERE asistencia = 'Ausencia injustificada' AND fecha_visita < CURRENT_DATE) > 0
            ORDER BY ausentes DESC LIMIT 10
          ) sub
        ), '[]'::json),
        'por_centro', COALESCE((
          SELECT json_agg(json_build_object('nombre', nombre, 'tasa', tasa, 'total', total, 'ausentes', ausentes))
          FROM (
            SELECT centro as nombre, 
                   COUNT(*) FILTER (WHERE fecha_visita < CURRENT_DATE) as total,
                   COUNT(*) FILTER (WHERE asistencia = 'Ausencia injustificada' AND fecha_visita < CURRENT_DATE) as ausentes,
                   ROUND(COUNT(*) FILTER (WHERE asistencia = 'Ausencia injustificada' AND fecha_visita < CURRENT_DATE) * 100.0 / NULLIF(COUNT(*) FILTER (WHERE fecha_visita < CURRENT_DATE), 0), 1) as tasa
            FROM filtered_visitas
            WHERE centro IS NOT NULL AND TRIM(centro) != ''
            GROUP BY 1 HAVING COUNT(*) FILTER (WHERE asistencia = 'Ausencia injustificada' AND fecha_visita < CURRENT_DATE) > 0
            ORDER BY ausentes DESC LIMIT 10
          ) sub
        ), '[]'::json),
        'por_usuario_creacion', COALESCE((
          SELECT json_agg(json_build_object('nombre', nombre, 'tasa', tasa, 'total', total, 'ausentes', ausentes))
          FROM (
            SELECT usuario_creacion as nombre, 
                   COUNT(*) FILTER (WHERE fecha_visita < CURRENT_DATE) as total,
                   COUNT(*) FILTER (WHERE asistencia = 'Ausencia injustificada' AND fecha_visita < CURRENT_DATE) as ausentes,
                   ROUND(COUNT(*) FILTER (WHERE asistencia = 'Ausencia injustificada' AND fecha_visita < CURRENT_DATE) * 100.0 / NULLIF(COUNT(*) FILTER (WHERE fecha_visita < CURRENT_DATE), 0), 1) as tasa
            FROM filtered_visitas
            WHERE usuario_creacion IS NOT NULL AND TRIM(usuario_creacion) != ''
            GROUP BY 1 HAVING COUNT(*) FILTER (WHERE asistencia = 'Ausencia injustificada' AND fecha_visita < CURRENT_DATE) > 0
            ORDER BY ausentes DESC LIMIT 10
          ) sub
        ), '[]'::json)
      )
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- 4. Forzar recarga del schema de PostgREST
NOTIFY pgrst, 'reload schema';
