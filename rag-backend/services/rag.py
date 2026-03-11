"""
RAG Pipeline V3.0 — Maximum Precision + Performance + Learning + Disambiguation
7-stage pipeline: Disambiguate → HyDE → Multi-Query → Hybrid Search → Dedup → Re-rank → Generate
V3.0: 
  - Step 0: Ambiguity detection — asks for clarification when question is unclear
  - Chat Learning: Automatically indexes Q&A pairs for continuous improvement
  - Enhanced context: Distinguishes between document sources and learned Q&A sources
"""
import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError
from config import (
    openai_client, supabase,
    CHAT_MODEL, RERANK_MODEL,
    MATCH_COUNT, RERANK_TOP_K
)
from services.embeddings import generate_embedding, hybrid_search

_executor = ThreadPoolExecutor(max_workers=8)

# Timeout for individual OpenAI calls (seconds)
OPENAI_CALL_TIMEOUT = 30
# Timeout for the entire pipeline (seconds)
PIPELINE_TIMEOUT = 120


# ============================================================
# STEP 0: Ambiguity Detection & Disambiguation
# ============================================================

def _check_ambiguity(question: str, conversation_history: list[dict]) -> dict | None:
    """
    Step 0: Evaluate if the question is ambiguous and needs clarification.
    
    Returns None if the question is clear enough to proceed.
    Returns a dict with clarification questions if ambiguous.
    
    Considers conversation history context — a vague follow-up like "y eso?"
    is NOT ambiguous if there's recent context.
    """
    # Very short questions without conversation context are likely ambiguous
    # But with context they might be valid follow-ups
    has_context = len(conversation_history) >= 2
    
    # Skip disambiguation for very clear questions (optimization)
    # Questions with specific keywords/entities are usually clear
    if len(question.split()) >= 8:
        return None
    
    try:
        context_hint = ""
        if has_context:
            # Include last exchange for context
            recent = conversation_history[-2:]
            context_hint = "\n\nCONTEXTO DE CONVERSACIÓN RECIENTE:\n"
            for msg in recent:
                context_hint += f"- {msg['role']}: {msg['content'][:200]}\n"
        
        response = openai_client.chat.completions.create(
            model=RERANK_MODEL,  # Use lighter model for speed
            temperature=0,
            max_tokens=400,
            timeout=OPENAI_CALL_TIMEOUT,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Sos un clasificador de preguntas para un sistema de consulta documental de Sanatorio Argentino. "
                        "Tu tarea es determinar si una pregunta del usuario es lo suficientemente clara para buscar en documentos, "
                        "o si necesita clarificación.\n\n"
                        "REGLAS:\n"
                        "1. Si la pregunta es clara y específica → responde: {\"clear\": true}\n"
                        "2. Si la pregunta es ambigua, muy vaga, o podría referirse a múltiples temas → responde con sugerencias\n"
                        "3. Si hay CONTEXTO DE CONVERSACIÓN y la pregunta es una continuación lógica → {\"clear\": true}\n"
                        "4. Preguntas de 1-2 palabras SIN contexto previo generalmente necesitan clarificación\n"
                        "5. NO seas demasiado estricto — si la pregunta tiene al menos un tema identificable, es clara\n\n"
                        "Formato de respuesta para preguntas ambiguas:\n"
                        "{\n"
                        "  \"clear\": false,\n"
                        "  \"reason\": \"Explicación breve de por qué es ambigua\",\n"
                        "  \"suggestions\": [\n"
                        "    \"Pregunta sugerida más específica 1\",\n"
                        "    \"Pregunta sugerida más específica 2\",\n"
                        "    \"Pregunta sugerida más específica 3\"\n"
                        "  ]\n"
                        "}\n\n"
                        "Respondé SOLO con JSON válido."
                    )
                },
                {
                    "role": "user",
                    "content": f"Pregunta del usuario: \"{question}\"{context_hint}"
                }
            ]
        )
        
        text = response.choices[0].message.content.strip()
        
        # Clean markdown code fences if present
        text = re.sub(r'^```json\s*', '', text)
        text = re.sub(r'\s*```$', '', text)
        
        result = json.loads(text)
        
        if result.get("clear", True):
            return None
        
        return {
            "reason": result.get("reason", "La pregunta podría ser más específica"),
            "suggestions": result.get("suggestions", [])[:4],  # Max 4 suggestions
        }
    
    except Exception as e:
        print(f"Ambiguity check failed (proceeding anyway): {e}")
        return None  # If check fails, proceed with the pipeline


