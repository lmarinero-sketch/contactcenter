-- ============================================
-- Contact Center Analytics - BI Views
-- Proyecto: Sanatorio Argentino
-- Descripción: Vistas optimizadas para cargar el dashboard de BI 
-- sin saturar el cliente con 36k+ registros.
-- ============================================

-- 1. KPIs Generales
CREATE OR REPLACE VIEW bi_kpis_visitas AS
SELECT 
  COUNT(*) as total_turnos,
  SUM(CASE WHEN asistencia = 'Presente' THEN 1 ELSE 0 END) as asistidos,
  SUM(CASE WHEN asistencia = 'Ausencia injustificada' THEN 1 ELSE 0 END) as ausentes
FROM salus_visitas;

-- 2. Heatmap de Creación (Día de la semana vs Hora)
-- Extrae el día de la semana (1=Lunes, 7=Domingo) y la hora (0-23)
CREATE OR REPLACE VIEW bi_heatmap_creacion AS
SELECT 
  EXTRACT(ISODOW FROM fecha_hora_creacion) as dia_semana,
  EXTRACT(HOUR FROM fecha_hora_creacion) as hora,
  COUNT(*) as cantidad
FROM salus_visitas
WHERE fecha_hora_creacion IS NOT NULL
GROUP BY 1, 2
ORDER BY 1, 2;

-- 3. Tendencia Mensual
CREATE OR REPLACE VIEW bi_tendencia_mensual AS
SELECT 
  DATE_TRUNC('month', fecha_hora_creacion) as mes,
  COUNT(*) as cantidad,
  SUM(CASE WHEN asistencia = 'Presente' THEN 1 ELSE 0 END) as asistidos
FROM salus_visitas
WHERE fecha_hora_creacion IS NOT NULL
GROUP BY 1
ORDER BY 1;

-- 4. Top Agentes (Usuarios de Creación)
CREATE OR REPLACE VIEW bi_top_agentes AS
SELECT 
  usuario_creacion as agente,
  COUNT(*) as cantidad
FROM salus_visitas
WHERE usuario_creacion IS NOT NULL AND usuario_creacion != 'NULL'
GROUP BY 1
ORDER BY 2 DESC
LIMIT 10;

-- Otorgar permisos de lectura a los roles anónimos y autenticados
GRANT SELECT ON bi_kpis_visitas TO anon, authenticated;
GRANT SELECT ON bi_heatmap_creacion TO anon, authenticated;
GRANT SELECT ON bi_tendencia_mensual TO anon, authenticated;
GRANT SELECT ON bi_top_agentes TO anon, authenticated;
