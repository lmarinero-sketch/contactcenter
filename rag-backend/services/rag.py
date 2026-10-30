"""
RAG Pipeline V3.4 — High-Speed Turbo Architecture + Entity-Aware + Recency Bias
Optimized pipeline:
  - Unified Step 0+1+2+4.5: Single fast LLM call (gpt-5.4-mini) for Disambiguation + Entity Extraction + Query Expansion
  - Batch Embedding + Parallel Hybrid Search + Direct Entity/Rule Lookup in Supabase
  - Fast-Path Entity Scoring + Single-Call Batch LLM Re-ranking (replaces 20 separate LLM calls with 1 batch call)
  - Non-blocking asynchronous persistence & learning
"""
import json
import re
import time
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError
from config import (
    openai_client, supabase,
    CHAT_MODEL, RERANK_MODEL,
    MATCH_COUNT, RERANK_TOP_K
)
from services.embeddings import generate_embedding, generate_embeddings_batch, hybrid_search

_executor = ThreadPoolExecutor(max_workers=12)

# Timeout for individual OpenAI calls (seconds)
OPENAI_CALL_TIMEOUT = 25
# Timeout for the entire pipeline (seconds)
PIPELINE_TIMEOUT = 90


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
        '  "summary": "Resumen conciso del documento identificado",\n'
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
# UNIFIED STEP 0 + 1 + 2 + 4.5: Fast Query Analysis & Expansion
# Replaces 4 separate LLM calls (_check_ambiguity + _generate_hyde_response
# + _generate_multi_queries + _extract_topic_entities) with 1 single fast call!
# ============================================================

OPERATIONAL_TRIGGERS = [
    "parametro", "parámetro", "dra", "dr", "doctor", "doctora", "medico", "médico",
    "lic", "licenciada", "licenciado", "kinesiolog", "ecograf", "ginecolog", "cardiolog",
    "pediatr", "traumatolog", "cirujano", "cirugia", "cirugía", "guardia",
    "arancel", "cobro", "plus", "coseguro", "alias", "turno", "seña", "horario",
    "atiende", "hace", "cuanto", "cuánto", "precio", "costo", "particular", "diferencial",
    "sede", "consultorio", "san luis", "santa fe", "orden", "autorizacion", "autorización",
    "token", "validador", "receta", "derivacion", "derivación",
    "obra social", "obras sociales", "prepaga", "prepagas", "convenio", "convenios",
    "cartilla", "plan", "planes", "recibe", "recibimos", "reciben", "acepta", "aceptan",
    "entra", "entran", "cobertura", "afiliado", "afiliados", "credencial", "suspendid",
    "osde", "iosfa", "sancor", "pami", "galeno", "nobis", "swiss", "medife",
    "medifé", "omint", "prevencion", "prevención", "osecac", "damsu", "apross",
    "ospedyc", "osprera", "union personal", "unión personal", "accord", "jerarquicos",
    "jerárquicos", "bancarios", "federada", "osdepym", "osp", "provincia", "ospe",
    "medicus", "bramed", "iter", "red de seguro", "cimyn", "colmed", "asog"
]


_STOPWORDS_ANALYSIS = {
    "como", "cual", "cuales", "cuando", "donde", "quien", "quienes", "para", "por", "con", "sin",
    "sobre", "entre", "hasta", "desde", "todo", "toda", "todos", "todas", "este", "esta", "estos",
    "estas", "ese", "esa", "esos", "esas", "tiene", "tienen", "hay", "puede", "pueden", "debe",
    "deben", "hace", "hacen", "atiende", "atienden", "recibe", "recibimos", "reciben", "acepta",
    "aceptamos", "aceptan", "entra", "entran", "cubre", "cubren", "trabaja", "trabajan", "cobra",
    "cobran", "obra", "social", "obras", "sociales", "prepaga", "prepagas", "medico", "médico",
    "medicos", "médicos", "doctor", "doctora", "dr", "dra", "lic", "licenciada", "licenciado",
    "consulta", "consultas", "turno", "turnos", "valor", "valores", "precio", "precios", "costo",
    "costos", "arancel", "aranceles", "coseguro", "plus", "particular", "diferencial", "alias",
    "seña", "sena", "horario", "horarios", "dias", "días", "atencion", "atención", "sede", "sedes",
    "consultorio", "consultorios", "sanatorio", "argentino", "plan", "planes", "parametro",
    "parametros", "parámetro", "parámetros", "nota", "notas", "regla", "reglas", "requisitos",
    "requisito", "orden", "autorizacion", "autorización", "necesita", "pide", "piden", "cual",
    "qué", "que", "cómo", "cuál", "cuáles", "cuánto", "cuanto", "dónde", "donde", "cuándo", "cuando",
    "del", "las", "los", "una", "uno", "unos", "unas", "les", "nos", "son", "esta", "está", "estan"
}

