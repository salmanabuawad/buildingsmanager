from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status, Request, Query
from fastapi.responses import Response, JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models import User
from app.repos import AssetRepo, AssetFileRepo, SystemConfigRepo
from app.schemas import AssetFileResponse
from app.auth import decode_token
from app.config import settings
from app import storage

_asset_repo = AssetRepo()
_asset_file_repo = AssetFileRepo()
_system_config_repo = SystemConfigRepo()
import uuid
import base64
import hmac
import hashlib
import json
import time
from datetime import datetime
from types import SimpleNamespace
from urllib.parse import unquote, quote

# View tokens: short-lived URL for opening file in new tab (e.g. print) without auth.
VIEW_TOKEN_EXPIRY_SECONDS = 300  # 5 minutes


def _create_view_token(path: str):
    expiry = int(time.time()) + VIEW_TOKEN_EXPIRY_SECONDS
    payload = f"{path}|{expiry}"
    sig = hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    token = base64.urlsafe_b64encode(sig).rstrip(b"=").decode("ascii")
    return token, expiry


def _verify_view_token(path: str, expiry: int, token: str) -> bool:
    if not token or not path or not expiry:
        return False
    if int(expiry) < time.time():
        return False
    payload = f"{path}|{int(expiry)}"
    expected = base64.urlsafe_b64encode(
        hmac.new(
            settings.SECRET_KEY.encode("utf-8"),
            payload.encode("utf-8"),
            hashlib.sha256,
        ).digest()
    ).rstrip(b"=").decode("ascii")
    return hmac.compare_digest(expected, token)


# Signed URL (Supabase-style): path in URL + single JWT token (no auth in new tab).
SIGNED_URL_BUCKET = "structure-drawings"


def _create_view_token_jwt(path: str) -> str:
    """JWT payload: url=path, exp=timestamp. Single token for view URL."""
    expiry = int(time.time()) + VIEW_TOKEN_EXPIRY_SECONDS
    payload = {"url": path, "exp": expiry}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def _verify_view_token_jwt(path: str, token: str) -> bool:
    if not token or not path:
        return False
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload.get("url") == path
    except JWTError:
        return False


router = APIRouter()
security_bearer_optional = HTTPBearer(auto_error=False)


def _media_type_from_filename(filename: str) -> str:
    """Return a proper media type so the browser displays (e.g. PDF) instead of downloading."""
    lower = (filename or "").lower()
    if lower.endswith(".pdf"):
        return "application/pdf"
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith(".jpg") or lower.endswith(".jpeg"):
        return "image/jpeg"
    if lower.endswith(".gif"):
        return "image/gif"
    if lower.endswith(".webp"):
        return "image/webp"
    if lower.endswith(".svg"):
        return "image/svg+xml"
    return "application/octet-stream"


def _get_storage_config() -> Optional[tuple[str, str]]:
    """Return (storage_path, storage_main_folder) from system_configuration name='file_storage', or None."""
    try:
        raw = _system_config_repo.get_value_by_name("file_storage")
        if not raw:
            return None
        data = json.loads(raw) if isinstance(raw, str) else raw
        if isinstance(data, dict):
            path = data.get("storage_path") or data.get("STORAGE_PATH")
            folder = data.get("storage_main_folder") or data.get("STORAGE_MAIN_FOLDER")
            if path and folder:
                return (str(path).strip(), str(folder).strip() or "assetflow-files")
    except Exception:
        pass
    return None


def _apply_storage_config(db: Optional[Session] = None) -> bool:
    """Apply storage location from system_configuration if present. Return True if storage is configured."""
    config = _get_storage_config()
    if config:
        storage.configure_storage(path=config[0], main_folder=config[1])
        return True
    storage.configure_storage(path=None, main_folder=None)
    return settings.has_storage


