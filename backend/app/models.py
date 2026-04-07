"""
SQLAlchemy ORM models — aligned with the production PostgreSQL schema.

NOTE: The original models had significant drift from the actual DB schema
(wrong PKs, wrong column names, phantom columns). These models now reflect
the real tables so ORM-based queries work correctly.

Endpoints that already use raw SQL (buildings/create, data.py, inspection_tasks,
auth) are unaffected; they never used the ORM for DML.
"""

from sqlalchemy import (
    Column, Integer, BigInteger, SmallInteger, String, Text, Boolean,
    DateTime, Numeric, ForeignKey, ARRAY
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    user_id       = Column(BigInteger, primary_key=True, autoincrement=True)
    auth_user_id  = Column(String, unique=True, index=True)
    user_name     = Column(String, unique=True, index=True, nullable=False)
    user_email    = Column(String, unique=True, index=True)
    user_role     = Column(String, nullable=False, default="user")
    password_hash = Column(String)
    full_name     = Column(String)
    phone         = Column(String)
    active        = Column(Boolean, nullable=False, default=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())
    updated_at    = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ---------------------------------------------------------------------------
# Buildings
# ---------------------------------------------------------------------------

class Building(Base):
    __tablename__ = "buildings"

    building_number             = Column(BigInteger, primary_key=True)
    total_building_area         = Column(Numeric(10, 2), default=0)
    tax_region                  = Column(String)
    elevator                    = Column(Boolean, nullable=False, default=False)
    single_double_family        = Column(Boolean, nullable=False, default=False)
    condo                       = Column(Boolean, nullable=False, default=False)
    townhouses                  = Column(Boolean, nullable=False, default=False)
    residence_shared_area       = Column(Numeric(10, 2), default=0)
    business_shared_area        = Column(Numeric(10, 2))
    area_for_control            = Column(Numeric)
    building_address            = Column(Integer)
    address                     = Column(Integer)
    gosh                        = Column(BigInteger)
    helka                       = Column(BigInteger)
    building_number_in_street   = Column(BigInteger)
    overload_ratio              = Column(Numeric(5, 2))
    need_residence_distribution = Column(Boolean, default=False)
    need_business_distribution  = Column(Boolean, default=False)
    action_id                   = Column(BigInteger, ForeignKey("audit.id"))
    note                        = Column(Text)
    net_area                    = Column(Numeric)
    asset_count                 = Column(Integer)
    shared_parking_area         = Column(Numeric)
    number_of_parking_units     = Column(Integer)
    created_at                  = Column(DateTime(timezone=True), server_default=func.now())

    assets = relationship("Asset", back_populates="building")


# ---------------------------------------------------------------------------
# Asset Types
# ---------------------------------------------------------------------------

class AssetType(Base):
    __tablename__ = "asset_types"

    id                               = Column(Integer, primary_key=True, autoincrement=True)
    name                             = Column(Text, nullable=False)
    description                      = Column(Text)
    tax_region                       = Column(Integer)
    elevator                         = Column(Boolean, nullable=False, default=False)
    single_double_family             = Column(Boolean, nullable=False, default=False)
    penthouse                        = Column(Boolean, nullable=False, default=False)
    condo                            = Column(Boolean, nullable=False, default=False)
    townhouses                       = Column(Boolean, nullable=False, default=False)
    business_residence               = Column(Text)
    min_size                         = Column(Numeric)
    max_size                         = Column(Numeric)
    non_accountable_for_total_area   = Column(Boolean, nullable=False, default=False)
    non_accountable_for_distribution = Column(Boolean, nullable=False, default=False)
    not_accountable_for_statistics   = Column(Boolean, nullable=False, default=False)
    area_description_for_tab         = Column(Text)
    use_shared_area                  = Column(Boolean)
    use_for_parking_shared_area      = Column(Boolean, default=False)
    active                           = Column(Boolean, nullable=False, default=True)
    can_be_subtype                   = Column(Boolean, nullable=False, default=True)
    min_sub_types_number             = Column(Integer, nullable=False, default=0)
    created_at                       = Column(DateTime(timezone=True), server_default=func.now())
    updated_at                       = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    assets = relationship("Asset", back_populates="asset_type")


# ---------------------------------------------------------------------------
# Assets
# ---------------------------------------------------------------------------

class Asset(Base):
    __tablename__ = "assets"

    asset_id                    = Column(BigInteger, primary_key=True)
    building_number             = Column(BigInteger, ForeignKey("buildings.building_number"), nullable=False, index=True)
    payer_id                    = Column(Text)
    measurement_date            = Column(Text, nullable=False, default="01/01/1900")
    main_asset_type             = Column(Text)
    asset_size                  = Column(Numeric)
    sub_asset_type_1            = Column(Text)
    sub_asset_size_1            = Column(Numeric)
    sub_asset_type_2            = Column(Text)
    sub_asset_size_2            = Column(Numeric)
    sub_asset_type_3            = Column(Text)
    sub_asset_size_3            = Column(Numeric)
    sub_asset_type_4            = Column(Text)
    sub_asset_size_4            = Column(Numeric)
    sub_asset_type_5            = Column(Text)
    sub_asset_size_5            = Column(Numeric)
    sub_asset_type_6            = Column(Text)
    sub_asset_size_6            = Column(Numeric)
    structure_drawing_url       = Column(Text)
    elevator                    = Column(Boolean)
    single_double_family        = Column(Boolean)
    condo                       = Column(Boolean)
    townhouses                  = Column(Boolean)
    penthouse                   = Column(Boolean)
    tax_region                  = Column(Integer)
    discount_type               = Column(Text)
    discount_date_from          = Column(Text)
    discount_date_to            = Column(Text)
    is_new_measurement          = Column(Boolean, nullable=False, default=False)
    action_id                   = Column(BigInteger, ForeignKey("audit.id"))
    business_distribution_area  = Column(Numeric)
    exported_to_automation      = Column(Boolean, nullable=False, default=False)
    data_from_automation        = Column(Boolean, nullable=False, default=False)
    comment                     = Column(Text)
    business_total_area         = Column(Numeric(10, 2), default=0)
    export_to_automation_at     = Column(Text)
    apartment_number            = Column(Text)
    apartment_floor             = Column(Text)
    storage_number              = Column(Text)
    storage_floor               = Column(Text)
    operator_id                 = Column(BigInteger, ForeignKey("operators.operator_id"))
    number_of_parking_units     = Column(Integer)
    use_nature                  = Column(Text)
    shared_parking_area         = Column(Numeric)
    created_at                  = Column(DateTime(timezone=True), server_default=func.now())
    updated_at                  = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    building   = relationship("Building", back_populates="assets")
    asset_type = relationship("AssetType", back_populates="assets",
                              primaryjoin="foreign(Asset.main_asset_type) == cast(AssetType.name, Text)",
                              viewonly=True)
    files      = relationship("AssetFile", back_populates="asset")


# ---------------------------------------------------------------------------
# Asset Files
# ---------------------------------------------------------------------------

class AssetFile(Base):
    __tablename__ = "asset_files"

    id               = Column(BigInteger, primary_key=True, autoincrement=True)
    asset_id         = Column(BigInteger, ForeignKey("assets.asset_id"), nullable=False, index=True)
    file_url         = Column(Text, nullable=False)
    file_name        = Column(Text)
    file_size        = Column(BigInteger)
    file_type        = Column(Text)
    uploaded_at      = Column(DateTime(timezone=True), server_default=func.now())
    uploaded_by      = Column(Text)
    measurement_date = Column(Text)

    asset = relationship("Asset", back_populates="files")


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------

class AuditLog(Base):
    __tablename__ = "audit"

    id          = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id     = Column(BigInteger, ForeignKey("users.user_id"))
    action_type = Column(String, nullable=False)
    entity_type = Column(Text, nullable=False)
    entity_id   = Column(Text)
    before_data = Column(Text)   # jsonb stored as text for simplicity
    after_data  = Column(Text)
    description = Column(Text)
    tax_region  = Column(Text)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())


# ---------------------------------------------------------------------------
# Operators  (referenced by assets)
# ---------------------------------------------------------------------------

class Operator(Base):
    __tablename__ = "operators"

    operator_id = Column(BigInteger, primary_key=True, autoincrement=True)
    name        = Column(Text)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    updated_at  = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