_MULTIWORD_ENTITIES = [
    "swiss medical", "union personal", "unión personal", "prevencion salud", "prevención salud",
    "red de seguro medico", "red de seguro médico", "obra social provincia", "san luis", "santa fe",
    "sancor salud", "jerarquicos salud", "jerárquicos salud", "federada salud", "osde binario",
    "hospital universitario"
]

_VAGUE_ONE_WORD = {"hola", "buenas", "consulta", "duda", "ayuda", "turno", "turnos", "medico", "médico", "obra"}


def _analyze_and_expand_query(question: str, conversation_history: list[dict]) -> dict:
    """
    Ultra-fast query analyzer:
    - Uses a <1ms deterministic local analyzer for clear, self-contained queries.
    - Falls back to a single RERANK_MODEL (gpt-5.4-mini) call only when conversational
      pronoun resolution or ambiguity disambiguation is needed.
    """
    lower_q = question.lower().strip()
    has_context = len(conversation_history) >= 2
    words_raw = re.findall(r'[a-zA-ZáéíóúñÁÉÍÓÚÑ0-9]+', question)

    is_doctor_query = any(
        w in lower_q.split() or w in lower_q
        for w in ("dr", "dra", "doctor", "doctora", "medico", "médico", "parametro", "parámetro", "parametros", "parámetros", "consultorio", "alias")
    )

    # Extract multi-word known entities first
    detected_entities = []
    remaining_q = lower_q
    for mw in _MULTIWORD_ENTITIES:
        if mw in remaining_q:
            detected_entities.append(mw.title())
            remaining_q = remaining_q.replace(mw, " ")

    # Extract individual candidate entity tokens (surnames, obras sociales, acronyms >= 3 chars)
    for w in words_raw:
        w_clean = w.strip()
        w_low = w_clean.lower()
        if len(w_clean) >= 3 and w_low not in _STOPWORDS_ANALYSIS:
            if not any(w_low in e.lower() for e in detected_entities):
                detected_entities.append(w_clean)

    # Check if this is a short conversational follow-up without an explicit entity (e.g. "¿y cuánto cobra?")
    needs_history_resolution = has_context and len(detected_entities) == 0
    is_vague_single = (not has_context) and (len(words_raw) <= 1) and (lower_q in _VAGUE_ONE_WORD or len(detected_entities) == 0)

    # FAST PATH (<1ms, 0 LLM calls): Self-contained clear query!
    if not needs_history_resolution and not is_vague_single and (len(detected_entities) >= 1 or len(words_raw) >= 3):
        keywords = detected_entities[:4] + [
            w.lower() for w in words_raw
            if len(w) >= 4 and w.lower() not in [e.lower() for e in detected_entities]
        ][:4]
        return {
            "clear": True,
            "reason": "",
            "suggestions": [],
            "entities": detected_entities[:3],
            "is_doctor_query": is_doctor_query,
            "topic": "medico" if is_doctor_query else "general",
            "canonical_query": question,
            "alt_queries": [],
            "keywords": keywords[:7],
            "strict": len(detected_entities) >= 1,
            "fast_local": True,
        }

    never_ambiguous = has_context or len(question.split()) >= 4 or any(t in lower_q for t in OPERATIONAL_TRIGGERS)

    context_hint = ""
    if has_context:
        recent = conversation_history[-2:]
        context_hint = "\nContexto previo:\n" + "\n".join(
            f"- {m['role']}: {m['content'][:160]}" for m in recent
        )

    try:
        response = openai_client.chat.completions.create(
            model=RERANK_MODEL,
            temperature=0,
            max_completion_tokens=260,
            timeout=12,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Sos el motor de análisis semántico de Sanatorio Argentino (Simon IA).\n"
                        "Analizá la consulta del usuario y devolvé ÚNICAMENTE un JSON válido:\n"
                        "{\n"
                        '  "clear": true,\n'
                        '  "reason": "",\n'
                        '  "suggestions": [],\n'
                        '  "entities": ["Entidad1"],\n'
                        '  "is_doctor_query": false,\n'
                        '  "topic": "medico|obra_social|precios|protocolo|general",\n'
                        '  "canonical_query": "Consulta técnica formal completa",\n'
                        '  "alt_queries": ["Variante 1"],\n'
                        '  "keywords": ["palabra1", "palabra2"],\n'
                        '  "strict": true\n'
                        "}\n"
                    )
                },
                {
                    "role": "user",
                    "content": f"Pregunta: \"{question}\"{context_hint}"
                }
            ]
        )

        text = response.choices[0].message.content.strip()
        text = re.sub(r'^```(?:json)?\s*', '', text)
        text = re.sub(r'\s*```$', '', text)
        result = json.loads(text)

        is_clear = True if never_ambiguous else bool(result.get("clear", True))
        return {
            "clear": is_clear,
            "reason": result.get("reason", "La pregunta podría ser más específica"),
            "suggestions": (result.get("suggestions") or [])[:4],
            "entities": result.get("entities") or detected_entities[:2],
            "is_doctor_query": bool(result.get("is_doctor_query", is_doctor_query)),
            "topic": result.get("topic", ""),
            "canonical_query": result.get("canonical_query") or question,
            "alt_queries": (result.get("alt_queries") or [])[:2],
            "keywords": (result.get("keywords") or [])[:8],
            "strict": bool(result.get("strict", False)),
        }
    except Exception as e:
        print(f"Fast query analysis fallback: {e}")
        return {
            "clear": True,
            "reason": "",
            "suggestions": [],
            "entities": detected_entities[:2],
            "is_doctor_query": is_doctor_query,
            "topic": "",
            "canonical_query": question,
            "alt_queries": [],
            "keywords": [],
            "strict": len(detected_entities) >= 1,
        }


