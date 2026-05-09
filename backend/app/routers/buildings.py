from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from typing import Any, List
from app.auth import get_current_user, require_jwt
from app.database import get_db
from app.models import Building
from app.schemas import BuildingCreate, BuildingUpdate, BuildingResponse
from app.services.workflow_service import (
    update_buildings_with_distribution_flags,
    update_building_total_area,
    _serialize_row,
    _get_columns,
)

router = APIRouter()


@router.get("/", response_model=List[BuildingResponse])
def get_buildings(
    skip: int = 0,
    limit: int = 1000,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    buildings = db.query(Building).offset(skip).limit(limit).all()
    return buildings


@router.get("/{building_number}", response_model=BuildingResponse)
def get_building(
    building_number: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    building = db.query(Building).filter(Building.building_number == building_number).first()
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    return building


@router.post("/", response_model=BuildingResponse, status_code=status.HTTP_201_CREATED)
def create_building(
    building: BuildingCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    if current_user.role not in ["admin", "editor"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    existing = db.query(Building).filter(Building.building_number == building.building_number).first()
    if existing:
        raise HTTPException(status_code=400, detail="Building number already exists")

    db_building = Building(**building.dict())
    db.add(db_building)
    db.commit()
    db.refresh(db_building)
    return db_building


@router.put("/{building_number}", response_model=BuildingResponse)
def update_building(
    building_number: int,
    building_update: BuildingUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    if current_user.role not in ["admin", "editor"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    db_building = db.query(Building).filter(Building.building_number == building_number).first()
    if not db_building:
        raise HTTPException(status_code=404, detail="Building not found")

    for key, value in building_update.dict(exclude_unset=True).items():
        setattr(db_building, key, value)

    db.commit()
    db.refresh(db_building)
    return db_building


@router.post("/create")
def create_building_raw(
    body: dict = Body(...),
    _payload: dict = Depends(require_jwt),
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
    _payload: dict = Depends(require_jwt),
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
    _payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    """Frontend-facing delete that returns deleted_assets_count."""
    return _delete_building_cascade(building_number, db)


@router.delete("/{building_number}")
def delete_building_by_number(
    building_number: int,
    _payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    return _delete_building_cascade(building_number, db)


@router.post("/bulk-distribution-flags")
def bulk_distribution_flags(
    body: dict = Body(...),
    _payload: dict = Depends(require_jwt),
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
    _payload: dict = Depends(require_jwt),
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
