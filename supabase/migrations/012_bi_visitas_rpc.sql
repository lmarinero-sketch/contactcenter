-- ============================================
-- Contact Center Analytics - BI Visitas RPC
-- Proyecto: Sanatorio Argentino
-- Descripción: Stored procedure para retornar todos los datos 
-- del dashboard agregados dinámicamente según un rango de fechas.
-- ============================================

CREATE OR REPLACE FUNCTION bi_visitas_dashboard_data(start_date timestamptz DEFAULT NULL, end_date timestamptz DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  result json;
BEGIN
  WITH filtered AS (
    SELECT *
    FROM salus_visitas
    WHERE (start_date IS NULL OR fecha_hora_creacion >= start_date)
      AND (end_date IS NULL OR fecha_hora_creacion <= end_date)
      AND fecha_hora_creacion >= '2025-06-01 00:00:00'
      AND usuario_creacion IN (
        'OLIVIER ESQUIVEL, SOFIA FERNANDA',
        'ACOSTA ESQUIVEL, MARIA ANTONELLA',
        'AGUILERA CARDOZO, DANIELA ROMINA'
      )
  ),
  kpis AS (
    SELECT
      COUNT(*) as total_turnos,
      SUM(CASE WHEN asistencia = 'Presente' THEN 1 ELSE 0 END) as asistidos,
      SUM(CASE WHEN asistencia = 'Ausencia injustificada' THEN 1 ELSE 0 END) as ausentes,
      SUM(CASE WHEN asistencia = 'Ausencia justificada' THEN 1 ELSE 0 END) as ausentes_justificados
    FROM filtered
  ),
  heatmap AS (
    SELECT
      EXTRACT(ISODOW FROM fecha_hora_creacion) as dia_semana,
      EXTRACT(HOUR FROM fecha_hora_creacion) as hora,
      COUNT(*) as cantidad
    FROM filtered
    WHERE fecha_hora_creacion IS NOT NULL
    GROUP BY 1, 2
  ),
  tendencia AS (
    SELECT
      DATE_TRUNC('month', fecha_hora_creacion) as mes,
      COUNT(*) as cantidad,
      SUM(CASE WHEN asistencia = 'Presente' THEN 1 ELSE 0 END) as asistidos
    FROM filtered
    WHERE fecha_hora_creacion IS NOT NULL
    GROUP BY 1
    ORDER BY 1
  ),
  top_agentes AS (
    SELECT
      usuario_creacion as agente,
      COUNT(*) as cantidad
    FROM filtered
    WHERE usuario_creacion IS NOT NULL AND usuario_creacion != 'NULL'
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 10
  ),
  top_especialidades AS (
    SELECT
      grupo_agenda as especialidad,
      COUNT(*) as cantidad
    FROM filtered
    WHERE grupo_agenda IS NOT NULL AND grupo_agenda != 'NULL'
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 10
  ),
  top_responsables AS (
    SELECT
      responsable as nombre,
      COUNT(*) as cantidad
    FROM filtered
    WHERE responsable IS NOT NULL AND responsable != 'NULL'
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 10
  )
  SELECT json_build_object(
    'kpis', COALESCE((SELECT row_to_json(kpis) FROM kpis), '{"total_turnos":0,"asistidos":0,"ausentes":0,"ausentes_justificados":0}'::json),
    'heatmap', COALESCE((SELECT json_agg(row_to_json(heatmap)) FROM heatmap), '[]'::json),
    'tendencia', COALESCE((SELECT json_agg(row_to_json(tendencia)) FROM tendencia), '[]'::json),
    'top_agentes', COALESCE((SELECT json_agg(row_to_json(top_agentes)) FROM top_agentes), '[]'::json),
    'top_especialidades', COALESCE((SELECT json_agg(row_to_json(top_especialidades)) FROM top_especialidades), '[]'::json),
    'top_responsables', COALESCE((SELECT json_agg(row_to_json(top_responsables)) FROM top_responsables), '[]'::json)
  ) INTO result;

  RETURN result;
END;
$$;

-- Notificamos a PostgREST para que detecte la nueva función
NOTIFY pgrst, 'reload schema';
