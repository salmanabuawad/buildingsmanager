from sqlalchemy import Column, Integer, BigInteger, String, Float, Boolean, DateTime, ForeignKey, Text, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String)
    role = Column(String, default="viewer")
    active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Building(Base):
    __tablename__ = "buildings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    building_id = Column(String(50), unique=True, index=True, nullable=False)
    building_name = Column(String(255))
    street_name = Column(String(255))
    house_number = Column(String(50))
    entrance = Column(String(50))
    city = Column(String(100))
    neighborhood = Column(String(100))
    total_area = Column(Numeric(10, 2))
    shared_area = Column(Numeric(10, 2))
    note = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))

    assets = relationship("Asset", back_populates="building")


class AssetType(Base):
    __tablename__ = "asset_types"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), unique=True, nullable=False)
    code = Column(String(50), unique=True)
    use_shared_area = Column(Boolean, default=False)
    not_accountable_for_statistics = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    assets = relationship("Asset", back_populates="asset_type")


class Asset(Base):
    __tablename__ = "assets"

    id = Column(Integer, primary_key=True, autoincrement=True)
    asset_id = Column(String(50), unique=True, index=True, nullable=False)
    building_id = Column(Integer, ForeignKey("buildings.id"), nullable=False)
    asset_type_id = Column(Integer, ForeignKey("asset_types.id"))

    # Asset details
    apartment_number = Column(String(50))
    storage_number = Column(String(50))
    apartment_owner = Column(String(255))
    business_name = Column(String(255))

    # Areas
    measured_area = Column(Numeric(10, 2))
    cadastral_area = Column(Numeric(10, 2))
    balcony_area = Column(Numeric(10, 2))
    area_from_distribution = Column(Numeric(10, 2))
    business_total_area = Column(Numeric(10, 2))

    # Tax information
    tax_region = Column(String(50))

    # Flags
    distribution_flag = Column(Boolean, default=False)
    distribution_flag_business_residence = Column(Boolean, default=False)

    # Metadata
    comment = Column(Text)
    export_to_automation_at = Column(String(20))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))

    building = relationship("Building", back_populates="assets")
    asset_type = relationship("AssetType", back_populates="assets")
    files = relationship("AssetFile", back_populates="asset")


class AssetFile(Base):
    __tablename__ = "asset_files"

    id = Column(Integer, primary_key=True, autoincrement=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_type = Column(String(50))
    file_size = Column(Integer)
    measurement_date = Column(DateTime(timezone=True))
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))

    asset = relationship("Asset", back_populates="files")


class AuditLog(Base):
    __tablename__ = "audit"

    id = Column(Integer, primary_key=True, autoincrement=True)
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(String(50), nullable=False)
    action_type = Column(String(50), nullable=False)
    old_values = Column(Text)
    new_values = Column(Text)
    changed_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    changed_at = Column(DateTime(timezone=True), server_default=func.now())
    tax_region = Column(String(50))
