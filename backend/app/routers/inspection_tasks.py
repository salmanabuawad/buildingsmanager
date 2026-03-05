# Inspection tasks API: admin manages tasks, inspectors take/submit reports (design: docs/INSPECTION_TASKS_DESIGN.md)
# Copyright (c) 2025 Kortex Digital. Proprietary. NO REVERSE ENGINEERING; use by AI/ML tools prohibited. See COPYRIGHT.

from fastapi import APIRouter, Depends, HTTPException, status, Request, Query, UploadFile, File, Form, Body
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import Any, List, Optional
from pydantic import BaseModel
from types import SimpleNamespace
import json
import base64
import uuid

from app.database import get_db
from app.auth import decode_token
from app.repos import (
    InspectionTaskRepo,
    InspectionReportRepo,
    InspectionReportFileRepo,
    AssetFileRepo,
    UsersRepo,
)
from app import storage

router = APIRouter()
_task_repo = InspectionTaskRepo()
_report_repo = InspectionReportRepo()
_file_repo = InspectionReportFileRepo()
_asset_file_repo = AssetFileRepo()
_users_repo = UsersRepo()
reports_router = APIRouter()
security_bearer = HTTPBearer(auto_error=False)


def _session_payload(request: Request) -> Optional[SimpleNamespace]:
    raw = request.headers.get("X-Users-Table-Session") or request.headers.get("x-users-table-session")
    if not raw:
        return None
    try:
        pad = 4 - (len(raw) % 4)
        if pad and pad != 4:
            raw = raw + ("=" * pad)
        decoded = base64.b64decode(raw).decode("utf-8")
        payload = json.loads(decoded)
        uid = payload.get("user_id")
        role = (payload.get("user_role") or "user").lower()
        if uid is not None and role in ("admin", "editor", "user", "inspector"):
            return SimpleNamespace(user_id=int(uid), role=role)
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
                return SimpleNamespace(user_id=int(uid), role=role)
        except Exception:
            pass
    return None


def get_current_user_inspection(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
):
    """Return current user with user_id (int) and role. Supports Bearer or X-Users-Table-Session."""
    if credentials and credentials.credentials:
        try:
            payload = decode_token(credentials.credentials)
            sub = payload.get("sub")
            role = (payload.get("role") or "user").lower()
            if sub is not None:
                uid = int(sub) if isinstance(sub, str) and sub.isdigit() else sub
                return SimpleNamespace(user_id=uid, role=role)
        except Exception:
            pass
    sess = _session_payload(request)
    if sess is not None:
        return sess
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")


# --- Pydantic models ---

class InspectionTaskCreate(BaseModel):
    title: Optional[str] = None
    building_number: int
    asset_ids: Optional[List[int]] = None
    assigned_to: Optional[int] = None
    note: Optional[str] = None
    priority: Optional[str] = None  # high, medium, low (Supabase-aligned)


class InspectionTaskUpdate(BaseModel):
    title: Optional[str] = None
    assigned_to: Optional[int] = None
    status: Optional[str] = None
    note: Optional[str] = None
    priority: Optional[str] = None  # high, medium, low (Supabase-aligned)


class ReturnTaskBody(BaseModel):
    comment: Optional[str] = None


class SubmitTaskBody(BaseModel):
    comment: Optional[str] = None


def _add_history(task_id: int, created_by: Optional[int], action: str, comment_text: Optional[str] = None) -> None:
    if action not in HISTORY_ACTIONS:
        return
    _task_repo.add_history(task_id, created_by, action, comment_text)


VALID_STATUSES = ("new", "in_progress", "pending_approval", "approved", "cancelled")
VALID_PRIORITIES = ("high", "medium", "low")
HISTORY_ACTIONS = ("created", "taken", "submitted", "returned", "approved", "cancelled")


def _row_to_task(row: dict) -> dict:
    out = dict(row)
    if "asset_ids" in out and out["asset_ids"] is not None and hasattr(out["asset_ids"], "__iter__") and not isinstance(out["asset_ids"], (str, bytes)):
        out["asset_ids"] = list(out["asset_ids"])
    return out


# --- List tasks (admin: all with filters; inspector: only assigned) ---

