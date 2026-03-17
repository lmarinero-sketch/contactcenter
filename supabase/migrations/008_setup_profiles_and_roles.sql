-- ============================================
-- SCRIPT UNIFICADO: Tablas + Perfiles + Roles
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- ========== 1. TABLA cc_profiles ==========
CREATE TABLE IF NOT EXISTS cc_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'agente' CHECK (role IN ('coordinador', 'agente', 'refuerzo')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para futuros usuarios
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.cc_profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'agente')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS para cc_profiles
ALTER TABLE cc_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON cc_profiles;
CREATE POLICY "Profiles are viewable by authenticated users"
  ON cc_profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON cc_profiles;
CREATE POLICY "Users can update own profile"
  ON cc_profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "Coordinadores can update any profile" ON cc_profiles;
CREATE POLICY "Coordinadores can update any profile"
  ON cc_profiles FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM cc_profiles WHERE id = auth.uid() AND role = 'coordinador'));

-- ========== 2. TABLA cc_shifts ==========
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

CREATE INDEX IF NOT EXISTS idx_cc_shifts_date ON cc_shifts(shift_date);
CREATE INDEX IF NOT EXISTS idx_cc_shifts_agent ON cc_shifts(agent_name);

ALTER TABLE cc_shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shifts are viewable by authenticated users" ON cc_shifts;
CREATE POLICY "Shifts are viewable by authenticated users"
  ON cc_shifts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Coordinadores can insert shifts" ON cc_shifts;
CREATE POLICY "Coordinadores can insert shifts"
  ON cc_shifts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM cc_profiles WHERE id = auth.uid() AND role = 'coordinador'));

DROP POLICY IF EXISTS "Coordinadores can update shifts" ON cc_shifts;
CREATE POLICY "Coordinadores can update shifts"
  ON cc_shifts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM cc_profiles WHERE id = auth.uid() AND role = 'coordinador'));

DROP POLICY IF EXISTS "Coordinadores can delete shifts" ON cc_shifts;
CREATE POLICY "Coordinadores can delete shifts"
  ON cc_shifts FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM cc_profiles WHERE id = auth.uid() AND role = 'coordinador'));

-- ========== 3. TABLA cc_logbook ==========
CREATE TABLE IF NOT EXISTS cc_logbook (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('novedad', 'sugerencia', 'problema', 'peticion', 'cambio_turno')),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  author_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cc_logbook_category ON cc_logbook(category);
CREATE INDEX IF NOT EXISTS idx_cc_logbook_date ON cc_logbook(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cc_logbook_author ON cc_logbook(created_by);

ALTER TABLE cc_logbook ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Logbook entries are viewable by authenticated users" ON cc_logbook;
CREATE POLICY "Logbook entries are viewable by authenticated users"
  ON cc_logbook FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Coordinadores and agentes can insert logbook entries" ON cc_logbook;
CREATE POLICY "Coordinadores and agentes can insert logbook entries"
  ON cc_logbook FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM cc_profiles WHERE id = auth.uid() AND role IN ('coordinador', 'agente')));

DROP POLICY IF EXISTS "Author or coordinador can delete logbook entries" ON cc_logbook;
CREATE POLICY "Author or coordinador can delete logbook entries"
  ON cc_logbook FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR EXISTS (SELECT 1 FROM cc_profiles WHERE id = auth.uid() AND role = 'coordinador'));

DROP POLICY IF EXISTS "Author or coordinador can update logbook entries" ON cc_logbook;
CREATE POLICY "Author or coordinador can update logbook entries"
  ON cc_logbook FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR EXISTS (SELECT 1 FROM cc_profiles WHERE id = auth.uid() AND role = 'coordinador'));

-- ========== 4. CREAR PERFILES PARA USUARIOS EXISTENTES ==========
-- Asignar roles a los usuarios que ya existen en auth.users

INSERT INTO cc_profiles (id, full_name, role)
SELECT id, 'Leonardo Marinero', 'coordinador'
FROM auth.users WHERE email = 'lmarinero@sanatorioargentino.com.ar'
ON CONFLICT (id) DO UPDATE SET full_name = 'Leonardo Marinero', role = 'coordinador';

INSERT INTO cc_profiles (id, full_name, role)
SELECT id, 'Daniela', 'agente'
FROM auth.users WHERE email = 'daniela@contactcenter.com'
ON CONFLICT (id) DO UPDATE SET full_name = 'Daniela', role = 'agente';

INSERT INTO cc_profiles (id, full_name, role)
SELECT id, 'Antonella', 'agente'
FROM auth.users WHERE email = 'antonela@contactcenter.com'
ON CONFLICT (id) DO UPDATE SET full_name = 'Antonella', role = 'agente';

INSERT INTO cc_profiles (id, full_name, role)
SELECT id, 'Sofia', 'agente'
FROM auth.users WHERE email = 'sofia@contactcenter.com'
ON CONFLICT (id) DO UPDATE SET full_name = 'Sofia', role = 'agente';

-- Verificar resultado
SELECT p.full_name, p.role, u.email
FROM cc_profiles p
JOIN auth.users u ON p.id = u.id
ORDER BY p.role, p.full_name;
