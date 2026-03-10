"""
RAG Pipeline V2.1 — Maximum Precision + Performance
6-stage pipeline: HyDE → Multi-Query → Hybrid Search → Dedup → Re-rank → Generate
V2.1: Parallel re-ranking, timeouts on all OpenAI calls, thread-safe execution
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


def _rerank_single_document(question: str, doc: dict) -> dict | None:
    """Re-rank a single document. Returns the doc with rerank_score or None if filtered out."""
    try:
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
                        "términos relacionados a la pregunta son MUY relevantes aunque no 'respondan' directamente. "
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


def _generate_final_answer(question: str, documents: list[dict],
                           conversation_history: list[dict]) -> str:
    """
    Step 6: Final answer generation with strict source citation.
    Optimized for both narrative text and tabular/Excel data.
    """
    # Build context from documents
    context_parts = []
    for i, doc in enumerate(documents, 1):
        filename = doc.get("metadata", {}).get("filename", "desconocido")
        score = doc.get("rerank_score", "N/A")
        context_parts.append(
            f"--- Documento {i} (Fuente: {filename}, Relevancia: {score}/10) ---\n"
            f"{doc['content']}"
        )

    context = "\n\n".join(context_parts)

    system_prompt = f"""Sos un asistente preciso de consulta documental para Sanatorio Argentino.
Tu función es responder preguntas usando la información del [CONTEXTO] proporcionado.

REGLAS:
1. Usá SOLO información del [CONTEXTO]. NO uses conocimiento externo.
2. El contexto puede incluir datos tabulares (Excel con pares clave:valor) — interpretá estos datos como registros estructurados.
3. Si encontrás datos relacionados, aunque sean parciales, presentalos organizados. NO digas "no tengo información" si hay datos relevantes.
4. SOLO respondé "No tengo suficiente información" si el contexto realmente NO contiene NADA relacionado a la pregunta.
5. SIEMPRE citá la fuente: **(Fuente: nombre_archivo)**
6. Si la información está repartida en varios fragmentos, sintetizá coherentemente.
7. Respondé en español, de forma clara y profesional.
8. Usá formato markdown para estructurar la respuesta (listas, tablas, negritas, etc.)

[CONTEXTO]
{context}"""

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


def process_question(question: str, conversation_id: str | None = None) -> dict:
    """
    Main RAG pipeline — Process a user question through 6 stages.
    Returns the answer, sources, and pipeline metadata.
    
    V2.1: HyDE + Multi-Query run in parallel, searches run in parallel,
    re-ranking runs in parallel. Much faster than sequential V2.
    """
    pipeline_info = {
        "hyde_generated": False,
        "multi_queries": 0,
        "total_searched": 0,
        "unique_results": 0,
        "reranked_kept": 0,
    }

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
    # Load conversation history if we have a conversation_id
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

    answer = _generate_final_answer(question, reranked, conversation_history)

    # Build sources summary
    sources = _build_sources(reranked)

    return _build_response(answer, sources, pipeline_info, question, conversation_id)


def _build_sources(documents: list[dict]) -> list[dict]:
    """Build a deduplicated sources summary grouped by filename."""
    source_map = {}
    for doc in documents:
        metadata = doc.get("metadata", {})
        filename = metadata.get("filename", "desconocido")
        if filename not in source_map:
            source_map[filename] = {
                "filename": filename,
                "file_type": metadata.get("file_type", ""),
                "similarity": doc.get("similarity", 0),
                "rerank_score": doc.get("rerank_score", 0),
                "chunks_used": 0,
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
    }
