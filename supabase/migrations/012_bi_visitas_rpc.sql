-- ============================================
-- Contact Center Analytics - BI Visitas RPC
-- Proyecto: Sanatorio Argentino
-- Descripción: Stored procedure optimizado con CTE Materializado
-- ============================================

-- 1. Crear índices críticos para evitar Timeout (Seq Scan)
CREATE INDEX IF NOT EXISTS idx_salus_visitas_creacion ON salus_visitas(fecha_hora_creacion);
CREATE INDEX IF NOT EXISTS idx_salus_visitas_usuario ON salus_visitas(usuario_creacion);

-- 2. Crear la función RPC optimizada
CREATE OR REPLACE FUNCTION bi_visitas_dashboard_data(start_date timestamptz DEFAULT NULL, end_date timestamptz DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  result json;
BEGIN
  WITH filtered_visitas AS MATERIALIZED (
    SELECT *
    FROM salus_visitas
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
               CAST(SPLIT_PART(hora_inicio, ':', 1) AS INTEGER) as hora, 
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
        SELECT DATE_TRUNC('day', fecha_visita) as dia, COUNT(*) as cantidad
        FROM filtered_visitas
        WHERE fecha_visita IS NOT NULL
          AND fecha_visita < CURRENT_DATE
          AND asistencia = 'Ausencia injustificada'
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
    ), '[]'::json)
  ) INTO result;

  RETURN result;
END;
$$;

NOTIFY pgrst, 'reload schema';