# ============================================================
# STEP 1: HyDE (Hypothetical Document Embeddings)
# ============================================================

def _generate_hyde_response(question: str) -> str:
    """
    Step 1: HyDE (Hypothetical Document Embeddings)
    Generate a hypothetical answer to guide the search.
    """
    try:
        response = openai_client.chat.completions.create(
            model=CHAT_MODEL,
            temperature=0.7,
            max_tokens=500,
            timeout=OPENAI_CALL_TIMEOUT,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Basándote en la siguiente pregunta, generá una respuesta hipotética detallada "
                        "como si tuvieras acceso a los documentos relevantes. Esta respuesta se usará "
                        "para buscar documentos similares, así que incluí términos técnicos y específicos "
                        "que probablemente aparezcan en los documentos."
                    )
                },
                {"role": "user", "content": question}
            ]
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"HyDE generation failed: {e}")
        return ""


# ============================================================
# STEP 2: Multi-Query
# ============================================================

def _generate_multi_queries(question: str) -> list[str]:
    """
    Step 2: Multi-Query
    Generate 3 reformulations of the question from different angles.
    """
    try:
        response = openai_client.chat.completions.create(
            model=CHAT_MODEL,
            temperature=0.5,
            max_tokens=300,
            timeout=OPENAI_CALL_TIMEOUT,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Generá exactamente 3 reformulaciones diferentes de la siguiente pregunta. "
                        "Cada reformulación debe abordar la pregunta desde un ángulo diferente. "
                        "Respondé SOLO con las 3 preguntas, una por línea, sin numeración ni explicación."
                    )
                },
                {"role": "user", "content": question}
            ]
        )
        text = response.choices[0].message.content
        queries = [q.strip() for q in text.strip().split('\n') if q.strip()]
        return queries[:3]
    except Exception as e:
        print(f"Multi-query generation failed: {e}")
        return []


# ============================================================
# STEP 5: Re-ranking
# ============================================================

def _rerank_single_document(question: str, doc: dict) -> dict | None:
    """Re-rank a single document. Returns the doc with rerank_score or None if filtered out."""
    try:
        # Identify if this is a learned Q&A chunk
        source_type = doc.get("metadata", {}).get("source", "")
        extra_hint = ""
        if source_type == "chat_history":
            extra_hint = (
                " Este fragmento proviene de una conversación previa (Q&A aprendido). "
                "Si la pregunta coincide temáticamente, es MUY relevante."
            )
        
        response = openai_client.chat.completions.create(
            model=RERANK_MODEL,
            temperature=0,
            max_tokens=100,
            timeout=OPENAI_CALL_TIMEOUT,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Evaluá la relevancia del siguiente fragmento de documento para "
                        "responder la pregunta del usuario. "
                        "El fragmento puede ser texto narrativo O datos tabulares (filas con key:value, "
                        "columnas de Excel, listas de registros). Los datos tabulares que contienen "
                        "términos relacionados a la pregunta son MUY relevantes aunque no 'respondan' directamente."
                        f"{extra_hint} "
                        "Respondé SOLO con JSON: {\"score\": 0-10, \"reason\": \"explicación breve\"}"
                    )
                },
                {
                    "role": "user",
                    "content": f"Pregunta: {question}\n\nFragmento:\n{doc['content'][:1500]}"
                }
            ]
        )
        text = response.choices[0].message.content.strip()

        # Parse JSON response
        try:
            result = json.loads(text)
            score = float(result.get("score", 0))
        except (json.JSONDecodeError, ValueError):
            # Try to extract score from text
            match = re.search(r'"score"\s*:\s*(\d+(?:\.\d+)?)', text)
            score = float(match.group(1)) if match else 0

        if score >= 1:  # Keep if score >= 1 (was 3, too aggressive for tabular data)
            doc_copy = dict(doc)
            doc_copy["rerank_score"] = score
            return doc_copy

    except Exception as e:
        print(f"Re-rank error for doc {doc.get('id')}: {e}")
        doc_copy = dict(doc)
        doc_copy["rerank_score"] = 0
        return doc_copy

    return None


