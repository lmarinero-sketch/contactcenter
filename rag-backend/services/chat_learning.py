"""
Chat Learning Service — Feedback-Driven RAG Learning
V2.0: Learns from Q&A pairs AND respects user feedback.

Key improvement over V1:
- When a user marks a response as INCORRECT → the corresponding Q&A chunk
  is REMOVED from the vector store so Simon stops recycling bad answers.
- When a user marks a response as CORRECT → the Q&A chunk gets a 'verified'
  flag in metadata, giving it a trust boost in future re-ranking.
- Only indexes Q&A pairs that haven't been marked as incorrect.
"""
import json
from config import supabase
from services.embeddings import generate_embedding


# Minimum messages in a conversation before indexing
MIN_MESSAGES_TO_INDEX = 2

# Tag used to identify chat-learned chunks
CHAT_LEARNING_TAG = "chat_history"
CHAT_LEARNING_FILENAME = "__chat_learned__"


def handle_feedback(conversation_id: str, message_index: int, is_correct: bool) -> dict:
    """
    Process user feedback for a specific assistant message.
    
    1. Record feedback in rag_feedback table (analytics)
    2. Update the message's feedback column in rag_messages
    3. If INCORRECT: delete the corresponding Q&A chunk from vector store
    4. If CORRECT: mark the Q&A chunk as 'verified' in metadata
    
    Args:
        conversation_id: UUID of the conversation
        message_index: 0-based index of the assistant message in the conversation
        is_correct: True if the user marked the response as correct
    
    Returns:
        dict with action taken and stats
    """
    result = {
        "conversation_id": conversation_id,
        "message_index": message_index,
        "is_correct": is_correct,
        "action": "recorded",
    }
    
    try:
        # 1. Store feedback in rag_feedback table
        supabase.table("rag_feedback").insert({
            "conversation_id": conversation_id,
            "message_index": message_index,
            "is_correct": is_correct,
        }).execute()
    except Exception as e:
        print(f"⚠️ Failed to insert rag_feedback (table may not exist yet): {e}")
        # Continue — the feedback column update below is the critical part
    
    # 2. Update the message's feedback column
    try:
        # Get all assistant messages in the conversation, ordered by created_at
        msgs_result = supabase.table("rag_messages") \
            .select("id, role, content") \
            .eq("conversation_id", conversation_id) \
            .eq("role", "assistant") \
            .order("created_at") \
            .execute()
        
        assistant_messages = msgs_result.data or []
        
        if message_index < len(assistant_messages):
            target_msg = assistant_messages[message_index]
            feedback_value = "correct" if is_correct else "incorrect"
            
            # Update the message with feedback
            try:
                supabase.table("rag_messages") \
                    .update({"feedback": feedback_value}) \
                    .eq("id", target_msg["id"]) \
                    .execute()
            except Exception as e:
                print(f"⚠️ Failed to update message feedback (column may not exist yet): {e}")
            
            # 3. Handle vector store based on feedback
            if not is_correct:
                # INCORRECT → Remove Q&A chunk from vector store
                removed = _deindex_qa_pair(conversation_id, target_msg["content"])
                result["action"] = "deindexed"
                result["chunks_removed"] = removed
                print(f"🗑️ Deindexed {removed} chunks for incorrect response in conv {conversation_id}")
            else:
                # CORRECT → Mark Q&A chunk as verified
                verified = _verify_qa_pair(conversation_id, target_msg["content"])
                result["action"] = "verified"
                result["chunks_verified"] = verified
                print(f"✅ Verified {verified} chunks for correct response in conv {conversation_id}")
        else:
            result["action"] = "message_not_found"
            print(f"⚠️ Message index {message_index} not found in conversation {conversation_id}")
    
    except Exception as e:
        print(f"Error processing feedback: {e}")
        result["error"] = str(e)
    
    return result


def _deindex_qa_pair(conversation_id: str, answer_content: str) -> int:
    """
    Remove Q&A chunks from the vector store that match this conversation
    and contain part of the incorrect answer.
    
    Returns the number of chunks removed.
    """
    try:
        # Find all chat-learned chunks for this conversation
        existing = supabase.table("rag_documents") \
            .select("id, content") \
            .eq("metadata->>filename", CHAT_LEARNING_FILENAME) \
            .eq("metadata->>conversation_id", conversation_id) \
            .execute()
        
        if not existing.data:
            return 0
        
        # Find chunks that contain part of the incorrect answer
        # Use first 100 chars of answer as a fingerprint
        answer_fingerprint = answer_content[:100].strip()
        chunks_to_delete = []
        
        for chunk in existing.data:
            # Check if this chunk's "Respuesta verificada:" section matches
            if answer_fingerprint in chunk.get("content", ""):
                chunks_to_delete.append(chunk["id"])
        
        # If no fingerprint match, delete ALL chunks from this conversation
        # (the entire conversation's learning is tainted)
        if not chunks_to_delete and existing.data:
            chunks_to_delete = [c["id"] for c in existing.data]
        
        # Delete the chunks
        if chunks_to_delete:
            supabase.table("rag_documents") \
                .delete() \
                .in_("id", chunks_to_delete) \
                .execute()
        
        return len(chunks_to_delete)
    
    except Exception as e:
        print(f"Error deindexing Q&A pair: {e}")
        return 0


