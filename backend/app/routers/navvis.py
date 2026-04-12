from __future__ import annotations

import json
import ssl
import threading
import urllib.request
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.config import settings

router = APIRouter()


# ---------------------------------------------------------------------------
# Storage helpers
# ---------------------------------------------------------------------------

def _navvis_storage() -> Path:
    p = Path(settings.FILES_BASE_PATH) / "navvis" / "scans"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _scan_dir(scan_id: str) -> Path:
    return _navvis_storage() / scan_id


def _read_meta(scan_id: str) -> dict | None:
    meta_path = _scan_dir(scan_id) / "meta.json"
    if not meta_path.exists():
        return None
    try:
        return json.loads(meta_path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _write_meta(scan_id: str, meta: dict) -> None:
    d = _scan_dir(scan_id)
    d.mkdir(parents=True, exist_ok=True)
    (d / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


# ---------------------------------------------------------------------------
# Conversion worker (runs in a daemon thread)
# ---------------------------------------------------------------------------

def _run_conversion(scan_id: str) -> None:
    from app.services.e57_reader import read_first_scan, E57ReadError
    from app.services.floorplan_generator import generate_outputs

    d = _scan_dir(scan_id)
    e57_path = d / "input.e57"
    dxf_path = d / "output.dxf"
    preview_path = d / "preview.png"
    manifest_path = d / "manifest.json"

    meta = _read_meta(scan_id) or {}
    try:
        meta["status"] = "processing"
        meta["started_at"] = datetime.utcnow().isoformat()
        _write_meta(scan_id, meta)

        e57_data = read_first_scan(e57_path)
        generate_outputs(e57_data, dxf_path, preview_path, manifest_path)

        meta["status"] = "done"
        meta["finished_at"] = datetime.utcnow().isoformat()
        _write_meta(scan_id, meta)
    except Exception as exc:
        meta["status"] = "failed"
        meta["error"] = str(exc)
        _write_meta(scan_id, meta)


def _start_conversion(scan_id: str) -> None:
    t = threading.Thread(target=_run_conversion, args=(scan_id,), daemon=True)
    t.start()


# ---------------------------------------------------------------------------
# Camera helpers
# ---------------------------------------------------------------------------

def _http_get_json(url: str, timeout: int = 10) -> any:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _normalize_camera_files(data: any, camera_url: str) -> list[dict]:
    if isinstance(data, list):
        items = data
    elif isinstance(data, dict):
        items = (
            data.get("scans")
            or data.get("files")
            or data.get("data")
            or data.get("results")
            or []
        )
    else:
        return []

    result = []
    for item in items:
        if not isinstance(item, dict):
            continue
        name = (
            item.get("name")
            or item.get("filename")
            or item.get("original_name")
            or str(item.get("id", "unknown"))
        )
        size = item.get("size") or item.get("file_size") or item.get("fileSize") or 0
        url = (
            item.get("download_url")
            or item.get("downloadUrl")
            or item.get("url")
            or item.get("e57_url")
            or ""
        )
        if url and not url.startswith("http"):
            url = camera_url.rstrip("/") + url
        if not str(name).lower().endswith(".e57"):
            name = str(name) + ".e57"
        result.append({"name": str(name), "size": int(size), "download_url": url})
    return result


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/camera/files")
def list_camera_files(camera_url: str):
    """Try common NavVis camera API paths and return a list of E57 files."""
    candidate_paths = [
        "/api/v1/scans",
        "/api/scans",
        "/api/v1/files",
        "/api/files",
        "/scans",
        "/files",
    ]
    last_error = "No reachable endpoint found"
    for path in candidate_paths:
        try:
            url = camera_url.rstrip("/") + path
            data = _http_get_json(url)
            files = _normalize_camera_files(data, camera_url)
            return {"files": files, "endpoint": path, "total": len(files)}
        except Exception as exc:
            last_error = str(exc)
            continue

    raise HTTPException(status_code=502, detail=f"Could not connect to camera: {last_error}")


@router.post("/scans/upload")
async def upload_scan(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """Upload an E57 file directly and queue conversion to DXF."""
    if not (file.filename or "").lower().endswith(".e57"):
        raise HTTPException(status_code=400, detail="Only .e57 files are supported")

    scan_id = str(uuid.uuid4())
    d = _scan_dir(scan_id)
    d.mkdir(parents=True, exist_ok=True)

    content = await file.read()
    (d / "input.e57").write_bytes(content)

    meta = {
        "scan_id": scan_id,
        "original_name": file.filename,
        "file_size": len(content),
        "status": "queued",
        "created_at": datetime.utcnow().isoformat(),
    }
    _write_meta(scan_id, meta)
    background_tasks.add_task(_start_conversion, scan_id)

    return {"scan_id": scan_id, "status": "queued", "original_name": file.filename}


@router.post("/scans/upload-from-camera")
def upload_from_camera(
    background_tasks: BackgroundTasks,
    camera_url: str,
    file_url: str,
    filename: str,
):
    """Download a file from the camera and queue conversion."""
    scan_id = str(uuid.uuid4())
    d = _scan_dir(scan_id)
    d.mkdir(parents=True, exist_ok=True)

    meta = {
        "scan_id": scan_id,
        "original_name": filename,
        "camera_url": camera_url,
        "status": "downloading",
        "created_at": datetime.utcnow().isoformat(),
    }
    _write_meta(scan_id, meta)

    def _download_and_convert() -> None:
        try:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            with urllib.request.urlopen(file_url, timeout=300, context=ctx) as resp:
                content = resp.read()
            (d / "input.e57").write_bytes(content)
            meta["file_size"] = len(content)
            meta["status"] = "queued"
            _write_meta(scan_id, meta)
            _run_conversion(scan_id)
        except Exception as exc:
            meta["status"] = "failed"
            meta["error"] = f"Download failed: {exc}"
            _write_meta(scan_id, meta)

    t = threading.Thread(target=_download_and_convert, daemon=True)
    t.start()

    return {"scan_id": scan_id, "status": "downloading", "original_name": filename}


@router.get("/scans")
def list_scans():
    """List all NavVis scans ordered by most recent first."""
    storage = _navvis_storage()
    scans = []
    for scan_dir in storage.iterdir():
        if not scan_dir.is_dir():
            continue
        meta = _read_meta(scan_dir.name)
        if meta:
            scans.append(meta)
    scans.sort(key=lambda s: s.get("created_at", ""), reverse=True)
    return {"scans": scans, "total": len(scans)}


@router.get("/scans/{scan_id}")
def get_scan(scan_id: str):
    meta = _read_meta(scan_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Scan not found")
    return meta


@router.get("/scans/{scan_id}/dxf")
def download_dxf(scan_id: str):
    dxf_path = _scan_dir(scan_id) / "output.dxf"
    if not dxf_path.exists():
        raise HTTPException(status_code=404, detail="DXF not ready yet")
    meta = _read_meta(scan_id) or {}
    filename = (meta.get("original_name") or "output").replace(".e57", "") + ".dxf"
    return FileResponse(str(dxf_path), filename=filename, media_type="application/octet-stream")


@router.get("/scans/{scan_id}/preview")
def download_preview(scan_id: str):
    preview_path = _scan_dir(scan_id) / "preview.png"
    if not preview_path.exists():
        raise HTTPException(status_code=404, detail="Preview not ready yet")
    return FileResponse(str(preview_path), media_type="image/png")


@router.delete("/scans/{scan_id}")
def delete_scan(scan_id: str):
    import shutil
    d = _scan_dir(scan_id)
    if not d.exists():
        raise HTTPException(status_code=404, detail="Scan not found")
    shutil.rmtree(str(d))
    return {"success": True}
