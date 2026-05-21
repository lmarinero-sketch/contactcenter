"""
RAG Backend — Configuración Centralizada
Sanatorio Argentino - Contact Center
"""
import os
from dotenv import load_dotenv
from openai import OpenAI
from supabase import create_client, Client

load_dotenv()

# --- API Clients ---
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
supabase: Client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
)

# --- Model Config ---
EMBEDDING_MODEL = "text-embedding-3-large"
EMBEDDING_DIMENSIONS = 1536
CHAT_MODEL = "gpt-4o"
RERANK_MODEL = "gpt-4o-mini"

# --- Chunking Config ---
CHUNK_SIZE = 1200
CHUNK_OVERLAP = 200

# --- Search Config ---
MATCH_THRESHOLD = 0.3
MATCH_COUNT = 25
RERANK_TOP_K = 10

# --- Supported File Extensions ---
SUPPORTED_EXTENSIONS = {
    '.pdf', '.docx', '.xlsx', '.xls', '.csv',
    '.txt', '.md', '.json', '.xml', '.html', '.htm',
    '.png', '.jpg', '.jpeg', '.webp'
}
