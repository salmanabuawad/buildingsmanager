from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional, Any
from app.database import get_db
from app.models import Asset
from app.schemas import AssetCreate, AssetUpdate, AssetResponse
from app.auth import get_current_user, require_jwt
from app.utils import serialize_value as _ser
from app.services.workflow_service import (
    copy_asset_to_history,
    delete_asset_transactional,
    delete_assets_bulk_transactional,
    get_assets_with_history,
    save_assets_bulk_transactional,
)

router = APIRouter()


@router.get("/", response_model=List[AssetResponse])
def get_assets(
    skip: int = 0,
    limit: int = 5000,
    building_number: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    query = db.query(Asset)
    if building_number:
        query = query.filter(Asset.building_number == building_number)
    assets = query.offset(skip).limit(limit).all()
    return assets


@router.get("/measured-not-exported")
def get_measured_not_exported(
    building_number: Optional[int] = None,
    _payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    """Return assets that are measured and not yet exported. Uses actual DB columns (building_number, measurement_date, exported_to_automation).
    If building_number is provided, filters by it; otherwise returns all measured-not-exported assets."""
    try:
        if building_number is not None and building_number > 0:
            result = db.execute(
                text(
                    "SELECT * FROM assets WHERE measurement_date IS NOT NULL AND "
                    "(exported_to_automation IS NULL OR exported_to_automation = false) "
                    "AND building_number = :bn "
                    "ORDER BY asset_id"
                ),
                {"bn": building_number},
            )
        else:
            result = db.execute(
                text(
                    "SELECT * FROM assets WHERE measurement_date IS NOT NULL AND "
                    "(exported_to_automation IS NULL OR exported_to_automation = false) "
                    "ORDER BY building_number, asset_id"
                )
            )
        rows = result.fetchall()
        if not rows:
            return []
        keys = list(rows[0]._mapping.keys())

        return [dict((k, _ser(r._mapping[k])) for k in keys) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _serialize_asset_row(row: Any, keys: List[str]) -> dict:
    """Serialize a raw assets row (dates, decimals) for JSON."""
    return dict((k, _ser(row._mapping[k])) for k in keys)


@router.post("/by-ids")
def get_assets_by_ids(
    body: dict = Body(...),
    _payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    """Return assets by asset_id list. Body: { \"p_asset_ids\": [id1, id2, ...] }. Used for export to automation."""
    raw = body.get("p_asset_ids") or []
    ids = [int(x) for x in raw if x is not None and (isinstance(x, (int, float)) or str(x).strip().isdigit())]
    if not ids:
        return []
    try:
        # Build IN clause to avoid driver-specific array binding
        placeholders = ", ".join(f":id{i}" for i in range(len(ids)))
        params = {f"id{i}": ids[i] for i in range(len(ids))}
        result = db.execute(
            text(f"SELECT * FROM assets WHERE asset_id IN ({placeholders})"),
            params,
        )
        rows = result.fetchall()
        if not rows:
            return []
        keys = list(rows[0]._mapping.keys())
        return [_serialize_asset_row(r, keys) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/mark-exported-by-ids")
def mark_exported_by_ids(
    body: dict = Body(...),
    _payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    """Mark assets as exported. Body: { \"asset_ids\": [id1, id2, ...] } (business asset_id). Sets exported_to_automation=true and export_to_automation_at=DD/MM/YYYY."""
    raw = body.get("asset_ids") or []
    ids = []
    for x in raw:
        if x is None:
            continue
        if isinstance(x, (int, float)):
            ids.append(str(int(x)))
        elif isinstance(x, str) and x.strip():
            ids.append(x.strip())
    if not ids:
        return {"updated_count": 0, "asset_ids": []}
    try:
        today = date.today()
        date_str = f"{today.day:02d}/{today.month:02d}/{today.year}"
        placeholders = ", ".join(f":id{i}" for i in range(len(ids)))
        params = {f"id{i}": ids[i] for i in range(len(ids))}
        params["export_date"] = date_str
        # asset_id column may be text or numeric; cast for comparison
        result = db.execute(
            text(
                f"UPDATE assets SET exported_to_automation = true, export_to_automation_at = :export_date "
                f"WHERE asset_id::text IN ({placeholders})"
            ),
            params,
        )
        updated = result.rowcount
        db.commit()
        return {"updated_count": updated, "asset_ids": ids}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reset-export-to-automation")
def reset_export_to_automation(
    _payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    """Reset exported_to_automation for assets with the latest export_to_automation_at. Returns count and next latest date."""
    try:
        # Get latest export date
        latest_row = db.execute(
            text(
                "SELECT export_to_automation_at FROM assets "
                "WHERE exported_to_automation = true AND export_to_automation_at IS NOT NULL "
                "ORDER BY export_to_automation_at DESC LIMIT 1"
            )
        ).fetchone()
        if not latest_row or latest_row[0] is None:
            return {"success": True, "count": 0, "next_latest_date": None}
        latest_date = latest_row[0]
        if hasattr(latest_date, "strip"):
            latest_str = latest_date.strip()
        else:
            latest_str = str(latest_date) if latest_date else ""
        if not latest_str:
            return {"success": True, "count": 0, "next_latest_date": None}
        # Reset assets with this date
        result = db.execute(
            text(
                "UPDATE assets SET exported_to_automation = false, export_to_automation_at = NULL "
                "WHERE export_to_automation_at = :dt"
            ),
            {"dt": latest_str},
        )
        count = result.rowcount
        db.commit()
        # Next latest date (if any)
        next_row = db.execute(
            text(
                "SELECT export_to_automation_at FROM assets "
                "WHERE exported_to_automation = true AND export_to_automation_at IS NOT NULL "
                "ORDER BY export_to_automation_at DESC LIMIT 1"
            )
        ).fetchone()
        next_date = next_row[0] if next_row and next_row[0] else None
        if next_date is not None and hasattr(next_date, "strip"):
            next_date = next_date.strip() or None
        return {"success": True, "count": count, "next_latest_date": next_date}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/with-history")
def assets_with_history(
    body: dict = Body(...),
    _payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    building_number = body.get("p_building_number")
    if building_number is None:
        raise HTTPException(status_code=400, detail="p_building_number is required")
    try:
        return get_assets_with_history(db, int(building_number))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/copy-to-history")
def asset_copy_to_history(
    body: dict = Body(...),
    _payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    asset_id = body.get("p_asset_id")
    if asset_id is None:
        raise HTTPException(status_code=400, detail="p_asset_id is required")
    try:
        copied = copy_asset_to_history(db, int(asset_id))
        db.commit()
        return {"success": copied}
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/save-bulk-transactional")
def asset_save_bulk_transactional(
    body: dict = Body(...),
    _payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    try:
        result = save_assets_bulk_transactional(
            db,
            assets_data=body.get("p_assets_data") or [],
            validation_passed=body.get("p_validation_passed"),
            validation_errors=body.get("p_validation_errors"),
            action_type=body.get("p_action_type") or "manual_update",
            user_id=body.get("p_user_id"),
        )
        db.commit()
        return result
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/delete-transactional")
def asset_delete_transactional(
    body: dict = Body(...),
    _payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    asset_id = body.get("p_asset_id")
    if asset_id is None:
        raise HTTPException(status_code=400, detail="p_asset_id is required")
    try:
        result = delete_asset_transactional(
            db,
            asset_id=int(asset_id),
            user_id=body.get("p_user_id"),
            description=body.get("p_description"),
        )
        db.commit()
        return result
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/delete-bulk-transactional")
def asset_delete_bulk_transactional(
    body: dict = Body(...),
    _payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    raw_ids = body.get("p_asset_ids") or []
    asset_ids = [int(value) for value in raw_ids if value is not None]
    if not asset_ids:
        return {"success": True, "count": 0}
    try:
        result = delete_assets_bulk_transactional(
            db,
            asset_ids=asset_ids,
            user_id=body.get("p_user_id"),
            description=body.get("p_description"),
        )
        db.commit()
        return result
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/{asset_id}", response_model=AssetResponse)
def get_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    asset = db.query(Asset).filter(Asset.asset_id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


@router.post("/", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
def create_asset(
    asset: AssetCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    if current_user.role not in ["admin", "editor"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    existing = db.query(Asset).filter(Asset.asset_id == asset.asset_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Asset ID already exists")

    db_asset = Asset(**asset.dict())
    db.add(db_asset)
    db.commit()
    db.refresh(db_asset)
    return db_asset


@router.put("/{asset_id}", response_model=AssetResponse)
def update_asset(
    asset_id: int,
    asset_update: AssetUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    if current_user.role not in ["admin", "editor"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    db_asset = db.query(Asset).filter(Asset.asset_id == asset_id).first()
    if not db_asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    for key, value in asset_update.dict(exclude_unset=True).items():
        setattr(db_asset, key, value)

    db.commit()
    db.refresh(db_asset)
    return db_asset


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    db_asset = db.query(Asset).filter(Asset.asset_id == asset_id).first()
    if not db_asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    db.delete(db_asset)
    db.commit()
    return None


@router.post("/bulk", response_model=List[AssetResponse])
def bulk_create_or_update_assets(
    assets: List[AssetCreate],
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    if current_user.role not in ["admin", "editor"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    result_assets = []
    for asset_data in assets:
        existing = db.query(Asset).filter(Asset.asset_id == asset_data.asset_id).first()
        if existing:
            for key, value in asset_data.dict(exclude_unset=True).items():
                setattr(existing, key, value)
            result_assets.append(existing)
        else:
            new_asset = Asset(**asset_data.dict())
            db.add(new_asset)
            result_assets.append(new_asset)

    db.commit()
    for asset in result_assets:
        db.refresh(asset)
    return result_assets
