-- ============================================
-- Contact Center Analytics - Agent Config Migration
-- Mapeo de agentes y bots conocidos
-- ============================================

-- Tabla de configuración de agentes
CREATE TABLE IF NOT EXISTS cc_agent_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('bot', 'human')),
  display_name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar agentes conocidos
INSERT INTO cc_agent_config (agent_name, role, display_name) VALUES
  ('Betina', 'bot', 'Bot Sanatorio'),
  ('Antonella', 'human', 'Antonella'),
  ('Sofia', 'human', 'Sofía'),
  ('Daniela', 'human', 'Daniela')
ON CONFLICT (agent_name) DO UPDATE SET
  role = EXCLUDED.role,
  display_name = EXCLUDED.display_name;

-- RLS
ALTER TABLE cc_agent_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access" ON cc_agent_config FOR SELECT USING (true);
CREATE POLICY "Allow service insert" ON cc_agent_config FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service update" ON cc_agent_config FOR UPDATE USING (true);

-- Actualizar tickets existentes: si agent_name = 'Betina' y no fue transferido,
-- marcar como manejado por bot
UPDATE cc_tickets 
SET transferred_to_agent = false 
WHERE agent_name = 'Betina' 
  AND (transferred_to_agent = true OR transferred_to_agent IS NULL);

-- Para los tickets donde Betina es el agente pero hay mensajes OUT de otro agente,
-- actualizar el agent_name al agente humano real
-- Esto se hace mejor en una query más específica basada en los mensajes reales
