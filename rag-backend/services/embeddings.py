"""
Embeddings Service — Generate embeddings and perform hybrid search
"""
import time
from config import (
    openai_client, supabase,
    EMBEDDING_MODEL, EMBEDDING_DIMENSIONS,
    MATCH_COUNT, MATCH_THRESHOLD
)


def generate_embedding(text: str) -> list[float]:
    """Generate a single embedding vector for a text string."""
    response = openai_client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=text,
        dimensions=EMBEDDING_DIMENSIONS
    )
    return response.data[0].embedding


def generate_embeddings_batch(texts: list[str], batch_size: int = 50) -> list[list[float]]:
    """Generate embeddings for multiple texts in batches."""
    all_embeddings = []

    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        try:
            response = openai_client.embeddings.create(
                model=EMBEDDING_MODEL,
                input=batch,
                dimensions=EMBEDDING_DIMENSIONS
            )
            batch_embeddings = [item.embedding for item in response.data]
            all_embeddings.extend(batch_embeddings)
        except Exception as e:
            print(f"Embedding batch {i // batch_size} failed, retrying: {e}")
            time.sleep(3)
            response = openai_client.embeddings.create(
                model=EMBEDDING_MODEL,
                input=batch,
                dimensions=EMBEDDING_DIMENSIONS
            )
            batch_embeddings = [item.embedding for item in response.data]
            all_embeddings.extend(batch_embeddings)

        # Rate limiting
        if i + batch_size < len(texts):
            time.sleep(0.5)

    return all_embeddings


def store_chunks_with_embeddings(chunks: list[dict]):
    """Store chunks with their embeddings in Supabase."""
    texts = [c["content"] for c in chunks]
    embeddings = generate_embeddings_batch(texts)

    batch_size = 50
    for i in range(0, len(chunks), batch_size):
        batch_data = []
        for j in range(i, min(i + batch_size, len(chunks))):
            batch_data.append({
                "content": chunks[j]["content"],
                "metadata": chunks[j]["metadata"],
                "embedding": embeddings[j],
            })
        supabase.table("rag_documents").insert(batch_data).execute()


def hybrid_search(query: str, query_embedding: list[float],
                  match_count: int = MATCH_COUNT,
                  full_text_weight: float = 1.0,
                  semantic_weight: float = 1.0,
                  rrf_k: int = 60,
                  filter_tag: str = "") -> list[dict]:
    """
    Execute hybrid search combining vector similarity + full-text search.
    Uses the rag_hybrid_search SQL function with RRF.
    Optionally filters by document tag.
    """
    # Try with filter_tag first; if SQL function doesn't support it yet, retry without
    params = {
        "query_text": query,
        "query_embedding": query_embedding,
        "match_count": match_count,
        "full_text_weight": full_text_weight,
        "semantic_weight": semantic_weight,
        "rrf_k": rrf_k,
    }

    try:
        params_with_tag = {**params, "filter_tag": filter_tag}
        result = supabase.rpc("rag_hybrid_search", params_with_tag).execute()
        return result.data or []
    except Exception as e:
        print(f"hybrid_search with filter_tag failed ({e}), retrying without...")
        try:
            result = supabase.rpc("rag_hybrid_search", params).execute()
            return result.data or []
        except Exception as e2:
            print(f"hybrid_search failed completely: {e2}")
            return []


def vector_search(query_embedding: list[float],
                  match_threshold: float = MATCH_THRESHOLD,
                  match_count: int = MATCH_COUNT) -> list[dict]:
    """Fallback: vector-only search."""
    result = supabase.rpc("rag_match_documents", {
        "query_embedding": query_embedding,
        "match_threshold": match_threshold,
        "match_count": match_count,
    }).execute()

    return result.data or []
