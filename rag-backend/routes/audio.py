import os
import json
import tempfile
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from openai import AsyncOpenAI

router = APIRouter()
client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

@router.websocket("/ws/transcribe")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    try:
        while True:
            data = await websocket.receive_bytes()
            
            with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_audio:
                temp_audio.write(data)
                temp_audio_path = temp_audio.name
                
            try:
                with open(temp_audio_path, "rb") as audio_file:
                    transcription = await client.audio.transcriptions.create(
                        file=audio_file,
                        model="whisper-1",
                        language="es",
                        response_format="text",
                        prompt="Entrevista de gobernanza y auditorÃ­a de datos, Sanatorio Argentino.",
                        temperature=0.2
                    )
                
                await websocket.send_text(json.dumps({
                    "type": "transcript",
                    "text": transcription
                }))
                
            except Exception as inner_e:
                print(f"Error procesando chunk: {inner_e}")
                try:
                    await websocket.send_text(json.dumps({"type": "error", "message": str(inner_e)}))
                except:
                    pass
            finally:
                if os.path.exists(temp_audio_path):
                    os.remove(temp_audio_path)
                    
    except WebSocketDisconnect:
        print("Cliente desconectado de la transcripcion")
    except Exception as e:
        print(f"Error WS: {e}")
