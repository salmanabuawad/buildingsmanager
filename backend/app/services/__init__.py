"""
Service layer: business logic and DB access (Postgres RPC/SQL).
Consumed by REST routers only. Keeps controllers thin and testable.
"""
from app.services.auth_service import AuthService
from app.services.asset_service import AssetService
from app.services.building_service import BuildingService
from app.services.asset_type_service import AssetTypeService
from app.services.audit_service import AuditService
from app.services.user_management_service import UserManagementService
from app.services.metadata_service import MetadataService
from app.services.user_service import UserService

__all__ = [
    "AuthService",
    "AssetService",
    "BuildingService",
    "AssetTypeService",
    "AuditService",
    "UserManagementService",
    "MetadataService",
    "UserService",
]
