from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from typing import Any
from app.auth import require_jwt, require_admin
from app.database import get_db
from app.services.workflow_service import (
    update_buildings_with_distribution_flags,
    update_building_total_area,
    _serialize_row,
    _get_columns,
)

router = APIRouter()


@router.post("/create")
def create_building_raw(
    body: dict = Body(...),
    _payload: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    columns = _get_columns(db, "buildings")
    allowed = {c for c in columns if c not in ("id", "created_at")}
    payload = {k: v for k, v in body.items() if k in allowed}
    if not payload:
        raise HTTPException(status_code=400, detail="No valid fields provided")
    cols = ", ".join(f'"{k}"' for k in payload)
    vals = ", ".join(f":{k}" for k in payload)
    try:
        row = db.execute(
            text(f'INSERT INTO "buildings" ({cols}) VALUES ({vals}) RETURNING *'),
            payload,
        ).mappings().first()
    except IntegrityError as e:
        db.rollback()
        bn = payload.get("building_number")
        msg = str(getattr(e, "orig", e))
        if "buildings_pkey" in msg or "duplicate key" in msg.lower():
            raise HTTPException(
                status_code=409,
                detail=f"מבנה {bn} כבר קיים במערכת",
            )
        raise HTTPException(status_code=400, detail=f"שגיאה ביצירת המבנה: {msg}")
    if row is None:
        raise HTTPException(status_code=500, detail="Failed to create building")
    db.commit()
    return _serialize_row(row)


@router.post("/create-bulk")
def create_buildings_bulk(
    body: dict = Body(...),
    _payload: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rows_input: list[dict[str, Any]] = body.get("rows") or []
    if not rows_input:
        return {"success": True, "count": 0, "buildings": []}
    columns = _get_columns(db, "buildings")
    allowed = {c for c in columns if c not in ("id", "created_at")}
    results = []
    conflicts: list[int] = []
    for item in rows_input:
        payload = {k: v for k, v in item.items() if k in allowed}
        if not payload:
            continue
        cols = ", ".join(f'"{k}"' for k in payload)
        vals = ", ".join(f":{k}" for k in payload)
        try:
            row = db.execute(
                text(f'INSERT INTO "buildings" ({cols}) VALUES ({vals}) RETURNING *'),
                payload,
            ).mappings().first()
        except IntegrityError as e:
            db.rollback()
            bn = payload.get("building_number")
            msg = str(getattr(e, "orig", e))
            if "buildings_pkey" in msg or "duplicate key" in msg.lower():
                # One duplicate aborts the transaction — surface it clearly and
                # stop so the client can show which number already exists.
                raise HTTPException(
                    status_code=409,
                    detail=f"מבנה {bn} כבר קיים במערכת",
                )
            raise HTTPException(status_code=400, detail=f"שגיאה ביצירת מבנה {bn}: {msg}")
        if row:
            results.append(_serialize_row(row))
    db.commit()
    return {"success": True, "count": len(results), "buildings": results, "conflicts": conflicts}


def _delete_building_cascade(building_number: int, db: Session) -> dict:
    """Shared implementation: audit cleanup + count assets + delete building (FK cascades to assets)."""
    # Count assets for the response (CASCADE will remove them when the building row goes)
    assets_count = db.execute(
        text('SELECT COUNT(*) FROM "assets" WHERE "building_number" = :bn'),
        {"bn": building_number},
    ).scalar() or 0

    # Delete audit rows that reference this building or its bulk-asset operations
    db.execute(
        text('DELETE FROM "audit" WHERE "entity_type" IN (\'bulk_asset\', \'building\') AND "entity_id" = :eid'),
        {"eid": str(building_number)},
    )

    result = db.execute(
        text('DELETE FROM "buildings" WHERE "building_number" = :building_number'),
        {"building_number": building_number},
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail=f"מבנה {building_number} לא נמצא")
    db.commit()
    return {
        "success": True,
        "building_number": building_number,
        "deleted_assets_count": int(assets_count),
        "message": "Building deleted successfully",
    }


@router.delete("/by-number/{building_number}")
def delete_building_with_related(
    building_number: int,
    _payload: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Frontend-facing delete that returns deleted_assets_count."""
    return _delete_building_cascade(building_number, db)


@router.delete("/{building_number}")
def delete_building_by_number(
    building_number: int,
    _payload: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return _delete_building_cascade(building_number, db)


@router.post("/bulk-distribution-flags")
def bulk_distribution_flags(
    body: dict = Body(...),
    _payload: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    items = body.get("p_buildings_data") or []
    if not isinstance(items, list) or len(items) == 0:
        return {"success": True, "count": 0, "buildings": []}

    try:
        result = update_buildings_with_distribution_flags(db, items)
        db.commit()
        return result
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/update-total-area")
def recalculate_total_area(
    body: dict = Body(...),
    _payload: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    building_number = body.get("p_building_number")
    if building_number is None:
        raise HTTPException(status_code=400, detail="p_building_number is required")

    try:
        result = update_building_total_area(db, int(building_number))
        db.commit()
        return result
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(exc))