def _verify_qa_pair(conversation_id: str, answer_content: str) -> int:
    """
    Mark Q&A chunks as 'verified' by updating their metadata.
    Verified chunks get priority in future re-ranking.
    
    Returns the number of chunks verified.
    """
    try:
        # Find all chat-learned chunks for this conversation
        existing = supabase.table("rag_documents") \
            .select("id, content, metadata") \
            .eq("metadata->>filename", CHAT_LEARNING_FILENAME) \
            .eq("metadata->>conversation_id", conversation_id) \
            .execute()
        
        if not existing.data:
            return 0
        
        answer_fingerprint = answer_content[:100].strip()
        verified_count = 0
        
        for chunk in existing.data:
            if answer_fingerprint in chunk.get("content", ""):
                # Update metadata to include verified flag
                metadata = chunk.get("metadata", {})
                metadata["verified"] = True
                metadata["verified_at"] = "now()"
                
                supabase.table("rag_documents") \
                    .update({"metadata": metadata}) \
                    .eq("id", chunk["id"]) \
                    .execute()
                verified_count += 1
        
        return verified_count
    
    except Exception as e:
        print(f"Error verifying Q&A pair: {e}")
        return 0


def index_conversation(conversation_id: str) -> dict:
    """
    Index a conversation's Q&A pairs into the RAG vector store.
    Each Q&A pair becomes a searchable chunk with special metadata.
    
    V2.0: Skips Q&A pairs where the response was marked as incorrect.
    
    Returns stats about what was indexed.
    """
    try:
        # Load all messages from the conversation
        result = supabase.table("rag_messages") \
            .select("role, content, sources, feedback, created_at") \
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
        
        # Build Q&A pairs — SKIP pairs where the assistant response was marked as incorrect
        qa_pairs = []
        skipped_negative = 0
        i = 0
        while i < len(messages) - 1:
            if messages[i]["role"] == "user" and messages[i + 1]["role"] == "assistant":
                assistant_msg = messages[i + 1]
                feedback = assistant_msg.get("feedback")
                
                # Skip if explicitly marked as incorrect
                if feedback == "incorrect":
                    skipped_negative += 1
                    i += 2
                    continue
                
                question = messages[i]["content"]
                answer = assistant_msg["content"]
                sources = assistant_msg.get("sources", [])
                is_verified = feedback == "correct"
                
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
                    "verified": is_verified,
                })
                i += 2
            else:
                i += 1
        
        if not qa_pairs:
            return {"indexed": 0, "skipped_negative": skipped_negative, "reason": "No valid Q&A pairs found"}
        
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
            return {"indexed": 0, "skipped_negative": skipped_negative, "reason": "All pairs already indexed"}
        
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
                        "verified": pair["verified"],
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
        
        return {
            "indexed": indexed,
            "total_pairs": len(qa_pairs),
            "skipped_negative": skipped_negative,
        }
    
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
        total_skipped = 0
        processed = 0
        
        for conv in conversations:
            stats = index_conversation(conv["id"])
            total_indexed += stats.get("indexed", 0)
            total_skipped += stats.get("skipped_negative", 0)
            processed += 1
        
        return {
            "conversations_processed": processed,
            "total_qa_indexed": total_indexed,
            "total_skipped_negative": total_skipped,
        }
    
    except Exception as e:
        print(f"Error in batch indexing: {e}")
        return {"error": str(e)}


def get_learning_stats() -> dict:
    """
    Get statistics about chat learning, including feedback metrics.
    """
    try:
        # Count chat-learned chunks
        result = supabase.table("rag_documents") \
            .select("id, metadata") \
            .eq("metadata->>filename", CHAT_LEARNING_FILENAME) \
            .execute()
        
        learned_data = result.data or []
        learned_chunks = len(learned_data)
        verified_chunks = sum(1 for d in learned_data if d.get("metadata", {}).get("verified"))
        
        # Count total conversations
        conv_result = supabase.table("rag_conversations") \
            .select("id") \
            .execute()
        
        total_conversations = len(conv_result.data) if conv_result.data else 0
        
        # Count feedback stats
        feedback_stats = {"total": 0, "correct": 0, "incorrect": 0, "accuracy": 0}
        try:
            fb_result = supabase.table("rag_feedback") \
                .select("is_correct") \
                .execute()
            
            if fb_result.data:
                feedback_stats["total"] = len(fb_result.data)
                feedback_stats["correct"] = sum(1 for f in fb_result.data if f["is_correct"])
                feedback_stats["incorrect"] = feedback_stats["total"] - feedback_stats["correct"]
                if feedback_stats["total"] > 0:
                    feedback_stats["accuracy"] = round(
                        feedback_stats["correct"] / feedback_stats["total"] * 100, 1
                    )
        except Exception:
            pass  # Table may not exist yet
        
        return {
            "learned_chunks": learned_chunks,
            "verified_chunks": verified_chunks,
            "total_conversations": total_conversations,
            "total_learned": learned_chunks,  # backward compat with frontend
            "feedback": feedback_stats,
        }
    
    except Exception as e:
        return {"error": str(e)}