# ============================================================
# DIRECT FAST LOOKUP FOR ENTITIES / DOCTOR RULES IN SUPABASE
# Ensures <180ms exact match on rules and doctor parameters
# ============================================================

def _direct_entity_lookup(entities: list[str], question: str, is_doctor_query: bool = False) -> list[dict]:
    """
    Directly queries rag_documents for rules and chunks matching the extracted entity names.
    1. First matches rule titles (`metadata->>title ILIKE %ent%`) so exact doctor rules or
       exact Obra Social rules are always ranked #1 without being drowned out by 456 doctor rules
       that merely list that Obra Social in their coverage!
    2. For non-doctor queries, also searches non-doctor rules (`metadata->>category != 'medico'`)
       by content, plus general document chunks.
    """
    candidates = [e.strip() for e in entities if len(e.strip()) >= 3]
    if not candidates:
        clean_words = re.findall(r'[a-zA-ZáéíóúñÁÉÍÓÚÑ]{4,}', question)
        candidates = [w for w in clean_words if w.lower() not in _STOPWORDS_ANALYSIS][:2]

    if not candidates:
        return []

    found = []
    seen_ids = set()
    for ent in candidates[:2]:
        try:
            # 1. Exact title match in rules (matches Doctor surname in title OR Obra Social name in title)
            res_title_rules = supabase.table("rag_documents") \
                .select("id, content, metadata, created_at") \
                .eq("metadata->>source", "rule") \
                .ilike("metadata->>title", f"%{ent}%") \
                .limit(8) \
                .execute()
            for row in (res_title_rules.data or []):
                if row["id"] not in seen_ids:
                    seen_ids.add(row["id"])
                    row["similarity"] = 0.98
                    row["rank_score"] = 0.99
                    row["direct_match"] = True
                    found.append(row)

            # 2. If not a doctor query (or no title rule found), search non-medico rules by content
            if not is_doctor_query or not found:
                res_content_rules = supabase.table("rag_documents") \
                    .select("id, content, metadata, created_at") \
                    .eq("metadata->>source", "rule") \
                    .neq("metadata->>category", "medico") \
                    .ilike("content", f"%{ent}%") \
                    .limit(6) \
                    .execute()
                for row in (res_content_rules.data or []):
                    if row["id"] not in seen_ids:
                        seen_ids.add(row["id"])
                        row["similarity"] = 0.94
                        row["rank_score"] = 0.96
                        row["direct_match"] = True
                        found.append(row)

            # 3. Only fetch general document chunks if we didn't already find a doctor rule for a doctor query
            has_doc_rule = any(r.get("metadata", {}).get("category") == "medico" for r in found)
            if not (is_doctor_query and has_doc_rule):
                res_docs = supabase.table("rag_documents") \
                    .select("id, content, metadata, created_at") \
                    .neq("metadata->>source", "rule") \
                    .ilike("content", f"%{ent}%") \
                    .limit(5) \
                    .execute()
                for row in (res_docs.data or []):
                    if row["id"] not in seen_ids:
                        seen_ids.add(row["id"])
                        row["similarity"] = 0.85
                        row["rank_score"] = 0.85
                        row["direct_match"] = True
                        found.append(row)
        except Exception as e:
            print(f"Direct entity lookup warning for '{ent}': {e}")

    found.sort(key=lambda r: r.get("rank_score", 0), reverse=True)
    return found


