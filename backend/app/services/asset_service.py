"""
Asset service: logic in Python (no DB RPCs for save/delete/get/audit).
"""
from typing import Any, Dict, List, Optional

from app.transactions.building_assets import (
    copy_asset_to_history_before_update,
    delete_asset_transactional as delete_one_py,
    delete_assets_bulk_transactional as delete_bulk_py,
)
from app.transactions import asset_queries
from app.transactions.save_assets_bulk import save_assets_bulk_transactional as save_assets_bulk_py


class AssetService:
    """Assets: bulk save, delete, get by ids, history, copy to history, mark exported."""

    @staticmethod
    def save_bulk_transactional(payload: Dict[str, Any]) -> Any:
        """Use Python implementation (replaces DB save_assets_bulk_transactional)."""
        assets_data = payload.get("p_assets_data") or payload.get("assets_data") or []
        return save_assets_bulk_py(
            p_assets_data=assets_data,
            p_validation_passed=payload.get("p_validation_passed", True),
            p_validation_errors=payload.get("p_validation_errors"),
            p_action_type=payload.get("p_action_type", "manual_update"),
            p_user_id=payload.get("p_user_id"),
            p_before_data=payload.get("p_before_data"),
            p_after_data=payload.get("p_after_data"),
            p_description=payload.get("p_description"),
            p_is_business_context=payload.get("p_is_business_context"),
        )

    @staticmethod
    def delete_transactional(payload: Dict[str, Any]) -> Any:
        p_asset_id = payload.get("p_asset_id") or payload.get("asset_id")
        p_user_id = payload.get("p_user_id")
        p_description = payload.get("p_description")
        return delete_one_py(int(p_asset_id), p_user_id=p_user_id, p_description=p_description)

    @staticmethod
    def delete_bulk_transactional(payload: Dict[str, Any]) -> Any:
        p_asset_ids = payload.get("p_asset_ids") or payload.get("asset_ids") or []
        p_user_id = payload.get("p_user_id")
        p_description = payload.get("p_description")
        return delete_bulk_py(p_asset_ids, p_user_id=p_user_id, p_description=p_description)

    @staticmethod
    def get_by_ids(p_asset_ids: List[int]) -> Any:
        return asset_queries.get_assets_by_ids(p_asset_ids)

    @staticmethod
    def get_with_history(payload: Dict[str, Any]) -> Any:
        bn = payload.get("p_building_number") or payload.get("building_number")
        return asset_queries.get_assets_with_history(int(bn))

    @staticmethod
    def copy_to_history_before_update(p_asset_id: int) -> Any:
        copy_asset_to_history_before_update(p_asset_id)
        return None

    @staticmethod
    def get_measured_not_exported(building_number: Optional[int] = None) -> List[Dict[str, Any]]:
        """Assets with measurement_date set, not yet exported (same criteria as mark_exported)."""
        return asset_queries.get_measured_not_exported_assets(building_number)

    @staticmethod
    def reset_export_to_automation() -> Dict[str, Any]:
        return asset_queries.reset_export_to_automation()

    @staticmethod
    def mark_exported_to_automation() -> Any:
        return asset_queries.mark_assets_as_exported_to_automation()

    @staticmethod
    def mark_exported_to_automation_by_ids(asset_ids: List[int]) -> Any:
        """Mark given asset IDs as exported. Use after successful send (queue or inline)."""
        return asset_queries.mark_assets_as_exported_to_automation_by_ids(asset_ids)

    @staticmethod
    def search_by_range(payload: Dict[str, Any]) -> Any:
        from_id = payload.get("from_id") or payload.get("fromId")
        to_id = payload.get("to_id") or payload.get("toId")
        return asset_queries.search_assets_by_range(int(from_id), int(to_id))
