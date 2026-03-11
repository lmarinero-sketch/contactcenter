"""
Document Routes — File Manager + RAG Processing
V4: Google Drive-like file management with folders, downloads, and batch processing.
Files are stored in Supabase Storage for download + processed for RAG vector search.
"""
import os
from fastapi import APIRouter, UploadFile, File, HTTPException, Query, Form
from typing import Optional
from config import supabase, SUPPORTED_EXTENSIONS
from services.document_processor import extract_text
from services.chunker import chunk_text
from services.embeddings import store_chunks_with_embeddings
from services.storage import upload_to_storage, get_download_url, delete_from_storage

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _sanitize_filename(filename: str) -> str:
    """Extract just the filename from a path (folder uploads send full relative paths)."""
    return os.path.basename(filename.replace('\\', '/').replace('/', os.sep))


def _process_single_file(file_path: str, filename: str, folder: str = "", tag: str = "") -> dict:
    """Process a single file: extract, chunk, embed, store in vector DB."""
    ext = os.path.splitext(filename)[1].lower()
    file_size = os.path.getsize(file_path)
    storage_path = f"{folder}/{filename}".strip("/")

    # Check if document already exists → delete old version
    reindexed = False
    existing = supabase.table("rag_documents") \
        .select("id") \
        .eq("metadata->>filename", filename) \
        .eq("metadata->>folder", folder) \
        .execute()

    if existing.data:
        supabase.table("rag_documents") \
            .delete() \
            .eq("metadata->>filename", filename) \
            .eq("metadata->>folder", folder) \
            .execute()
        reindexed = True

    # Extract text
    raw_text = extract_text(file_path)
    if not raw_text.strip():
        return {
            "filename": filename,
            "folder": folder,
            "status": "error",
            "error": "No se pudo extraer texto del archivo",
            "total_chunks": 0,
        }

    # Chunk text
    chunks = chunk_text(raw_text, filename, ext, file_size)

    # Add folder and tag to all chunk metadata
    for chunk in chunks:
        chunk["metadata"]["folder"] = folder
        chunk["metadata"]["storage_path"] = storage_path
        if tag:
            chunk["metadata"]["tag"] = tag

    # Generate embeddings and store
    store_chunks_with_embeddings(chunks)

    return {
        "filename": filename,
        "folder": folder,
        "storage_path": storage_path,
        "status": "ok",
        "file_type": ext,
        "total_chunks": len(chunks),
        "tag": tag,
        "reindexed": reindexed,
        "content_preview": raw_text[:200],
    }


# === File Upload ===

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    folder: Optional[str] = Form(default=""),
    tag: Optional[str] = Form(default=""),
):
    """Upload a single document to a folder. Stores original + processes for RAG."""
    filename = _sanitize_filename(file.filename)
    ext = os.path.splitext(filename)[1].lower()
    folder = (folder or "").strip("/")
    print(f"Upload: {file.filename} -> {filename} (folder={folder}, tag={tag})")

    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Formato no soportado: {ext}. Válidos: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )

    file_path = os.path.join(UPLOAD_DIR, filename)
    try:
        content = await file.read()

        # Save locally for processing
        with open(file_path, "wb") as f:
            f.write(content)

        # Store original in Supabase Storage for download
        upload_to_storage(content, filename, folder)

        # Process for RAG
        result = _process_single_file(file_path, filename, folder, tag)

        if result["status"] == "error":
            raise HTTPException(status_code=400, detail=result["error"])

        return {"message": f"'{filename}' procesado exitosamente", **result}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)


# === File Manager (Google Drive-like) ===