def _filter_by_entity(documents: list[dict], entity_info: dict,
                      min_results: int = 3) -> tuple[list[dict], dict]:
    """
    Filter documents to keep only those relevant to the extracted entities.
    """
    entities = entity_info.get("entities", [])
    strict = entity_info.get("strict", False)

    if not entities:
        return documents, {"entity_filter": "none", "entities": []}

    normalized_entities = [e.lower().strip() for e in entities if e.strip()]

    scored_docs = []
    for doc in documents:
        content_lower = doc.get("content", "").lower()
        metadata = doc.get("metadata", {})
        filename_lower = metadata.get("filename", "").lower()
        title_lower = metadata.get("title", "").lower()
        doc_summary_lower = metadata.get("doc_summary", "").lower()

        full_text = f"{title_lower} {filename_lower} {content_lower} {doc_summary_lower}"
        entity_hits = sum(1 for ent in normalized_entities if ent in full_text)

        source_type = metadata.get("source", "")
        # Keep non-matching rules only if they are not from a different doctor!
        is_other_doctor_rule = (
            source_type == "rule"
            and metadata.get("category") == "medico"
            and entity_hits == 0
        )
        is_special = source_type in ("chat_history", "rule") and not is_other_doctor_rule

        scored_docs.append({
            "doc": doc,
            "entity_hits": entity_hits,
            "has_entity": entity_hits > 0,
            "is_special": is_special,
        })

    with_entity = [s["doc"] for s in scored_docs if s["has_entity"]]
    special_only = [s["doc"] for s in scored_docs if not s["has_entity"] and s["is_special"]]
    without_entity = [s["doc"] for s in scored_docs if not s["has_entity"] and not s["is_special"]]

    stats = {
        "entity_filter": "strict" if strict else "soft",
        "entities": entities,
        "with_entity": len(with_entity),
        "without_entity": len(without_entity),
    }

    if strict and len(with_entity) >= min_results:
        stats["filtered_out"] = len(without_entity)
        return with_entity + special_only[:3], stats

    if with_entity:
        result = with_entity + special_only[:4] + without_entity
        stats["reordered"] = True
        return result, stats

    stats["entity_filter"] = "no_match"
    return documents, stats


# ============================================================
# STEP 5: Single-Call Batch Re-ranking (Replaces 20x LLM calls)
# ============================================================