def _ensure_storage(db: Optional[Session] = None):
    if _apply_storage_config():
        return
    if settings.has_storage:
        storage.configure_storage(path=None, main_folder=None)
        return
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="File storage not configured (set in System Configuration or STORAGE_PATH and STORAGE_MAIN_FOLDER)",
    )


def _session_from_payload(raw: Optional[str]):
    """Decode X-Users-Table-Session style payload (base64 JSON with user_id, user_role). Return SimpleNamespace(role=...) or None."""
    if not raw or not isinstance(raw, str):
        return None
    raw = raw.strip()
    if not raw:
        return None
    try:
        # Add padding if needed (browser btoa can omit trailing =)
        pad = 4 - (len(raw) % 4)
        if pad and pad != 4:
            raw = raw + ("=" * pad)
        decoded = base64.b64decode(raw).decode("utf-8")
        payload = json.loads(decoded)
        uid = payload.get("user_id")
        role = (payload.get("user_role") or "user").lower()
        if uid is not None and role in ("admin", "editor", "user", "inspector"):
            return SimpleNamespace(id=None, role=role)
    except Exception:
        try:
            pad2 = 4 - (len(raw) % 4)
            if pad2 and pad2 != 4:
                raw = raw + ("=" * pad2)
            decoded = base64.urlsafe_b64decode(raw).decode("utf-8")
            payload = json.loads(decoded)
            uid = payload.get("user_id")
            role = (payload.get("user_role") or "user").lower()
            if uid is not None and role in ("admin", "editor", "user", "inspector"):
                return SimpleNamespace(id=None, role=role)
        except Exception:
            pass
    return None


def get_current_user_for_files(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer_optional),
    db: Session = Depends(get_db),
):
    """Accept Bearer token, X-Users-Table-Session header, or file_session cookie so session-only frontend can upload/print."""
    if credentials and credentials.credentials:
        try:
            payload = decode_token(credentials.credentials)
            user_id = payload.get("sub")
            if user_id is not None:
                user = db.query(User).filter(User.id == user_id).first()
                if user is not None:
                    return user
        except Exception:
            pass
    raw = request.headers.get("X-Users-Table-Session") or request.headers.get("x-users-table-session")
    user = _session_from_payload(raw)
    if user is not None:
        return user
    raw = request.cookies.get("file_session")
    user = _session_from_payload(raw)
    if user is not None:
        return user
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")




