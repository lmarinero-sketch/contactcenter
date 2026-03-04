-- ============================================
-- Contact Center Analytics - Bot Handoff Timing
-- Agrega campo para medir el tiempo entre último 
-- mensaje del bot y primer mensaje del agente humano
-- ============================================

-- Nueva columna en cc_tickets para almacenar el tiempo de handoff
ALTER TABLE cc_tickets 
ADD COLUMN IF NOT EXISTS bot_handoff_seconds INTEGER;

-- Índice para poder filtrar/ordenar por handoff time
CREATE INDEX IF NOT EXISTS idx_cc_tickets_handoff ON cc_tickets(bot_handoff_seconds);

-- Comentario descriptivo
COMMENT ON COLUMN cc_tickets.bot_handoff_seconds IS 
  'Tiempo en segundos entre el último mensaje OUT del bot y el primer mensaje OUT del agente humano. NULL si no hubo transferencia.';
