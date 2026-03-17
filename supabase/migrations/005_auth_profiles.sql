-- ============================================
-- Contact Center — Auth Profiles
-- Perfiles de usuario vinculados a auth.users
-- Roles: coordinador, agente, refuerzo
-- ============================================

CREATE TABLE IF NOT EXISTS cc_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'agente' CHECK (role IN ('coordinador', 'agente', 'refuerzo')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: crear perfil automáticamente al registrar usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.cc_profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'agente')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS
ALTER TABLE cc_profiles ENABLE ROW LEVEL SECURITY;

-- Todos los usuarios autenticados pueden leer todos los perfiles
CREATE POLICY "Profiles are viewable by authenticated users"
  ON cc_profiles FOR SELECT
  TO authenticated
  USING (true);

-- Cada usuario puede actualizar su propio perfil
CREATE POLICY "Users can update own profile"
  ON cc_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- Coordinadores pueden actualizar cualquier perfil
CREATE POLICY "Coordinadores can update any profile"
  ON cc_profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cc_profiles
      WHERE id = auth.uid() AND role = 'coordinador'
    )
  );
