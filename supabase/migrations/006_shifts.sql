-- ============================================
-- Contact Center — Shift Calendar (Diagrama de Turnos)
-- ============================================

CREATE TABLE IF NOT EXISTS cc_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL,
  shift_date DATE NOT NULL,
  shift_type TEXT NOT NULL CHECK (shift_type IN ('M', 'T', 'I', 'V', 'F')),
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_name, shift_date)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_cc_shifts_date ON cc_shifts(shift_date);
CREATE INDEX IF NOT EXISTS idx_cc_shifts_agent ON cc_shifts(agent_name);
CREATE INDEX IF NOT EXISTS idx_cc_shifts_month ON cc_shifts(shift_date) WHERE shift_date IS NOT NULL;

-- RLS
ALTER TABLE cc_shifts ENABLE ROW LEVEL SECURITY;

-- Todos los autenticados pueden leer
CREATE POLICY "Shifts are viewable by authenticated users"
  ON cc_shifts FOR SELECT
  TO authenticated
  USING (true);

-- Solo coordinadores pueden insertar
CREATE POLICY "Coordinadores can insert shifts"
  ON cc_shifts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cc_profiles
      WHERE id = auth.uid() AND role = 'coordinador'
    )
  );

-- Solo coordinadores pueden actualizar
CREATE POLICY "Coordinadores can update shifts"
  ON cc_shifts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cc_profiles
      WHERE id = auth.uid() AND role = 'coordinador'
    )
  );

-- Solo coordinadores pueden eliminar
CREATE POLICY "Coordinadores can delete shifts"
  ON cc_shifts FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cc_profiles
      WHERE id = auth.uid() AND role = 'coordinador'
    )
  );
