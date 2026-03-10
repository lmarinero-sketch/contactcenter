"""
Storage Service — Manage files in Supabase Storage
Handles upload, download (signed URLs), and deletion of original files.
"""
import os
from config import supabase

BUCKET_NAME = "rag-files"


def _ensure_bucket():
    """Create the storage bucket if it doesn't exist."""
    try:
        supabase.storage.get_bucket(BUCKET_NAME)
    except Exception:
        try:
            supabase.storage.create_bucket(
                BUCKET_NAME,
                options={"public": False, "file_size_limit": 52428800}  # 50MB
            )
            print(f"Storage bucket '{BUCKET_NAME}' created")
        except Exception as e:
            # Bucket might already exist
            print(f"Bucket creation note: {e}")


def upload_to_storage(file_bytes: bytes, filename: str, folder: str = "") -> str:
    """
    Upload a file to Supabase Storage.
    Returns the storage path.
    """
    _ensure_bucket()
    storage_path = f"{folder}/{filename}" if folder else filename
    # Remove leading/trailing slashes
    storage_path = storage_path.strip("/")

    try:
        # Remove existing file if present (for re-indexing)
        try:
            supabase.storage.from_(BUCKET_NAME).remove([storage_path])
        except Exception:
            pass

        supabase.storage.from_(BUCKET_NAME).upload(
            storage_path,
            file_bytes,
            {"content-type": "application/octet-stream", "upsert": "true"}
        )
        print(f"Storage: uploaded '{storage_path}'")
        return storage_path
    except Exception as e:
        print(f"Storage upload failed: {e}")
        return ""


def get_download_url(storage_path: str, expires_in: int = 3600) -> str:
    """
    Generate a signed download URL for a file.
    Default expiry: 1 hour.
    """
    try:
        result = supabase.storage.from_(BUCKET_NAME).create_signed_url(
            storage_path, expires_in
        )
        return result.get("signedURL", "")
    except Exception as e:
        print(f"Storage signed URL failed: {e}")
        return ""


def delete_from_storage(storage_path: str) -> bool:
    """Delete a file from storage."""
    try:
        supabase.storage.from_(BUCKET_NAME).remove([storage_path])
        return True
    except Exception as e:
        print(f"Storage delete failed: {e}")
        return False


def list_storage_files(folder: str = "") -> list:
    """List files in a storage folder."""
    try:
        path = folder.strip("/") if folder else ""
        result = supabase.storage.from_(BUCKET_NAME).list(
            path=path,
            options={"limit": 1000, "sortBy": {"column": "name", "order": "asc"}}
        )
        return result or []
    except Exception as e:
        print(f"Storage list failed: {e}")
        return []
