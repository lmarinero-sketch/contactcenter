-- Create rag_feedback table for Simon IA feedback system
CREATE TABLE IF NOT EXISTS rag_feedback (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    message_index INTEGER NOT NULL DEFAULT 0,
    is_correct BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rag_feedback_conv ON rag_feedback(conversation_id);
CREATE INDEX IF NOT EXISTS idx_rag_feedback_created ON rag_feedback(created_at);

-- Add feedback column to rag_messages
ALTER TABLE rag_messages ADD COLUMN IF NOT EXISTS feedback TEXT;
