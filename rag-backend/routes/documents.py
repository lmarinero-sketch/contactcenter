"""
Document Routes — Upload (single/batch), List, Delete, Tag documents
V3: Supports batch upload, tagging for categorization, and filtered search
"""
import os
from fastapi import APIRouter, UploadFile, File, HTTPException, Query, Form
from typing import Optional
from config import supabase, SUPPORTED_EXTENSIONS
from services.document_processor import extract_text
from services.chunker import chunk_text
from services.embeddings import store_chunks_with_embeddings

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _sanitize_filename(filename: str) -> str:
    """Extract just the filename from a path (folder uploads send full relative paths)."""
    # Browser folder uploads send paths like 'folder/subfolder/file.pdf'
    # We only want 'file.pdf'
    return os.path.basename(filename.replace('\\', '/').replace('/', os.sep))


def _process_single_file(file_path: str, filename: str, tag: str = "") -> dict:
    """Process a single file: extract, chunk, embed, store. Returns result dict."""
    ext = os.path.splitext(filename)[1].lower()
    file_size = os.path.getsize(file_path)

    # Check if document already exists → delete old version
    reindexed = False
    existing = supabase.table("rag_documents") \
        .select("id") \
        .eq("metadata->>filename", filename) \
        .execute()

    if existing.data:
        supabase.table("rag_documents") \
            .delete() \
            .eq("metadata->>filename", filename) \
            .execute()
        reindexed = True

    # Extract text
    raw_text = extract_text(file_path)
    if not raw_text.strip():
        return {
            "filename": filename,
            "status": "error",
            "error": "No se pudo extraer texto del archivo",
            "total_chunks": 0,
        }

    # Chunk text
    chunks = chunk_text(raw_text, filename, ext, file_size)

    # Add tag to all chunk metadata if provided
    if tag:
        for chunk in chunks:
            chunk["metadata"]["tag"] = tag

    # Generate embeddings and store
    store_chunks_with_embeddings(chunks)

    return {
        "filename": filename,
        "status": "ok",
        "file_type": ext,
        "total_chunks": len(chunks),
        "tag": tag,
        "reindexed": reindexed,
        "content_preview": raw_text[:200],
    }


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    tag: Optional[str] = Form(default=""),
):
    """
    Upload a single document with optional tag for categorization.
    """
    filename = _sanitize_filename(file.filename)
    ext = os.path.splitext(filename)[1].lower()
    print(f"Upload: {file.filename} -> {filename} (ext={ext})")

    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Formato no soportado: {ext}. Formatos validos: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )

    file_path = os.path.join(UPLOAD_DIR, filename)
    try:
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)

        result = _process_single_file(file_path, filename, tag)

        if result["status"] == "error":
            raise HTTPException(status_code=400, detail=result["error"])

        return {
            "message": f"Documento '{filename}' procesado exitosamente",
            **result,
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Error al procesar '{filename}': {str(e)}")
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)


@router.post("/upload-batch")
async def upload_batch(
    files: list[UploadFile] = File(...),
    tag: Optional[str] = Form(default=""),
):
    """
    Upload multiple files at once (from folder selection or multi-select).
    All files in the batch share the same tag for grouping.
    Processes each file independently — partial failures don't stop the batch.
    """
    results = []
    processed = 0
    failed = 0

    for file in files:
        filename = _sanitize_filename(file.filename)
        ext = os.path.splitext(filename)[1].lower()
        print(f"Batch: {file.filename} -> {filename} (ext={ext})")

        # Skip unsupported files silently
        if ext not in SUPPORTED_EXTENSIONS:
            results.append({
                "filename": filename,
                "status": "skipped",
                "error": f"Formato no soportado: {ext}",
                "total_chunks": 0,
            })
            continue

        file_path = os.path.join(UPLOAD_DIR, filename)
        try:
            with open(file_path, "wb") as f:
                content = await file.read()
                f.write(content)

            result = _process_single_file(file_path, filename, tag)
            results.append(result)

            if result["status"] == "ok":
                processed += 1
            else:
                failed += 1

        except Exception as e:
            print(f"Batch upload error for {filename}: {e}")
            results.append({
                "filename": filename,
                "status": "error",
                "error": str(e),
                "total_chunks": 0,
            })
            failed += 1
        finally:
            if os.path.exists(file_path):
                os.remove(file_path)

    total_chunks = sum(r.get("total_chunks", 0) for r in results)

    return {
        "message": f"Batch completado: {processed} procesados, {failed} fallidos, {len(files) - processed - failed} omitidos",
        "processed": processed,
        "failed": failed,
        "skipped": len(files) - processed - failed,
        "total_chunks": total_chunks,
        "tag": tag,
        "results": results,
    }


@router.get("/documents")
async def list_documents(tag: Optional[str] = Query(default=None)):
    """List all unique documents (grouped by filename), optionally filtered by tag."""
    try:
        result = supabase.table("rag_documents") \
            .select("metadata, created_at") \
            .execute()

        # Group by filename
        doc_map = {}
        for row in (result.data or []):
            metadata = row.get("metadata", {})
            filename = metadata.get("filename", "desconocido")
            doc_tag = metadata.get("tag", "")

            # Filter by tag if specified
            if tag and doc_tag != tag:
                continue

            if filename not in doc_map:
                doc_map[filename] = {
                    "filename": filename,
                    "file_type": metadata.get("file_type", ""),
                    "file_size": metadata.get("file_size", 0),
                    "total_chunks": metadata.get("total_chunks", 0),
                    "tag": doc_tag,
                    "created_at": row.get("created_at", ""),
                }

        documents = sorted(doc_map.values(), key=lambda x: x.get("created_at", ""), reverse=True)

        # Collect unique tags
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
            raise HTTPException(status_code=404, detail=f"Documento '{filename}' no encontrado")

        return {
            "message": f"Documento '{filename}' eliminado ({deleted_count} chunks)",
            "deleted_chunks": deleted_count,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/documents/by-tag")
async def delete_documents_by_tag(tag: str = Query(...)):
    """Delete all documents with a specific tag."""
    try:
        result = supabase.table("rag_documents") \
            .delete() \
            .eq("metadata->>tag", tag) \
            .execute()

        deleted_count = len(result.data) if result.data else 0

        return {
            "message": f"Eliminados {deleted_count} chunks con tag '{tag}'",
            "deleted_chunks": deleted_count,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
