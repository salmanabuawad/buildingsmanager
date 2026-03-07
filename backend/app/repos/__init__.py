"""
Repository layer: DB access only. No business logic.

Design rule: No direct DB access – all table access goes through repos.
Routers/services/transactions must not use db.execute(text(...)) or db.query(Model).
Only repos import db_rpc; all other code uses repos. See .cursor/rules/no-direct-db-use-repos.mdc.
"""
from app.repos.base_repo import BaseRepo, transaction
from app.repos.building_repo import BuildingRepo
from app.repos.asset_repo import AssetRepo
from app.repos.audit_repo import AuditRepo
from app.repos.users_repo import UsersRepo
from app.repos.inspection_repo import (
    InspectionTaskRepo,
    InspectionReportRepo,
    InspectionReportFileRepo,
    InspectionTaskAccessTokenRepo,
)
from app.repos.asset_file_repo import AssetFileRepo
from app.repos.data_repo import DataRepo
from app.repos.system_config_repo import SystemConfigRepo
from app.repos.metadata_repo import MetadataRepo
from app.repos.asset_type_repo import AssetTypeRepo
from app.repos.user_repo import UserRepo  # ORM-based, for legacy User model

__all__ = [
    "BaseRepo",
    "transaction",
    "BuildingRepo",
    "AssetRepo",
    "AuditRepo",
    "UsersRepo",
    "InspectionTaskRepo",
    "InspectionReportRepo",
    "InspectionReportFileRepo",
    "InspectionTaskAccessTokenRepo",
    "AssetFileRepo",
    "DataRepo",
    "SystemConfigRepo",
    "MetadataRepo",
    "AssetTypeRepo",
    "UserRepo",
]
