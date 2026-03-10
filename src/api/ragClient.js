/**
 * RAG API Client — Functions to interact with the RAG backend
 * Sanatorio Argentino - Contact Center
 * 
 * In development: uses Vite proxy (/rag-api → localhost:8000/api)
 * In production:  uses VITE_RAG_API_URL env var (Railway URL)
 */

const RAG_API_BASE = import.meta.env.VITE_RAG_API_URL || '/rag-api';

// === Chat ===

export async function sendRAGMessage(question, conversationId = null) {
    const response = await fetch(`${RAG_API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, conversation_id: conversationId }),
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Error de conexión' }));
        throw new Error(error.detail || 'Error al enviar pregunta');
    }
    return response.json();
}

// === Conversations ===

export async function listRAGConversations() {
    const response = await fetch(`${RAG_API_BASE}/conversations`);
    if (!response.ok) throw new Error('Error al cargar conversaciones');
    return response.json();
}

export async function getRAGConversationMessages(conversationId) {
    const response = await fetch(`${RAG_API_BASE}/conversations/${conversationId}/messages`);
    if (!response.ok) throw new Error('Error al cargar mensajes');
    return response.json();
}

export async function deleteRAGConversation(conversationId) {
    const response = await fetch(`${RAG_API_BASE}/conversations/${conversationId}`, {
        method: 'DELETE',
    });
    if (!response.ok) throw new Error('Error al eliminar conversación');
    return response.json();
}

// === Documents ===

export async function uploadRAGDocument(file, onProgress = null) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${RAG_API_BASE}/upload`, {
        method: 'POST',
        body: formData,
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Error al subir archivo' }));
        throw new Error(error.detail || 'Error al subir documento');
    }
    return response.json();
}

export async function listRAGDocuments() {
    const response = await fetch(`${RAG_API_BASE}/documents`);
    if (!response.ok) throw new Error('Error al cargar documentos');
    return response.json();
}

export async function deleteRAGDocument(filename) {
    const response = await fetch(`${RAG_API_BASE}/documents?filename=${encodeURIComponent(filename)}`, {
        method: 'DELETE',
    });
    if (!response.ok) throw new Error('Error al eliminar documento');
    return response.json();
}

// === Health Check ===

export async function checkRAGHealth() {
    try {
        const response = await fetch(`${RAG_API_BASE}/health`);
        return response.ok;
    } catch {
        return false;
    }
}
