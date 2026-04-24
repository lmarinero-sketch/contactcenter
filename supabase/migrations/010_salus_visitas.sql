-- ============================================
-- Contact Center Analytics - Visitas Histórico
-- Proyecto: Sanatorio Argentino
-- ============================================

CREATE TABLE IF NOT EXISTS salus_visitas_historico (
  id_visita BIGINT PRIMARY KEY,
  id_paciente BIGINT,
  asistencia TEXT,
  paciente TEXT,
  nif TEXT,
  telefono TEXT,
  email TEXT,
  comentarios TEXT,
  grupo_agenda TEXT,
  cliente TEXT,
  sexo TEXT,
  edad INTEGER,
  poblacion TEXT,
  responsable TEXT,
  tipo_visita TEXT,
  fecha_visita DATE,
  hora_inicio TEXT,
  hora_fin TEXT,
  centro TEXT,
  fecha_hora_creacion TIMESTAMP,
  usuario_creacion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance y filtros BI
CREATE INDEX IF NOT EXISTS idx_salus_visitas_nif ON salus_visitas_historico(nif);
CREATE INDEX IF NOT EXISTS idx_salus_visitas_fecha ON salus_visitas_historico(fecha_visita);
CREATE INDEX IF NOT EXISTS idx_salus_visitas_asistencia ON salus_visitas_historico(asistencia);
CREATE INDEX IF NOT EXISTS idx_salus_visitas_responsable ON salus_visitas_historico(responsable);
CREATE INDEX IF NOT EXISTS idx_salus_visitas_tipo ON salus_visitas_historico(tipo_visita);

-- RLS (Row Level Security)
ALTER TABLE salus_visitas_historico ENABLE ROW LEVEL SECURITY;

-- Políticas
CREATE POLICY "Allow read access" ON salus_visitas_historico FOR SELECT USING (true);
CREATE POLICY "Allow service insert" ON salus_visitas_historico FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service update" ON salus_visitas_historico FOR UPDATE USING (true);