@router.get("/", response_model=List[dict])
def list_inspection_tasks(
    status: Optional[str] = Query(None),
    assigned_to: Optional[int] = Query(None),
    building_number: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: SimpleNamespace = Depends(get_current_user_inspection),
):
    role = getattr(current_user, "role", "") or "user"
    user_id = getattr(current_user, "user_id", None)
    if role not in ("admin", "editor", "inspector"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    conditions = ["1=1"]
    params: dict = {"skip": skip, "limit": limit}
    if role == "inspector":
        if user_id is None:
            raise HTTPException(status_code=403, detail="Inspector must be identified")
        conditions.append("t.assigned_to = :uid")
        params["uid"] = user_id
    if status:
        if status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        conditions.append("t.status = :status")
        params["status"] = status
    if assigned_to is not None and role in ("admin", "editor"):
        conditions.append("t.assigned_to = :assigned_to")
        params["assigned_to"] = assigned_to
    if building_number is not None:
        conditions.append("t.building_number = :building_number")
        params["building_number"] = building_number

    where = " AND ".join(conditions)
    sql = f"""
    SELECT t.id, t.title, t.building_number, t.asset_ids, t.assigned_to, t.status,
           t.created_at, t.created_by, t.updated_at, t.taken_at, t.submitted_at, t.approved_at, t.approved_by, t.note
    FROM inspection_tasks t
    WHERE {where}
    ORDER BY t.created_at DESC
    OFFSET :skip LIMIT :limit
    """
    rows = _task_repo.list_with_filters(conditions, params, skip=skip, limit=limit)
    return [_row_to_task(r) for r in rows]


# --- Get one task (with report and files) ---

@router.get("/{task_id}", response_model=dict)
def get_inspection_task(
    task_id: int,
    current_user: SimpleNamespace = Depends(get_current_user_inspection),
):
    role = getattr(current_user, "role", "") or "user"
    user_id = getattr(current_user, "user_id", None)
    if role not in ("admin", "editor", "inspector"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    task = _task_repo.get_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task = _row_to_task(task)
    if role == "inspector" and task.get("assigned_to") != user_id:
        raise HTTPException(status_code=403, detail="Not assigned to this task")

    reports = _report_repo.get_by_task_id(task_id)
    task["report"] = _row_to_task(reports[0]) if reports else None
    if task.get("report"):
        rid = task["report"]["id"]
        files = _file_repo.get_by_report_id(rid)
        task["report"]["files"] = [dict(f) for f in files]
    else:
        task["report"] = None
    history = _task_repo.get_history(task_id)
    task["history"] = [dict(h) for h in history]
    return task


# --- Create task (admin only) ---

@router.post("/", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_inspection_task(
    body: InspectionTaskCreate,
    current_user: SimpleNamespace = Depends(get_current_user_inspection),
):
    if getattr(current_user, "role", "") not in ("admin", "editor"):
        raise HTTPException(status_code=403, detail="Only admin/editor can create tasks")
    user_id = getattr(current_user, "user_id")
    if user_id is None:
        raise HTTPException(status_code=403, detail="User id required")

    # Check building exists
    if not _task_repo.building_exists(body.building_number):
        raise HTTPException(status_code=400, detail="Building not found")

    asset_ids = body.asset_ids if body.asset_ids is not None else []
    priority = body.priority if body.priority in VALID_PRIORITIES else "medium"
    rows = _task_repo.create(
        body.title, body.building_number, asset_ids,
        body.assigned_to, user_id, body.note, priority,
    )
    if not rows:
        raise HTTPException(status_code=500, detail="Insert failed")
    new_id = rows[0]["id"]
    _add_history(new_id, user_id, "created")
    return get_inspection_task(new_id, current_user)


# --- Update task (admin: assign, status; inspector: limited) ---

@router.patch("/{task_id}", response_model=dict)
def update_inspection_task(
    task_id: int,
    body: InspectionTaskUpdate,
    current_user: SimpleNamespace = Depends(get_current_user_inspection),
):
    role = getattr(current_user, "role", "") or "user"
    user_id = getattr(current_user, "user_id", None)
    if role not in ("admin", "editor", "inspector"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    task = _task_repo.get_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if role == "inspector" and task.get("assigned_to") != user_id:
        raise HTTPException(status_code=403, detail="Not assigned to this task")

    updates = []
    params: dict = {"id": task_id}
    if body.title is not None:
        updates.append("title = :title")
        params["title"] = body.title
    if body.assigned_to is not None and role in ("admin", "editor"):
        updates.append("assigned_to = :assigned_to")
        params["assigned_to"] = body.assigned_to
    if body.status is not None:
        if body.status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        if role not in ("admin", "editor"):
            raise HTTPException(status_code=403, detail="Only admin can change status")
        updates.append("status = :status")
        params["status"] = body.status
    if body.note is not None:
        updates.append("note = :note")
        params["note"] = body.note
    if body.priority is not None and role in ("admin", "editor"):
        if body.priority not in VALID_PRIORITIES:
            raise HTTPException(status_code=400, detail="Invalid priority")
        updates.append("priority = :priority")
        params["priority"] = body.priority
    if not updates:
        return get_inspection_task(task_id, current_user)
    updates.append("updated_at = now()")
    _task_repo.update(task_id, updates, params)
    if body.status is not None and body.status == "cancelled" and role in ("admin", "editor") and user_id is not None:
        _add_history(task_id, user_id, "cancelled")
    return get_inspection_task(task_id, current_user)


# --- Take task (inspector: new -> in_progress) ---

@router.post("/{task_id}/take", response_model=dict)
def take_inspection_task(
    task_id: int,
    current_user: SimpleNamespace = Depends(get_current_user_inspection),
):
    role = getattr(current_user, "role", "") or "user"
    user_id = getattr(current_user, "user_id", None)
    if role not in ("admin", "editor", "inspector"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    if user_id is None:
        raise HTTPException(status_code=403, detail="User id required")

    task = _task_repo.get_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task["status"] != "new":
        raise HTTPException(status_code=400, detail="Task is not in new status")
    if task.get("assigned_to") and task["assigned_to"] != user_id:
        raise HTTPException(status_code=403, detail="Task assigned to another inspector")
    if not task.get("assigned_to") and role == "inspector":
        _task_repo.update(task_id, ["assigned_to = :uid", "status = 'in_progress'", "taken_at = now()", "updated_at = now()"], {"uid": user_id})
    else:
        _task_repo.update(task_id, ["status = 'in_progress'", "taken_at = now()", "updated_at = now()"], {})
    _add_history(task_id, user_id, "taken")
    return get_inspection_task(task_id, current_user)


# --- Submit for approval (in_progress -> pending_approval) ---

@router.post("/{task_id}/submit", response_model=dict)
def submit_inspection_task(
    task_id: int,
    body: Optional[SubmitTaskBody] = Body(None),
    current_user: SimpleNamespace = Depends(get_current_user_inspection),
):
    role = getattr(current_user, "role", "") or "user"
    user_id = getattr(current_user, "user_id", None)
    if role not in ("admin", "editor", "inspector"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    task = _task_repo.get_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task["status"] != "in_progress":
        raise HTTPException(status_code=400, detail="Task must be in progress to submit")
    if role == "inspector" and task.get("assigned_to") != user_id:
        raise HTTPException(status_code=403, detail="Not your task")
    _task_repo.update(task_id, ["status = 'pending_approval'", "submitted_at = now()", "updated_at = now()"], {})
    comment = (body.comment if body else None) or None
    _add_history(task_id, user_id, "submitted", comment_text=comment)
    return get_inspection_task(task_id, current_user)


# --- Approve (admin: pending_approval -> approved) ---

def _copy_inspection_files_to_assets(task_id: int, approved_by_user_id: Optional[int] = None) -> None:
    """On approve: copy report files with asset_ids to asset_files for each asset."""
    report_rows = _report_repo.get_by_task_id(task_id)
    if not report_rows:
        return
    report_id = report_rows[0]["id"]
    try:
        rows = _file_repo.get_by_report_id(report_id)
    except Exception:
        return
    user_name = None
    if approved_by_user_id:
        user_name = _users_repo.get_user_name_by_id(approved_by_user_id)
    for row in rows:
        aids = row.get("asset_ids")
        if not aids or (hasattr(aids, "__len__") and len(aids) == 0):
            continue
        if isinstance(aids, str):
            try:
                aids = json.loads(aids) if aids.startswith("[") else [int(x) for x in aids.split(",") if x.strip()]
            except (json.JSONDecodeError, ValueError):
                continue
        path = row.get("file_path") or ""
        fname = row.get("file_name") or path.split("/")[-1]
        ftype = row.get("file_type")
        file_url = path
        for aid in aids:
            try:
                _asset_file_repo.insert(int(aid), file_url, fname, ftype, user_name)
            except Exception:
                pass


@router.post("/{task_id}/approve", response_model=dict)
def approve_inspection_task(
    task_id: int,
    current_user: SimpleNamespace = Depends(get_current_user_inspection),
):
    if getattr(current_user, "role", "") not in ("admin", "editor"):
        raise HTTPException(status_code=403, detail="Only admin/editor can approve")
    user_id = getattr(current_user, "user_id", None)
    if user_id is None:
        raise HTTPException(status_code=403, detail="User id required")

    task = _task_repo.get_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task["status"] != "pending_approval":
        raise HTTPException(status_code=400, detail="Task must be pending approval")
    _task_repo.update(task_id, ["status = 'approved'", "approved_at = now()", "approved_by = :uid", "updated_at = now()"], {"uid": user_id})
    _add_history(task_id, user_id, "approved")
    _copy_inspection_files_to_assets(task_id, approved_by_user_id=user_id)
    return get_inspection_task(task_id, current_user)


# --- Return to inspector (admin: pending_approval -> in_progress, with optional comment) ---

# --- Create access token (admin: one-time login link for inspector) ---

class CreateAccessTokenBody(BaseModel):
    user_id: int


@router.post("/{task_id}/access-token", response_model=dict)
def create_inspection_task_access_token(
    task_id: int,
    body: CreateAccessTokenBody,
    current_user: SimpleNamespace = Depends(get_current_user_inspection),
):
    """Create one-time token for inspector to access task without login. Admin/editor only."""
    if getattr(current_user, "role", "") not in ("admin", "editor"):
        raise HTTPException(status_code=403, detail="Only admin/editor can create access tokens")
    user_id = getattr(current_user, "user_id", None)
    if user_id is None:
        raise HTTPException(status_code=403, detail="User id required")

    task = _task_repo.get_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if body.user_id != task.get("assigned_to"):
        raise HTTPException(status_code=400, detail="Token can only be created for the assigned inspector")
    user_row = _users_repo.get_user_for_inspector_check(body.user_id)
    if not user_row or (user_row.get("user_role") or "").lower() != "inspector":
        raise HTTPException(status_code=400, detail="User must be an active inspector")

    import secrets
    from app.repos import InspectionTaskAccessTokenRepo
    token = secrets.token_urlsafe(32)
    InspectionTaskAccessTokenRepo().create(task_id, body.user_id, token)
    return {"token": token, "expires_in_days": 7}


@router.post("/{task_id}/return", response_model=dict)
def return_inspection_task(
    task_id: int,
    body: Optional[ReturnTaskBody] = Body(None),
    current_user: SimpleNamespace = Depends(get_current_user_inspection),
):
    if getattr(current_user, "role", "") not in ("admin", "editor"):
        raise HTTPException(status_code=403, detail="Only admin/editor can return task")
    user_id = getattr(current_user, "user_id", None)

    task = _task_repo.get_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task["status"] != "pending_approval":
        raise HTTPException(status_code=400, detail="Task must be pending approval to return")
    _task_repo.update(task_id, ["status = 'in_progress'", "updated_at = now()"], {})
    comment = (body.comment if body else None) or None
    _add_history(task_id, user_id, "returned", comment_text=comment)
    return get_inspection_task(task_id, current_user)


# ---------- Inspection reports (reports_router mounted at /api/inspection-reports) ----------

@reports_router.get("", response_model=dict)
def get_report_by_task(
    task_id: int = Query(..., alias="task_id"),
    current_user: SimpleNamespace = Depends(get_current_user_inspection),
):
    role = getattr(current_user, "role", "") or "user"
    user_id = getattr(current_user, "user_id", None)
    if role not in ("admin", "editor", "inspector"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    task = _task_repo.get_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if role == "inspector" and task.get("assigned_to") != user_id:
        raise HTTPException(status_code=403, detail="Not assigned to this task")

    reports = _report_repo.get_by_task_id(task_id)
    if not reports:
        return {"task_id": task_id, "report": None}
    report = dict(reports[0])
    files = _file_repo.get_by_report_id(report["id"])
    report["files"] = [dict(f) for f in files]
    return {"task_id": task_id, "report": report}


class InspectionReportUpsertBody(BaseModel):
    task_id: int
    report_text: Optional[str] = None


@reports_router.put("", response_model=dict)
def upsert_inspection_report(
    body: InspectionReportUpsertBody,
    current_user: SimpleNamespace = Depends(get_current_user_inspection),
):
    role = getattr(current_user, "role", "") or "user"
    user_id = getattr(current_user, "user_id", None)
    if role not in ("admin", "editor", "inspector"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    task = _task_repo.get_by_id(body.task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if role == "inspector" and task.get("assigned_to") != user_id:
        raise HTTPException(status_code=403, detail="Not assigned to this task")

    rid = _report_repo.upsert(body.task_id, body.report_text, user_id)
    if rid is None:
        raise HTTPException(status_code=500, detail="Report upsert failed")
    report = _report_repo.get_by_id(rid) or {}
    report = dict(report)
    report["files"] = []
    files = _file_repo.get_by_report_id(rid)
    report["files"] = [dict(f) for f in files]
    return {"task_id": body.task_id, "report": report}


@reports_router.get("/{report_id}/files", response_model=List[dict])
def list_inspection_report_files(
    report_id: int,
    current_user: SimpleNamespace = Depends(get_current_user_inspection),
):
    role = getattr(current_user, "role", "") or "user"
    user_id = getattr(current_user, "user_id", None)
    if role not in ("admin", "editor", "inspector"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    report = _report_repo.get_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    task_id = report["task_id"]
    task = _task_repo.get_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if role == "inspector" and task.get("assigned_to") != user_id:
        raise HTTPException(status_code=403, detail="Not assigned to this task")
    rows = _file_repo.get_by_report_id(report_id)
    return [dict(r) for r in rows]


@reports_router.post("/{report_id}/files", response_model=dict)
async def upload_inspection_report_file(
    report_id: int,
    file: UploadFile = File(...),
    asset_ids: Optional[str] = Form(None),
    current_user: SimpleNamespace = Depends(get_current_user_inspection),
):
    role = getattr(current_user, "role", "") or "user"
    user_id = getattr(current_user, "user_id", None)
    if role not in ("admin", "editor", "inspector"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    report = _report_repo.get_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    task_id = report["task_id"]
    task = _task_repo.get_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if role == "inspector" and task.get("assigned_to") != user_id:
        raise HTTPException(status_code=403, detail="Not assigned to this task")

    ext = (file.filename or "").split(".")[-1] if "." in (file.filename or "") else "bin"
    logical_path = f"inspections/{report_id}/{uuid.uuid4()}.{ext}"
    content = await file.read()
    try:
        storage.write_file(logical_path, content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Storage write failed: {str(e)}")

    file_type = (file.content_type or "").strip() or "application/octet-stream"
    file_name = file.filename or logical_path.split("/")[-1]
    file_size = len(content)

    # Parse asset_ids (e.g. "1,2,3" or "[1,2,3]")
    aids: List[int] = []
    if asset_ids and asset_ids.strip():
        raw = asset_ids.strip()
        if raw.startswith("["):
            try:
                aids = [int(x) for x in json.loads(raw) if isinstance(x, (int, float))]
            except (json.JSONDecodeError, ValueError):
                pass
        else:
            for p in raw.split(","):
                try:
                    aids.append(int(p.strip()))
                except ValueError:
                    pass

    fid = _file_repo.insert(report_id, logical_path, file_name, file_type, user_id, aids)
    return {
        "id": fid,
        "report_id": report_id,
        "file_path": logical_path,
        "file_name": file_name,
        "file_type": file_type,
        "uploaded_at": None,
        "uploaded_by": user_id,
        "asset_ids": aids,
    }


@reports_router.delete("/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_inspection_report_file(
    file_id: int,
    current_user: SimpleNamespace = Depends(get_current_user_inspection),
):
    if getattr(current_user, "role", "") not in ("admin", "editor", "inspector"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    row = _file_repo.get_by_id(file_id)
    if not row:
        raise HTTPException(status_code=404, detail="File not found")
    logical_path = row["file_path"]
    try:
        storage.delete_file(logical_path)
    except Exception:
        pass
    _file_repo.delete(file_id)
    return None
