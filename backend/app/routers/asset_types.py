from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import AssetType, User
from app.schemas import AssetTypeBase, AssetTypeResponse
from app.auth import get_current_user

router = APIRouter()


@router.get("/", response_model=List[AssetTypeResponse])
def get_asset_types(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    asset_types = db.query(AssetType).all()
    return asset_types


@router.get("/{asset_type_id}", response_model=AssetTypeResponse)
def get_asset_type(
    asset_type_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    asset_type = db.query(AssetType).filter(AssetType.id == asset_type_id).first()
    if not asset_type:
        raise HTTPException(status_code=404, detail="Asset type not found")
    return asset_type


@router.post("/", response_model=AssetTypeResponse, status_code=status.HTTP_201_CREATED)
def create_asset_type(
    asset_type: AssetTypeBase,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    existing = db.query(AssetType).filter(AssetType.name == asset_type.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Asset type name already exists")

    db_asset_type = AssetType(**asset_type.dict())
    db.add(db_asset_type)
    db.commit()
    db.refresh(db_asset_type)
    return db_asset_type
