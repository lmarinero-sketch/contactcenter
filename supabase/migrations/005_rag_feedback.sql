-- ============================================
-- RAG Feedback System — Schema
-- Conecta el feedback del usuario con el learning
-- ============================================

-- 1. Agregar columna feedback a rag_messages
ALTER TABLE rag_messages
  ADD COLUMN IF NOT EXISTS feedback TEXT CHECK (feedback IN ('correct', 'incorrect'));

-- 2. Agregar columna indexed a rag_conversations (para tracking de learning)
ALTER TABLE rag_conversations
  ADD COLUMN IF NOT EXISTS indexed BOOLEAN DEFAULT FALSE;

-- 3. Tabla de feedback detallado (para analytics)
CREATE TABLE IF NOT EXISTS rag_feedback (
  id BIGSERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES rag_conversations(id) ON DELETE CASCADE,
  message_index INT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rag_feedback_conversation
  ON rag_feedback(conversation_id);

-- RLS
ALTER TABLE rag_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read rag_feedback" ON rag_feedback FOR SELECT USING (true);
CREATE POLICY "Allow insert rag_feedback" ON rag_feedback FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update rag_messages_feedback" ON rag_messages FOR UPDATE USING (true);