def _rerank_documents(question: str, documents: list[dict]) -> list[dict]:
    """
    Step 5: Re-ranking with LLM (PARALLELIZED)
    Score each document's relevance to the question (0-10).
    Uses ThreadPoolExecutor for concurrent API calls.
    """
    candidates = documents[:12]  # Only re-rank top 12 candidates
    reranked = []

    # Submit all re-ranking calls in parallel
    futures = {
        _executor.submit(_rerank_single_document, question, doc): doc
        for doc in candidates
    }

    for future in as_completed(futures, timeout=60):
        try:
            result = future.result(timeout=OPENAI_CALL_TIMEOUT)
            if result is not None:
                reranked.append(result)
        except TimeoutError:
            print(f"Re-rank timeout for a document")
        except Exception as e:
            print(f"Re-rank future error: {e}")

    # Sort by rerank score descending
    reranked.sort(key=lambda x: x.get("rerank_score", 0), reverse=True)
    return reranked[:RERANK_TOP_K]


# ============================================================
# STEP 6: Final Answer Generation
# ============================================================

def _generate_final_answer(question: str, documents: list[dict],
                           conversation_history: list[dict]) -> str:
    """
    Step 6: Final answer generation with strict source citation.
    Optimized for both narrative text and tabular/Excel data.
    Now distinguishes between document sources and learned Q&A sources.
    """
    # Build context from documents, separating doc vs learned vs rules
    context_parts = []
    learned_parts = []
    rules_parts = []
    
    for i, doc in enumerate(documents, 1):
        metadata = doc.get("metadata", {})
        filename = metadata.get("filename", "desconocido")
        score = doc.get("rerank_score", "N/A")
        source_type = metadata.get("source", "")
        
        if source_type == "chat_history":
            learned_parts.append(
                f"--- Respuesta Previa (Conversación: {metadata.get('conversation_title', 'anterior')}, "
                f"Relevancia: {score}/10) ---\n{doc['content']}"
            )
        elif source_type == "rule":
            rules_parts.append(
                f"--- Regla: {metadata.get('title', 'S/T')} (Categoría: {metadata.get('category', 'general')}, "
                f"Fecha regla: {metadata.get('rule_date', 'N/D')}, Relevancia: {score}/10) ---\n"
                f"{metadata.get('processed_text', doc['content'])}"
            )
        else:
            context_parts.append(
                f"--- Documento {i} (Fuente: {filename}, Relevancia: {score}/10) ---\n"
                f"{doc['content']}"
            )

    context = "\n\n".join(context_parts)
    learned_context = "\n\n".join(learned_parts)
    rules_context = "\n\n".join(rules_parts)

    # Build system prompt with all context types
    learned_section = ""
    if learned_context:
        learned_section = (
            f"\n\n[RESPUESTAS PREVIAS APRENDIDAS]\n"
            f"Las siguientes son respuestas que ya se dieron en conversaciones anteriores sobre temas similares. "
            f"Usalas como referencia pero verificá con los documentos del [CONTEXTO] si están disponibles.\n"
            f"{learned_context}"
        )

    rules_section = ""
    if rules_context:
        rules_section = (
            f"\n\n[REGLAS Y DIRECTIVAS]\n"
            f"Las siguientes son reglas/información ingresada manualmente por administradores del sistema. "
            f"TIENEN PRIORIDAD sobre los documentos cuando hay conflicto. Respetá estas instrucciones.\n"
            f"{rules_context}"
        )

    system_prompt = f"""Sos Simon, el asistente IA documental del Sanatorio Argentino.
Tu función es responder preguntas usando la información proporcionada.

REGLAS:
1. Usá SOLO información del [CONTEXTO], [REGLAS Y DIRECTIVAS] y [RESPUESTAS PREVIAS]. NO uses conocimiento externo.
2. Si hay [REGLAS Y DIRECTIVAS], estas tienen MÁXIMA PRIORIDAD — son instrucciones directas del personal.
3. El contexto puede incluir datos tabulares (Excel con pares clave:valor) — interpretá estos datos como registros estructurados.
4. Si encontrás datos relacionados, aunque sean parciales, presentalos organizados. NO digas "no tengo información" si hay datos relevantes.
5. SOLO respondé "No tengo suficiente información" si el contexto realmente NO contiene NADA relacionado a la pregunta.
6. SIEMPRE citá la fuente: **(Fuente: nombre_archivo)** o **(Regla: título_regla)**
7. Si la información está repartida en varios fragmentos, sintetizá coherentemente.
8. Respondé en español, de forma clara y profesional.
9. Usá formato markdown para estructurar la respuesta (listas, tablas, negritas, etc.)
10. AL FINAL de cada respuesta, agregá 2-3 preguntas relacionadas que el usuario podría hacer a continuación, basándote en el contexto disponible. Formato EXACTO:

---
💡 **También podrías preguntar:**
- ¿Pregunta relacionada 1?
- ¿Pregunta relacionada 2?
- ¿Pregunta relacionada 3?

[CONTEXTO]
{context}{rules_section}{learned_section}"""

    # Build messages with conversation history
    messages = [{"role": "system", "content": system_prompt}]

    # Add last 10 messages from history
    for msg in conversation_history[-10:]:
        messages.append({
            "role": msg["role"],
            "content": msg["content"]
        })

    messages.append({"role": "user", "content": question})

    response = openai_client.chat.completions.create(
        model=CHAT_MODEL,
        temperature=0,
        max_tokens=3000,
        timeout=OPENAI_CALL_TIMEOUT * 2,  # Double timeout for generation
        messages=messages
    )

    return response.choices[0].message.content


