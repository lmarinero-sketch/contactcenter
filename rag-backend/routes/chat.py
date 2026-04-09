"""
Chat Routes — RAG Question Answering + Conversation Management
V3.0: Non-blocking pipeline execution + disambiguation + chat learning endpoints
"""
import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from config import supabase
from services.rag import process_question, PIPELINE_TIMEOUT

router = APIRouter()


class ChatRequest(BaseModel):
    question: str
    conversation_id: str | None = None


@router.post("/chat")
async def chat(request: ChatRequest):
    """Process a RAG question and return the answer with sources.
    
    Uses asyncio.to_thread to run the synchronous RAG pipeline
    without blocking the event loop. Includes a timeout guard.
    
    V3.0: Now supports disambiguation responses (type: "clarification")
    """
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="La pregunta no puede estar vacía")

    try:
        # Run the sync pipeline in a separate thread with timeout
        result = await asyncio.wait_for(
            asyncio.to_thread(
                process_question,
                question=request.question.strip(),
                conversation_id=request.conversation_id,
            ),
            timeout=PIPELINE_TIMEOUT,
        )
        return result
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail=f"La consulta tardó más de {PIPELINE_TIMEOUT}s. Intentá con una pregunta más corta o específica."
        )
    except Exception as e:
        print(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=f"Error al procesar la pregunta: {str(e)}")


@router.get("/conversations")
async def list_conversations():
    """List all RAG conversations, most recent first."""
    try:
        result = supabase.table("rag_conversations") \
            .select("*") \
            .order("updated_at", desc=True) \
            .limit(50) \
            .execute()
        return {"conversations": result.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/conversations/{conversation_id}/messages")
async def get_conversation_messages(conversation_id: str):
    """Get all messages for a specific conversation."""
    try:
        result = supabase.table("rag_messages") \
            .select("*") \
            .eq("conversation_id", conversation_id) \
            .order("created_at") \
            .execute()
        return {"messages": result.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    """Delete a conversation and all its messages."""
    try:
        supabase.table("rag_conversations") \
            .delete() \
            .eq("id", conversation_id) \
            .execute()
        return {"message": "Conversación eliminada"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Feedback Endpoint
# ============================================================

class FeedbackRequest(BaseModel):
    conversation_id: str
    message_index: int
    is_correct: bool


@router.post("/feedback")
async def submit_feedback(request: FeedbackRequest):
    """
    Record user feedback (correct/incorrect) for a specific assistant message.
    
    Effects:
    - Stores feedback in rag_feedback table (for analytics)
    - Updates the message's feedback column in rag_messages
    - If INCORRECT: de-indexes the corresponding Q&A pair from the vector store
      so Simon stops using that wrong answer as learned knowledge
    - If CORRECT: marks the Q&A pair as verified (boosted in future searches)
    """
    try:
        from services.chat_learning import handle_feedback
        result = await asyncio.to_thread(
            handle_feedback,
            request.conversation_id,
            request.message_index,
            request.is_correct,
        )
        return result
    except Exception as e:
        print(f"Feedback error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Chat Learning Endpoints
# ============================================================

@router.post("/learning/index-all")
async def index_all_conversations():
    """Index all conversations for chat learning (batch operation)."""
    try:
        from services.chat_learning import index_all_conversations as do_index
        result = await asyncio.to_thread(do_index)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/learning/index/{conversation_id}")
async def index_conversation(conversation_id: str):
    """Index a specific conversation for chat learning."""
    try:
        from services.chat_learning import index_conversation as do_index
        result = await asyncio.to_thread(do_index, conversation_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/learning/stats")
async def learning_stats():
    """Get statistics about chat learning, including feedback metrics."""
    try:
        from services.chat_learning import get_learning_stats
        result = await asyncio.to_thread(get_learning_stats)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