@router.get("/files")
async def list_files(folder: Optional[str] = Query(default="")):
    """
    List files and subfolders in a folder (Google Drive-like).
    Returns items at the current folder level only.
    """
    try:
        folder = (folder or "").strip("/")

        # Get all documents from vector DB
        result = supabase.table("rag_documents") \
            .select("metadata, created_at") \
            .execute()

        # Build file and folder structure
        file_map = {}
        folder_set = set()

        for row in (result.data or []):
            metadata = row.get("metadata", {})
            file_folder = metadata.get("folder", "")
            filename = metadata.get("filename", "")

            if not filename:
                continue

            # Skip internal chunks (not real files)
            if filename in ("__chat_learned__", "__rules__"):
                continue

            # If we're in a folder, only show items in this folder
            if folder:
                if file_folder == folder:
                    # File is directly in this folder
                    if filename not in file_map:
                        file_map[filename] = {
                            "name": filename,
                            "type": "file",
                            "file_type": metadata.get("file_type", ""),
                            "file_size": metadata.get("file_size", 0),
                            "total_chunks": metadata.get("total_chunks", 0),
                            "tag": metadata.get("tag", ""),
                            "folder": file_folder,
                            "storage_path": metadata.get("storage_path", ""),
                            "created_at": row.get("created_at", ""),
                        }
                elif file_folder.startswith(folder + "/"):
                    # File is in a subfolder — extract subfolder name
                    remaining = file_folder[len(folder) + 1:]
                    subfolder = remaining.split("/")[0]
                    folder_set.add(subfolder)
            else:
                if not file_folder:
                    # File is in root
                    if filename not in file_map:
                        file_map[filename] = {
                            "name": filename,
                            "type": "file",
                            "file_type": metadata.get("file_type", ""),
                            "file_size": metadata.get("file_size", 0),
                            "total_chunks": metadata.get("total_chunks", 0),
                            "tag": metadata.get("tag", ""),
                            "folder": "",
                            "storage_path": metadata.get("storage_path", ""),
                            "created_at": row.get("created_at", ""),
                        }
                elif "/" not in file_folder:
                    # File is in a top-level folder
                    folder_set.add(file_folder)
                else:
                    # File is in a nested folder
                    top_folder = file_folder.split("/")[0]
                    folder_set.add(top_folder)

        # Build items list: folders first, then files
        items = []
        for f_name in sorted(folder_set):
            items.append({
                "name": f_name,
                "type": "folder",
                "path": f"{folder}/{f_name}".strip("/"),
            })

        items.extend(sorted(file_map.values(), key=lambda x: x["name"]))

        return {
            "items": items,
            "current_folder": folder,
            "total_files": len(file_map),
            "total_folders": len(folder_set),
        }

    except Exception as e:
        print(f"List files error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/files/download")
async def download_file(path: str = Query(...)):
    """Get a signed download URL for a file."""
    url = get_download_url(path.strip("/"))
    if not url:
        raise HTTPException(status_code=404, detail="Archivo no encontrado en storage")
    return {"download_url": url, "path": path}


