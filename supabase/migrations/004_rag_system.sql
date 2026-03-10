-- ============================================
-- RAG System V2 - Database Schema
-- Proyecto: Sanatorio Argentino - Contact Center
-- Asistente IA Documental
-- ============================================

-- Habilitar extensión pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- Tabla de documentos (chunks con embeddings)
-- ============================================
CREATE TABLE IF NOT EXISTS rag_documents (
  id BIGSERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  embedding VECTOR(1536),
  fts TSVECTOR,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice HNSW para búsqueda vectorial (cosine similarity)
CREATE INDEX IF NOT EXISTS rag_documents_embedding_idx
  ON rag_documents
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Índice GIN para full-text search
CREATE INDEX IF NOT EXISTS rag_documents_fts_idx
  ON rag_documents
  USING gin (fts);

-- Índice GIN para filtrado por metadata (filename, etc.)
CREATE INDEX IF NOT EXISTS rag_documents_metadata_idx
  ON rag_documents
  USING gin (metadata);

-- Trigger: auto-genera tsvector en español al insertar/actualizar
CREATE OR REPLACE FUNCTION rag_documents_fts_trigger()
RETURNS TRIGGER AS $$
BEGIN
  NEW.fts := to_tsvector('spanish', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rag_documents_fts_update ON rag_documents;
CREATE TRIGGER rag_documents_fts_update
  BEFORE INSERT OR UPDATE ON rag_documents
  FOR EACH ROW
  EXECUTE FUNCTION rag_documents_fts_trigger();

-- ============================================
-- Tabla de conversaciones RAG
-- ============================================
CREATE TABLE IF NOT EXISTS rag_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Tabla de mensajes RAG
-- ============================================
CREATE TABLE IF NOT EXISTS rag_messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES rag_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  sources JSONB,
  pipeline_info JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: actualiza updated_at en conversación al insertar mensaje
CREATE OR REPLACE FUNCTION update_rag_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE rag_conversations SET updated_at = NOW() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_rag_conversation_on_message ON rag_messages;
CREATE TRIGGER update_rag_conversation_on_message
  AFTER INSERT ON rag_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_rag_conversation_timestamp();

-- ============================================
-- Función: Búsqueda Híbrida con RRF
-- Combina vector similarity + full-text search
-- ============================================
CREATE OR REPLACE FUNCTION rag_hybrid_search(
  query_text TEXT,
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 15,
  full_text_weight FLOAT DEFAULT 1.0,
  semantic_weight FLOAT DEFAULT 1.0,
  rrf_k INT DEFAULT 60
)
RETURNS TABLE (
  id BIGINT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT,
  rank_score FLOAT
)
LANGUAGE sql
AS $$
WITH semantic_search AS (
  SELECT
    d.id,
    d.content,
    d.metadata,
    1 - (d.embedding <=> query_embedding) AS similarity,
    ROW_NUMBER() OVER (ORDER BY d.embedding <=> query_embedding) AS rank_ix
  FROM rag_documents d
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count * 2
),
keyword_search AS (
  -- Use plainto_tsquery (more permissive than websearch_to_tsquery)
  -- Search with both 'spanish' and 'simple' configs to catch technical terms
  SELECT
    d.id,
    d.content,
    d.metadata,
    GREATEST(
      ts_rank_cd(d.fts, plainto_tsquery('spanish', query_text)),
      ts_rank_cd(d.fts, plainto_tsquery('simple', query_text))
    ) AS fts_rank,
    ROW_NUMBER() OVER (
      ORDER BY GREATEST(
        ts_rank_cd(d.fts, plainto_tsquery('spanish', query_text)),
        ts_rank_cd(d.fts, plainto_tsquery('simple', query_text))
      ) DESC
    ) AS rank_ix
  FROM rag_documents d
  WHERE d.fts @@ plainto_tsquery('spanish', query_text)
     OR d.fts @@ plainto_tsquery('simple', query_text)
  ORDER BY fts_rank DESC
  LIMIT match_count * 2
)
SELECT
  COALESCE(ss.id, ks.id) AS id,
  COALESCE(ss.content, ks.content) AS content,
  COALESCE(ss.metadata, ks.metadata) AS metadata,
  COALESCE(ss.similarity, 0.0) AS similarity,
  (
    COALESCE(semantic_weight / (rrf_k + ss.rank_ix), 0.0) +
    COALESCE(full_text_weight / (rrf_k + ks.rank_ix), 0.0)
  ) AS rank_score
FROM semantic_search ss
FULL OUTER JOIN keyword_search ks ON ss.id = ks.id
ORDER BY rank_score DESC
LIMIT match_count;
$$;

-- ============================================
-- Función: Búsqueda vectorial pura (fallback)
-- ============================================
CREATE OR REPLACE FUNCTION rag_match_documents(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.3,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id BIGINT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE sql
AS $$
SELECT
  d.id,
  d.content,
  d.metadata,
  1 - (d.embedding <=> query_embedding) AS similarity
FROM rag_documents d
WHERE 1 - (d.embedding <=> query_embedding) > match_threshold
ORDER BY d.embedding <=> query_embedding
LIMIT match_count;
$$;

-- ============================================
-- RLS Policies
-- ============================================
ALTER TABLE rag_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_messages ENABLE ROW LEVEL SECURITY;

-- Lectura pública (el dashboard lee con anon key)
CREATE POLICY "Allow read rag_documents" ON rag_documents FOR SELECT USING (true);
CREATE POLICY "Allow read rag_conversations" ON rag_conversations FOR SELECT USING (true);
CREATE POLICY "Allow read rag_messages" ON rag_messages FOR SELECT USING (true);

-- Escritura (para service role y anon - el backend hace insert directo)
CREATE POLICY "Allow insert rag_documents" ON rag_documents FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow delete rag_documents" ON rag_documents FOR DELETE USING (true);
CREATE POLICY "Allow insert rag_conversations" ON rag_conversations FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update rag_conversations" ON rag_conversations FOR UPDATE USING (true);
CREATE POLICY "Allow delete rag_conversations" ON rag_conversations FOR DELETE USING (true);
CREATE POLICY "Allow insert rag_messages" ON rag_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow delete rag_messages" ON rag_messages FOR DELETE USING (true);
