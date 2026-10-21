"""
RAG Pipeline V3.3 — Maximum Precision + Entity-Aware + Recency Bias
8-stage pipeline: Disambiguate → HyDE → Multi-Query → Hybrid Search → Dedup → Entity Filter → Re-rank → Generate
V3.3:
  - Step 0: Ambiguity detection — asks for clarification when question is unclear
  - Step 4: Recency-boosted deduplication — newer documents get priority in ranking
  - Step 4.5: Entity-Aware Topic Filtering — extracts key entities from the question
    and filters retrieved chunks to stay on-topic (e.g., only OSDE docs when asking about OSDE)
  - Step 5: Recency-aware re-ranking — LLM scorer favors recent documents
  - Step 6: Recency-aware answer gen — prefers most recent info when data conflicts
  - Chat Learning: Automatically indexes Q&A pairs for continuous improvement
"""
import json
import re
from datetime import datetime, timezone
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
# MULTIMODAL VISION: Image and Document Interpreter (GPT-5.4)
# ============================================================

def _analyze_attachments(attachments: list[dict], user_prompt: str) -> dict | None:
    """
    Analyzes images and documents attached to the chat using GPT-5.4 Vision.
    Extracts key medical/administrative entities and formulates an enriched RAG query.
    """
    if not attachments:
        return None

    import base64
    import io

    image_items = []
    doc_texts = []

    for att in attachments:
        mime = att.get("mime_type", "")
        data = att.get("data", "")
        name = att.get("name", "archivo")

        if mime.startswith("image/") or att.get("isImage"):
            image_items.append({"mime": mime or "image/jpeg", "data": data, "name": name})
        elif "pdf" in mime or name.lower().endswith(".pdf"):
            try:
                raw_bytes = base64.b64decode(data)
                import pdfplumber
                with pdfplumber.open(io.BytesIO(raw_bytes)) as pdf:
                    pages_text = []
                    for p in pdf.pages[:5]:
                        t = p.extract_text()
                        if t:
                            pages_text.append(t)
                    if pages_text:
                        doc_texts.append(f"Documento PDF ({name}):\n" + "\n".join(pages_text))
            except Exception as pe:
                print(f"Error parsing PDF attachment: {pe}")

    if not image_items and not doc_texts:
        return None

    prompt_instructions = (
        "Sos el Asistente Clínico y de Gestión de Sanatorio Argentino (Simón IA).\n"
        "Tu tarea es analizar detalladamente la imagen o documento adjunto (orden médica, carnet de obra social/prepaga, "
        "receta, pedido quirúrgico, resultado de estudio o circular administrativa).\n\n"
        "Extrae con rigor clínico e institucional:\n"
        "1. Tipo de documento (Ej: Pedido médico / Orden de consulta / Carnet de Obra Social / Informe ecográfico)\n"
        "2. Obra Social o Prepaga y Plan exacto (Ej: OSDEPYM, OSDE 210, Swiss Medical, PAMI, etc.)\n"
        "3. Médico o Profesional firmante / solicitado (Ej: Dr. Gonzalo Llarena)\n"
        "4. Paciente (Nombre y DNI si están visibles)\n"
        "5. Prácticas, Códigos nomencladores o Estudios indicados\n"
        "6. Diagnóstico o motivo de consulta si figura\n\n"
        "Devuelve ESTRICTAMENTE un JSON válido con la siguiente estructura:\n"
        "{\n"
        '  "summary": "Resumen conciso del documento identificado (Ej: Orden médica de consulta ginecológica del Dr. Gonzalo Llarena para afiliada a OSDEPYM)",\n'
        '  "tipo_documento": "...",\n'
        '  "obra_social": "...",\n'
        '  "plan": "...",\n'
        '  "medico": "...",\n'
        '  "practica": "...",\n'
        '  "codigo": "...",\n'
        '  "search_query": "Consulta clara y directa para el motor RAG de Sanatorio Argentino",\n'
        '  "key_details": "Detalles clínicos o administrativos relevantes detectados"\n'
        "}"
    )

    user_content = []
    text_part = f"Consulta del usuario: {user_prompt or '¿Qué normativas, cobertura y aranceles aplican a este documento en Sanatorio Argentino?'}\n"
    if doc_texts:
        text_part += "\nContenido extraído del documento:\n" + "\n---\n".join(doc_texts)
    user_content.append({"type": "text", "text": text_part})

    for img in image_items[:3]:
        user_content.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:{img['mime']};base64,{img['data']}",
                "detail": "high"
            }
        })

    try:
        response = openai_client.chat.completions.create(
            model=CHAT_MODEL,
            temperature=0.1,
            max_completion_tokens=600,
            messages=[
                {"role": "system", "content": prompt_instructions},
                {"role": "user", "content": user_content}
            ]
        )
        raw_resp = response.choices[0].message.content.strip()
        if raw_resp.startswith("```"):
            raw_resp = re.sub(r"^```(?:json)?\n?", "", raw_resp)
            raw_resp = re.sub(r"\n?```$", "", raw_resp)
        parsed = json.loads(raw_resp.strip())
        return parsed
    except Exception as e:
        print(f"Attachment vision analysis error: {e}")
        return {
            "summary": "Documento / imagen adjunta cargada por el usuario",
            "search_query": user_prompt or "normativas generales sanatorio argentino",
            "key_details": str(e)
        }

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
    
    # Questions about doctors, parameters, fees, or operational terms are NEVER ambiguous
    lower_q = question.lower()
    operational_triggers = [
        # Médicos y turnos
        "parametro", "parámetro", "dra", "dr", "doctor", "doctora", "medico", "médico",
        "arancel", "cobro", "plus", "coseguro", "alias", "turno", "seña", "horario",
        "atiende", "hace", "cuanto", "cuánto", "precio", "costo",
        # Obras sociales, prepagas y convenios sanatoriales
        "obra social", "obras sociales", "prepaga", "prepagas", "convenio", "convenios",
        "cartilla", "plan", "planes", "recibe", "recibimos", "reciben", "acepta", "aceptan",
        "entra", "entran", "cobertura", "afiliado", "afiliados", "credencial",
        "osde", "iosfa", "sancor", "pami", "galeno", "nobis", "swiss medical", "medife",
        "medifé", "omint", "prevencion", "prevención", "osecac", "damsu", "apross",
        "ospedyc", "osprera", "union personal", "unión personal", "accord", "jerarquicos",
        "jerárquicos", "bancarios", "federada", "osdepym"
    ]
    if any(t in lower_q for t in operational_triggers):
        return None

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
            max_completion_tokens=400,
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
                        "5. NO seas demasiado estricto — si la pregunta tiene al menos un tema identificable, es clara\n"
                        "6. PREGUNTAS DE CONVENIOS O PLANES: Preguntas sobre si el sanatorio 'recibe', 'atiende', 'acepta' o qué 'planes' entran de una obra social/prepaga (ej: '¿qué planes de Nobis recibimos?') NUNCA son ambiguas → responde: {\"clear\": true}\n\n"
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
# STEP 4.5: Entity Extraction & Topic Filtering
# ============================================================

