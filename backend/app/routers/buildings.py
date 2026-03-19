from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlalchemy.orm import Session
from typing import List
from app.auth import get_current_user, require_jwt
from app.database import get_db
from app.models import Building, User
from app.schemas import BuildingCreate, BuildingUpdate, BuildingResponse
from app.services.workflow_service import (
    update_buildings_with_distribution_flags,
    update_building_total_area,
)

router = APIRouter()


@router.get("/", response_model=List[BuildingResponse])
def get_buildings(
    skip: int = 0,
    limit: int = 1000,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    buildings = db.query(Building).offset(skip).limit(limit).all()
    return buildings


@router.get("/{building_id}", response_model=BuildingResponse)
def get_building(
    building_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    building = db.query(Building).filter(Building.building_id == building_id).first()
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    return building


@router.post("/", response_model=BuildingResponse, status_code=status.HTTP_201_CREATED)
def create_building(
    building: BuildingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in ["admin", "editor"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    existing = db.query(Building).filter(Building.building_id == building.building_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Building ID already exists")

    db_building = Building(
        **building.dict(),
        created_by=current_user.id
    )
    db.add(db_building)
    db.commit()
    db.refresh(db_building)
    return db_building


@router.put("/{building_id}", response_model=BuildingResponse)
def update_building(
    building_id: str,
    building_update: BuildingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in ["admin", "editor"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    db_building = db.query(Building).filter(Building.building_id == building_id).first()
    if not db_building:
        raise HTTPException(status_code=404, detail="Building not found")

    for key, value in building_update.dict(exclude_unset=True).items():
        setattr(db_building, key, value)

    db.commit()
    db.refresh(db_building)
    return db_building


@router.delete("/{building_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_building(
    building_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    db_building = db.query(Building).filter(Building.building_id == building_id).first()
    if not db_building:
        raise HTTPException(status_code=404, detail="Building not found")

    db.delete(db_building)
    db.commit()
    return None


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
