"""
Chat Learning Service — Index conversations into the RAG vector store
V1.0: Automatically learns from Q&A pairs by embedding them as searchable chunks.

When a conversation reaches a certain quality threshold (has at least 2 messages),
the Q&A pairs are indexed so future similar questions can benefit from past answers.
"""
import json
from config import supabase
from services.embeddings import generate_embedding


# Minimum messages in a conversation before indexing
MIN_MESSAGES_TO_INDEX = 2

# Tag used to identify chat-learned chunks
CHAT_LEARNING_TAG = "chat_history"
CHAT_LEARNING_FILENAME = "__chat_learned__"


def index_conversation(conversation_id: str) -> dict:
    """
    Index a conversation's Q&A pairs into the RAG vector store.
    Each Q&A pair becomes a searchable chunk with special metadata.
    
    Returns stats about what was indexed.
    """
    try:
        # Load all messages from the conversation
        result = supabase.table("rag_messages") \
            .select("role, content, sources, created_at") \
            .eq("conversation_id", conversation_id) \
            .order("created_at") \
            .execute()
        
        messages = result.data or []
        
        if len(messages) < MIN_MESSAGES_TO_INDEX:
            return {"indexed": 0, "reason": "Not enough messages"}
        
        # Load conversation title
        conv_result = supabase.table("rag_conversations") \
            .select("title") \
            .eq("id", conversation_id) \
            .single() \
            .execute()
        
        conv_title = conv_result.data.get("title", "Sin título") if conv_result.data else "Sin título"
        
        # Build Q&A pairs
        qa_pairs = []
        i = 0
        while i < len(messages) - 1:
            if messages[i]["role"] == "user" and messages[i + 1]["role"] == "assistant":
                question = messages[i]["content"]
                answer = messages[i + 1]["content"]
                sources = messages[i + 1].get("sources", [])
                
                # Build the chunk content — a structured Q&A format
                source_refs = ""
                if sources:
                    source_names = [s.get("filename", "") for s in sources if s.get("filename")]
                    if source_names:
                        source_refs = f"\nFuentes originales: {', '.join(source_names)}"
                
                chunk_content = (
                    f"Pregunta frecuente: {question}\n\n"
                    f"Respuesta verificada: {answer}"
                    f"{source_refs}"
                )
                
                qa_pairs.append({
                    "content": chunk_content,
                    "question": question,
                    "answer_preview": answer[:200],
                    "created_at": messages[i]["created_at"],
                })
                i += 2
            else:
                i += 1
        
        if not qa_pairs:
            return {"indexed": 0, "reason": "No Q&A pairs found"}
        
        # Check which Q&A pairs are already indexed (avoid duplicates)
        existing = supabase.table("rag_documents") \
            .select("metadata") \
            .eq("metadata->>filename", CHAT_LEARNING_FILENAME) \
            .eq("metadata->>conversation_id", conversation_id) \
            .execute()
        
        existing_count = len(existing.data) if existing.data else 0
        
        # Only index new pairs (skip already indexed ones)
        new_pairs = qa_pairs[existing_count:]
        
        if not new_pairs:
            return {"indexed": 0, "reason": "All pairs already indexed"}
        
        # Generate embeddings and store
        indexed = 0
        for pair in new_pairs:
            try:
                embedding = generate_embedding(pair["content"])
                
                supabase.table("rag_documents").insert({
                    "content": pair["content"],
                    "metadata": {
                        "filename": CHAT_LEARNING_FILENAME,
                        "source": CHAT_LEARNING_TAG,
                        "conversation_id": conversation_id,
                        "conversation_title": conv_title,
                        "question": pair["question"],
                        "answer_preview": pair["answer_preview"],
                        "chunk_index": existing_count + indexed,
                        "file_type": ".chat",
                    },
                    "embedding": embedding,
                }).execute()
                
                indexed += 1
            except Exception as e:
                print(f"Failed to index Q&A pair: {e}")
        
        # Mark conversation as indexed
        try:
            supabase.table("rag_conversations") \
                .update({"indexed": True}) \
                .eq("id", conversation_id) \
                .execute()
        except Exception:
            pass  # Column might not exist yet, that's ok
        
        return {"indexed": indexed, "total_pairs": len(qa_pairs)}
    
    except Exception as e:
        print(f"Error indexing conversation {conversation_id}: {e}")
        return {"indexed": 0, "error": str(e)}


def index_all_conversations() -> dict:
    """
    Index all conversations that haven't been indexed yet.
    Useful for initial setup or batch re-indexing.
    """
    try:
        # Get all conversations
        result = supabase.table("rag_conversations") \
            .select("id, title") \
            .order("created_at") \
            .execute()
        
        conversations = result.data or []
        total_indexed = 0
        processed = 0
        
        for conv in conversations:
            stats = index_conversation(conv["id"])
            total_indexed += stats.get("indexed", 0)
            processed += 1
        
        return {
            "conversations_processed": processed,
            "total_qa_indexed": total_indexed,
        }
    
    except Exception as e:
        print(f"Error in batch indexing: {e}")
        return {"error": str(e)}


def get_learning_stats() -> dict:
    """Get statistics about chat learning."""
    try:
        # Count chat-learned chunks
        result = supabase.table("rag_documents") \
            .select("id", count="exact") \
            .eq("metadata->>source", CHAT_LEARNING_TAG) \
            .execute()
        
        learned_chunks = result.count or 0
        
        # Count total conversations
        conv_result = supabase.table("rag_conversations") \
            .select("id", count="exact") \
            .execute()
        
        total_conversations = conv_result.count or 0
        
        return {
            "learned_chunks": learned_chunks,
            "total_conversations": total_conversations,
        }
    
    except Exception as e:
        return {"error": str(e)}