def _rerank_documents(question: str, documents: list[dict],
                      entity_info: dict | None = None) -> list[dict]:
    """
    Fast Re-ranking:
    1. If we already have direct entity matches (rules or chunks matching the requested doctor,
       obra social, or service), score deterministically in 0ms!
    2. Otherwise, score candidates in a single batched JSON LLM call (1 call instead of 20!).
    """
    if not documents:
        return []

    entities = [e.lower().strip() for e in (entity_info or {}).get("entities", []) if e.strip()]

    # Separate rules/direct matches vs general chunks
    rules_and_direct = []
    other_docs = []
    for d in documents:
        meta = d.get("metadata", {})
        if meta.get("source") == "rule" or d.get("direct_match"):
            rules_and_direct.append(d)
        else:
            other_docs.append(d)

    candidates = (rules_and_direct[:8] + other_docs[:8])[:12]

    # FAST-PATH (0ms): If user asked about a specific entity (Doctor, Obra Social, Service) and we found exact matches
    direct_entity_hits = []
    has_doctor_rule = False
    if entities:
        for d in candidates:
            meta = d.get("metadata", {})
            text_check = (
                f"{meta.get('title', '')} "
                f"{meta.get('medico', '')} "
                f"{meta.get('filename', '')} "
                f"{d.get('content', '')}"
            ).lower()
            if all(ent in text_check for ent in entities):
                is_rule = meta.get("source") == "rule"
                if is_rule and meta.get("category") == "medico":
                    has_doctor_rule = True
                doc_copy = dict(d)
                doc_copy["rerank_score"] = 9.5 if is_rule else 8.5
                direct_entity_hits.append(doc_copy)

    # Deduplicate redundant Guia_Parametros_Notas_Diarias_Medicos_SALUS.md chunk if the exact doctor rule is already present
    if has_doctor_rule and len(direct_entity_hits) > 1:
        filtered_hits = []
        for dh in direct_entity_hits:
            fn = dh.get("metadata", {}).get("filename", "")
            if dh.get("metadata", {}).get("source") != "rule" and "Guia_Parametros_Notas_Diarias_Medicos_SALUS" in fn:
                continue
            filtered_hits.append(dh)
        if filtered_hits:
            direct_entity_hits = filtered_hits

    # Whenever we have >= 1 direct entity hit (doctor, obra social, service), skip LLM rerank (0ms)!
    if len(direct_entity_hits) >= 1:
        direct_ids = {d.get("id") for d in direct_entity_hits}
        extra = []
        for d in candidates:
            if d.get("id") not in direct_ids:
                dc = dict(d)
                dc["rerank_score"] = round(min(7.0, float(d.get("rank_score", 0.5)) * 6), 1)
                extra.append(dc)
        combined = direct_entity_hits[:6] + extra[:2]
        combined.sort(key=lambda x: x.get("rerank_score", 0), reverse=True)
        return combined[:6]

    # If candidate set is already small (<= 5 docs), score deterministically by hybrid rank_score (0ms)!
    if len(candidates) <= 5:
        fast_list = []
        for d in candidates:
            dc = dict(d)
            is_rule = dc.get("metadata", {}).get("source") == "rule"
            dc["rerank_score"] = 9.0 if is_rule else round(min(8.5, max(5.0, float(d.get("rank_score", 0.5)) * 8)), 1)
            fast_list.append(dc)
        fast_list.sort(key=lambda x: x.get("rerank_score", 0), reverse=True)
        return fast_list

    # SINGLE BATCH LLM CALL to score candidates when query has no direct entity match and >5 candidates
    try:
        snippets = []
        for idx, doc in enumerate(candidates):
            meta = doc.get("metadata", {})
            src = meta.get("source", "doc")
            title = meta.get("title") or meta.get("filename") or "fragmento"
            date_str = meta.get("rule_date") or (str(doc.get("created_at", ""))[:10])
            snippet_text = doc.get("content", "")[:450].replace("\n", " ")
            snippets.append(f"[{idx}] ({src} | {title} | {date_str}): {snippet_text}")

        entity_note = ""
        if entities:
            entity_note = f"Entidad principal buscada: {', '.join(entities)}. Penalizá con 0-1 los fragmentos de otras entidades distintas.\n"

        response = openai_client.chat.completions.create(
            model=RERANK_MODEL,
            temperature=0,
            max_completion_tokens=180,
            timeout=12,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Evaluá de 0 a 10 la relevancia de cada fragmento numerado para responder la pregunta del usuario.\n"
                        f"{entity_note}"
                        "Priorizá reglas ('rule') y documentos más recientes que coincidan con la entidad o tema.\n"
                        "Respondé ÚNICAMENTE con JSON válido asignando el puntaje a cada índice: "
                        '{"scores": {"0": 9, "1": 4, "2": 0}}'
                    )
                },
                {
                    "role": "user",
                    "content": f"Pregunta: {question}\n\nFragmentos:\n" + "\n".join(snippets)
                }
            ]
        )

        raw = response.choices[0].message.content.strip()
        raw = re.sub(r'^```(?:json)?\s*', '', raw)
        raw = re.sub(r'\s*```$', '', raw)
        parsed = json.loads(raw)
        scores_map = parsed.get("scores", parsed)

        reranked = []
        for idx, doc in enumerate(candidates):
            sc = float(scores_map.get(str(idx), scores_map.get(idx, 0)))
            if sc >= 2:
                doc_copy = dict(doc)
                doc_copy["rerank_score"] = sc
                reranked.append(doc_copy)

        if reranked:
            reranked.sort(key=lambda x: x.get("rerank_score", 0), reverse=True)
            return reranked[:6]
    except Exception as e:
        print(f"Batch re-rank fallback to hybrid rank_score: {e}")

    # Instant deterministic fallback if batch LLM rerank fails or filters all
    fallback = []
    for d in candidates[:6]:
        dc = dict(d)
        dc["rerank_score"] = round(min(9.0, float(d.get("rank_score", 0.5)) * 8), 1)
        fallback.append(dc)
    return fallback