# ============================================================
# Hybrid Search Executor
# ============================================================

def _execute_search(query: str) -> list[dict]:
    """Execute a single hybrid search for a query. Used for parallel search."""
    try:
        query_embedding = generate_embedding(query)
        results = hybrid_search(
            query=query,
            query_embedding=query_embedding,
            match_count=MATCH_COUNT,
        )
        return results
    except Exception as e:
        print(f"Search failed for query: {e}")
        return []


# ============================================================
# MAIN PIPELINE
# ============================================================

def process_question(question: str, conversation_id: str | None = None) -> dict:
    """
    Main RAG pipeline — Process a user question through 7 stages.
    Returns the answer, sources, and pipeline metadata.
    
    V3.0: Disambiguate → HyDE + Multi-Query → Hybrid Search → Dedup → Re-rank → Generate → Learn
    """
    pipeline_info = {
        "hyde_generated": False,
        "multi_queries": 0,
        "total_searched": 0,
        "unique_results": 0,
        "reranked_kept": 0,
        "disambiguation_triggered": False,
        "chat_learning": False,
    }

    # Load conversation history early (needed for disambiguation)
    conversation_history = []
    if conversation_id:
        try:
            history_result = supabase.table("rag_messages") \
                .select("role, content") \
                .eq("conversation_id", conversation_id) \
                .order("created_at") \
                .execute()
            conversation_history = history_result.data or []
        except Exception as e:
            print(f"Failed to load conversation history: {e}")

    # === STEP 0: Ambiguity Check ===
    ambiguity = _check_ambiguity(question, conversation_history)
    
    if ambiguity is not None:
        pipeline_info["disambiguation_triggered"] = True
        # Return clarification request instead of searching
        return _build_clarification_response(
            question=question,
            reason=ambiguity["reason"],
            suggestions=ambiguity["suggestions"],
            conversation_id=conversation_id,
            pipeline_info=pipeline_info,
        )

    # === STEPS 1 & 2: HyDE + Multi-Query IN PARALLEL ===
    hyde_future = _executor.submit(_generate_hyde_response, question)
    multi_future = _executor.submit(_generate_multi_queries, question)

    try:
        hyde_response = hyde_future.result(timeout=OPENAI_CALL_TIMEOUT + 5)
    except Exception as e:
        print(f"HyDE future failed: {e}")
        hyde_response = ""

    try:
        multi_queries = multi_future.result(timeout=OPENAI_CALL_TIMEOUT + 5)
    except Exception as e:
        print(f"Multi-query future failed: {e}")
        multi_queries = []

    pipeline_info["hyde_generated"] = bool(hyde_response)
    pipeline_info["multi_queries"] = len(multi_queries)

    # === STEP 3: Hybrid Search × N (PARALLEL) ===
    search_queries = [question]
    if hyde_response:
        search_queries.append(hyde_response)
    search_queries.extend(multi_queries)

    # Execute all searches in parallel
    search_futures = [
        _executor.submit(_execute_search, query)
        for query in search_queries
    ]

    all_results = []
    for future in as_completed(search_futures, timeout=60):
        try:
            results = future.result(timeout=OPENAI_CALL_TIMEOUT)
            all_results.extend(results)
        except Exception as e:
            print(f"Search future failed: {e}")

    pipeline_info["total_searched"] = len(all_results)

    # === STEP 4: De-duplication ===
    seen = {}
    for doc in all_results:
        doc_id = doc.get("id")
        if doc_id not in seen or doc.get("rank_score", 0) > seen[doc_id].get("rank_score", 0):
            seen[doc_id] = doc

    unique_docs = sorted(
        seen.values(),
        key=lambda x: x.get("rank_score", 0),
        reverse=True
    )
    pipeline_info["unique_results"] = len(unique_docs)

    # If no documents found, return early
    if not unique_docs:
        answer = "No encontré documentos relevantes para responder tu pregunta. Asegurate de que los documentos necesarios estén cargados en el sistema."
        return _build_response(answer, [], pipeline_info, question, conversation_id)

    # === STEP 5: Re-ranking (PARALLEL) ===
    reranked = _rerank_documents(question, unique_docs)
    pipeline_info["reranked_kept"] = len(reranked)

    # FALLBACK: If re-ranking filtered everything, use top docs by vector similarity
    if not reranked:
        print("Re-ranking filtered all documents — falling back to top docs by similarity")
        fallback_docs = unique_docs[:RERANK_TOP_K]
        for doc in fallback_docs:
            doc["rerank_score"] = 0  # Mark as un-reranked
        reranked = fallback_docs
        pipeline_info["reranked_kept"] = len(reranked)
        pipeline_info["rerank_fallback"] = True

    # === STEP 6: Generate Final Answer ===
    answer = _generate_final_answer(question, reranked, conversation_history)

    # Build sources summary
    sources = _build_sources(reranked)

    response = _build_response(answer, sources, pipeline_info, question, conversation_id)

    # === STEP 7: Learn from this conversation (async, non-blocking) ===
    if response.get("conversation_id"):
        try:
            _executor.submit(_learn_from_conversation, response["conversation_id"])
            pipeline_info["chat_learning"] = True
        except Exception as e:
            print(f"Failed to submit learning task: {e}")

    return response


