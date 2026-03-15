"""
File service: local filesystem storage replacing Supabase Storage.
Buckets: structure-drawings, asset-files, inspection-reports, dwg-files
Files stored at: {FILES_BASE_PATH}/{bucket}/{path}
Signed URLs: HMAC-signed tokens (no DB needed).
"""
import os
import hmac
import hashlib
import time
import urllib.parse
from pathlib import Path
from fastapi import HTTPException
from app.config import settings

ALLOWED_BUCKETS = {"structure-drawings", "asset-files", "inspection-reports", "dwg-files"}


def _bucket_path(bucket: str, path: str) -> Path:
    if bucket not in ALLOWED_BUCKETS:
        raise HTTPException(status_code=400, detail=f"Unknown bucket: {bucket}")
    # Prevent path traversal
    safe_path = Path(path.lstrip("/"))
    if ".." in safe_path.parts:
        raise HTTPException(status_code=400, detail="Invalid path")
    return Path(settings.FILES_BASE_PATH) / bucket / safe_path


def get_public_url(bucket: str, path: str) -> str:
    """Return a public URL for a file (served by Nginx at /uploads/)."""
    safe = path.lstrip("/")
    return f"/uploads/{bucket}/{safe}"


def create_signed_url(bucket: str, path: str, expires_in: int = 3600) -> str:
    """Create an HMAC-signed URL valid for `expires_in` seconds."""
    exp = int(time.time()) + expires_in
    payload = f"{bucket}/{path.lstrip('/')}:{exp}"
    sig = hmac.new(
        settings.SECRET_KEY.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()
    encoded_path = urllib.parse.quote(path.lstrip("/"), safe="/-_.")
    return f"/api/files/{bucket}/{encoded_path}?expires={exp}&sig={sig}"


def verify_signed_url(bucket: str, path: str, expires: str, sig: str) -> bool:
    try:
        exp = int(expires)
    except (ValueError, TypeError):
        return False
    if time.time() > exp:
        return False
    payload = f"{bucket}/{path.lstrip('/')}:{exp}"
    expected = hmac.new(
        settings.SECRET_KEY.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(sig, expected)


async def upload(bucket: str, path: str, content: bytes, content_type: str | None = None) -> dict:
    dest = _bucket_path(bucket, path)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(content)
    return {"path": f"{bucket}/{path.lstrip('/')}", "bucket": bucket}


async def download(bucket: str, path: str) -> bytes:
    dest = _bucket_path(bucket, path)
    if not dest.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return dest.read_bytes()


async def remove(bucket: str, paths: list[str]) -> dict:
    removed = []
    for p in paths:
        dest = _bucket_path(bucket, p)
        if dest.exists():
            dest.unlink()
            removed.append(p)
    return {"removed": removed}


def get_file_path(bucket: str, path: str) -> Path:
    return _bucket_path(bucket, path)
