"""
Analytics Service — Simon IA Usage & Performance Metrics
Extracts insights from rag_conversations, rag_messages, and rag_documents.
"""
import json
from datetime import datetime, timedelta
from collections import Counter
from config import supabase


def get_full_analytics(days: int = 30) -> dict:
    """
    Get comprehensive analytics for Simon IA.
    Returns all metrics for the analytics dashboard.
    """
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
    
    # Fetch all data in bulk (3 queries total)
    conversations = _fetch_conversations(cutoff)
    messages = _fetch_messages(cutoff)
    doc_stats = _fetch_document_stats()
    
    # Process metrics
    return {
        "period_days": days,
        "generated_at": datetime.utcnow().isoformat(),
        "overview": _calc_overview(conversations, messages),
        "daily_usage": _calc_daily_usage(messages),
        "top_topics": _calc_top_topics(messages),
        "response_quality": _calc_response_quality(messages),
        "pipeline_performance": _calc_pipeline_performance(messages),
        "top_sources": _calc_top_sources(messages),
        "knowledge_base": doc_stats,
        "disambiguation": _calc_disambiguation(messages),
        "hourly_distribution": _calc_hourly_distribution(messages),
    }


def _fetch_conversations(cutoff: str) -> list[dict]:
    """Fetch conversations within the period."""
    try:
        result = supabase.table("rag_conversations") \
            .select("id, title, created_at") \
            .gte("created_at", cutoff) \
            .order("created_at", desc=True) \
            .execute()
        return result.data or []
    except Exception as e:
        print(f"Error fetching conversations: {e}")
        return []


def _fetch_messages(cutoff: str) -> list[dict]:
    """Fetch messages within the period."""
    try:
        result = supabase.table("rag_messages") \
            .select("id, conversation_id, role, content, sources, pipeline_info, created_at") \
            .gte("created_at", cutoff) \
            .order("created_at", desc=True) \
            .execute()
        return result.data or []
    except Exception as e:
        print(f"Error fetching messages: {e}")
        return []


def _fetch_document_stats() -> dict:
    """Get document/knowledge base stats."""
    try:
        # Total documents (not internal)
        all_docs = supabase.table("rag_documents") \
            .select("id, metadata") \
            .execute()
        
        docs = all_docs.data or []
        
        total_docs = 0
        total_rules = 0
        total_learned = 0
        file_types = Counter()
        
        for doc in docs:
            meta = doc.get("metadata", {})
            source = meta.get("source", "")
            filename = meta.get("filename", "")
            
            if source == "rule":
                total_rules += 1
            elif filename == "__chat_learned__" or source == "chat_history":
                total_learned += 1
            else:
                total_docs += 1
                ft = meta.get("file_type", "unknown")
                file_types[ft] += 1
        
        return {
            "total_chunks": total_docs,
            "total_rules": total_rules,
            "total_learned": total_learned,
            "file_types": dict(file_types.most_common(10)),
        }
    except Exception as e:
        print(f"Error fetching doc stats: {e}")
        return {"total_chunks": 0, "total_rules": 0, "total_learned": 0, "file_types": {}}


def _calc_overview(conversations: list[dict], messages: list[dict]) -> dict:
    """Calculate high-level overview metrics."""
    user_msgs = [m for m in messages if m.get("role") == "user"]
    assistant_msgs = [m for m in messages if m.get("role") == "assistant"]
    
    # Average messages per conversation
    conv_ids = set(m.get("conversation_id") for m in messages if m.get("conversation_id"))
    avg_msgs = len(messages) / max(len(conv_ids), 1)
    
    return {
        "total_conversations": len(conversations),
        "total_questions": len(user_msgs),
        "total_responses": len(assistant_msgs),
        "avg_messages_per_conversation": round(avg_msgs, 1),
        "unique_conversations": len(conv_ids),
    }


def _calc_daily_usage(messages: list[dict]) -> list[dict]:
    """Calculate daily usage (questions per day)."""
    daily = Counter()
    
    for msg in messages:
        if msg.get("role") != "user":
            continue
        try:
            dt = datetime.fromisoformat(msg["created_at"].replace("Z", "+00:00"))
            day_key = dt.strftime("%Y-%m-%d")
            daily[day_key] += 1
        except (KeyError, ValueError):
            continue
    
    # Sort by date and return last 30 days
    sorted_days = sorted(daily.items())
    return [{"date": d, "queries": c} for d, c in sorted_days[-30:]]


def _calc_top_topics(messages: list[dict]) -> list[dict]:
    """Extract top question topics/keywords."""
    # Collect user questions
    questions = []
    for msg in messages:
        if msg.get("role") == "user" and msg.get("content"):
            questions.append(msg["content"].strip().lower())
    
    if not questions:
        return []
    
    # Simple keyword extraction — count frequent words (excluding stopwords)
    stopwords = {
        "que", "de", "la", "el", "en", "y", "a", "los", "las", "del", "un",
        "una", "por", "con", "para", "es", "se", "no", "lo", "al", "le",
        "su", "como", "más", "pero", "sus", "ya", "o", "fue", "ser", "ha",
        "son", "me", "si", "mi", "tiene", "hay", "muy", "este", "esta",
        "cuál", "cual", "cuáles", "cuales", "qué", "donde", "dónde",
        "cuanto", "cuánto", "cuando", "cómo", "quien", "quién",
        "hola", "buenas", "buen", "día", "sobre", "puedo", "puede",
        "tengo", "saber", "quiero", "necesito", "decir", "decime",
    }
    
    word_count = Counter()
    for q in questions:
        words = q.split()
        for word in words:
            clean = word.strip("?¿!¡.,;:()\"'")
            if len(clean) > 2 and clean not in stopwords:
                word_count[clean] += 1
    
    # Also extract full question titles (first 60 chars)
    question_freq = Counter()
    for q in questions:
        short = q[:60]
        question_freq[short] += 1
    
    top_keywords = [{"keyword": w, "count": c} for w, c in word_count.most_common(15)]
    top_questions = [{"question": q, "count": c} for q, c in question_freq.most_common(10)]
    
    return {
        "keywords": top_keywords,
        "frequent_questions": top_questions,
    }


