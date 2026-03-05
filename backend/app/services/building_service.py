"""
Building service: update total area, bulk distribution flags, delete building with related data.
Supabase is the single source of truth; all logic in Python.
"""
from typing import Any, Dict

from app.transactions.building_assets import (
    update_building_total_area as update_building_total_area_py,
    delete_building_with_related as delete_building_with_related_py,
)
from app.transactions.buildings_bulk import update_buildings_bulk_with_distribution_flags as update_buildings_bulk_py


class BuildingService:
    """Buildings: total area, bulk distribution flags, delete with related (assets, audit)."""

    @staticmethod
    def update_total_area(p_building_number: int) -> Any:
        """Use Python implementation (matches Supabase)."""
        update_building_total_area_py(p_building_number)
        return None

    @staticmethod
    def update_bulk_distribution_flags(payload: Dict[str, Any]) -> Any:
        """Use Python implementation (replaces DB RPC)."""
        buildings_data = payload.get("p_buildings_data") or payload.get("buildings_data") or []
        return update_buildings_bulk_py(buildings_data)

    @staticmethod
    def delete_building_with_related(p_building_number: int, p_user_id: str = None) -> Dict[str, Any]:
        """Delete building and all related assets/audit in one transaction. Called by DELETE /api/buildings/by-number/{id}."""
        return delete_building_with_related_py(
            p_building_number,
            p_user_id=p_user_id,
            p_description="Building deleted",
        )