def _extract_topic_entities(question: str) -> dict:
    """
    Extract key entities, topics, canonical query and keywords from the question.
    Handles colloquial language (e.g. 'que planes recibimos de nobis?').
    Returns a dict with:
      - entities: list of proper nouns/brands (e.g., ["Nobis"], ["OSDE"], ["PAMI"])
      - topic: the main topic keyword (e.g., "convenios", "autorizaciones", "turnos")
      - canonical_query: normalized formal query for institutional search
      - keywords: list of essential search terms/synonyms
      - strict: whether to enforce strict entity filtering
    """
    try:
        response = openai_client.chat.completions.create(
            model=RERANK_MODEL,  # gpt-5.4-mini for speed and intelligence
            temperature=0,
            max_completion_tokens=400,
            timeout=OPENAI_CALL_TIMEOUT,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Sos un experto en lingüística clínica, administrativa y comprensión semántica de Sanatorio Argentino.\n"
                        "Tu tarea es analizar la consulta del usuario (que puede ser informal, coloquial, con modismos o incompleta) "
                        "y transformarla en una representación estructurada para el motor de búsqueda documental RAG.\n\n"
                        "REGLAS DE INTERPRETACIÓN COLOQUIAL:\n"
                        "1. Modismos como 'recibir / entra / se recibe / atienden / toman / agarran X': significan 'convenio vigente, cartilla de obra social o prepaga, planes aceptados o cobertura'.\n"
                        "2. Entidades Principales: Obras sociales y prepagas (Nobis, OSDE, Swiss Medical, PAMI, Galeno, Medifé, SanCor, OSECAC, etc.), servicios/sectores (Guardia, UTI, Quirófano, Maternidad, Laboratorio) y médicos.\n"
                        "3. 'canonical_query': reformulá la pregunta coloquial en una consulta formal, técnica e institucional de Sanatorio Argentino.\n"
                        "   Ejemplo: 'que planes recibimos de nobis?' -> 'Convenio y planes de cobertura de la obra social o prepaga Nobis aceptados en Sanatorio Argentino'\n"
                        "   Ejemplo: 'atiende pami en guardia?' -> 'Cobertura y atención de urgencia de PAMI en el servicio de guardia'\n"
                        "4. 'keywords': lista de 5 a 8 palabras clave esenciales y sinónimos para matching léxico y vectorial (ej: ['nobis', 'obra social', 'prepaga', 'planes', 'convenio', 'cartilla', 'cobertura', 'admisión']).\n"
                        "5. 'strict': true si la pregunta se refiere a UNA entidad específica y mezclar con otras causaría desinformación.\n\n"
                        "Respondé ÚNICAMENTE un JSON válido con este esquema:\n"
                        "{\n"
                        '  "entities": ["Nobis"],\n'
                        '  "topic": "convenios_obras_sociales",\n'
                        '  "canonical_query": "Convenio y planes de cobertura de la obra social Nobis aceptados en Sanatorio Argentino",\n'
                        '  "keywords": ["nobis", "obra social", "prepaga", "planes", "convenio", "cartilla", "cobertura"],\n'
                        '  "strict": true\n'
                        "}"
                    )
                },
                {
                    "role": "user",
                    "content": f"Pregunta: \"{question}\""
                }
            ]
        )
        
        text = response.choices[0].message.content.strip()
        text = re.sub(r'^```json\s*', '', text)
        text = re.sub(r'\s*```$', '', text)
        result = json.loads(text)
        
        entities = result.get("entities", [])
        topic = result.get("topic", "")
        canonical_query = result.get("canonical_query", question)
        keywords = result.get("keywords", [])
        strict = result.get("strict", False)
        
        if entities or canonical_query != question:
            print(f"[Entity/Query] Entities: {entities} | Canonical: '{canonical_query}' | Keywords: {keywords} (strict={strict})")
        
        return {
            "entities": entities,
            "topic": topic,
            "canonical_query": canonical_query,
            "keywords": keywords,
            "strict": strict
        }
    
    except Exception as e:
        print(f"Entity extraction failed (proceeding without filter): {e}")
        return {
            "entities": [],
            "topic": "",
            "canonical_query": question,
            "keywords": [],
            "strict": False
        }


