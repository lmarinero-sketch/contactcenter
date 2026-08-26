"""
RAG Backend â€” FastAPI Entry Point
Sanatorio Argentino - Contact Center
"""
import sys
import io

# Redefine standard output streams to use UTF-8 to prevent charmap/encoding exceptions on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from fastapi import FastAPI

from fastapi.middleware.cors import CORSMiddleware
from routes.chat import router as chat_router
from routes.documents import router as documents_router
from routes.audio import router as audio_router

app = FastAPI(
    title="Simon IA - Sanatorio Argentino",
    description="Asistente IA Documental con RAG Pipeline V3.1",
    version="3.1.0"
)

# CORS â€” allow all origins (Vercel + local dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Routes
app.include_router(chat_router, prefix="/api")
app.include_router(documents_router, prefix="/api")
app.include_router(audio_router, prefix="/api")

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "rag-backend"}

