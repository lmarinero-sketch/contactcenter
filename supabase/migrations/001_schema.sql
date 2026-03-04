-- ============================================
-- Contact Center Analytics - Database Schema
-- Proyecto: Sanatorio Argentino
-- ============================================

-- Tabla principal de tickets/conversaciones
CREATE TABLE IF NOT EXISTS cc_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id TEXT UNIQUE NOT NULL,
  channel TEXT,
  source TEXT,
  status TEXT,
  subject TEXT,
  
  -- Bot info
  bot_id INTEGER,
  bot_name TEXT,
  transferred_to_agent BOOLEAN DEFAULT false,
  
  -- Department
  department_id INTEGER,
  department_name TEXT,
  
  -- Agent
  agent_id INTEGER,
  agent_name TEXT,
  agent_email TEXT,
  
  -- Customer
  customer_fingerprint TEXT,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_country_code TEXT,
  customer_country_name TEXT,
  customer_browser_os TEXT,
  customer_ip TEXT,
  customer_sentiment TEXT,
  
  -- Event
  event_locale TEXT,
  event_timezone TEXT,
  event_location TEXT,
  event_status TEXT,
  
  -- Timestamps
  chat_started_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Raw payload for debugging
  raw_payload JSONB
);

-- Tabla de mensajes individuales
CREATE TABLE IF NOT EXISTS cc_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id TEXT NOT NULL REFERENCES cc_tickets(ticket_id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  sender_name TEXT,
  message TEXT,
  message_timestamp TIMESTAMPTZ,
  message_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de análisis generado por OpenAI
CREATE TABLE IF NOT EXISTS cc_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id TEXT UNIQUE NOT NULL REFERENCES cc_tickets(ticket_id) ON DELETE CASCADE,
  
  -- Clasificación
  detected_intent TEXT,
  intent_confidence FLOAT,
  category TEXT,
  subcategory TEXT,
  
  -- Sentimiento
  overall_sentiment TEXT,
  sentiment_score FLOAT,
  
  -- Análisis del agente
  agent_tone TEXT,
  agent_greeting BOOLEAN,
  agent_farewell BOOLEAN,
  agent_protocol_score FLOAT,
  agent_response_quality TEXT,
  
  -- Bot path analysis
  bot_path_choices TEXT[],
  bot_path_depth INTEGER,
  bot_resolution BOOLEAN,
  bot_first_choice TEXT,
  bot_second_choice TEXT,
  bot_third_choice TEXT,
  
  -- Keywords
  customer_keywords TEXT[],
  agent_keywords TEXT[],
  
  -- Tiempos
  first_response_time_seconds INTEGER,
  total_resolution_time_seconds INTEGER,
  message_count INTEGER,
  agent_message_count INTEGER,
  customer_message_count INTEGER,
  bot_message_count INTEGER,
  
  -- Resumen
  conversation_summary TEXT,
  improvement_suggestions TEXT[],
  
  -- Meta
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  model_used TEXT DEFAULT 'gpt-4o-mini',
  tokens_used INTEGER
);

-- Tabla de estadísticas diarias por agente
CREATE TABLE IF NOT EXISTS cc_agent_daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id INTEGER,
  agent_name TEXT,
  stat_date DATE NOT NULL,
  
  total_chats INTEGER DEFAULT 0,
  avg_sentiment_score FLOAT,
  avg_protocol_score FLOAT,
  avg_first_response_seconds INTEGER,
  avg_resolution_seconds INTEGER,
  resolved_count INTEGER DEFAULT 0,
  transferred_count INTEGER DEFAULT 0,
  
  top_keywords TEXT[],
  tone_distribution JSONB,
  intent_distribution JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, stat_date)
);

-- Tabla del árbol del chatbot (configuración)
CREATE TABLE IF NOT EXISTS cc_bot_tree (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level INTEGER NOT NULL,
  option_key TEXT NOT NULL,
  option_label TEXT NOT NULL,
  parent_option_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar el árbol del chatbot conocido
INSERT INTO cc_bot_tree (level, option_key, option_label, parent_option_key) VALUES
  -- Nivel 1
  (1, '1A', 'Turnos o Autorizaciones', NULL),
  (1, '1B', 'Guardias', NULL),
  (1, '1C', 'Otras consultas', NULL),
  -- Nivel 2 (hijo de 1A)
  (2, '2A', 'Solicitar turnos', '1A'),
  (2, '2B', 'Reprogramar o cancelar turnos', '1A'),
  (2, '2C', 'Autorizaciones', '1A'),
  (2, '2D', 'Chequeo preventivo', '1A'),
  (2, '2E', 'Programa prevenir', '1A'),
  (2, '2F', 'Información', '1A'),
  (2, '2G', 'Volver al menú anterior', '1A'),
  -- Nivel 3 (hijo de 2A -> Solicitar turnos)
  (3, '3A', 'Turnos de consultas', '2A'),
  (3, '3B', 'Turnos de Tomografía, Ecografía, Mamografía, Densitometría y Rayos X', '2A'),
  (3, '3C', 'Volver al menú anterior', '2A');

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_cc_tickets_agent ON cc_tickets(agent_id);
CREATE INDEX IF NOT EXISTS idx_cc_tickets_status ON cc_tickets(status);
CREATE INDEX IF NOT EXISTS idx_cc_tickets_received ON cc_tickets(received_at);
CREATE INDEX IF NOT EXISTS idx_cc_tickets_department ON cc_tickets(department_id);
CREATE INDEX IF NOT EXISTS idx_cc_messages_ticket ON cc_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_cc_messages_action ON cc_messages(action);
CREATE INDEX IF NOT EXISTS idx_cc_analysis_ticket ON cc_analysis(ticket_id);
CREATE INDEX IF NOT EXISTS idx_cc_analysis_intent ON cc_analysis(detected_intent);
CREATE INDEX IF NOT EXISTS idx_cc_analysis_sentiment ON cc_analysis(overall_sentiment);
CREATE INDEX IF NOT EXISTS idx_cc_agent_stats_date ON cc_agent_daily_stats(stat_date);

-- RLS (Row Level Security) - Habilitado pero con política abierta para service role
ALTER TABLE cc_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_agent_daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_bot_tree ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura pública (el dashboard lee con anon key)
CREATE POLICY "Allow read access" ON cc_tickets FOR SELECT USING (true);
CREATE POLICY "Allow read access" ON cc_messages FOR SELECT USING (true);
CREATE POLICY "Allow read access" ON cc_analysis FOR SELECT USING (true);
CREATE POLICY "Allow read access" ON cc_agent_daily_stats FOR SELECT USING (true);
CREATE POLICY "Allow read access" ON cc_bot_tree FOR SELECT USING (true);

-- Políticas de escritura solo para service_role (Edge Functions)
CREATE POLICY "Allow service insert" ON cc_tickets FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service insert" ON cc_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service insert" ON cc_analysis FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service update" ON cc_analysis FOR UPDATE USING (true);
CREATE POLICY "Allow service insert" ON cc_agent_daily_stats FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service update" ON cc_agent_daily_stats FOR UPDATE USING (true);
