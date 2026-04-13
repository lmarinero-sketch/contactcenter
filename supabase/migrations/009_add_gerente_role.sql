-- ============================================
-- Migración: Agregar rol "gerente" + perfil Sergio Femenia
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- 1. Ampliar el CHECK constraint para incluir 'gerente'
ALTER TABLE cc_profiles DROP CONSTRAINT IF EXISTS cc_profiles_role_check;
ALTER TABLE cc_profiles ADD CONSTRAINT cc_profiles_role_check
  CHECK (role IN ('coordinador', 'agente', 'refuerzo', 'gerente'));

-- 2. Actualizar perfil de Sergio Femenia
INSERT INTO cc_profiles (id, full_name, role)
SELECT id, 'Sergio Femenia', 'gerente'
FROM auth.users WHERE email = 'sfemenia@sanatorioargentino.com.ar'
ON CONFLICT (id) DO UPDATE SET full_name = 'Sergio Femenia', role = 'gerente';

-- 3. Asegurar que gerente tenga permisos de lectura/escritura en shifts (igual que coordinador)
-- Las policies existentes de SELECT ya usan USING(true) para authenticated, así que puede ver todo.
-- Para shifts, logbook: agregar 'gerente' a las policies de escritura

-- Shifts: INSERT
DROP POLICY IF EXISTS "Coordinadores can insert shifts" ON cc_shifts;
CREATE POLICY "Coordinadores can insert shifts"
  ON cc_shifts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM cc_profiles WHERE id = auth.uid() AND role IN ('coordinador', 'gerente')));

-- Shifts: UPDATE
DROP POLICY IF EXISTS "Coordinadores can update shifts" ON cc_shifts;
CREATE POLICY "Coordinadores can update shifts"
  ON cc_shifts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM cc_profiles WHERE id = auth.uid() AND role IN ('coordinador', 'gerente')));

-- Shifts: DELETE
DROP POLICY IF EXISTS "Coordinadores can delete shifts" ON cc_shifts;
CREATE POLICY "Coordinadores can delete shifts"
  ON cc_shifts FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM cc_profiles WHERE id = auth.uid() AND role IN ('coordinador', 'gerente')));

-- Logbook: INSERT (gerente también puede escribir)
DROP POLICY IF EXISTS "Coordinadores and agentes can insert logbook entries" ON cc_logbook;
CREATE POLICY "Coordinadores and agentes can insert logbook entries"
  ON cc_logbook FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM cc_profiles WHERE id = auth.uid() AND role IN ('coordinador', 'agente', 'gerente')));

-- Logbook: DELETE (gerente puede borrar cualquier entrada)
DROP POLICY IF EXISTS "Author or coordinador can delete logbook entries" ON cc_logbook;
CREATE POLICY "Author or coordinador can delete logbook entries"
  ON cc_logbook FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR EXISTS (SELECT 1 FROM cc_profiles WHERE id = auth.uid() AND role IN ('coordinador', 'gerente')));

-- Logbook: UPDATE
DROP POLICY IF EXISTS "Author or coordinador can update logbook entries" ON cc_logbook;
CREATE POLICY "Author or coordinador can update logbook entries"
  ON cc_logbook FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR EXISTS (SELECT 1 FROM cc_profiles WHERE id = auth.uid() AND role IN ('coordinador', 'gerente')));

-- Profiles: Gerente puede actualizar cualquier perfil
DROP POLICY IF EXISTS "Coordinadores can update any profile" ON cc_profiles;
CREATE POLICY "Coordinadores can update any profile"
  ON cc_profiles FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM cc_profiles WHERE id = auth.uid() AND role IN ('coordinador', 'gerente')));

-- Verificar resultado
SELECT p.full_name, p.role, u.email
FROM cc_profiles p
JOIN auth.users u ON p.id = u.id
ORDER BY p.role, p.full_name;
