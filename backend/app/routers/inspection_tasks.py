"""
Inspection tasks & reports router.
Matches the frontend API in src/lib/inspectionApi.ts.
"""

import json
import os
import uuid
from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import require_jwt, create_access_token
from app.config import settings
from app.database import get_db

router = APIRouter()
reports_router = APIRouter()


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _parse_uid(sub: str | None) -> int | None:
    """Extract integer user_id from JWT sub claim ('uid:123' or plain int)."""
    if sub is None:
        return None
    s = str(sub).strip()
    if s.startswith("uid:"):
        try:
            return int(s[4:])
        except ValueError:
            return None
    try:
        return int(s)
    except (ValueError, TypeError):
        return None


def _ser(v):
    if v is None:
        return None
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return float(v)
    return v


def _row_to_dict(row) -> dict:
    m = row._mapping
    return {k: _ser(m[k]) for k in m.keys()}


def _get_user_id(payload: dict) -> int:
    uid = _parse_uid(payload.get("sub"))
    if uid is None:
        raise HTTPException(status_code=401, detail="Invalid user token")
    return uid


# ---------------------------------------------------------------------------
# Enrich a task dict with report (+ files) and history
# ---------------------------------------------------------------------------

def _enrich_task(db: Session, task: dict) -> dict:
    tid = task["id"]

    # report
    rep_row = db.execute(
        text("SELECT * FROM inspection_reports WHERE task_id = :tid"), {"tid": tid}
    ).fetchone()
    if rep_row:
        report = _row_to_dict(rep_row)
        files = db.execute(
            text("SELECT * FROM inspection_report_files WHERE report_id = :rid ORDER BY uploaded_at"),
            {"rid": report["id"]},
        ).fetchall()
        report["files"] = [_row_to_dict(f) for f in files]
        # parse asset_ids jsonb for each file
        for f in report["files"]:
            if isinstance(f.get("asset_ids"), str):
                f["asset_ids"] = json.loads(f["asset_ids"])
        task["report"] = report
    else:
        task["report"] = None

    # history
    hist = db.execute(
        text("SELECT * FROM inspection_task_history WHERE task_id = :tid ORDER BY created_at"),
        {"tid": tid},
    ).fetchall()
    task["history"] = [_row_to_dict(h) for h in hist]

    # parse asset_ids jsonb
    if isinstance(task.get("asset_ids"), str):
        task["asset_ids"] = json.loads(task["asset_ids"])

    return task


# ---------------------------------------------------------------------------
# TASKS CRUD
# ---------------------------------------------------------------------------

@router.get("/")
def list_tasks(
    status_filter: Optional[str] = Query(None, alias="status"),
    assigned_to: Optional[int] = None,
    building_number: Optional[int] = None,
    skip: int = 0,
    limit: int = 500,
    payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    clauses = []
    params: dict = {"skip": skip, "limit": limit}
    if status_filter:
        clauses.append("status = :status")
        params["status"] = status_filter
    if assigned_to is not None:
        clauses.append("assigned_to = :assigned_to")
        params["assigned_to"] = assigned_to
    if building_number is not None:
        clauses.append("building_number = :building_number")
        params["building_number"] = building_number

    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    sql = f"SELECT * FROM inspection_tasks{where} ORDER BY created_at DESC OFFSET :skip LIMIT :limit"
    rows = db.execute(text(sql), params).fetchall()
    tasks = [_row_to_dict(r) for r in rows]
    for t in tasks:
        _enrich_task(db, t)
    return tasks


@router.get("/{task_id}")
def get_task(
    task_id: int,
    payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    row = db.execute(text("SELECT * FROM inspection_tasks WHERE id = :id"), {"id": task_id}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    return _enrich_task(db, _row_to_dict(row))


@router.post("/", status_code=201)
def create_task(
    body: dict,
    payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    uid = _get_user_id(payload)
    asset_ids = json.dumps(body.get("asset_ids", []))
    row = db.execute(
        text("""
            INSERT INTO inspection_tasks (title, building_number, asset_ids, assigned_to, note, priority, created_by, status)
            VALUES (:title, :building_number, :asset_ids::jsonb, :assigned_to, :note, :priority, :created_by, 'open')
            RETURNING *
        """),
        {
            "title": body.get("title"),
            "building_number": body["building_number"],
            "asset_ids": asset_ids,
            "assigned_to": body.get("assigned_to"),
            "note": body.get("note"),
            "priority": body.get("priority", "medium"),
            "created_by": uid,
        },
    ).fetchone()
    db.commit()
    task = _row_to_dict(row)
    # add history entry
    db.execute(
        text("""
            INSERT INTO inspection_task_history (task_id, created_by, action)
            VALUES (:tid, :uid, 'created')
        """),
        {"tid": task["id"], "uid": uid},
    )
    db.commit()
    return _enrich_task(db, task)


@router.patch("/{task_id}")
def update_task(
    task_id: int,
    body: dict,
    payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    uid = _get_user_id(payload)
    allowed = {"title", "assigned_to", "status", "note", "priority"}
    sets = []
    params: dict = {"id": task_id}
    for k, v in body.items():
        if k in allowed:
            sets.append(f"{k} = :{k}")
            params[k] = v
    if not sets:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    sets.append("updated_at = now()")
    sql = f"UPDATE inspection_tasks SET {', '.join(sets)} WHERE id = :id RETURNING *"
    row = db.execute(text(sql), params).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    db.execute(
        text("INSERT INTO inspection_task_history (task_id, created_by, action) VALUES (:tid, :uid, 'updated')"),
        {"tid": task_id, "uid": uid},
    )
    db.commit()
    return _enrich_task(db, _row_to_dict(row))


@router.post("/{task_id}/take")
def take_task(
    task_id: int,
    payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    uid = _get_user_id(payload)
    row = db.execute(
        text("""
            UPDATE inspection_tasks
            SET status = 'in_progress', assigned_to = :uid, taken_at = now(), updated_at = now()
            WHERE id = :id RETURNING *
        """),
        {"id": task_id, "uid": uid},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    db.execute(
        text("INSERT INTO inspection_task_history (task_id, created_by, action) VALUES (:tid, :uid, 'taken')"),
        {"tid": task_id, "uid": uid},
    )
    db.commit()
    return _enrich_task(db, _row_to_dict(row))


@router.post("/{task_id}/submit")
def submit_task(
    task_id: int,
    body: dict = {},
    payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    uid = _get_user_id(payload)
    row = db.execute(
        text("""
            UPDATE inspection_tasks
            SET status = 'submitted', submitted_at = now(), updated_at = now()
            WHERE id = :id RETURNING *
        """),
        {"id": task_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    db.execute(
        text("INSERT INTO inspection_task_history (task_id, created_by, action, comment_text) VALUES (:tid, :uid, 'submitted', :comment)"),
        {"tid": task_id, "uid": uid, "comment": body.get("comment")},
    )
    db.commit()
    return _enrich_task(db, _row_to_dict(row))


@router.post("/{task_id}/approve")
def approve_task(
    task_id: int,
    payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    uid = _get_user_id(payload)
    row = db.execute(
        text("""
            UPDATE inspection_tasks
            SET status = 'approved', approved_at = now(), approved_by = :uid, updated_at = now()
            WHERE id = :id RETURNING *
        """),
        {"id": task_id, "uid": uid},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    db.execute(
        text("INSERT INTO inspection_task_history (task_id, created_by, action) VALUES (:tid, :uid, 'approved')"),
        {"tid": task_id, "uid": uid},
    )
    db.commit()
    return _enrich_task(db, _row_to_dict(row))


@router.post("/{task_id}/return")
def return_task(
    task_id: int,
    body: dict = {},
    payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    uid = _get_user_id(payload)
    row = db.execute(
        text("""
            UPDATE inspection_tasks
            SET status = 'returned', updated_at = now()
            WHERE id = :id RETURNING *
        """),
        {"id": task_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    db.execute(
        text("INSERT INTO inspection_task_history (task_id, created_by, action, comment_text) VALUES (:tid, :uid, 'returned', :comment)"),
        {"tid": task_id, "uid": uid, "comment": body.get("comment")},
    )
    db.commit()
    return _enrich_task(db, _row_to_dict(row))


@router.post("/{task_id}/access-token")
def create_inspector_access_token(
    task_id: int,
    body: dict,
    payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    role = payload.get("role", "")
    if role not in ("admin", "dev"):
        raise HTTPException(status_code=403, detail="Admin only")
    user_id = body.get("user_id")
    if user_id is None:
        raise HTTPException(status_code=400, detail="user_id required")
    expires = timedelta(days=7)
    token = create_access_token(
        data={"sub": f"uid:{user_id}", "role": "inspector", "task_id": task_id},
        expires_delta=expires,
    )
    return {"token": token, "expires_in_days": 7}


# ---------------------------------------------------------------------------
# REPORTS
# ---------------------------------------------------------------------------

@reports_router.get("/")
def get_report_by_task(
    task_id: int = Query(...),
    payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text("SELECT * FROM inspection_reports WHERE task_id = :tid"), {"tid": task_id}
    ).fetchone()
    if not row:
        return {"task_id": task_id, "report": None}
    report = _row_to_dict(row)
    files = db.execute(
        text("SELECT * FROM inspection_report_files WHERE report_id = :rid ORDER BY uploaded_at"),
        {"rid": report["id"]},
    ).fetchall()
    report["files"] = [_row_to_dict(f) for f in files]
    for f in report["files"]:
        if isinstance(f.get("asset_ids"), str):
            f["asset_ids"] = json.loads(f["asset_ids"])
    return {"task_id": task_id, "report": report}


@reports_router.put("/")
def upsert_report(
    body: dict,
    payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    uid = _get_user_id(payload)
    task_id = body.get("task_id")
    if task_id is None:
        raise HTTPException(status_code=400, detail="task_id required")
    report_text = body.get("report_text")

    row = db.execute(
        text("""
            INSERT INTO inspection_reports (task_id, report_text, reported_by, reported_at)
            VALUES (:tid, :rt, :uid, now())
            ON CONFLICT (task_id) DO UPDATE SET report_text = EXCLUDED.report_text, reported_by = EXCLUDED.reported_by, reported_at = now()
            RETURNING *
        """),
        {"tid": task_id, "rt": report_text, "uid": uid},
    ).fetchone()
    db.commit()
    report = _row_to_dict(row)
    files = db.execute(
        text("SELECT * FROM inspection_report_files WHERE report_id = :rid ORDER BY uploaded_at"),
        {"rid": report["id"]},
    ).fetchall()
    report["files"] = [_row_to_dict(f) for f in files]
    return {"task_id": task_id, "report": report}


@reports_router.get("/{report_id}/files")
def list_report_files(
    report_id: int,
    payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        text("SELECT * FROM inspection_report_files WHERE report_id = :rid ORDER BY uploaded_at"),
        {"rid": report_id},
    ).fetchall()
    results = [_row_to_dict(r) for r in rows]
    for f in results:
        if isinstance(f.get("asset_ids"), str):
            f["asset_ids"] = json.loads(f["asset_ids"])
    return results


@reports_router.post("/{report_id}/files", status_code=201)
async def upload_report_file(
    report_id: int,
    file: UploadFile = File(...),
    asset_ids: Optional[str] = Form(None),
    payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    uid = _get_user_id(payload)

    # ensure report exists
    rpt = db.execute(text("SELECT id FROM inspection_reports WHERE id = :rid"), {"rid": report_id}).fetchone()
    if not rpt:
        raise HTTPException(status_code=404, detail="Report not found")

    # save file to disk
    upload_dir = os.path.join(settings.FILES_BASE_PATH, "inspection-reports", str(report_id))
    os.makedirs(upload_dir, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex}_{file.filename or 'file'}"
    dest = os.path.join(upload_dir, safe_name)
    contents = await file.read()
    with open(dest, "wb") as f:
        f.write(contents)

    rel_path = f"inspection-reports/{report_id}/{safe_name}"
    parsed_ids = json.dumps(json.loads(asset_ids)) if asset_ids else "[]"

    row = db.execute(
        text("""
            INSERT INTO inspection_report_files (report_id, file_path, file_name, file_type, uploaded_by, asset_ids)
            VALUES (:rid, :fp, :fn, :ft, :uid, :aids::jsonb)
            RETURNING *
        """),
        {
            "rid": report_id,
            "fp": rel_path,
            "fn": file.filename,
            "ft": file.content_type,
            "uid": uid,
            "aids": parsed_ids,
        },
    ).fetchone()
    db.commit()
    result = _row_to_dict(row)
    if isinstance(result.get("asset_ids"), str):
        result["asset_ids"] = json.loads(result["asset_ids"])
    return result


@reports_router.delete("/files/{file_id}")
def delete_report_file(
    file_id: int,
    payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text("SELECT * FROM inspection_report_files WHERE id = :fid"), {"fid": file_id}
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="File not found")

    fdata = _row_to_dict(row)
    # delete from disk
    full_path = os.path.join(settings.FILES_BASE_PATH, fdata["file_path"])
    if os.path.exists(full_path):
        os.remove(full_path)

    db.execute(text("DELETE FROM inspection_report_files WHERE id = :fid"), {"fid": file_id})
    db.commit()
    return None
