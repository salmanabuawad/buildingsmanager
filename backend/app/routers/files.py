from __future__ import annotations

import mimetypes
import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi.responses import FileResponse
from app.database import get_db
from app.utils import row_to_dict as _row_to_dict
from app.auth import require_jwt, _parse_uid
from app.config import settings
import uuid

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



@router.post("/upload/{asset_id}")
async def upload_file(
    asset_id: int,
    file: UploadFile = File(...),
    measurement_date: str = None,
    path: str | None = Query(default=None, description="Optional storage-relative path."),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_jwt),
):
    uid = _parse_uid(payload.get("sub"))

    # Generate unique file name
    file_extension = file.filename.split('.')[-1] if '.' in file.filename else ''
    unique_filename = f"{uuid.uuid4()}.{file_extension}"
    # Store under the structure-drawings-like layout by default so the existing frontend extraction works.
    if path:
        safe_rel = _extract_structure_drawings_rel_path(path)
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
        # DB schema: file_url (not file_path), uploaded_by is text, measurement_date is text
        row = db.execute(
            text("""
                INSERT INTO asset_files (asset_id, file_name, file_url, file_type, file_size, measurement_date, uploaded_by)
                VALUES (:asset_id, :file_name, :file_url, :file_type, :file_size, :measurement_date, :uploaded_by)
                RETURNING *
            """),
            {
                "asset_id": asset_id,
                "file_name": file.filename,
                "file_url": rel_path,
                "file_type": file.content_type,
                "file_size": len(file_content),
                "measurement_date": measurement_date or None,
                "uploaded_by": str(uid) if uid else None,
            },
        ).fetchone()
        db.commit()

        return _row_to_dict(row)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")


@router.get("/asset/{asset_id}")
def get_asset_files(
    asset_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_jwt),
):
    rows = db.execute(
        text("SELECT * FROM asset_files WHERE asset_id = :aid ORDER BY uploaded_at DESC"),
        {"aid": asset_id},
    ).fetchall()
    return [_row_to_dict(r) for r in rows]


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(
    file_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_jwt),
):
    row = db.execute(
        text("SELECT * FROM asset_files WHERE id = :fid"), {"fid": file_id}
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="File not found")

    fdata = _row_to_dict(row)
    try:
        # Delete from local filesystem
        local_root = Path(getattr(settings, "ASSET_FILES_STORAGE_PATH", settings.FILES_BASE_PATH))
        rel = _extract_structure_drawings_rel_path(fdata.get("file_url") or fdata.get("file_path") or "")
        full = local_root / rel
        if full.exists():
            full.unlink()

        # Delete from database
        db.execute(text("DELETE FROM asset_files WHERE id = :fid"), {"fid": file_id})
        db.commit()
        return None

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File deletion failed: {str(e)}")



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
    q = f"path={path}" + ("&inline=1" if inline else "")
    return {"url": f"/api/files/download?{q}"}


@router.get("/download/{file_id}")
def get_file_url(
    file_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_jwt),
):
    row = db.execute(
        text("SELECT * FROM asset_files WHERE id = :fid"), {"fid": file_id}
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="File not found")

    fdata = _row_to_dict(row)
    try:
        rel = _extract_structure_drawings_rel_path(fdata.get("file_url") or fdata.get("file_path") or fdata.get("file_name") or "")
        return {"url": f"/api/files/download?path={rel}", "filename": fdata.get("file_name")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to build download URL: {str(e)}")
