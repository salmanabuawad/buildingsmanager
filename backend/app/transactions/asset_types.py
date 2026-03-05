"""
Python implementations of update_asset_type_with_distribution_reset and
update_asset_types_bulk_with_distribution_reset (replacing DB functions).
All DB access via repos.
"""
from typing import Any, Dict, List, Optional

from app.repos import transaction, AssetTypeRepo, BuildingRepo

_asset_type_repo = AssetTypeRepo()
_building_repo = BuildingRepo()


def _extract_boolean(val: Any, default: bool = False) -> bool:
    if val is None:
        return default
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        return bool(val) if val != 0 else False
    s = (val if isinstance(val, str) else str(val)).strip().strip('"')
    if s.lower() in ("yes", "true", "1", "t", "כן"):
        return True
    if s.lower() in ("no", "false", "0", "f", "לא", ""):
        return False
    return default


def _nullable_bool(val: Any, default: bool = False) -> Optional[bool]:
    if val is None:
        return None
    if isinstance(val, str) and val.strip().lower() == "null":
        return None
    return _extract_boolean(val, default)


def update_asset_type_with_distribution_reset(
    p_id: int,
    p_updates: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Update asset type by id; if non_accountable_for_distribution changes,
    set need_*_distribution on affected buildings.
    """
    p_updates = p_updates or {}

    with transaction() as conn:
        before_data = _asset_type_repo.get_by_id(p_id, conn=conn)
        if not before_data:
            raise ValueError(f"Asset type with id {p_id} not found")

        asset_type_name = before_data.get("name")
        old_non_accountable = bool(before_data.get("non_accountable_for_distribution") or False)
        new_non_accountable = (
            _extract_boolean(p_updates.get("non_accountable_for_distribution"), False)
            if "non_accountable_for_distribution" in p_updates
            else old_non_accountable
        )

        def _text(k: str):
            v = p_updates.get(k)
            return (v if v is None else str(v).strip()) if k in p_updates else before_data.get(k)

        def _int_col(k: str):
            v = p_updates.get(k)
            if k not in p_updates or v is None:
                return before_data.get(k)
            try:
                return int(v)
            except (TypeError, ValueError):
                return before_data.get(k)

        def _num(k: str):
            v = p_updates.get(k)
            if k not in p_updates or v is None:
                return before_data.get(k)
            try:
                return float(v)
            except (TypeError, ValueError):
                return before_data.get(k)

        def _bool_col(k: str, default: bool = False):
            if k in p_updates:
                return _extract_boolean(p_updates[k], default)
            return before_data.get(k) if before_data.get(k) is not None else default

        def _opt_bool(k: str):
            if k not in p_updates:
                return before_data.get(k)
            return _nullable_bool(p_updates[k], False)

        params = {
            "id": p_id,
            "name": _text("name"),
            "description": _text("description"),
            "tax_region": _int_col("tax_region"),
            "elevator": _bool_col("elevator", False),
            "single_double_family": _bool_col("single_double_family", False),
            "penthouse": _bool_col("penthouse", False),
            "condo": _bool_col("condo", False),
            "townhouses": _bool_col("townhouses", False),
            "business_residence": _text("business_residence"),
            "non_accountable_for_total_area": _bool_col("non_accountable_for_total_area", False),
            "non_accountable_for_distribution": new_non_accountable,
            "not_accountable_for_statistics": _bool_col("not_accountable_for_statistics", False),
            "use_shared_area": _opt_bool("use_shared_area"),
            "use_for_parking_shared_area": _opt_bool("use_for_parking_shared_area"),
            "min_size": _num("min_size"),
            "max_size": _num("max_size"),
            "active": _bool_col("active", True),
            "area_description_for_tab": _text("area_description_for_tab"),
        }
        _asset_type_repo.update_by_columns(conn, p_id, params)

        after_data = _asset_type_repo.get_by_id(p_id, conn=conn) or before_data

        affected_buildings: List[int] = []
        if old_non_accountable != new_non_accountable:
            affected_buildings = _asset_type_repo.get_building_numbers_with_asset_type(asset_type_name, conn=conn)
            if affected_buildings:
                br = (after_data.get("business_residence") or "").strip()
                if br == "עסקים":
                    for bn in affected_buildings:
                        _building_repo.set_need_business_distribution(bn, conn=conn)
                elif br == "מגורים":
                    for bn in affected_buildings:
                        _building_repo.set_need_residence_distribution(bn, conn=conn)
                else:
                    for bn in affected_buildings:
                        _building_repo.set_both_distribution_flags(bn, conn=conn)

        return {
            "before_data": before_data,
            "after_data": after_data,
            "affected_buildings": affected_buildings,
            "distribution_flags_reset": len(affected_buildings) > 0,
        }


def update_asset_types_bulk_with_distribution_reset(
    p_asset_types_data: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Bulk update asset types; each item is { id, updates }."""
    results: List[Dict[str, Any]] = []
    all_affected: List[int] = []

    for item in p_asset_types_data or []:
        p_id = item.get("id")
        if p_id is None:
            raise ValueError("Asset type id is required for all updates")
        p_id = int(p_id)
        updates = item.get("updates") or {}
        if not updates:
            continue
        single = update_asset_type_with_distribution_reset(p_id, updates)
        results.append(single)
        for b in single.get("affected_buildings") or []:
            if b not in all_affected:
                all_affected.append(b)

    count = len(results)
    return {
        "success": True,
        "count": count,
        "results": results,
        "affected_buildings": all_affected,
        "message": f"Successfully updated {count} asset types",
    }