# ============================================================
# STEP 6: Final Answer Generation
# ============================================================

def _generate_final_answer(question: str, documents: list[dict],
                           conversation_history: list[dict],
                           interpreted_doc: dict | None = None) -> str:
    """
    Step 6: Final answer generation with strict source citation.
    Uses RERANK_MODEL (gpt-5.4-mini) for fast, high-precision text synthesis (~1.5s)
    and CHAT_MODEL (gpt-5.4) when multimodal document interpretation is involved.
    """
    context_parts = []
    learned_parts = []
    rules_parts = []

    for i, doc in enumerate(documents[:6], 1):
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
            f"Las siguientes son reglas/información ingresada manualmente o sincronizada desde SALUS. "
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
    system_prompt = f"""Sos Simon, el Asistente de IA Avanzado y Consultor Documental del Sanatorio Argentino.
Tu función es analizar la información proporcionada y entregar respuestas directas, claras, estructuradas y de nivel experto.
Fecha actual: {today_str}

DIRECTRICES CORE (Cumplimiento Estricto):
1. PRECISIÓN ABSOLUTA: Basá tu respuesta EXCLUSIVAMENTE en el [CONTEXTO], [REGLAS Y DIRECTIVAS] y [RESPUESTAS PREVIAS]. Cero alucinaciones.
2. JERARQUÍA DE DATOS: Si hay [REGLAS Y DIRECTIVAS], suplantan cualquier otra información. Son la verdad absoluta.
3. RESPUESTA ÁGIL Y ESTRUCTURADA: Andá directo al grano con los datos operativos clave (valores, cobertura, sedes, horarios, requisitos, alias). Usá negritas, viñetas y tablas Markdown cuando presentes varios ítems.
4. NO HAY CALLEJONES SIN SALIDA: Si encontrás datos parciales, entregalos y aclará qué parte falta. Solo respondé "No tengo información" si el contexto es 100% irrelevante.
5. CITAS OBLIGATORIAS: Siempre referenciá el origen de los datos usando el formato: **(Fuente: nombre_archivo)** o **(Regla: título)** al final del párrafo correspondiente.
6. RESTRICCIÓN TEMÁTICA (ENTITY ISOLATION): Si la pregunta especifica una entidad (ej. un médico, OSDE, Quirófano), FILTRÁ mentalmente y respondé SOLO sobre esa entidad, ignorando el resto del contexto que no aplique.
7. COMPULSA DE REGLAS SIMILARES Y SESGO DE RECENCIA:
   - Si detectás múltiples reglas sobre la misma obra social, arancel o servicio con diferentes fechas, priorizá la más reciente cercana a {today_str} como vigente y mencioná brevemente el historial si aplica.
8. FOLLOW-UP INTELIGENTE: Al final, sugerí SIEMPRE 2-3 preguntas breves que el usuario lógicamente haría a continuación, usando este formato exacto:

---
💡 **También podrías preguntar:**
- ¿Pregunta relacionada 1?
- ¿Pregunta relacionada 2?
- ¿Pregunta relacionada 3?

[DOCUMENTO ADJUNTO INTERPRETADO]
{interpreted_doc_section}

[CONTEXTO]
{context}{rules_section}{learned_section}"""

    messages = [{"role": "system", "content": system_prompt}]

    for msg in conversation_history[-6:]:
        messages.append({
            "role": msg["role"],
            "content": msg["content"]
        })

    messages.append({"role": "user", "content": question})

    synthesis_model = CHAT_MODEL if interpreted_doc else RERANK_MODEL

    response = openai_client.chat.completions.create(
        model=synthesis_model,
        temperature=0,
        max_completion_tokens=1100,
        timeout=OPENAI_CALL_TIMEOUT * 2,
        messages=messages
    )

    return response.choices[0].message.content


# ============================================================
# Batch Hybrid Search Executor
# ============================================================

