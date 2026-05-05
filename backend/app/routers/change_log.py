import json
from datetime import datetime, date
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app.auth import require_jwt

router = APIRouter()


def _serialize_row(row: Any) -> dict:
    out = {}
    for k, v in dict(row).items():
        if isinstance(v, (datetime, date)):
            out[k] = v.isoformat()
        elif isinstance(v, Decimal):
            out[k] = float(v)
        else:
            out[k] = v
    return out


def _to_pg_text_array(value: Any) -> str | None:
    """Convert a Python list to a PostgreSQL text-array literal, e.g. '{"a","b"}'."""
    if not isinstance(value, list):
        return None
    # Escape each element: double quotes inside the value must be escaped as \"
    def escape(s: str) -> str:
        return '"' + str(s).replace('"', '\\"') + '"'
    return "{" + ",".join(escape(item) for item in value) + "}"


@router.post("/entry")
def create_change_log_entry(
    body: dict = Body(...),
    _payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    """Insert a single change-log entry. Accepts p_-prefixed parameters."""
    table_name = body.get("p_table_name")
    operation = body.get("p_operation")
    if not table_name or not operation:
        raise HTTPException(status_code=400, detail="p_table_name and p_operation are required")

    record_id = body.get("p_record_id")
    user_id = body.get("p_user_id")
    before_data = body.get("p_before_data")
    after_data = body.get("p_after_data")
    changed_fields = body.get("p_changed_fields")

    try:
        result = db.execute(
            text(
                """
                INSERT INTO change_log
                    (table_name, operation, record_id, user_id,
                     before_data, after_data, changed_fields, created_at)
                VALUES
                    (:table_name, :operation, :record_id, :user_id,
                     :before_data::jsonb, :after_data::jsonb,
                     :changed_fields::text[], NOW())
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
                "changed_fields": _to_pg_text_array(changed_fields),
            },
        ).mappings().first()
        db.commit()
        return {"success": True, "log_id": result["log_id"] if result else None}
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/history")
def get_change_log_history(
    body: dict = Body(...),
    _payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    """Return change-log rows for a given table + record, newest first."""
    table_name = body.get("p_table_name")
    record_id = body.get("p_record_id")
    limit = int(body.get("p_limit") or 50)

    if not table_name:
        raise HTTPException(status_code=400, detail="p_table_name is required")

    params: dict[str, Any] = {"table_name": table_name, "limit": limit}
    where = "table_name = :table_name"
    if record_id is not None:
        where += " AND record_id = :record_id"
        params["record_id"] = str(record_id)

    try:
        rows = db.execute(
            text(f"SELECT * FROM change_log WHERE {where} ORDER BY created_at DESC LIMIT :limit"),
            params,
        ).mappings().fetchall()
        return [_serialize_row(r) for r in rows]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
