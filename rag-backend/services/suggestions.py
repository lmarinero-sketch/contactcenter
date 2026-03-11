"""
Suggestions Service — Smart Guidance Layer for Simon IA
Provides categories, top queries, and related questions for guiding users.
Uses caching to avoid expensive queries on every request.
"""
import time
from collections import Counter
from config import supabase

# Cache: {data, timestamp}
_cache = {"data": None, "timestamp": 0}
CACHE_TTL = 300  # 5 minutes


def get_suggestions() -> dict:
    """
    Get suggestion data for the chat UI.
    Returns categories (from documents) and top queries (from successful conversations).
    Cached for 5 minutes.
    """
    now = time.time()
    if _cache["data"] and (now - _cache["timestamp"]) < CACHE_TTL:
        return _cache["data"]
    
    categories = _extract_categories()
    top_queries = _extract_top_queries()
    
    result = {
        "categories": categories,
        "top_queries": top_queries,
    }
    
    _cache["data"] = result
    _cache["timestamp"] = now
    
    return result


def _extract_categories() -> list[dict]:
    """
    Extract document categories from rag_documents metadata.
    Groups by filename patterns, folders, and file types.
    """
    try:
        result = supabase.table("rag_documents") \
            .select("metadata") \
            .execute()
        
        docs = result.data or []
        
        # Count by folder and file type
        folder_count = Counter()
        filenames = set()
        keyword_count = Counter()
        
        for doc in docs:
            meta = doc.get("metadata", {})
            source = meta.get("source", "")
            filename = meta.get("filename", "")
            
            # Skip internal chunks
            if source in ("chat_history", "rule") or filename in ("__chat_learned__", "__rules__"):
                continue
            
            filenames.add(filename)
            
            # Count folders
            folder = meta.get("folder", "/")
            if folder and folder != "/":
                folder_name = folder.strip("/").split("/")[-1] if "/" in folder else folder.strip("/")
                folder_count[folder_name] += 1
            
            # Extract keywords from filename
            clean_name = filename.lower()
            for ext in [".pdf", ".docx", ".xlsx", ".txt", ".csv", ".doc", ".xls"]:
                clean_name = clean_name.replace(ext, "")
            
            # Split by common separators and extract meaningful words
            words = clean_name.replace("-", " ").replace("_", " ").replace(".", " ").split()
            stopwords = {"de", "la", "el", "los", "las", "del", "un", "una", "y", "a", "en", "por", "con", "para"}
            for word in words:
                if len(word) > 2 and word not in stopwords and not word.isdigit():
                    keyword_count[word] += 1
        
        categories = []
        
        # Add folder-based categories
        for folder, count in folder_count.most_common(8):
            categories.append({
                "name": folder.title(),
                "type": "folder",
                "count": count,
            })
        
        # Add keyword-based categories (from filenames)
        for keyword, count in keyword_count.most_common(10):
            # Skip if already covered by a folder
            if any(keyword.lower() in cat["name"].lower() for cat in categories):
                continue
            if count >= 2:  # At least mentioned in 2 docs
                categories.append({
                    "name": keyword.title(),
                    "type": "keyword",
                    "count": count,
                })
        
        return categories[:12]  # Max 12 categories
        
    except Exception as e:
        print(f"Error extracting categories: {e}")
        return []


def _extract_top_queries() -> list[dict]:
    """
    Extract top successful queries from rag_messages.
    A "successful" query is one where Simon responded with sources.
    """
    try:
        # Get user messages (questions)
        user_msgs = supabase.table("rag_messages") \
            .select("content, conversation_id, created_at") \
            .eq("role", "user") \
            .order("created_at", desc=True) \
            .limit(500) \
            .execute()
        
        # Get assistant messages with sources (successful answers)
        assistant_msgs = supabase.table("rag_messages") \
            .select("conversation_id, sources, pipeline_info") \
            .eq("role", "assistant") \
            .order("created_at", desc=True) \
            .limit(500) \
            .execute()
        
        # Find conversation IDs with successful responses
        successful_convs = set()
        for msg in (assistant_msgs.data or []):
            sources = msg.get("sources") or []
            pipeline = msg.get("pipeline_info") or {}
            # Successful if has sources and no disambiguation
            if len(sources) > 0 and not pipeline.get("disambiguation_triggered"):
                successful_convs.add(msg["conversation_id"])
        
        # Count unique questions from successful conversations
        query_count = Counter()
        for msg in (user_msgs.data or []):
            if msg["conversation_id"] in successful_convs:
                # Normalize question
                q = msg["content"].strip()
                if len(q) > 5 and len(q) < 200:  # Skip very short/long
                    # Simple normalization: lowercase, strip punctuation
                    normalized = q.lower().rstrip("?¿!¡.,;:")
                    query_count[q] += 1  # Keep original casing for display
        
        # Return top queries (deduplicated by similarity)
        top = []
        seen_normalized = set()
        for query, count in query_count.most_common(30):
            normalized = query.lower()[:40]  # Rough dedup
            if normalized not in seen_normalized:
                seen_normalized.add(normalized)
                top.append({
                    "text": query,
                    "count": count,
                })
        
        return top[:20]  # Max 20 suggestions
        
    except Exception as e:
        print(f"Error extracting top queries: {e}")
        return []
