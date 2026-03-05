"""
Transactional logic in Python (replacing DB functions and triggers).
Use transaction() from app.repos for a single connection; run multiple statements
then commit/rollback together. All DB access via repos.
"""
from app.transactions.building_assets import (
    update_building_total_area as update_building_total_area_py,
    copy_asset_to_history_before_update as copy_asset_to_history_before_update_py,
)

__all__ = [
    "update_building_total_area_py",
    "copy_asset_to_history_before_update_py",
]
