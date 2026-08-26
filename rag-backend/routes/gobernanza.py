import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from openai import AsyncOpenAI

router = APIRouter()
client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    transcript: str
    messages: List[ChatMessage]

@router.post("/gobernanza/chat")
async def chat_with_transcript(request: ChatRequest):
    if not request.transcript:
        raise HTTPException(status_code=400, detail="Transcript is required")
        
    system_prompt = f"""
Eres un asistente experto analizando transcripciones de auditorÃ­as de gobernanza de datos para el Sanatorio Argentino.
Debes responder de manera profesional, directa y precisa a las preguntas del usuario basÃ¡ndote ESTRICTAMENTE en la transcripciÃ³n proporcionada.
Si la respuesta no estÃ¡ en la transcripciÃ³n, indica que no se mencionÃ³ en la entrevista. No inventes informaciÃ³n.

TRANSCRIPCIÃ“N DE REFERENCIA:
{request.transcript}
"""

    openai_messages = [{"role": "system", "content": system_prompt}]
    
    # Agregar historial previo y el nuevo mensaje
    for msg in request.messages:
        openai_messages.append({"role": msg.role, "content": msg.content})
        
    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=openai_messages,
            temperature=0.3
        )
        
        return {"answer": response.choices[0].message.content}
    except Exception as e:
        print(f"Error en chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))