def _execute_batch_searches(queries: list[str]) -> list[dict]:
    """
    Embeds search queries in a SINGLE OpenAI API call,
    then executes Supabase hybrid_search RPCs.
    """
    unique_queries = []
    seen_q = set()
    for q in queries:
        q_clean = (q or "").strip()
        if q_clean and q_clean.lower() not in seen_q:
            seen_q.add(q_clean.lower())
            unique_queries.append(q_clean)

    if not unique_queries:
        return []

    # Cap to at most 2 queries to avoid Supabase connection pool serialization
    unique_queries = unique_queries[:2]

    try:
        embeddings = generate_embeddings_batch(unique_queries, batch_size=10)
    except Exception as e:
        print(f"Batch embedding failed, falling back to single query: {e}")
        try:
            embeddings = [generate_embedding(unique_queries[0])]
            unique_queries = [unique_queries[0]]
        except Exception:
            return []

    def _run_one(q_text: str, q_emb: list[float]) -> list[dict]:
        try:
            return hybrid_search(query=q_text, query_embedding=q_emb, match_count=MATCH_COUNT)
        except Exception as exc:
            print(f"Hybrid search error for '{q_text[:40]}': {exc}")
            return []

    if len(unique_queries) == 1:
        return _run_one(unique_queries[0], embeddings[0])

    futures = [
        _executor.submit(_run_one, q_text, q_emb)
        for q_text, q_emb in zip(unique_queries, embeddings)
    ]

    all_results = []
    for fut in as_completed(futures, timeout=20):
        try:
            all_results.extend(fut.result(timeout=12))
        except Exception as e:
            print(f"Search future warning: {e}")

    return all_results


# ============================================================
# MAIN PIPELINE
# ============================================================

def process_question(question: str, conversation_id: str | None = None, attachments: list[dict] | None = None, user_id: str | None = None) -> dict:
    """
    Main RAG pipeline V3.5 — Instant Turbo Architecture.
    """
    t_start = time.time()
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
                doc_query = interpreted_doc.get("search_query", "")
                if not question.strip():
                    question = doc_query or interpreted_doc.get("summary", "Consulta sobre documento adjunto")
                else:
                    question = f"{question} (Documento adjunto: {interpreted_doc.get('summary', '')})"
        except Exception as e:
            print(f"Error in multimodal attachment analysis: {e}")

    # Load conversation history (if conversation_id exists)
    conversation_history = []
    if conversation_id:
        try:
            history_result = supabase.table("rag_messages") \
                .select("role, content") \
                .eq("conversation_id", conversation_id) \
                .order("created_at") \
                .limit(10) \
                .execute()
            conversation_history = history_result.data or []
        except Exception as e:
            print(f"Failed to load conversation history: {e}")

    # === STEP 1: Instant Local / Hybrid Query Analysis (<1ms for self-contained queries) ===
    analysis = _analyze_and_expand_query(question, conversation_history)

    if not analysis.get("clear", True):
        pipeline_info["disambiguation_triggered"] = True
        return _build_clarification_response(
            question=question,
            reason=analysis.get("reason", "La pregunta podría ser más específica"),
            suggestions=analysis.get("suggestions", []),
            conversation_id=conversation_id,
            pipeline_info=pipeline_info,
        )

    entities = analysis.get("entities", [])
    canonical_query = analysis.get("canonical_query", question)
    alt_queries = analysis.get("alt_queries", [])
    keywords = analysis.get("keywords", [])

    pipeline_info["multi_queries"] = len(alt_queries)
    pipeline_info["entity_detected"] = entities
    pipeline_info["canonical_query"] = canonical_query
    pipeline_info["keywords_detected"] = keywords

    # === STEP 2: Fast Direct Entity Lookup (<250ms) + Conditional Hybrid Search ===
    is_doc_q = bool(analysis.get("is_doctor_query", False))
    direct_results = _direct_entity_lookup(entities, question, is_doctor_query=is_doc_q) if entities else []
    has_matching_rule = any(
        r.get("metadata", {}).get("source") == "rule"
        for r in direct_results
    )

    all_results = list(direct_results)

    # Skip hybrid search if we already found exact institutional rules for the queried entity!
    if has_matching_rule:
        pipeline_info["fast_direct_skip_hybrid"] = True
    elif len(direct_results) >= 3:
        # We have direct document matches; run at most 1 fast hybrid search for extra context
        try:
            all_results.extend(_execute_batch_searches([question]))
        except Exception as e:
            print(f"Primary hybrid search error: {e}")
    else:
        # General query without direct entity matches: run primary + canonical/alt search
        search_queries = [question]
        if canonical_query and canonical_query != question:
            search_queries.append(canonical_query)
        elif alt_queries:
            search_queries.append(alt_queries[0])
        try:
            all_results.extend(_execute_batch_searches(search_queries))
        except Exception as e:
            print(f"Hybrid search error: {e}")

    pipeline_info["total_searched"] = len(all_results)

    # === STEP 3: De-duplication + Recency Boost ===
    seen = {}
    for doc in all_results:
        doc_id = doc.get("id")
        if doc_id not in seen or doc.get("rank_score", 0) > seen[doc_id].get("rank_score", 0):
            seen[doc_id] = doc

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

    if not unique_docs:
        answer = "No encontré documentos relevantes para responder tu pregunta. Asegurate de que los documentos necesarios estén cargados en el sistema."
        return _build_response(answer, [], pipeline_info, question, conversation_id)

    # === STEP 4: Entity-Aware Topic Filtering ===
    if entities:
        unique_docs, filter_stats = _filter_by_entity(unique_docs, analysis)
        pipeline_info["entity_filter"] = filter_stats.get("entity_filter", "none")
        pipeline_info["entity_filter_stats"] = filter_stats

    # === STEP 5: Fast Deterministic / Batch Re-ranking ===
    reranked = _rerank_documents(question, unique_docs, analysis)
    pipeline_info["reranked_kept"] = len(reranked)

    if not reranked:
        fallback_docs = unique_docs[:6]
        for doc in fallback_docs:
            doc["rerank_score"] = 0
        reranked = fallback_docs
        pipeline_info["reranked_kept"] = len(reranked)
        pipeline_info["rerank_fallback"] = True

    # Create conversation in parallel with final answer generation if needed
    conv_future = None
    if not conversation_id:
        def _create_conv():
            try:
                title = question[:80]
                conv_result = supabase.table("rag_conversations").insert({"title": title}).execute()
                return conv_result.data[0]["id"]
            except Exception as e:
                print(f"Error creating conversation: {e}")
                return None
        conv_future = _executor.submit(_create_conv)

    # === STEP 6: Generate Final Answer ===
    answer = _generate_final_answer(question, reranked, conversation_history, interpreted_doc)

    if conv_future is not None:
        try:
            conversation_id = conv_future.result(timeout=5)
        except Exception:
            pass

    sources = _build_sources(reranked)
    pipeline_info["elapsed_seconds"] = round(time.time() - t_start, 2)
    print(f"[Simon Turbo] Answered '{question[:50]}' in {pipeline_info['elapsed_seconds']}s")

    return _build_response(answer, sources, pipeline_info, question, conversation_id)


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
        if doc.get("similarity", 0) > source_map[filename]["similarity"]:
            source_map[filename]["similarity"] = doc.get("similarity", 0)

    return list(source_map.values())


