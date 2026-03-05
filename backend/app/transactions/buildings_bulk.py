"""
Python implementation of update_buildings_bulk_with_distribution_flags.
Replaces the DB function; runs in a single transaction. All DB access via repos.
"""
from typing import Any, Dict, List, Optional

from app.repos import transaction, BuildingRepo

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


def _num(val: Any) -> Optional[float]:
    if val is None or val == "":
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _int(val: Any) -> Optional[int]:
    if val is None or val == "":
        return None
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def update_buildings_bulk_with_distribution_flags(
    p_buildings_data: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Bulk update buildings with distribution flags. Recalculates total_building_area
    when residence/business/shared_parking_area change (unless total_building_area is in updates).
    Returns { success, count, affected_buildings, buildings, message }.
    """
    if not p_buildings_data:
        return {
            "success": True,
            "count": 0,
            "affected_buildings": [],
            "buildings": [],
            "message": "Successfully updated 0 buildings",
        }

    affected_buildings: List[int] = []
    updated_buildings: List[Dict[str, Any]] = []

    with transaction() as conn:
        for building_data in p_buildings_data:
            building_number = building_data.get("building_number")
            if building_number is None:
                raise ValueError("Building number is required for all building updates")
            building_number = int(building_number)

            updates = building_data.get("updates") or {}
            if not updates:
                continue

            old = _building_repo.get_by_number(building_number, conn=conn)
            if not old:
                continue

            old_res = _num(old.get("residence_shared_area"))
            old_biz = _num(old.get("business_shared_area"))
            old_park = _num(old.get("shared_parking_area"))
            old_npark = _int(old.get("number_of_parking_units"))

            new_res = _num(updates["residence_shared_area"]) if "residence_shared_area" in updates else old_res
            new_biz = _num(updates["business_shared_area"]) if "business_shared_area" in updates else old_biz
            new_park = _num(updates["shared_parking_area"]) if "shared_parking_area" in updates else old_park
            new_npark = _int(updates["number_of_parking_units"]) if "number_of_parking_units" in updates else old_npark

            final = dict(updates)
            if (old_res != new_res) or (old_res is None) != (new_res is None):
                final["need_residence_distribution"] = True
            if (old_biz != new_biz) or (old_biz is None) != (new_biz is None):
                final["need_business_distribution"] = True
            if (old_park != new_park) or (old_park is None) != (new_park is None) or (old_npark != new_npark) or (old_npark is None) != (new_npark is None):
                final["need_business_distribution"] = True

            for k in ("action_id", "created_at", "building_number"):
                final.pop(k, None)

            def _num_col(key: str):
                v = final.get(key)
                if v is not None and v != "":
                    try:
                        return float(v)
                    except (TypeError, ValueError):
                        pass
                return old.get(key)

            def _int_col(key: str):
                v = final.get(key)
                if v is not None and v != "":
                    try:
                        return int(v)
                    except (TypeError, ValueError):
                        pass
                return old.get(key)

            def _bool_col(key: str, default: bool = False):
                if key in final:
                    return _extract_boolean(final[key], default)
                return old.get(key) if old.get(key) is not None else default

            def _text_col(key: str):
                v = final.get(key)
                if v is not None and str(v).strip() != "":
                    return str(v).strip()
                return old.get(key)

            total_building_area = _num_col("total_building_area")
            tax_region = final.get("tax_region")
            if tax_region is not None and tax_region != "":
                tax_region = str(tax_region)
            else:
                tax_region = old.get("tax_region")

            building_address = old.get("building_address")
            if "address" in final:
                building_address = _int(final["address"])
            elif "building_address" in final:
                building_address = _int_col("building_address")

            note = _text_col("note") if "note" in final else old.get("note")
            if note is not None and str(note).strip() == "":
                note = None

            shared_parking_area = _num_col("shared_parking_area") if "shared_parking_area" in final else old.get("shared_parking_area")
            number_of_parking_units = _int_col("number_of_parking_units") if "number_of_parking_units" in final else old.get("number_of_parking_units")

            # Use repo's update - BuildingRepo doesn't have a generic update. We need to add it or use _run
            # The original used a big UPDATE with many columns. Let me add update_building to BuildingRepo.
            _building_repo.update_full(
                conn,
                building_number,
                total_building_area=total_building_area,
                tax_region=tax_region,
                elevator=_bool_col("elevator", False),
                single_double_family=_bool_col("single_double_family", False),
                condo=_bool_col("condo", False),
                townhouses=_bool_col("townhouses", False),
                residence_shared_area=_num_col("residence_shared_area"),
                business_shared_area=_num_col("business_shared_area"),
                area_for_control=_num_col("area_for_control"),
                shared_parking_area=shared_parking_area,
                number_of_parking_units=number_of_parking_units,
                gosh=_int_col("gosh"),
                helka=_int_col("helka"),
                building_number_in_street=_int_col("building_number_in_street"),
                overload_ratio=_num_col("overload_ratio"),
                need_residence_distribution=final.get("need_residence_distribution") if "need_residence_distribution" in final else old.get("need_residence_distribution"),
                need_business_distribution=final.get("need_business_distribution") if "need_business_distribution" in final else old.get("need_business_distribution"),
                building_address=building_address,
                note=note,
            )

            recalc_total = (
                ("residence_shared_area" in updates or "business_shared_area" in updates or "shared_parking_area" in updates)
                and "total_building_area" not in updates
            )
            if recalc_total:
                _building_repo.update_total_area(building_number, conn=conn)

            if building_number not in affected_buildings:
                affected_buildings.append(building_number)

            updated_row = _building_repo.get_by_number(building_number, conn=conn)
            if updated_row:
                updated_buildings.append(updated_row)

        count = len(updated_buildings)
        return {
            "success": True,
            "count": count,
            "affected_buildings": affected_buildings,
            "buildings": updated_buildings,
            "message": f"Successfully updated {count} buildings",
        }
