"""
REST endpoints that wrap service layer. All require JWT (Bearer) auth.
Register this router first so paths like /api/assets/save-bulk-transactional take precedence.
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Any, Dict, List, Optional

from app.config import settings
from app.services import (
    AssetService,
    BuildingService,
    AssetTypeService,
    AuditService,
    UserManagementService,
    MetadataService,
)
from app.users_table import get_current_user_users_table

router = APIRouter()


def _error_detail(exc: Exception) -> str:
    """Sanitize error detail for API response (avoid leaking internals in production)."""
    return str(exc) if settings.ENVIRONMENT == "development" else "Operation failed"


# ---- Assets ----
@router.post("/assets/save-bulk-transactional")
def assets_save_bulk_transactional(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    try:
        return AssetService.save_bulk_transactional(body) or {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=_error_detail(e))


@router.post("/assets/delete-transactional")
def assets_delete_transactional(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    try:
        return AssetService.delete_transactional(body) or {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=_error_detail(e))


@router.post("/assets/delete-bulk-transactional")
def assets_delete_bulk_transactional(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    try:
        return AssetService.delete_bulk_transactional(body) or {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=_error_detail(e))


@router.post("/assets/by-ids")
def assets_by_ids(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    p_asset_ids = body.get("p_asset_ids", body.get("asset_ids", []))
    try:
        return AssetService.get_by_ids(p_asset_ids) or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=_error_detail(e))


@router.post("/assets/with-history")
def assets_with_history(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    try:
        return AssetService.get_with_history(body) or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=_error_detail(e))


@router.post("/assets/copy-to-history")
def assets_copy_to_history(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    p_asset_id = body.get("p_asset_id", body.get("asset_id"))
    try:
        return AssetService.copy_to_history_before_update(int(p_asset_id)) or {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=_error_detail(e))


@router.get("/assets/measured-not-exported")
def assets_measured_not_exported(building_number: Optional[int] = None, _user=Depends(get_current_user_users_table)):
    """Return assets that have measurement_date and are not yet exported (same logic as mark-exported)."""
    try:
        return AssetService.get_measured_not_exported(building_number) or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=_error_detail(e))


@router.post("/assets/reset-export-to-automation")
def assets_reset_export_to_automation(_user=Depends(get_current_user_users_table)):
    """Reset the latest export batch (set exported_to_automation=false for assets with latest export date)."""
    try:
        return AssetService.reset_export_to_automation()
    except Exception as e:
        raise HTTPException(status_code=500, detail=_error_detail(e))


@router.post("/assets/mark-exported")
def assets_mark_exported(_user=Depends(get_current_user_users_table)):
    try:
        return AssetService.mark_exported_to_automation() or {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=_error_detail(e))


@router.post("/assets/mark-exported-by-ids")
def assets_mark_exported_by_ids(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    """Mark given asset IDs as exported. Call after successful send (queue or inline) so count updates only after send."""
    asset_ids = body.get("asset_ids") or []
    if not asset_ids:
        return {"updated_count": 0, "asset_ids": []}
    try:
        ids = [int(x) for x in asset_ids]
        return AssetService.mark_exported_to_automation_by_ids(ids) or {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=_error_detail(e))


@router.post("/assets/search-by-range")
def assets_search_by_range(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    try:
        return AssetService.search_by_range(body) or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=_error_detail(e))


# ---- Buildings ----
@router.post("/buildings/update-total-area")
def buildings_update_total_area(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    p_building_number = body.get("p_building_number", body.get("building_number"))
    try:
        return BuildingService.update_total_area(int(p_building_number)) or {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=_error_detail(e))


@router.post("/buildings/bulk-distribution-flags")
def buildings_bulk_distribution_flags(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    try:
        return BuildingService.update_bulk_distribution_flags(body) or {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=_error_detail(e))


@router.delete("/buildings/by-number/{building_number}", status_code=200)
def buildings_delete_with_related(building_number: int, _user=Depends(get_current_user_users_table)):
    """
    Delete a building and all related data (assets with history copy, audit rows, then building).
    REST: single DELETE; backend owns all business logic. No generic delete-by-query.
    """
    try:
        return BuildingService.delete_building_with_related(building_number)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=_error_detail(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=_error_detail(e))


# ---- Asset types ----
@router.post("/asset-types/update-with-distribution-reset")
def asset_types_update_with_distribution_reset(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    try:
        return AssetTypeService.update_with_distribution_reset(body) or {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=_error_detail(e))


@router.post("/asset-types/bulk-distribution-reset")
def asset_types_bulk_distribution_reset(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    try:
        return AssetTypeService.bulk_update_with_distribution_reset(body) or {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=_error_detail(e))


# ---- Audit ----
@router.post("/audit/entry")
def audit_entry(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    try:
        return AuditService.log_entry(body) or {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=_error_detail(e))


@router.post("/audit/for-asset")
def audit_for_asset(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    try:
        return AuditService.log_for_asset(body) or {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=_error_detail(e))


@router.post("/audit/for-building")
def audit_for_building(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    try:
        return AuditService.log_for_building(body) or {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=_error_detail(e))


@router.post("/change-log/entry")
def change_log_entry(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    try:
        return AuditService.log_change_entry(body) or {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=_error_detail(e))


@router.post("/change-log/history")
def change_log_history(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    try:
        return AuditService.get_record_change_history(body) or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=_error_detail(e))


# ---- Users (internal) ----
@router.post("/users/internal")
def users_create_internal(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    try:
        return UserManagementService.create_internal(body) or {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=_error_detail(e))


@router.post("/users/set-password")
def users_set_password(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    try:
        return UserManagementService.set_password(body) or {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=_error_detail(e))


@router.post("/users/ensure-defaults")
def users_ensure_defaults(_user=Depends(get_current_user_users_table)):
    try:
        return UserManagementService.ensure_defaults() or {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=_error_detail(e))


# ---- Metadata ----
@router.get("/metadata/tables-fields-types")
def metadata_tables_fields_types(_user=Depends(get_current_user_users_table)):
    try:
        return MetadataService.get_tables_fields_types() or {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=_error_detail(e))