@router.post("/folders")
async def create_folder(name: str = Query(...), parent: Optional[str] = Query(default="")):
    """
    Create a virtual folder. Since Supabase Storage is path-based,
    we create a .folder marker file.
    """
    parent = (parent or "").strip("/")
    folder_path = f"{parent}/{name}".strip("/")

    try:
        # Create a marker file so the folder "exists"
        upload_to_storage(b"", ".folder", folder_path)
        return {"message": f"Carpeta '{name}' creada", "path": folder_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/files")
async def delete_file(path: str = Query(...)):
    """Delete a file from storage and vector DB."""
    path = path.strip("/")
    parts = path.rsplit("/", 1)
    filename = parts[-1]
    folder = parts[0] if len(parts) > 1 else ""

    try:
        # Delete from vector DB
        result = supabase.table("rag_documents") \
            .delete() \
            .eq("metadata->>filename", filename) \
            .eq("metadata->>folder", folder) \
            .execute()

        deleted_chunks = len(result.data) if result.data else 0

        # Delete from storage
        delete_from_storage(path)

        return {
            "message": f"'{filename}' eliminado ({deleted_chunks} chunks)",
            "deleted_chunks": deleted_chunks,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/folders")
async def delete_folder(path: str = Query(...)):
    """Delete a folder and all its contents (files + chunks)."""
    path = path.strip("/")

    try:
        # Delete all chunks with this folder prefix
        deleted_total = 0

        # Get all docs in this folder (and subfolders)
        result = supabase.table("rag_documents") \
            .select("id, metadata") \
            .execute()

        ids_to_delete = []
        storage_paths = set()
        for row in (result.data or []):
            doc_folder = row.get("metadata", {}).get("folder", "")
            if doc_folder == path or doc_folder.startswith(path + "/"):
                ids_to_delete.append(row["id"])
                sp = row.get("metadata", {}).get("storage_path", "")
                if sp:
                    storage_paths.add(sp)

        # Delete chunks in batches
        for i in range(0, len(ids_to_delete), 100):
            batch = ids_to_delete[i:i+100]
            supabase.table("rag_documents") \
                .delete() \
                .in_("id", batch) \
                .execute()
            deleted_total += len(batch)

        # Delete files from storage
        for sp in storage_paths:
            delete_from_storage(sp)

        # Delete folder marker
        delete_from_storage(f"{path}/.folder")

        return {
            "message": f"Carpeta '{path}' eliminada ({deleted_total} chunks)",
            "deleted_chunks": deleted_total,
            "deleted_files": len(storage_paths),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# === Legacy endpoints (backward compatibility) ===

@router.get("/documents")
async def list_documents(tag: Optional[str] = Query(default=None)):
    """List all unique documents, optionally filtered by tag."""
    try:
        result = supabase.table("rag_documents") \
            .select("metadata, created_at") \
            .execute()

        doc_map = {}
        for row in (result.data or []):
            metadata = row.get("metadata", {})
            filename = metadata.get("filename", "desconocido")
            doc_tag = metadata.get("tag", "")

            if tag and doc_tag != tag:
                continue

            # Skip internal chunks
            if filename in ("__chat_learned__", "__rules__"):
                continue

            if filename not in doc_map:
                doc_map[filename] = {
                    "filename": filename,
                    "file_type": metadata.get("file_type", ""),
                    "file_size": metadata.get("file_size", 0),
                    "total_chunks": metadata.get("total_chunks", 0),
                    "tag": doc_tag,
                    "folder": metadata.get("folder", ""),
                    "created_at": row.get("created_at", ""),
                }

        documents = sorted(doc_map.values(), key=lambda x: x.get("created_at", ""), reverse=True)
        all_tags = list(set(
            row.get("metadata", {}).get("tag", "")
            for row in (result.data or [])
            if row.get("metadata", {}).get("tag")
        ))

        return {
            "documents": documents,
            "total_documents": len(documents),
            "tags": sorted(all_tags),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/documents")
async def delete_document(filename: str = Query(...)):
    """Delete a document and all its chunks by filename."""
    try:
        result = supabase.table("rag_documents") \
            .delete() \
            .eq("metadata->>filename", filename) \
            .execute()

        deleted_count = len(result.data) if result.data else 0
        if deleted_count == 0:
            raise HTTPException(status_code=404, detail=f"'{filename}' no encontrado")

        return {
            "message": f"'{filename}' eliminado ({deleted_count} chunks)",
            "deleted_chunks": deleted_count,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Rules — Manual Knowledge Input
# ============================================================

from pydantic import BaseModel

class RuleInput(BaseModel):
    text: str
    created_by: str = "admin"

@router.post("/rules")
async def create_rule_endpoint(payload: RuleInput):
    """Create a new rule from text input (processes dates, categorizes, embeds)."""
    if not payload.text or len(payload.text.strip()) < 5:
        raise HTTPException(status_code=400, detail="El texto de la regla es muy corto")
    
    try:
        from services.rules import create_rule
        result = create_rule(payload.text.strip(), payload.created_by)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/rules")
async def list_rules_endpoint():
    """List all stored rules."""
    try:
        from services.rules import list_rules
        rules = list_rules()
        return {"rules": rules, "total": len(rules)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/rules/{rule_id}")
async def delete_rule_endpoint(rule_id: int):
    """Delete a specific rule."""
    try:
        from services.rules import delete_rule
        success = delete_rule(rule_id)
        if not success:
            raise HTTPException(status_code=404, detail="Regla no encontrada")
        return {"message": "Regla eliminada"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/rules/count")
async def rules_count_endpoint():
    """Get total count of rules."""
    try:
        from services.rules import get_rules_count
        return {"count": get_rules_count()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Analytics
# ============================================================

@router.get("/analytics")
async def get_analytics(days: int = Query(default=30, ge=1, le=365)):
    """Get comprehensive Simon IA analytics."""
    try:
        from services.analytics import get_full_analytics
        return get_full_analytics(days)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Suggestions — Smart Guidance Layer
# ============================================================

@router.get("/suggestions")
async def get_suggestions():
    """Get categories and top queries for guiding users."""
    try:
        from services.suggestions import get_suggestions
        return get_suggestions()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
