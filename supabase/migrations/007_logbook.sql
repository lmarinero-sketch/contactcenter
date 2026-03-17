-- ============================================
-- Contact Center — Bitácora (Logbook)
-- ============================================

CREATE TABLE IF NOT EXISTS cc_logbook (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('novedad', 'sugerencia', 'problema', 'peticion', 'cambio_turno')),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  author_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_cc_logbook_category ON cc_logbook(category);
CREATE INDEX IF NOT EXISTS idx_cc_logbook_date ON cc_logbook(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cc_logbook_author ON cc_logbook(created_by);

-- RLS
ALTER TABLE cc_logbook ENABLE ROW LEVEL SECURITY;

-- Todos los autenticados pueden leer
CREATE POLICY "Logbook entries are viewable by authenticated users"
  ON cc_logbook FOR SELECT
  TO authenticated
  USING (true);

-- Coordinadores y agentes pueden insertar
CREATE POLICY "Coordinadores and agentes can insert logbook entries"
  ON cc_logbook FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cc_profiles
      WHERE id = auth.uid() AND role IN ('coordinador', 'agente')
    )
  );

-- Solo el autor o coordinador puede eliminar
CREATE POLICY "Author or coordinador can delete logbook entries"
  ON cc_logbook FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM cc_profiles
      WHERE id = auth.uid() AND role = 'coordinador'
    )
  );

-- Solo el autor o coordinador puede actualizar
CREATE POLICY "Author or coordinador can update logbook entries"
  ON cc_logbook FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM cc_profiles
      WHERE id = auth.uid() AND role = 'coordinador'
    )
  );
