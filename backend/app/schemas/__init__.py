"""
Pydantic schemas. Repository-layer user schemas in user.py.
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime
from decimal import Decimal

from app.schemas.user import UserCreate, UserOut


class UserLogin(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict


class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    full_name: Optional[str]
    role: str
    active: bool

    class Config:
        from_attributes = True


class BuildingBase(BaseModel):
    building_id: str
    building_name: Optional[str] = None
    street_name: Optional[str] = None
    house_number: Optional[str] = None
    entrance: Optional[str] = None
    city: Optional[str] = None
    neighborhood: Optional[str] = None
    total_area: Optional[Decimal] = None
    shared_area: Optional[Decimal] = None
    note: Optional[str] = None


class BuildingCreate(BuildingBase):
    pass


class BuildingUpdate(BaseModel):
    building_name: Optional[str] = None
    street_name: Optional[str] = None
    house_number: Optional[str] = None
    entrance: Optional[str] = None
    city: Optional[str] = None
    neighborhood: Optional[str] = None
    total_area: Optional[Decimal] = None
    shared_area: Optional[Decimal] = None
    note: Optional[str] = None


class BuildingResponse(BuildingBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class AssetTypeBase(BaseModel):
    name: str
    code: Optional[str] = None
    use_shared_area: bool = False
    not_accountable_for_statistics: bool = False


class AssetTypeResponse(AssetTypeBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class AssetBase(BaseModel):
    asset_id: str
    building_id: int
    asset_type_id: Optional[int] = None
    apartment_number: Optional[str] = None
    storage_number: Optional[str] = None
    apartment_owner: Optional[str] = None
    business_name: Optional[str] = None
    measured_area: Optional[Decimal] = None
    cadastral_area: Optional[Decimal] = None
    balcony_area: Optional[Decimal] = None
    area_from_distribution: Optional[Decimal] = None
    business_total_area: Optional[Decimal] = None
    tax_region: Optional[str] = None
    distribution_flag: bool = False
    distribution_flag_business_residence: bool = False
    comment: Optional[str] = None


class AssetCreate(AssetBase):
    pass


class AssetUpdate(BaseModel):
    asset_type_id: Optional[int] = None
    apartment_number: Optional[str] = None
    storage_number: Optional[str] = None
    apartment_owner: Optional[str] = None
    business_name: Optional[str] = None
    measured_area: Optional[Decimal] = None
    cadastral_area: Optional[Decimal] = None
    balcony_area: Optional[Decimal] = None
    area_from_distribution: Optional[Decimal] = None
    business_total_area: Optional[Decimal] = None
    tax_region: Optional[str] = None
    distribution_flag: Optional[bool] = None
    distribution_flag_business_residence: Optional[bool] = None
    comment: Optional[str] = None


class AssetResponse(AssetBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime]
    export_to_automation_at: Optional[str]

    class Config:
        from_attributes = True


class AssetFileResponse(BaseModel):
    id: int
    asset_id: int
    file_name: str
    file_path: str
    file_type: Optional[str]
    file_size: Optional[int]
    measurement_date: Optional[datetime]
    uploaded_at: datetime

    class Config:
        from_attributes = True


class AuditLogResponse(BaseModel):
    id: int
    entity_type: str
    entity_id: str
    action_type: str
    old_values: Optional[str]
    new_values: Optional[str]
    changed_at: datetime
    tax_region: Optional[str]

    class Config:
        from_attributes = True


__all__ = [
    "UserLogin", "Token", "UserResponse", "UserCreate", "UserOut",
    "BuildingBase", "BuildingCreate", "BuildingUpdate", "BuildingResponse",
    "AssetTypeBase", "AssetTypeResponse",
    "AssetBase", "AssetCreate", "AssetUpdate", "AssetResponse",
    "AssetFileResponse", "AuditLogResponse",
]
