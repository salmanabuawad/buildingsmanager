"""
In-memory job store for async tasks (zip export, etc.). Jobs expire after TTL.
"""
import time
import uuid
from typing import Any, Dict, Optional

# job_id -> { status, result_bytes?, error?, created_at }
_store: Dict[str, Dict[str, Any]] = {}
_JOB_TTL_SECONDS = 3600  # 1 hour


def create_job() -> str:
    job_id = str(uuid.uuid4())
    _store[job_id] = {
        "status": "pending",
        "result_bytes": None,
        "error": None,
        "created_at": time.time(),
    }
    return job_id


def set_job_building(job_id: str) -> None:
    if job_id in _store:
        _store[job_id]["status"] = "building"


def set_job_ready(job_id: str, result_bytes: bytes, zip_filename: Optional[str] = None) -> None:
    if job_id in _store:
        _store[job_id]["status"] = "ready"
        _store[job_id]["result_bytes"] = result_bytes
        _store[job_id]["error"] = None
        if zip_filename:
            _store[job_id]["zip_filename"] = zip_filename


def set_job_failed(job_id: str, error: str) -> None:
    if job_id in _store:
        _store[job_id]["status"] = "failed"
        _store[job_id]["error"] = error


def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    if job_id not in _store:
        return None
    entry = _store[job_id]
    if (time.time() - entry["created_at"]) > _JOB_TTL_SECONDS:
        _store.pop(job_id, None)
        return None
    out = {
        "status": entry["status"],
        "error": entry.get("error"),
        "created_at": entry["created_at"],
    }
    if entry.get("zip_filename"):
        out["zip_filename"] = entry["zip_filename"]
    return out


def get_job_result(job_id: str) -> Optional[bytes]:
    if job_id not in _store:
        return None
    entry = _store[job_id]
    if (time.time() - entry["created_at"]) > _JOB_TTL_SECONDS:
        _store.pop(job_id, None)
        return None
    return entry.get("result_bytes")


def consume_job_result(job_id: str) -> Optional[tuple]:
    """Get (result_bytes, zip_filename?) and remove from store (one-time download)."""
    if job_id not in _store:
        return None
    entry = _store[job_id]
    if (time.time() - entry["created_at"]) > _JOB_TTL_SECONDS:
        _store.pop(job_id, None)
        return None
    data = entry.get("result_bytes")
    filename = entry.get("zip_filename")
    _store.pop(job_id, None)
    return (data, filename) if data is not None else None
