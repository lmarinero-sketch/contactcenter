-- ============================================
-- Simon IA - Upgrade Fase 1: Multi-Encargado
-- Proyecto: Sanatorio Argentino
-- ============================================

-- 1. Tabla de historial de actividades (Audit Trail)
CREATE TABLE IF NOT EXISTS rag_activity_log (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_name TEXT,
    action TEXT NOT NULL,        -- 'upload', 'delete', 'create_rule', 'edit_rule', 'sync'
    resource_type TEXT NOT NULL, -- 'document', 'rule', 'folder', 'system'
    resource_id TEXT,
    resource_name TEXT,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsqueda rápida y ordenamiento
CREATE INDEX IF NOT EXISTS idx_rag_activity_log_user_id ON rag_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_rag_activity_log_action ON rag_activity_log(action);
CREATE INDEX IF NOT EXISTS idx_rag_activity_log_resource_type ON rag_activity_log(resource_type);
CREATE INDEX IF NOT EXISTS idx_rag_activity_log_created_at ON rag_activity_log(created_at DESC);

-- RLS Policies para rag_activity_log
ALTER TABLE rag_activity_log ENABLE ROW LEVEL SECURITY;

-- Todos los usuarios autenticados pueden ver la actividad (o podríamos restringir a gerente/coordinador)
CREATE POLICY "Permitir lectura de actividad a autenticados" 
ON rag_activity_log FOR SELECT TO authenticated USING (true);

-- Permisos de inserción (cualquier acción autenticada queda registrada)
CREATE POLICY "Permitir insertar actividad a autenticados" 
ON rag_activity_log FOR INSERT TO authenticated WITH CHECK (true);

-- No permitimos DELETE ni UPDATE en el audit trail para asegurar inmutabilidad
