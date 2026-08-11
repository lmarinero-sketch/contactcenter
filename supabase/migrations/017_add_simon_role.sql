-- ============================================
-- Migración: Agregar rol "simon" para acceso exclusivo
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- 1. Ampliar el CHECK constraint para incluir 'simon'
ALTER TABLE cc_profiles DROP CONSTRAINT IF EXISTS cc_profiles_role_check;
ALTER TABLE cc_profiles ADD CONSTRAINT cc_profiles_role_check
  CHECK (role IN ('coordinador', 'agente', 'refuerzo', 'gerente', 'simon'));

-- 2. Permisos: 'simon' solo necesita poder leer (y posiblemente actualizar su propio logbook si aplica).
-- Ya existe "Profiles are viewable by authenticated users"
-- Ya existe "Users can update own profile"

-- Con esto es suficiente, el acceso UI restringe su visión.