def _filter_by_entity(documents: list[dict], entity_info: dict, 
                      min_results: int = 3) -> tuple[list[dict], dict]:
    """
    Filter documents to keep only those relevant to the extracted entities.
    Uses a soft-filter approach: if too few results remain, relaxes the filter.
    
    Returns:
        - filtered documents list
        - filter stats dict
    """
    entities = entity_info.get("entities", [])
    strict = entity_info.get("strict", False)
    
    if not entities:
        return documents, {"entity_filter": "none", "entities": []}
    
    # Normalize entities for case-insensitive matching
    normalized_entities = [e.lower().strip() for e in entities]
    
    # Score each document based on entity mention
    scored_docs = []
    for doc in documents:
        content_lower = doc.get("content", "").lower()
        metadata = doc.get("metadata", {})
        
        # Check content + metadata for entity mentions
        filename_lower = metadata.get("filename", "").lower()
        doc_summary_lower = metadata.get("doc_summary", "").lower()
        
        full_text = f"{content_lower} {filename_lower} {doc_summary_lower}"
        
        # Count entity matches
        entity_hits = sum(1 for ent in normalized_entities if ent in full_text)
        
        # Special handling for chat_history / rules — always keep these
        source_type = metadata.get("source", "")
        is_special = source_type in ("chat_history", "rule")
        
        scored_docs.append({
            "doc": doc,
            "entity_hits": entity_hits,
            "has_entity": entity_hits > 0,
            "is_special": is_special,
        })
    
    # Separate: docs with entity match vs without
    with_entity = [s["doc"] for s in scored_docs if s["has_entity"] or s["is_special"]]
    without_entity = [s["doc"] for s in scored_docs if not s["has_entity"] and not s["is_special"]]
    
    stats = {
        "entity_filter": "strict" if strict else "soft",
        "entities": entities,
        "with_entity": len(with_entity),
        "without_entity": len(without_entity),
    }
    
    # Strict mode: only keep entity-matching docs (if enough remain)
    if strict and len(with_entity) >= min_results:
        print(f"[Entity] Strict entity filter: kept {len(with_entity)}/{len(documents)} docs for {entities}")
        stats["filtered_out"] = len(without_entity)
        return with_entity, stats
    
    # Soft mode: prioritize entity-matching docs, then fill with others
    if with_entity:
        result = with_entity + without_entity
        print(f"[Entity] Soft entity filter: prioritized {len(with_entity)} entity docs + {len(without_entity)} others for {entities}")
        stats["reordered"] = True
        return result, stats
    
    # No matches at all — return original order
    print(f"[Entity] Entity filter: no docs matched {entities}, keeping all")
    stats["entity_filter"] = "no_match"
    return documents, stats


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
            temperature=0.6,
            max_completion_tokens=500,
            timeout=OPENAI_CALL_TIMEOUT,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Basándote en la siguiente pregunta (incluso si es coloquial como 'qué planes recibimos de X'), "
                        "generá una respuesta o fragmento institucional hipotético y formal de Sanatorio Argentino como si "
                        "tuvieras acceso a los convenios y reglamentos internos. Incluí terminología técnica (obras sociales, prepagas, "
                        "planes vigentes, cartilla, autorizaciones, coseguros, cobertura ambulatoria o de internación) "
                        "que probablemente aparezca en los documentos institucionales."
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
    Step 2: Multi-Query (Entity-Aware)
    Generate 3 reformulations of the question from different angles.
    Preserves key entities and bridges colloquial terms to formal clinical/administrative terms.
    """
    try:
        response = openai_client.chat.completions.create(
            model=CHAT_MODEL,
            temperature=0.5,
            max_completion_tokens=300,
            timeout=OPENAI_CALL_TIMEOUT,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Generá exactamente 3 reformulaciones técnicas y complementarias de la siguiente pregunta para buscar en los documentos del Sanatorio Argentino.\n"
                        "Si el usuario pregunta de forma coloquial (ej. 'recibimos X', 'entra X', 'atiende X'), traduce la intención a términos documentales formales (convenio, planes aceptados, cartilla, cobertura, aranceles, normativas).\n"
                        "IMPORTANTE: Si la pregunta menciona una entidad específica (obra social, prepaga, servicio, departamento, médico), TODAS las reformulaciones deben mantener esa entidad.\n"
                        "Respondé SOLO con las 3 preguntas, una por línea, sin numeración ni explicaciones."
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

def _rerank_single_document(question: str, doc: dict, 
                            entity_info: dict | None = None) -> dict | None:
    """Re-rank a single document with entity awareness.
    Returns the doc with rerank_score or None if filtered out."""
    try:
        # Identify if this is a learned Q&A chunk (and if verified by user feedback)
        source_type = doc.get("metadata", {}).get("source", "")
        is_verified = doc.get("metadata", {}).get("verified", False)
        extra_hint = ""
        if source_type == "chat_history":
            if is_verified:
                extra_hint = (
                    " Este fragmento proviene de una conversación previa VERIFICADA por un usuario "
                    "(marcada como correcta). Si la pregunta coincide temáticamente, es EXTREMADAMENTE relevante "
                    "y debería tener score alto (8-10)."
                )
            else:
                extra_hint = (
                    " Este fragmento proviene de una conversación previa (Q&A aprendido). "
                    "Si la pregunta coincide temáticamente, es MUY relevante."
                )
        
        # Entity-awareness hint for re-ranking
        entity_hint = ""
        if entity_info and entity_info.get("entities"):
            entities_str = ", ".join(entity_info["entities"])
            entity_hint = (
                f" ATENCIÓN: La pregunta se refiere específicamente a: {entities_str}. "
                f"Si el fragmento habla de {entities_str}, aumentá el score. "
                f"Si el fragmento habla de OTRA entidad diferente (ej: otra obra social, "
                f"otro servicio), reducí el score significativamente (máximo 2/10) "
                f"a menos que contenga información comparativa relevante."
            )
        
        # Special hint for manually loaded rules to prevent filtering out older/similar ones
        rule_hint = ""
        if source_type == "rule":
            rule_hint = (
                " Este fragmento es una REGLA (manual override). Si trata sobre el mismo tema, servicio o entidad "
                "de la pregunta, dale un score de relevancia alto (mínimo 5/10) incluso si es una regla antigua o "
                "parece entrar en conflicto con otra, ya que es fundamental conservar todas las reglas similares "
                "o históricas para que el generador las analice y compare."
            )
        
        response = openai_client.chat.completions.create(
            model=RERANK_MODEL,
            temperature=0,
            max_completion_tokens=150,
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
                        "PRIORIDAD TEMPORAL: Si el fragmento contiene fechas o períodos, "
                        "los documentos más recientes (cercanos a hoy) son MÁS relevantes. "
                        "Si dos fragmentos contienen info similar, el más reciente debería tener mayor score."
                        f"{extra_hint}"
                        f"{entity_hint}"
                        f"{rule_hint} "
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


def _rerank_documents(question: str, documents: list[dict],
                      entity_info: dict | None = None) -> list[dict]:
    """
    Step 5: Re-ranking with LLM (PARALLELIZED + ENTITY-AWARE)
    Score each document's relevance to the question (0-10).
    Uses ThreadPoolExecutor for concurrent API calls.
    Entity info is passed to each re-ranker for topic-aware scoring.
    """
    # Separate rules and other documents to ensure we always evaluate rules
    rules = [d for d in documents if d.get("metadata", {}).get("source") == "rule"]
    other_docs = [d for d in documents if d.get("metadata", {}).get("source") != "rule"]
    
    # Prioritize up to 8 rules and up to 12 other docs as candidates for re-ranking
    candidates = rules[:8] + other_docs[:12]
    reranked = []

    # Submit all re-ranking calls in parallel (with entity info)
    futures = {
        _executor.submit(_rerank_single_document, question, doc, entity_info): doc
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
                           conversation_history: list[dict],
                           interpreted_doc: dict | None = None) -> str:
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

    interpreted_doc_section = ""
    if interpreted_doc:
        interpreted_doc_section = (
            f"El usuario adjuntó una imagen/documento interpretada:\n"
            f"- Resumen: {interpreted_doc.get('summary', 'Documento adjunto')}\n"
            f"- Obra Social: {interpreted_doc.get('obra_social', 'N/D')} | Plan: {interpreted_doc.get('plan', 'N/D')}\n"
            f"- Médico: {interpreted_doc.get('medico', 'N/D')} | Práctica: {interpreted_doc.get('practica', 'N/D')}\n"
            f"- Detalles clave: {interpreted_doc.get('key_details', 'N/D')}\n\n"
            f"IMPORTANTE: Confirma al inicio de tu respuesta qué documento fue identificado, y luego responde con la normativa oficial aplicable de Sanatorio Argentino.\n"
        )
    today_str = datetime.now().strftime("%d/%m/%Y")
    system_prompt = f"""Sos Simon, el Asistente de IA Avanzado y Consultor Documental del Sanatorio Argentino (Motor: GPT-5.4).
