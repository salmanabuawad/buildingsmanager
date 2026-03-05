"""
Asset type service: update with distribution reset (single and bulk).
Uses Python transaction layer (no DB RPCs).
"""
from typing import Any, Dict

from app.transactions.asset_types import (
    update_asset_type_with_distribution_reset as update_asset_type_py,
    update_asset_types_bulk_with_distribution_reset as update_asset_types_bulk_py,
)


class AssetTypeService:
    """Asset types: update with distribution reset."""

    @staticmethod
    def update_with_distribution_reset(payload: Dict[str, Any]) -> Any:
        p_id = payload.get("p_id") or payload.get("id")
        p_updates = payload.get("p_updates") or payload.get("updates") or {}
        return update_asset_type_py(int(p_id), p_updates)

    @staticmethod
    def bulk_update_with_distribution_reset(payload: Dict[str, Any]) -> Any:
        data = payload.get("p_asset_types_data") or payload.get("asset_types_data") or []
        return update_asset_types_bulk_py(data)
