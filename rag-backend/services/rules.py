"""
Rules Service — Manual Knowledge Input for Simon
Processes, enriches, and stores admin-defined rules as RAG-searchable embeddings.
"""
import json
from datetime import datetime
from config import openai_client, supabase, CHAT_MODEL
from services.embeddings import generate_embedding


def _enrich_rule(raw_text: str) -> dict:
    """
    Use GPT to process a raw rule input:
    - Resolve date references ("al día de la fecha" → actual date)
    - Extract category/topic
    - Generate a clean, searchable version
    """
    today = datetime.now().strftime("%d/%m/%Y")
    
    try:
        response = openai_client.chat.completions.create(
            model=CHAT_MODEL,
            temperature=0,
            max_tokens=500,
            messages=[
                {
                    "role": "system",
                    "content": (
                        f"Sos un asistente que procesa reglas e información para un sistema de consulta "
                        f"documental de Sanatorio Argentino. La fecha de hoy es: {today}.\n\n"
                        "Tu tarea:\n"
                        "1. Tomar la regla/información del usuario\n"
                        "2. Reemplazar referencias temporales:\n"
                        "   - 'al día de la fecha', 'hoy', 'a la fecha' → fecha real\n"
                        "   - 'desde este mes', 'a partir de ahora' → mes/año real\n"
                        "3. Asignar una categoría (ej: 'obra_social', 'precios', 'protocolo', 'administrativo', 'medico', 'general')\n"
                        "4. Generar un título corto\n"
                        "5. Generar la versión procesada de la regla (clara, precisa, con fechas resueltas)\n\n"
                        "Respondé SOLO con JSON:\n"
                        "{\n"
                        '  "title": "Título corto de la regla",\n'
                        '  "category": "categoria",\n'
                        '  "processed_text": "Regla con fechas y referencias resueltas",\n'
                        '  "keywords": ["palabra1", "palabra2"]\n'
                        "}"
                    )
                },
                {"role": "user", "content": raw_text}
            ]
        )
        
        text = response.choices[0].message.content.strip()
        # Clean markdown fences
        import re
        text = re.sub(r'^```json\s*', '', text)
        text = re.sub(r'\s*```$', '', text)
        
        return json.loads(text)
    except Exception as e:
        print(f"Rule enrichment failed: {e}")
        # Fallback: use raw text as-is
        return {
            "title": raw_text[:60],
            "category": "general",
            "processed_text": raw_text,
            "keywords": []
        }


def create_rule(raw_text: str, created_by: str = "admin") -> dict:
    """
    Process and store a new rule.
    1. Enrich with GPT (resolve dates, categorize)
    2. Generate embedding
    3. Store in rag_documents with 'rule' source type
    """
    enriched = _enrich_rule(raw_text)
    
    # Build the text to embed — include both original and processed for better search
    embed_text = (
        f"REGLA: {enriched['title']}\n"
        f"Categoría: {enriched['category']}\n"
        f"{enriched['processed_text']}\n"
        f"Texto original: {raw_text}"
    )
    
    # Generate embedding
    embedding = generate_embedding(embed_text)
    
    now = datetime.utcnow().isoformat()
    
    # Store in rag_documents
    result = supabase.table("rag_documents").insert({
        "content": embed_text,
        "embedding": embedding,
        "metadata": {
            "source": "rule",
            "filename": "__rules__",
            "file_type": "rule",
            "title": enriched["title"],
            "category": enriched["category"],
            "original_text": raw_text,
            "processed_text": enriched["processed_text"],
            "keywords": enriched.get("keywords", []),
            "created_by": created_by,
            "created_at": now,
            "rule_date": datetime.now().strftime("%Y-%m-%d"),
        }
    }).execute()
    
    rule_id = result.data[0]["id"] if result.data else None
    
    return {
        "id": rule_id,
        "title": enriched["title"],
        "category": enriched["category"],
        "processed_text": enriched["processed_text"],
        "original_text": raw_text,
        "keywords": enriched.get("keywords", []),
        "created_at": now,
    }


def list_rules() -> list[dict]:
    """List all stored rules."""
    result = supabase.table("rag_documents") \
        .select("id, content, metadata, created_at") \
        .eq("metadata->>source", "rule") \
        .order("created_at", desc=True) \
        .execute()
    
    rules = []
    for row in (result.data or []):
        meta = row.get("metadata", {})
        rules.append({
            "id": row["id"],
            "title": meta.get("title", "Sin título"),
            "category": meta.get("category", "general"),
            "original_text": meta.get("original_text", ""),
            "processed_text": meta.get("processed_text", ""),
            "keywords": meta.get("keywords", []),
            "created_by": meta.get("created_by", "admin"),
            "created_at": meta.get("created_at", row.get("created_at", "")),
        })
    
    return rules


def delete_rule(rule_id: int) -> bool:
    """Delete a specific rule by ID."""
    try:
        supabase.table("rag_documents") \
            .delete() \
            .eq("id", rule_id) \
            .execute()
        return True
    except Exception as e:
        print(f"Error deleting rule {rule_id}: {e}")
        return False


def get_rules_count() -> int:
    """Get total count of rules."""
    result = supabase.table("rag_documents") \
        .select("id") \
        .eq("metadata->>source", "rule") \
        .execute()
    return len(result.data or [])