def _persist_messages_and_learn(conversation_id: str, question: str, answer: str, sources: list[dict], pipeline_info: dict):
    """Background task to persist messages and trigger learning without blocking HTTP response."""
    try:
        supabase.table("rag_messages").insert([
            {
                "conversation_id": conversation_id,
                "role": "user",
                "content": question,
            },
            {
                "conversation_id": conversation_id,
                "role": "assistant",
                "content": answer,
                "sources": sources,
                "pipeline_info": pipeline_info,
            }
        ]).execute()
        _learn_from_conversation(conversation_id)
    except Exception as e:
        print(f"Async message persistence error: {e}")


def _build_response(answer: str, sources: list[dict], pipeline_info: dict,
                    question: str, conversation_id: str | None) -> dict:
    """Build the final response and persist messages asynchronously."""
    if not conversation_id:
        title = question[:80]
        conv_result = supabase.table("rag_conversations") \
            .insert({"title": title}) \
            .execute()
        conversation_id = conv_result.data[0]["id"]

    pipeline_info["chat_learning"] = True
    _executor.submit(_persist_messages_and_learn, conversation_id, question, answer, sources, pipeline_info)

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
    if not conversation_id:
        title = question[:80]
        conv_result = supabase.table("rag_conversations") \
            .insert({"title": title}) \
            .execute()
        conversation_id = conv_result.data[0]["id"]

    clarification_text = f"🤔 {reason}\n\n¿Podrías ser más específico? Te sugiero algunas opciones:"
    for i, suggestion in enumerate(suggestions, 1):
        clarification_text += f"\n{i}. {suggestion}"

    _executor.submit(_persist_messages_and_learn, conversation_id, question, clarification_text, [], pipeline_info)

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