Tu función es analizar profundamente la información proporcionada y entregar respuestas definitivas, estructuradas y de nivel experto.
Fecha actual: {today_str}

DIRECTRICES CORE (Cumplimiento Estricto):
1. PRECISIÓN ABSOLUTA: Basá tu respuesta EXCLUSIVAMENTE en el [CONTEXTO], [REGLAS Y DIRECTIVAS] y [RESPUESTAS PREVIAS]. Cero alucinaciones.
2. JERARQUÍA DE DATOS: Si hay [REGLAS Y DIRECTIVAS], suplantan cualquier otra información. Son la verdad absoluta.
3. RAZONAMIENTO PROFUNDO: Analizá datos tabulares y narrativos cruzando información. Si el usuario hace una pregunta compleja, explicá tu razonamiento paso a paso antes de dar la conclusión final.
4. ESTÉTICA DE LA RESPUESTA: Usá Markdown avanzado. Empleá negritas para destacar conceptos clave, viñetas para listas y tablas en formato Markdown cuando compares o presentes datos estructurados.
5. NO HAY CALLEJONES SIN SALIDA: Si encontrás datos parciales, entregalos y aclará qué parte falta. Solo respondé "No tengo información" si el contexto es 100% irrelevante.
6. CITAS OBLIGATORIAS: Siempre referenciá el origen de los datos usando el formato: **(Fuente: nombre_archivo)** o **(Regla: título)** al final del párrafo correspondiente.
7. RESTRICCIÓN TEMÁTICA (ENTITY ISOLATION): Si la pregunta especifica una entidad (ej. OSDE, Quirófano), FILTRÁ mentalmente y respondé SOLO sobre esa entidad, ignorando el resto del contexto que no aplique.
8. COMPULSA DE REGLAS SIMILARES Y SESGO DE RECENCIA:
   - Si detectás múltiples reglas o informaciones muy similares o relacionadas (por ejemplo, varias reglas sobre la misma obra social, arancel o servicio con diferentes fechas o condiciones):
     a) Indica explícitamente al inicio de tu respuesta (como una nota o aviso en negrita) que se encontraron múltiples reglas o informaciones similares/históricas sobre el tema.
     b) Determina cuál es la **última información disponible** (la regla o documento con la fecha más reciente cercana a {today_str}) y presentala de manera prominente como la información vigente y principal.
     c) Muestra y resume claramente las **otras reglas parecidas o anteriores** bajo una sección clara titulada 'Otras reglas relacionadas / Historial', indicando sus respectivas fechas y en qué se diferencian (por ejemplo, si antes se recibía la obra social y ahora no, o si cambió el monto del coseguro), para darle al usuario todo el contexto y la trazabilidad del cambio.
   - Ante cualquier otro conflicto de información, la fecha de vigencia o creación más cercana a {today_str} es la correcta y debe primar.
