import mimetypes
import os
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import urlopen, Request

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status, Query
from sqlalchemy.orm import Session
from typing import List
from fastapi.responses import FileResponse, Response
from app.database import get_db
from app.models import AssetFile, Asset, User
from app.schemas import AssetFileResponse
from app.auth import get_current_user, require_jwt
from app.config import settings
import uuid
from datetime import datetime

router = APIRouter()


def _looks_like_url(s: str) -> bool:
    return s.startswith("http://") or s.startswith("https://")


def _extract_structure_drawings_rel_path(url_or_path: str) -> str:
    """
    The frontend stores/receives file URLs that look like:
      .../structure-drawings/{assetId}/{filename}
    For local storage we only need the relative tail: {assetId}/{filename}.
    """
    val = url_or_path.replace("\\", "/").strip()
    if "structure-drawings/" in val:
        tail = val.split("structure-drawings/")[1]
        return tail.split("?")[0].strip()
    # If already a relative path, keep it.
    return val.split("?")[0].strip().lstrip("/")


def _resolve_local_file_path(path_param: str) -> Path:
    """
    Resolve a frontend-provided path into a real local file.
    We support both:
      - "123/file.pdf"
      - "structure-drawings/123/file.pdf"
    """
    clean = (path_param or "").replace("\\", "/").strip()
    if not clean:
        raise FileNotFoundError("Empty path")

    # Normalize to tail for structure-drawings URLs/paths.
    rel = _extract_structure_drawings_rel_path(clean)
    root = Path(getattr(settings, "ASSET_FILES_STORAGE_PATH", settings.FILES_BASE_PATH))

    # Try direct relative join first.
    candidate1 = root / rel
    if candidate1.exists():
        return candidate1

    # Try without leading directories (defensive).
    # Example: rel might include nested prefixes; take last 2 segments.
    parts = [p for p in rel.split("/") if p]
    if len(parts) >= 2:
        candidate2 = root / Path(parts[-2]) / parts[-1]
        if candidate2.exists():
            return candidate2

    # Last fallback: treat param itself as relative.
    candidate3 = root / clean.lstrip("/")
    if candidate3.exists():
        return candidate3

    raise FileNotFoundError(f"Local file not found for path: {path_param}")


def _guess_mime_type(file_name: str) -> str:
    mt, _ = mimetypes.guess_type(file_name)
    return mt or "application/octet-stream"


@router.post("/upload/{asset_id}", response_model=AssetFileResponse)
async def upload_file(
    asset_id: int,
    file: UploadFile = File(...),
    measurement_date: str = None,
    path: str | None = Query(default=None, description="Optional storage-relative path (legacy supabase-style)."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in ["admin", "editor"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    # Verify asset exists
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Generate unique file name
    file_extension = file.filename.split('.')[-1] if '.' in file.filename else ''
    unique_filename = f"{uuid.uuid4()}.{file_extension}"
    # Store under the structure-drawings-like layout by default so the existing frontend extraction works.
    # If `path` is provided, preserve it (relative) and just append unique filename.
    if path:
        # Keep only relative tail; don't allow absolute paths.
        safe_rel = _extract_structure_drawings_rel_path(path)
        # If path already contains a filename, just treat it as a folder-like prefix.
        safe_rel_dir = safe_rel.rsplit("/", 1)[0] if "/" in safe_rel else str(asset_id)
        rel_path = f"{safe_rel_dir}/{unique_filename}"
    else:
        rel_path = f"{asset_id}/{unique_filename}"
    full_path = Path(getattr(settings, "ASSET_FILES_STORAGE_PATH", settings.FILES_BASE_PATH)) / rel_path
    full_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        file_content = await file.read()
        full_path.write_bytes(file_content)

        # Save file metadata to database
        db_file = AssetFile(
            asset_id=asset_id,
            file_name=file.filename,
            file_path=rel_path,
            file_type=file.content_type,
            file_size=len(file_content),
            measurement_date=datetime.fromisoformat(measurement_date) if measurement_date else None,
            uploaded_by=current_user.id
        )
        db.add(db_file)
        db.commit()
        db.refresh(db_file)

        return db_file

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")


@router.get("/asset/{asset_id}", response_model=List[AssetFileResponse])
def get_asset_files(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    files = db.query(AssetFile).filter(AssetFile.asset_id == asset_id).all()
    return files


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in ["admin", "editor"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    db_file = db.query(AssetFile).filter(AssetFile.id == file_id).first()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        # Delete from local filesystem
        local_root = Path(getattr(settings, "ASSET_FILES_STORAGE_PATH", settings.FILES_BASE_PATH))
        rel = _extract_structure_drawings_rel_path(db_file.file_path or "")
        full = local_root / rel
        if full.exists():
            full.unlink()

        # Delete from database
        db.delete(db_file)
        db.commit()
        return None

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File deletion failed: {str(e)}")


def _is_allowed_fetch_host(netloc: str) -> bool:
    """Allow Supabase storage and same-origin to avoid SSRF."""
    n = (netloc or "").lower().split(":")[0]
    if n in ("localhost", "127.0.0.1"):
        return True
    if n.endswith(".supabase.co") or n == "supabase.co":
        return True
    return False


@router.get("/fetch-for-export")
def fetch_file_for_export(
    url: str = Query(..., description="Full URL of the file to fetch (e.g. Supabase storage). Used when file is not on backend disk."),
    _payload: dict = Depends(require_jwt),
):
    """Fetch file from URL server-side and return bytes. Used for ZIP export when file is at Supabase/external URL (avoids CORS)."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Invalid URL scheme")
    if not _is_allowed_fetch_host(parsed.netloc):
        raise HTTPException(status_code=400, detail="URL host not allowed")
    try:
        req = Request(url, headers={"User-Agent": "AssetFlow-Export/1.0"})
        with urlopen(req, timeout=30) as resp:
            content = resp.read()
            content_type = resp.headers.get("Content-Type") or "application/octet-stream"
        return Response(content=content, media_type=content_type)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch file: {str(e)}")


@router.get("/download")
def download_by_path(
    path: str = Query(..., description="Storage-relative path, e.g. {assetId}/{filename}"),
    inline: bool = Query(False, description="If true, Content-Disposition: inline so file displays in browser (e.g. for print window)"),
):
    try:
        file_path = _resolve_local_file_path(path)
        file_name = file_path.name
        disposition = "inline" if inline else "attachment"
        return FileResponse(
            str(file_path),
            media_type=_guess_mime_type(file_name),
            filename=file_name,
            content_disposition_type=disposition,
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")


@router.get("/view-url")
def get_view_url(
    path: str = Query(..., description="Storage-relative path"),
    inline: bool = Query(True, description="Include inline=1 so file displays in window (e.g. for print)"),
):
    # The frontend uses this to open/view without auth.
    # We return the download URL with inline=1 so the file displays in the window (not download).
    q = f"path={path}" + ("&inline=1" if inline else "")
    return {"url": f"/api/files/download?{q}"}


@router.get("/download/{file_id}")
def get_file_url(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db_file = db.query(AssetFile).filter(AssetFile.id == file_id).first()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        # Provide a backend-relative download URL that the frontend can fetch.
        # If file_path contains a supabase-style structure-drawings URL, extract the tail.
        rel = _extract_structure_drawings_rel_path(db_file.file_path or db_file.file_name or "")
        return {"url": f"/api/files/download?path={rel}", "filename": db_file.file_name}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to build download URL: {str(e)}")