def _calc_response_quality(messages: list[dict]) -> dict:
    """
    Analyze response quality:
    - Successful: has sources
    - No info: contains "no tengo" or "no encontré"
    - Clarification: disambiguation triggered
    """
    assistant_msgs = [m for m in messages if m.get("role") == "assistant"]
    
    successful = 0
    no_info = 0
    clarification = 0
    with_sources = 0
    
    no_info_phrases = [
        "no tengo suficiente información",
        "no encontré documentos",
        "no tengo información",
        "no encontré información",
    ]
    
    for msg in assistant_msgs:
        content = (msg.get("content") or "").lower()
        sources = msg.get("sources") or []
        pipeline = msg.get("pipeline_info") or {}
        
        if pipeline.get("disambiguation_triggered"):
            clarification += 1
        elif any(phrase in content for phrase in no_info_phrases):
            no_info += 1
        else:
            successful += 1
        
        if sources and len(sources) > 0:
            with_sources += 1
    
    total = len(assistant_msgs) or 1
    
    return {
        "total_responses": len(assistant_msgs),
        "successful": successful,
        "successful_rate": round(successful / total * 100, 1),
        "no_info": no_info,
        "no_info_rate": round(no_info / total * 100, 1),
        "clarification": clarification,
        "clarification_rate": round(clarification / total * 100, 1),
        "with_sources": with_sources,
        "satisfaction_score": round(successful / total * 100, 1),  # Proxy for satisfaction
    }


def _calc_pipeline_performance(messages: list[dict]) -> dict:
    """Analyze pipeline performance metrics from pipeline_info."""
    pipeline_data = []
    
    for msg in messages:
        if msg.get("role") != "assistant":
            continue
        pi = msg.get("pipeline_info")
        if not pi:
            continue
        pipeline_data.append(pi)
    
    if not pipeline_data:
        return {
            "avg_total_searched": 0, "avg_unique_results": 0,
            "avg_reranked_kept": 0, "avg_multi_queries": 0,
            "hyde_usage_rate": 0, "learning_rate": 0,
        }
    
    total = len(pipeline_data)
    
    return {
        "avg_total_searched": round(sum(p.get("total_searched", 0) for p in pipeline_data) / total, 1),
        "avg_unique_results": round(sum(p.get("unique_results", 0) for p in pipeline_data) / total, 1),
        "avg_reranked_kept": round(sum(p.get("reranked_kept", 0) for p in pipeline_data) / total, 1),
        "avg_multi_queries": round(sum(p.get("multi_queries", 0) for p in pipeline_data) / total, 1),
        "hyde_usage_rate": round(sum(1 for p in pipeline_data if p.get("hyde_generated")) / total * 100, 1),
        "learning_rate": round(sum(1 for p in pipeline_data if p.get("chat_learning")) / total * 100, 1),
        "rerank_fallback_rate": round(sum(1 for p in pipeline_data if p.get("rerank_fallback")) / total * 100, 1),
        "total_pipeline_runs": total,
    }


def _calc_top_sources(messages: list[dict]) -> list[dict]:
    """Find most cited source documents."""
    source_count = Counter()
    
    for msg in messages:
        if msg.get("role") != "assistant":
            continue
        sources = msg.get("sources") or []
        for src in sources:
            filename = src.get("filename", "")
            src_type = src.get("type", "")
            if filename and src_type != "chat_history" and filename != "__chat_learned__":
                source_count[filename] += 1
    
    return [{"filename": f, "citations": c} for f, c in source_count.most_common(10)]


def _calc_disambiguation(messages: list[dict]) -> dict:
    """Analyze disambiguation/clarification patterns."""
    total_assistant = 0
    disambiguations = 0
    
    for msg in messages:
        if msg.get("role") != "assistant":
            continue
        total_assistant += 1
        pi = msg.get("pipeline_info") or {}
        if pi.get("disambiguation_triggered"):
            disambiguations += 1
    
    rate = round(disambiguations / max(total_assistant, 1) * 100, 1)
    
    return {
        "total_disambiguations": disambiguations,
        "rate": rate,
        "interpretation": (
            "Las preguntas son claras" if rate < 10 else
            "Nivel normal de ambigüedad" if rate < 25 else
            "Muchas preguntas necesitan clarificación — considerar mejorar la guía"
        )
    }


def _calc_hourly_distribution(messages: list[dict]) -> list[dict]:
    """Calculate query distribution by hour of day."""
    hourly = Counter()
    
    for msg in messages:
        if msg.get("role") != "user":
            continue
        try:
            dt = datetime.fromisoformat(msg["created_at"].replace("Z", "+00:00"))
            # Adjust to Argentina timezone (UTC-3)
            dt_ar = dt - timedelta(hours=3)
            hourly[dt_ar.hour] += 1
        except (KeyError, ValueError):
            continue
    
    return [{"hour": h, "queries": hourly.get(h, 0)} for h in range(24)]