@router.post("/upload/{asset_id}")
async def upload_file(
    request: Request,
    asset_id: int,
    file: UploadFile = File(...),
    path: Optional[str] = Query(None, description="Storage path (e.g. assetId/filename); ref-like: first segment = asset_id"),
    measurement_date: str = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user_for_files),
):
    if getattr(current_user, "role", None) not in ("admin", "editor", "user", "inspector"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    if not _asset_repo.exists(asset_id):
        raise HTTPException(status_code=404, detail="Asset not found")

    # Ref-like: use client path as blob path when provided (assetId/filename)
    if path:
        blob_path = unquote(path).strip()
        if not blob_path or ".." in blob_path:
            raise HTTPException(status_code=400, detail="Invalid path")
        do_db_insert = False
    else:
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else ''
        unique_filename = f"{uuid.uuid4()}.{file_extension}"
        blob_path = f"assets/{asset_id}/{unique_filename}"
        do_db_insert = True

    try:
        _ensure_storage(db)
        file_content = await file.read()
        storage.write_file(blob_path, file_content)

        if do_db_insert:
            file_type = (file.content_type or "").strip() or _media_type_from_filename(file.filename or "")
            fname = file.filename or (blob_path.split("/")[-1] if "/" in blob_path else blob_path)
            mdate = datetime.fromisoformat(measurement_date) if measurement_date else None
            mdate_str = mdate.isoformat() if mdate else None
            uid = getattr(current_user, "id", None)
            uid_str = str(uid) if uid else None
            row = _asset_file_repo.create_for_files(
                asset_id=asset_id,
                file_url=blob_path,
                file_name=fname,
                file_type=file_type or None,
                file_size=len(file_content),
                measurement_date=mdate_str,
                uploaded_by=uid_str,
            )
            if row:
                row["file_path"] = row.get("file_url") or blob_path
                return row

        base = str(request.base_url).rstrip("/")
        public_url = f"{base}/api/files/download?path={quote(blob_path, safe='')}"
        return JSONResponse(content={"path": blob_path, "publicUrl": public_url})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")


@router.get("/asset/{asset_id}", response_model=List[AssetFileResponse])
def get_asset_files(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user_for_files),
):
    rows = _asset_file_repo.get_by_asset_id(asset_id)
    out = []
    for r in rows:
        r = dict(r)
        r["file_path"] = r.get("file_path") or r.get("file_url") or ""
        out.append(AssetFileResponse.model_validate(r))
    return out


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user_for_files),
):
    if getattr(current_user, "role", None) not in ("admin", "editor", "user", "inspector"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    db_file = _asset_file_repo.get_by_id(file_id)
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        _ensure_storage(db)
        file_path = db_file.get("file_path") or db_file.get("file_url") or ""
        storage.delete_file(file_path)
        _asset_file_repo.delete_by_id(file_id)
        return None

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File deletion failed: {str(e)}")


def _filename_for_response(blob_path: str) -> str:
    """Prefer stored file_name from asset_files (match by file_url); else basename of blob_path."""
    fname = _asset_file_repo.get_filename_for_blob_path(blob_path)
    return fname if fname else (blob_path.split("/")[-1] if "/" in blob_path else blob_path)


def _file_meta_for_response(blob_path: str) -> tuple[str, str]:
    """Return (filename, media_type) for response; use stored file_name and file_type from asset_files when present."""
    filename, media_type = _asset_file_repo.get_file_meta_for_blob_path(blob_path)
    if not media_type or media_type == "application/octet-stream":
        media_type = _media_type_from_filename(filename)
    return filename, media_type


@router.get("/download")
def get_file_by_path(
    path: str = Query(..., description="Storage path (e.g. assetId/filename)"),
    current_user = Depends(get_current_user_for_files),
    db: Session = Depends(get_db),
):
    """Ref-like: download blob by path (same path as upload). Sends physical file name and type from DB when present."""
    if getattr(current_user, "role", None) not in ("admin", "editor", "user", "inspector"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    blob_path = unquote(path).strip()
    if not blob_path or ".." in blob_path:
        raise HTTPException(status_code=400, detail="Invalid path")
    try:
        _ensure_storage(db)
        content = storage.read_file(blob_path)
        filename, media_type = _file_meta_for_response(blob_path)
        return Response(
            content=content,
            media_type=media_type,
            headers={"Content-Disposition": f"inline; filename*=UTF-8''{quote(filename)}", "Content-Length": str(len(content))},
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/view")
def get_file_view(
    request: Request,
    path: str = Query(..., description="Storage path"),
    token: str = Query(..., description="View token"),
    expiry: int = Query(..., description="Token expiry timestamp"),
    db: Session = Depends(get_db),
):
    """Serve file inline by path with a short-lived token (no auth). For print/new-tab view like ref_only."""
    if not _verify_view_token(unquote(path).strip(), expiry, token):
        raise HTTPException(status_code=403, detail="Invalid or expired view link")
    blob_path = unquote(path).strip()
    if not blob_path or ".." in blob_path:
        raise HTTPException(status_code=400, detail="Invalid path")
    try:
        _ensure_storage(db)
        content = storage.read_file(blob_path)
        filename, media_type = _file_meta_for_response(blob_path)
        return Response(
            content=content,
            media_type=media_type,
            headers={"Content-Disposition": f"inline; filename*=UTF-8''{quote(filename)}", "Content-Length": str(len(content))},
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


def _view_base_url(request: Request) -> str:
    """Base URL for view links so the browser can load them (respect proxy headers)."""
    forwarded_host = request.headers.get("x-forwarded-host") or request.headers.get("X-Forwarded-Host")
    forwarded_proto = request.headers.get("x-forwarded-proto") or request.headers.get("X-Forwarded-Proto")
    if forwarded_host and forwarded_proto:
        return f"{forwarded_proto.strip()}://{forwarded_host.split(',')[0].strip()}".rstrip("/")
    return str(request.base_url).rstrip("/")


@router.get("/view-url")
def get_view_url(
    request: Request,
    path: str = Query(..., description="Storage path"),
    current_user = Depends(get_current_user_for_files),
):
    """Return a short-lived URL for new-tab/print (no auth in that tab). Uses /api/files/view so proxy and method work."""
    if getattr(current_user, "role", None) not in ("admin", "editor", "user", "inspector"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    blob_path = unquote(path).strip()
    if not blob_path or ".." in blob_path:
        raise HTTPException(status_code=400, detail="Invalid path")
    token, expiry = _create_view_token(blob_path)
    base = _view_base_url(request)
    # Legacy query-string URL (GET) so it works behind proxy and avoids 405
    view_url = f"{base}/api/files/view?path={quote(blob_path, safe='')}&token={token}&expiry={expiry}"
    return {"url": view_url}


@router.post("/delete", status_code=status.HTTP_204_NO_CONTENT)
async def delete_by_paths(
    request: Request,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user_for_files),
):
    """Ref-like: delete blobs by path (frontend deletes DB row separately)."""
    if getattr(current_user, "role", None) not in ("admin", "editor", "user", "inspector"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Expected JSON body: { paths: string[] }")
    paths = body.get("paths") if isinstance(body, dict) else []
    if not isinstance(paths, list) or len(paths) == 0:
        raise HTTPException(status_code=400, detail="Expected JSON body: { paths: string[] }")
    try:
        _ensure_storage(db)
        for p in paths:
            path_str = unquote(p).strip() if isinstance(p, str) else ""
            if not path_str or ".." in path_str:
                continue
            storage.delete_file(path_str)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")
    return None


@router.get("/download/{file_id}")
def get_file_url(
    request: Request,
    file_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user_for_files),
):
    db_file = _asset_file_repo.get_by_id(file_id)
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")
    _ensure_storage(db)
    base = str(request.base_url).rstrip("/")
    file_path = db_file.get("file_path") or db_file.get("file_url") or ""
    file_name = db_file.get("file_name") or ""
    download_url = f"{base}/api/files/download?path={file_path}"
    return {"url": download_url, "filename": file_name}


# Signed URL route: /storage/v1/object/sign/{bucket}/{file_path}?token=JWT (no auth)
storage_router = APIRouter()


@storage_router.api_route("/v1/object/sign/{bucket}/{file_path:path}", methods=["GET", "OPTIONS"])
def get_file_signed(
    request: Request,
    bucket: str,
    file_path: str,
    token: str = Query(None, description="JWT view token"),
    db: Session = Depends(get_db),
):
    """Serve file by path + JWT token (no auth). OPTIONS for CORS preflight."""
    if request.method == "OPTIONS":
        return Response(status_code=200)
    if not token:
        raise HTTPException(status_code=400, detail="Missing token")
    blob_path = unquote(file_path).strip()
    if not blob_path or ".." in blob_path:
        raise HTTPException(status_code=400, detail="Invalid path")
    if not _verify_view_token_jwt(blob_path, token):
        raise HTTPException(status_code=403, detail="Invalid or expired view link")
    try:
        _ensure_storage(db)
        content = storage.read_file(blob_path)
        filename, media_type = _file_meta_for_response(blob_path)
        return Response(
            content=content,
            media_type=media_type,
            headers={
                "Content-Disposition": f"inline; filename*=UTF-8''{quote(filename)}",
                "Content-Length": str(len(content)),
            },
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
