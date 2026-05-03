from __future__ import annotations

from pydantic import BaseModel
from typing import Any, Optional, List
from datetime import datetime
from decimal import Decimal


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class UserLogin(BaseModel):
    username: str
    password: str


class SessionLogin(BaseModel):
    """Frontend sends user_name (same as username)."""
    user_name: str
    password: str


class SessionLoginResponse(BaseModel):
    """Response shape expected by frontend (usersTableAuth)."""
    user_id: int | str
    user_name: str
    user_role: str
    access_token: str


class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

class UserResponse(BaseModel):
    user_id: int
    user_name: str
    user_email: Optional[str] = None
    user_role: str
    full_name: Optional[str] = None
    phone: Optional[str] = None
    active: bool

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Buildings
# ---------------------------------------------------------------------------

class BuildingBase(BaseModel):
    building_number: int
    total_building_area: Optional[Decimal] = None
    tax_region: Optional[str] = None
    elevator: bool = False
    single_double_family: bool = False
    condo: bool = False
    townhouses: bool = False
    residence_shared_area: Optional[Decimal] = None
    business_shared_area: Optional[Decimal] = None
    area_for_control: Optional[Decimal] = None
    building_address: Optional[int] = None
    address: Optional[int] = None
    gosh: Optional[int] = None
    helka: Optional[int] = None
    building_number_in_street: Optional[int] = None
    overload_ratio: Optional[Decimal] = None
    need_residence_distribution: bool = False
    need_business_distribution: bool = False
    note: Optional[str] = None
    net_area: Optional[Decimal] = None
    asset_count: Optional[int] = None
    shared_parking_area: Optional[Decimal] = None
    number_of_parking_units: Optional[int] = None


class BuildingCreate(BuildingBase):
    pass


class BuildingUpdate(BaseModel):
    total_building_area: Optional[Decimal] = None
    tax_region: Optional[str] = None
    elevator: Optional[bool] = None
    single_double_family: Optional[bool] = None
    condo: Optional[bool] = None
    townhouses: Optional[bool] = None
    residence_shared_area: Optional[Decimal] = None
    business_shared_area: Optional[Decimal] = None
    area_for_control: Optional[Decimal] = None
    building_address: Optional[int] = None
    address: Optional[int] = None
    gosh: Optional[int] = None
    helka: Optional[int] = None
    building_number_in_street: Optional[int] = None
    overload_ratio: Optional[Decimal] = None
    need_residence_distribution: Optional[bool] = None
    need_business_distribution: Optional[bool] = None
    note: Optional[str] = None
    net_area: Optional[Decimal] = None
    asset_count: Optional[int] = None
    shared_parking_area: Optional[Decimal] = None
    number_of_parking_units: Optional[int] = None


class BuildingResponse(BuildingBase):
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Asset Types
# ---------------------------------------------------------------------------

class AssetTypeBase(BaseModel):
    name: str
    description: Optional[str] = None
    tax_region: Optional[int] = None
    elevator: bool = False
    single_double_family: bool = False
    penthouse: bool = False
    condo: bool = False
    townhouses: bool = False
    business_residence: Optional[str] = None
    min_size: Optional[Decimal] = None
    max_size: Optional[Decimal] = None
    non_accountable_for_total_area: bool = False
    non_accountable_for_distribution: bool = False
    not_accountable_for_statistics: bool = False
    area_description_for_tab: Optional[str] = None
    use_shared_area: Optional[bool] = None
    use_for_parking_shared_area: bool = False
    active: bool = True
    can_be_subtype: bool = True
    min_sub_types_number: int = 0


class AssetTypeCreate(AssetTypeBase):
    pass


class AssetTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    tax_region: Optional[int] = None
    elevator: Optional[bool] = None
    single_double_family: Optional[bool] = None
    penthouse: Optional[bool] = None
    condo: Optional[bool] = None
    townhouses: Optional[bool] = None
    business_residence: Optional[str] = None
    min_size: Optional[Decimal] = None
    max_size: Optional[Decimal] = None
    non_accountable_for_total_area: Optional[bool] = None
    non_accountable_for_distribution: Optional[bool] = None
    not_accountable_for_statistics: Optional[bool] = None
    area_description_for_tab: Optional[str] = None
    use_shared_area: Optional[bool] = None
    use_for_parking_shared_area: Optional[bool] = None
    active: Optional[bool] = None
    can_be_subtype: Optional[bool] = None
    min_sub_types_number: Optional[int] = None


