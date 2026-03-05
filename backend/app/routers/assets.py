from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models import Asset, User
from app.schemas import AssetCreate, AssetUpdate, AssetResponse
from app.auth import get_current_user

router = APIRouter()


@router.get("/", response_model=List[AssetResponse])
def get_assets(
    skip: int = 0,
    limit: int = 5000,
    building_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Asset)
    if building_id:
        query = query.filter(Asset.building_id == building_id)
    assets = query.offset(skip).limit(limit).all()
    return assets


@router.get("/{asset_id}", response_model=AssetResponse)
def get_asset(
    asset_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    asset = db.query(Asset).filter(Asset.asset_id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


@router.post("/", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
def create_asset(
    asset: AssetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in ["admin", "editor", "inspector"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    existing = db.query(Asset).filter(Asset.asset_id == asset.asset_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Asset ID already exists")

    db_asset = Asset(
        **asset.dict(),
        created_by=current_user.id,
        updated_by=current_user.id
    )
    db.add(db_asset)
    db.commit()
    db.refresh(db_asset)
    return db_asset


@router.put("/{asset_id}", response_model=AssetResponse)
def update_asset(
    asset_id: str,
    asset_update: AssetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in ["admin", "editor", "inspector"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    db_asset = db.query(Asset).filter(Asset.asset_id == asset_id).first()
    if not db_asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    for key, value in asset_update.dict(exclude_unset=True).items():
        setattr(db_asset, key, value)

    db_asset.updated_by = current_user.id
    db.commit()
    db.refresh(db_asset)
    return db_asset


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(
    asset_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
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
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in ["admin", "editor", "inspector"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    result_assets = []
    for asset_data in assets:
        existing = db.query(Asset).filter(Asset.asset_id == asset_data.asset_id).first()
        if existing:
            for key, value in asset_data.dict(exclude_unset=True).items():
                setattr(existing, key, value)
            existing.updated_by = current_user.id
            result_assets.append(existing)
        else:
            new_asset = Asset(
                **asset_data.dict(),
                created_by=current_user.id,
                updated_by=current_user.id
            )
            db.add(new_asset)
            result_assets.append(new_asset)

    db.commit()
    for asset in result_assets:
        db.refresh(asset)
    return result_assets