# ============================================================
# Response Builders
# ============================================================

def _build_sources(documents: list[dict]) -> list[dict]:
    """Build a deduplicated sources summary grouped by filename."""
    source_map = {}
    for doc in documents:
        metadata = doc.get("metadata", {})
        filename = metadata.get("filename", "desconocido")
        source_type = metadata.get("source", "document")
        
        if filename not in source_map:
            source_map[filename] = {
                "filename": filename,
                "file_type": metadata.get("file_type", ""),
                "similarity": doc.get("similarity", 0),
                "rerank_score": doc.get("rerank_score", 0),
                "chunks_used": 0,
                "source_type": source_type,
                "storage_path": metadata.get("storage_path", ""),
                "folder": metadata.get("folder", ""),
            }
        source_map[filename]["chunks_used"] += 1
        # Keep highest similarity
        if doc.get("similarity", 0) > source_map[filename]["similarity"]:
            source_map[filename]["similarity"] = doc.get("similarity", 0)

    return list(source_map.values())


def _build_response(answer: str, sources: list[dict], pipeline_info: dict,
                    question: str, conversation_id: str | None) -> dict:
    """Build the final response and persist to database."""
    # Create or use conversation
    if not conversation_id:
        title = question[:80]
        conv_result = supabase.table("rag_conversations") \
            .insert({"title": title}) \
            .execute()
        conversation_id = conv_result.data[0]["id"]
    
    # Save user message
    supabase.table("rag_messages").insert({
        "conversation_id": conversation_id,
        "role": "user",
        "content": question,
    }).execute()

    # Save assistant message
    supabase.table("rag_messages").insert({
        "conversation_id": conversation_id,
        "role": "assistant",
        "content": answer,
        "sources": sources,
        "pipeline_info": pipeline_info,
    }).execute()

    return {
        "answer": answer,
        "sources": sources,
        "documents_found": pipeline_info.get("reranked_kept", 0),
        "model": CHAT_MODEL,
        "conversation_id": conversation_id,
        "pipeline": pipeline_info,
        "type": "answer",
    }