class AssetTypeResponse(AssetTypeBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Assets
# ---------------------------------------------------------------------------

class AssetBase(BaseModel):
    asset_id: int
    building_number: int
    payer_id: Optional[str] = None
    measurement_date: Optional[str] = None
    main_asset_type: Optional[str] = None
    asset_size: Optional[Decimal] = None
    sub_asset_type_1: Optional[str] = None
    sub_asset_size_1: Optional[Decimal] = None
    sub_asset_type_2: Optional[str] = None
    sub_asset_size_2: Optional[Decimal] = None
    sub_asset_type_3: Optional[str] = None
    sub_asset_size_3: Optional[Decimal] = None
    sub_asset_type_4: Optional[str] = None
    sub_asset_size_4: Optional[Decimal] = None
    sub_asset_type_5: Optional[str] = None
    sub_asset_size_5: Optional[Decimal] = None
    sub_asset_type_6: Optional[str] = None
    sub_asset_size_6: Optional[Decimal] = None
    structure_drawing_url: Optional[str] = None
    elevator: Optional[bool] = None
    single_double_family: Optional[bool] = None
    condo: Optional[bool] = None
    townhouses: Optional[bool] = None
    penthouse: Optional[bool] = None
    tax_region: Optional[int] = None
    discount_type: Optional[str] = None
    discount_date_from: Optional[str] = None
    discount_date_to: Optional[str] = None
    is_new_measurement: bool = False
    business_distribution_area: Optional[Decimal] = None
    exported_to_automation: bool = False
    data_from_automation: bool = False
    comment: Optional[str] = None
    business_total_area: Optional[Decimal] = None
    export_to_automation_at: Optional[str] = None
    apartment_number: Optional[str] = None
    apartment_floor: Optional[str] = None
    storage_number: Optional[str] = None
    storage_floor: Optional[str] = None
    operator_id: Optional[int] = None
    number_of_parking_units: Optional[int] = None
    use_nature: Optional[str] = None
    shared_parking_area: Optional[Decimal] = None


class AssetCreate(AssetBase):
    pass


class AssetUpdate(BaseModel):
    building_number: Optional[int] = None
    payer_id: Optional[str] = None
    measurement_date: Optional[str] = None
    main_asset_type: Optional[str] = None
    asset_size: Optional[Decimal] = None
    sub_asset_type_1: Optional[str] = None
    sub_asset_size_1: Optional[Decimal] = None
    sub_asset_type_2: Optional[str] = None
    sub_asset_size_2: Optional[Decimal] = None
    sub_asset_type_3: Optional[str] = None
    sub_asset_size_3: Optional[Decimal] = None
    sub_asset_type_4: Optional[str] = None
    sub_asset_size_4: Optional[Decimal] = None
    sub_asset_type_5: Optional[str] = None
    sub_asset_size_5: Optional[Decimal] = None
    sub_asset_type_6: Optional[str] = None
    sub_asset_size_6: Optional[Decimal] = None
    structure_drawing_url: Optional[str] = None
    elevator: Optional[bool] = None
    single_double_family: Optional[bool] = None
    condo: Optional[bool] = None
    townhouses: Optional[bool] = None
    penthouse: Optional[bool] = None
    tax_region: Optional[int] = None
    discount_type: Optional[str] = None
    discount_date_from: Optional[str] = None
    discount_date_to: Optional[str] = None
    is_new_measurement: Optional[bool] = None
    business_distribution_area: Optional[Decimal] = None
    exported_to_automation: Optional[bool] = None
    data_from_automation: Optional[bool] = None
    comment: Optional[str] = None
    business_total_area: Optional[Decimal] = None
    export_to_automation_at: Optional[str] = None
    apartment_number: Optional[str] = None
    apartment_floor: Optional[str] = None
    storage_number: Optional[str] = None
    storage_floor: Optional[str] = None
    operator_id: Optional[int] = None
    number_of_parking_units: Optional[int] = None
    use_nature: Optional[str] = None
    shared_parking_area: Optional[Decimal] = None


class AssetResponse(AssetBase):
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Asset Files
# ---------------------------------------------------------------------------

class AssetFileResponse(BaseModel):
    id: int
    asset_id: int
    file_url: str
    file_name: Optional[str] = None
    file_type: Optional[str] = None
    file_size: Optional[int] = None
    measurement_date: Optional[str] = None
    uploaded_at: Optional[datetime] = None
    uploaded_by: Optional[str] = None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------

class AuditLogResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    entity_type: str
    entity_id: Optional[str] = None
    action_type: str
    # before_data / after_data are jsonb columns; SQLAlchemy returns them as
    # dict | list | None. Declaring them as Optional[str] broke the response
    # serializer whenever a real row came back (every time, in practice).
    before_data: Optional[Any] = None
    after_data: Optional[Any] = None
    description: Optional[str] = None
    tax_region: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
