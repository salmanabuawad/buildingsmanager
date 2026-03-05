"""
Async ZIP export: create a job that builds a ZIP in the background; client polls status and downloads when ready.
"""
import io
import zipfile
from typing import List

from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends, status
from fastapi.responses import Response
from pydantic import BaseModel

from app.config import settings
from app.jobs import (
    create_job,
    set_job_building,
    set_job_ready,
    set_job_failed,
    get_job,
    consume_job_result,
)
from app.auth import get_current_user
from app.models import User

router = APIRouter()


class ZipEntry(BaseModel):
    path: str  # storage path (e.g. assets/123/uuid.pdf)
    filename_in_zip: str  # name inside the ZIP


class CreateZipRequest(BaseModel):
    zip_filename: str
    entries: List[ZipEntry]


def _download_blob_bytes(path: str) -> bytes:
    """Read file content by path from configured storage."""
    from app import storage
    return storage.read_file(path)


def _build_zip_task(job_id: str, zip_filename: str, entries: List[ZipEntry]) -> None:
    try:
        set_job_building(job_id)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for entry in entries:
                try:
                    data = _download_blob_bytes(entry.path)
                    zf.writestr(entry.filename_in_zip, data)
                except Exception as e:
                    # Skip missing files; or fail the whole job
                    zf.writestr(entry.filename_in_zip + ".error.txt", f"Failed to load: {e}")
        buf.seek(0)
        set_job_ready(job_id, buf.getvalue(), zip_filename=zip_filename)
    except Exception as e:
        set_job_failed(job_id, str(e))


@router.post("/zip", status_code=202)
async def create_zip_job(
    request: CreateZipRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    """Start an async ZIP export job. Returns job_id; poll GET /export/zip/{job_id} and download when ready."""
    if not settings.has_storage:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="File storage not configured (set STORAGE_PATH and STORAGE_MAIN_FOLDER)",
        )
    if not request.entries:
        raise HTTPException(status_code=400, detail="At least one entry required")
    job_id = create_job()
    entries = [ZipEntry(path=e.path, filename_in_zip=e.filename_in_zip) for e in request.entries]
    background_tasks.add_task(_build_zip_task, job_id, request.zip_filename, entries)
    return {"job_id": job_id, "message": "ZIP job started", "status": "pending"}


@router.get("/zip/{job_id}")
async def get_zip_status(
    job_id: str,
    current_user: User = Depends(get_current_user),
):
    """Return job status: pending, building, ready, or failed."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or expired")
    return {
        "job_id": job_id,
        "status": job["status"],
        "error": job.get("error"),
    }


@router.get("/zip/{job_id}/download")
async def download_zip(
    job_id: str,
    current_user: User = Depends(get_current_user),
):
    """Download the ZIP file when status is ready. Consumes the job (one-time download)."""
    result = consume_job_result(job_id)
    if not result:
        raise HTTPException(status_code=404, detail="Job not found, expired, or already downloaded")
    data, zip_filename = result[0], result[1] if len(result) > 1 else None
    if not data:
        raise HTTPException(status_code=404, detail="No file data")
    name = (zip_filename or "export").replace('"', "'")
    if not name.endswith(".zip"):
        name += ".zip"
    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )
