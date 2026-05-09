from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Any, Dict, List, Optional
from app.auth import require_jwt
from app.database import get_db

router = APIRouter()


@router.post("/entry")
def change_log_entry(
    body: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    _jwt=Depends(require_jwt),
):
    """Insert a record into the change_log table."""
    try:
        table_name = body.get("table_name") or body.get("p_table_name")
        operation = (body.get("operation") or body.get("p_operation") or "UPDATE").upper()
        record_id = body.get("record_id") or body.get("p_record_id")
        user_id = body.get("user_id") or body.get("p_user_id")
        before_data = body.get("before_data") or body.get("p_before_data")
        after_data = body.get("after_data") or body.get("p_after_data")
        changed_fields = body.get("changed_fields") or body.get("p_changed_fields")
        session_id = body.get("session_id") or body.get("p_session_id")

        if not table_name:
            raise HTTPException(status_code=400, detail="table_name is required")
        if operation not in ("INSERT", "UPDATE", "DELETE"):
            operation = "UPDATE"

        # Resolve user_id — fall back to looking up by JWT sub if not provided
        if not user_id:
            try:
                from app.auth import require_jwt
                sub = _jwt.get("sub") if isinstance(_jwt, dict) else None
                if sub:
                    from sqlalchemy import text as _text
                    row = db.execute(_text("SELECT user_id FROM users WHERE user_name = :u OR user_email = :u LIMIT 1"), {"u": sub}).fetchone()
                    if row:
                        user_id = row[0]
            except Exception:
                pass
        # If we still have no valid user_id, skip logging silently
        if not user_id:
            return {"log_id": None, "created_at": None, "skipped": True}

        # Strip "uid:" prefix sent by the frontend (getAuthUserIdForBackend returns "uid:<id>")
        if isinstance(user_id, str) and user_id.startswith("uid:"):
            user_id = user_id[4:]

        import json
        result = db.execute(
            text(
                """
                INSERT INTO change_log
                  (table_name, operation, record_id, user_id,
                   before_data, after_data, changed_fields, session_id)
                VALUES
                  (:table_name, :operation, :record_id, :user_id,
                   CAST(:before_data AS jsonb), CAST(:after_data AS jsonb), :changed_fields, :session_id)
                RETURNING log_id, created_at
                """
            ),
            {
                "table_name": table_name,
                "operation": operation,
                "record_id": str(record_id) if record_id is not None else None,
                "user_id": int(user_id) if user_id is not None else None,
                "before_data": json.dumps(before_data) if before_data is not None else None,
                "after_data": json.dumps(after_data) if after_data is not None else None,
                "changed_fields": changed_fields,
                "session_id": session_id,
            },
        )
        db.commit()
        row = result.fetchone()
        return {"log_id": row[0], "created_at": str(row[1])}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/history")
def change_log_history(
    body: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    _jwt=Depends(require_jwt),
):
    """Retrieve change history for a specific record."""
    try:
        table_name = body.get("table_name") or body.get("p_table_name")
        record_id = body.get("record_id") or body.get("p_record_id")
        limit = int(body.get("limit") or body.get("p_limit") or 100)

        if not table_name or record_id is None:
            raise HTTPException(status_code=400, detail="table_name and record_id are required")

        result = db.execute(
            text(
                """
                SELECT log_id, table_name, operation, record_id, user_id,
                       before_data, after_data, changed_fields,
                       ip_address, session_id, created_at
                FROM change_log
                WHERE table_name = :table_name AND record_id = :record_id
                ORDER BY created_at DESC
                LIMIT :limit
                """
            ),
            {"table_name": table_name, "record_id": str(record_id), "limit": limit},
        )
        rows = result.fetchall()
        return [
            {
                "log_id": r[0],
                "table_name": r[1],
                "operation": r[2],
                "record_id": r[3],
                "user_id": r[4],
                "before_data": r[5],
                "after_data": r[6],
                "changed_fields": r[7],
                "ip_address": str(r[8]) if r[8] else None,
                "session_id": r[9],
                "created_at": str(r[10]),
            }
            for r in rows
        ]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
