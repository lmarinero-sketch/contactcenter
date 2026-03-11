"""
RAG Backend — FastAPI Entry Point
Sanatorio Argentino - Contact Center
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.chat import router as chat_router
from routes.documents import router as documents_router

app = FastAPI(
    title="RAG System - Sanatorio Argentino",
    description="Asistente IA Documental para Contact Center",
    version="2.0.0"
)

# CORS — allow all origins (Vercel + local dev)
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

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "rag-backend"}
