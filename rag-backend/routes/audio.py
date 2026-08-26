import os
import json
import asyncio
import websockets as ws_client
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()
DEEPGRAM_API_KEY = "896c8da735b5edce67498d67fc58422f11962dce"

@router.websocket("/ws/transcribe")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    # Endpoint de Deepgram con diarizacion activada
    dg_url = "wss://api.deepgram.com/v1/listen?model=nova-2&language=es&diarize=true&smart_format=true"
    
    try:
        async with ws_client.connect(dg_url, additional_headers={"Authorization": f"Token {DEEPGRAM_API_KEY}"}) as dg_ws:
            
            async def sender():
                try:
                    while True:
                        data = await websocket.receive_bytes()
                        await dg_ws.send(data)
                except WebSocketDisconnect:
                    await dg_ws.send(json.dumps({"type": "CloseStream"}))
                except Exception as e:
                    print(f"Error reading from client: {e}")
                    
            async def receiver():
                try:
                    async for message in dg_ws:
                        msg = json.loads(message)
                        if msg.get("type") == "Results":
                            is_final = msg.get("is_final", False)
                            if is_final:
                                transcript = msg["channel"]["alternatives"][0]["transcript"]
                                if not transcript.strip():
                                    continue
                                    
                                words = msg["channel"]["alternatives"][0].get("words", [])
                                formatted_transcript = ""
                                
                                if words:
                                    current_speaker = None
                                    current_text = ""
                                    for w in words:
                                        speaker = w.get("speaker", 0)
                                        word = w.get("punctuated_word", w["word"])
                                        if speaker != current_speaker:
                                            if current_speaker is not None:
                                                formatted_transcript += f"\n[Participante {current_speaker}]: {current_text.strip()} "
                                            current_speaker = speaker
                                            current_text = word
                                        else:
                                            current_text += f" {word}"
                                            
                                    if current_speaker is not None:
                                        formatted_transcript += f"\n[Participante {current_speaker}]: {current_text.strip()} "
                                else:
                                    formatted_transcript = transcript
                                    
                                await websocket.send_text(json.dumps({
                                    "type": "transcript",
                                    "text": formatted_transcript.strip()
                                }))
                except Exception as e:
                    print(f"Error reading from deepgram: {e}")

            await asyncio.gather(sender(), receiver())
            
    except Exception as e:
        print(f"Error connecting to Deepgram: {e}")
        try:
            await websocket.send_text(json.dumps({"type": "error", "message": str(e)}))
        except:
            pass
