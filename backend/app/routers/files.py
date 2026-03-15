"""
Files router: /api/files/{bucket}/*
Upload, download, remove, signed-url, public-url for local filesystem.
Auth via file_session cookie (base64 JSON) or X-User-Id header.
"""
import mimetypes
from fastapi import APIRouter, Request, UploadFile, File, HTTPException, Query
from fastapi.responses import FileResponse
from app.services import file_service
from app.auth import parse_file_session

router = APIRouter()


def _require_session(request: Request) -> dict:
    cookie = request.cookies.get("file_session")
    session = parse_file_session(cookie)
    if session and session.get("user_id"):
        return session
    uid_header = request.headers.get("X-User-Id")
    if uid_header:
        return {"user_id": uid_header}
    return {}


@router.post("/{bucket}/upload")
async def upload_file(
    bucket: str,
    path: str = Query(...),
    file: UploadFile = File(...),
):
    content = await file.read()
    result = await file_service.upload(bucket, path, content, file.content_type)
    return {"data": result, "error": None}


@router.post("/{bucket}/remove")
async def remove_files(bucket: str, body: dict):
    paths = body.get("paths") or []
    result = await file_service.remove(bucket, paths)
    return {"data": result, "error": None}


@router.get("/{bucket}/public-url")
async def public_url(bucket: str, path: str = Query(...)):
    url = file_service.get_public_url(bucket, path)
    return {"data": {"publicUrl": url}, "error": None}


@router.get("/{bucket}/signed-url")
async def signed_url(
    bucket: str,
    path: str = Query(...),
    expires_in: int = Query(3600),
):
    url = file_service.create_signed_url(bucket, path, expires_in)
    return {"data": {"signedUrl": url}, "error": None}


@router.get("/{bucket}/{path:path}")
async def serve_file(
    bucket: str,
    path: str,
    request: Request,
    expires: str | None = None,
    sig: str | None = None,
):
    if expires and sig:
        if not file_service.verify_signed_url(bucket, path, expires, sig):
            raise HTTPException(status_code=403, detail="Invalid or expired signed URL")
    else:
        session = _require_session(request)
        if not session.get("user_id"):
            raise HTTPException(status_code=401, detail="Authentication required")

    file_path = file_service.get_file_path(bucket, path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    mime, _ = mimetypes.guess_type(str(file_path))
    return FileResponse(str(file_path), media_type=mime or "application/octet-stream")