def _build_clarification_response(question: str, reason: str, 
                                   suggestions: list[str],
                                   conversation_id: str | None,
                                   pipeline_info: dict) -> dict:
    """Build a clarification response when the question is ambiguous."""
    # Create conversation if needed (to maintain flow)
    if not conversation_id:
        title = question[:80]
        conv_result = supabase.table("rag_conversations") \
            .insert({"title": title}) \
            .execute()
        conversation_id = conv_result.data[0]["id"]
    
    # Save user message
    supabase.table("rag_messages").insert({
        "conversation_id": conversation_id,
        "role": "user",
        "content": question,
    }).execute()

    # Build clarification message
    clarification_text = f"🤔 {reason}\n\n¿Podrías ser más específico? Te sugiero algunas opciones:"
    for i, suggestion in enumerate(suggestions, 1):
        clarification_text += f"\n{i}. {suggestion}"

    # Save assistant clarification message
    supabase.table("rag_messages").insert({
        "conversation_id": conversation_id,
        "role": "assistant",
        "content": clarification_text,
        "pipeline_info": pipeline_info,
    }).execute()

    return {
        "type": "clarification",
        "answer": clarification_text,
        "reason": reason,
        "suggestions": suggestions,
        "conversation_id": conversation_id,
        "pipeline": pipeline_info,
        "sources": [],
        "documents_found": 0,
        "model": CHAT_MODEL,
    }


# ============================================================
# Chat Learning (async)
# ============================================================

def _learn_from_conversation(conversation_id: str):
    """Background task: Index the latest Q&A from a conversation."""
    try:
        from services.chat_learning import index_conversation
        result = index_conversation(conversation_id)
        if result.get("indexed", 0) > 0:
            print(f"📚 Learned {result['indexed']} Q&A pairs from conversation {conversation_id}")
    except Exception as e:
        print(f"Chat learning error: {e}")