9. TONO Y ESTILO: Profesional, empático, resolutivo y clínico. Evitá frases robóticas.
10. FOLLOW-UP INTELIGENTE: Al final, sugerí SIEMPRE 2-3 preguntas que el usuario lógicamente haría a continuación, usando este formato exacto:

---
💡 **También podrías preguntar:**
- ¿Pregunta relacionada 1?
- ¿Pregunta relacionada 2?
- ¿Pregunta relacionada 3?

11. INTERPRETACIÓN DE PREGUNTAS COLOQUIALES:
Los usuarios suelen consultar con lenguaje informal o abreviado (ej. "qué planes recibimos de Nobis", "entra X obra social?", "atiende tal médico?", "cuánto sale?").
Entendé siempre la intención institucional de fondo:
- "recibir / se recibe / entra X": se refiere a convenios vigentes, obras sociales y prepagas aceptadas, planes autorizados, requisitos o coseguros en Sanatorio Argentino.
- Respondé siempre con precisión técnica e institucional formal, destacando con claridad los planes específicos recibidos o no recibidos según los documentos oficiales.

[DOCUMENTO ADJUNTO INTERPRETADO]
{interpreted_doc_section}

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
        max_completion_tokens=3500,
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

def process_question(question: str, conversation_id: str | None = None, attachments: list[dict] | None = None, user_id: str | None = None) -> dict:
    """
    Main RAG pipeline — Process a user question through 8 stages.
    Returns the answer, sources, and pipeline metadata.
    
    V3.2: Disambiguate → HyDE + Multi-Query → Hybrid Search → Dedup → Entity Filter → Re-rank → Generate → Learn
    """
    pipeline_info = {
        "hyde_generated": False,
        "multi_queries": 0,
        "total_searched": 0,
        "unique_results": 0,
        "entity_filter": "none",
        "entity_detected": [],
        "reranked_kept": 0,
        "disambiguation_triggered": False,
        "chat_learning": False,
        "multimodal_attachment": bool(attachments),
    }

    # === STEP -1: Multimodal Vision & Attachment Analysis ===
    interpreted_doc = None
    if attachments:
        try:
            interpreted_doc = _analyze_attachments(attachments, question)
            if interpreted_doc:
                pipeline_info["interpreted_doc"] = interpreted_doc
                # Enrich question if user wrote nothing or brief text
                doc_query = interpreted_doc.get("search_query", "")
                if not question.strip():
                    question = doc_query or interpreted_doc.get("summary", "Consulta sobre documento adjunto")
                else:
                    question = f"{question} (Documento adjunto: {interpreted_doc.get('summary', '')})"
        except Exception as e:
            print(f"Error in multimodal attachment analysis: {e}")

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

    # === STEPS 1, 2 & 4.5 prep: HyDE + Multi-Query + Entity Extraction IN PARALLEL ===
    hyde_future = _executor.submit(_generate_hyde_response, question)
    multi_future = _executor.submit(_generate_multi_queries, question)
    entity_future = _executor.submit(_extract_topic_entities, question)

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

    try:
        entity_info = entity_future.result(timeout=OPENAI_CALL_TIMEOUT + 5)
    except Exception as e:
        print(f"Entity extraction future failed: {e}")
        entity_info = {"entities": [], "topic": "", "strict": False}

    pipeline_info["hyde_generated"] = bool(hyde_response)
    pipeline_info["multi_queries"] = len(multi_queries)
    pipeline_info["entity_detected"] = entity_info.get("entities", [])
    pipeline_info["canonical_query"] = entity_info.get("canonical_query", question)
    pipeline_info["keywords_detected"] = entity_info.get("keywords", [])

    # === STEP 3: Hybrid Search × N (PARALLEL) ===
    search_queries = [question]
    canonical_query = entity_info.get("canonical_query")
    if canonical_query and canonical_query != question:
        search_queries.append(canonical_query)
    keywords = entity_info.get("keywords", [])
    if keywords:
        search_queries.append(" ".join(keywords))
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

    # === STEP 4: De-duplication + Recency Boost ===
    seen = {}
    for doc in all_results:
        doc_id = doc.get("id")
        if doc_id not in seen or doc.get("rank_score", 0) > seen[doc_id].get("rank_score", 0):
            seen[doc_id] = doc

    # Apply recency boost: newer documents get a small score bonus
    now = datetime.now(timezone.utc)
    for doc in seen.values():
        created_at = doc.get("created_at") or doc.get("metadata", {}).get("created_at", "")
        if created_at:
            try:
                if isinstance(created_at, str):
                    created_at = created_at.replace("Z", "+00:00")
                    doc_date = datetime.fromisoformat(created_at)
                else:
                    doc_date = created_at
                days_old = (now - doc_date).days
                # Recency boost: 0.15 for today, decays over 180 days
                recency_boost = max(0, 0.15 * (1 - days_old / 180))
                doc["recency_boost"] = round(recency_boost, 4)
                doc["rank_score"] = doc.get("rank_score", 0) + recency_boost
            except Exception:
                doc["recency_boost"] = 0
        else:
            doc["recency_boost"] = 0

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

    # === STEP 4.5: Entity-Aware Topic Filtering ===
    if entity_info.get("entities"):
        unique_docs, filter_stats = _filter_by_entity(unique_docs, entity_info)
        pipeline_info["entity_filter"] = filter_stats.get("entity_filter", "none")
        pipeline_info["entity_filter_stats"] = filter_stats
    
    # === STEP 5: Re-ranking (PARALLEL + ENTITY-AWARE) ===
    reranked = _rerank_documents(question, unique_docs, entity_info)
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
    answer = _generate_final_answer(question, reranked, conversation_history, interpreted_doc)

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
        "interpreted_doc": pipeline_info.get("interpreted_doc"),
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
            print(f"Learned {result['indexed']} Q&A pairs from conversation {conversation_id}")
    except Exception as e:
        print(f"Chat learning error: {e}")
