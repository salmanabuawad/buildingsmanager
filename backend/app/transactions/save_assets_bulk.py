"""
Python implementation of save_assets_bulk_transactional (replacing DB function).
Saves multiple assets in one transaction via repos.
"""
from typing import Any, Dict, List, Optional

from app.repos import (
    transaction,
    BuildingRepo,
    AssetRepo,
    AuditRepo,
    UsersRepo,
)


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


_building_repo = BuildingRepo()
_asset_repo = AssetRepo()
_audit_repo = AuditRepo()
_users_repo = UsersRepo()


def _resolve_user_id(p_user_id: Optional[str]) -> Optional[int]:
    if not p_user_id:
        return None
    if p_user_id.startswith("uid:"):
        try:
            return _users_repo.get_user_id_by_uid(int(p_user_id.split(":")[1]))
        except (ValueError, IndexError):
            return None
    uid = _users_repo.get_user_id_by_auth_user_id(p_user_id)
    if uid is not None:
        return uid
    _users_repo.ensure_auth_user_id(p_user_id)
    return _users_repo.get_user_id_by_auth_user_id(p_user_id)


def _get_default_user_id() -> Optional[int]:
    return _users_repo.get_default_user_id()


def save_assets_bulk_transactional(
    p_assets_data: List[Dict[str, Any]],
    p_validation_passed: bool = True,
    p_validation_errors: Optional[str] = None,
    p_action_type: str = "manual_update",
    p_user_id: Optional[str] = None,
    p_before_data: Optional[Dict] = None,
    p_after_data: Optional[Dict] = None,
    p_description: Optional[str] = None,
    p_is_business_context: Optional[bool] = None,
) -> Dict[str, Any]:
    """
    Bulk save assets in one transaction. Returns { success, affected_asset_ids, affected_buildings, count, audit_id, message }.
    """
    user_id = _resolve_user_id(p_user_id)
    if user_id is None:
        user_id = _get_default_user_id()
    if user_id is None:
        user_id = 1

    assets_data = [a for a in (p_assets_data or []) if a]
    if not assets_data:
        return {
            "success": True,
            "affected_asset_ids": [],
            "affected_buildings": [],
            "count": 0,
            "audit_id": None,
            "message": "Successfully saved 0 assets",
        }

    first_building_number = None
    for a in assets_data:
        bn = a.get("building_number")
        if bn is not None:
            first_building_number = int(bn)
            break

    with transaction() as conn:
        affected_asset_ids: List[int] = []
        affected_buildings: List[int] = []
        before_assets: List[Dict] = []
        after_assets: List[Dict] = []

        need_before = (not p_before_data or p_before_data in (None, "null", {})) and first_building_number is not None
        if need_before and p_action_type in ("distribute_shared", "business_distribution", "residence_distribution", "transfer_area"):
            before_assets = _asset_repo.get_all_for_building(first_building_number, conn=conn)
        elif need_before:
            before_ids = [int(a["asset_id"]) for a in assets_data if a.get("asset_id") is not None]
            before_assets = _asset_repo.get_by_ids(before_ids, conn=conn)

        before_data_collected = {"assets": before_assets} if before_assets else p_before_data

        existing_by_id: Dict[int, Dict] = {}
        if assets_data:
            ids_to_load = [int(a["asset_id"]) for a in assets_data if a.get("asset_id") is not None]
            if ids_to_load:
                for row in _asset_repo.get_by_ids(ids_to_load, conn=conn):
                    existing_by_id[int(row["asset_id"])] = row

        for v_asset_data in assets_data:
            v_asset_data = {k: v for k, v in v_asset_data.items() if k not in ("id", "_isNew", "_isDirty", "_validationErrors", "_isMasterRow")}
            v_asset_id = v_asset_data.get("asset_id")
            v_building_number = v_asset_data.get("building_number")
            v_new_main_asset_type = (v_asset_data.get("main_asset_type") or "").strip() or None
            if v_asset_id is None or v_building_number is None:
                raise ValueError("Asset ID and Building Number required")
            v_asset_id = int(v_asset_id)
            v_building_number = int(v_building_number)

            existing = existing_by_id.get(v_asset_id)
            found = bool(existing)

            if not found:
                _insert_asset(conn, v_asset_id, v_building_number, v_asset_data)
            else:
                if _extract_boolean(v_asset_data.get("is_new_measurement"), False):
                    _asset_repo.copy_to_history(v_asset_id, conn)
                _update_asset(conn, v_asset_id, v_building_number, v_asset_data, existing)

            if v_asset_id not in affected_asset_ids:
                affected_asset_ids.append(v_asset_id)
            if v_building_number not in affected_buildings:
                affected_buildings.append(v_building_number)

            _building_repo.update_total_area(v_building_number, conn=conn)

        if not p_after_data or p_after_data in (None, "null", {}):
            if first_building_number and p_action_type in ("distribute_shared", "business_distribution", "residence_distribution", "transfer_area"):
                after_assets = _asset_repo.get_all_for_building(first_building_number, conn=conn)
            else:
                after_assets = _asset_repo.get_by_ids(affected_asset_ids, conn=conn)
            after_data_collected = {"assets": after_assets}
        else:
            after_data_collected = p_after_data

        entity_id = str(first_building_number) if p_action_type in ("business_distribution", "residence_distribution", "distribute_shared", "transfer_area") and first_building_number else ",".join(map(str, affected_asset_ids))
        audit_id = None
        if p_action_type:
            try:
                audit_id = _audit_repo.log_audit(
                    user_id, p_action_type, "bulk_asset", entity_id,
                    before_data=before_data_collected,
                    after_data=after_data_collected,
                    description=p_description,
                    conn=conn,
                )
            except Exception:
                pass

        if p_action_type in ("business_distribution", "residence_distribution", "distribute_shared") and first_building_number:
            if p_action_type == "business_distribution":
                _building_repo.clear_business_distribution(first_building_number, conn=conn)
            elif p_action_type == "residence_distribution":
                _building_repo.clear_residence_distribution(first_building_number, conn=conn)
            elif p_action_type == "distribute_shared":
                _building_repo.clear_both_distribution(first_building_number, conn=conn)

        count = len(affected_asset_ids)
        return {
            "success": True,
            "affected_asset_ids": affected_asset_ids,
            "affected_buildings": affected_buildings,
            "count": count,
            "audit_id": audit_id,
            "message": f"Successfully saved {count} assets",
        }


def _insert_asset(conn, asset_id: int, building_number: int, d: Dict[str, Any]) -> None:
    def _b(k: str, default: bool = False):
        return _extract_boolean(d.get(k), default)
    def _n(k: str, default: float = 0):
        v = d.get(k)
        if v is None or v == "":
            return default
        try:
            return float(v)
        except (TypeError, ValueError):
            return default
    def _t(k: str):
        v = d.get(k)
        return (v if v is None else str(v).strip()) or None
    def _i(k: str):
        v = d.get(k)
        if v is None or v == "":
            return None
        try:
            return int(v)
        except (TypeError, ValueError):
            return None

    params = {
        "asset_id": asset_id,
        "building_number": building_number,
        "payer_id": _t("payer_id"),
        "measurement_date": _t("measurement_date"),
        "main_asset_type": d.get("main_asset_type") or "",
        "asset_size": _n("asset_size", 0),
        "tax_region": _i("tax_region"),
        "sub_asset_type_1": _t("sub_asset_type_1"), "sub_asset_size_1": _n("sub_asset_size_1", 0),
        "sub_asset_type_2": _t("sub_asset_type_2"), "sub_asset_size_2": _n("sub_asset_size_2", 0),
        "sub_asset_type_3": _t("sub_asset_type_3"), "sub_asset_size_3": _n("sub_asset_size_3", 0),
        "sub_asset_type_4": _t("sub_asset_type_4"), "sub_asset_size_4": _n("sub_asset_size_4", 0),
        "sub_asset_type_5": _t("sub_asset_type_5"), "sub_asset_size_5": _n("sub_asset_size_5", 0),
        "sub_asset_type_6": _t("sub_asset_type_6"), "sub_asset_size_6": _n("sub_asset_size_6", 0),
        "elevator": _b("elevator", False), "single_double_family": _b("single_double_family", False),
        "condo": _b("condo", False), "townhouses": _b("townhouses", False), "penthouse": _b("penthouse", False),
        "structure_drawing_url": _t("structure_drawing_url"),
        "discount_type": _t("discount_type"), "discount_date_from": _t("discount_date_from"), "discount_date_to": _t("discount_date_to"),
        "business_distribution_area": _n("business_distribution_area"),
        "exported_to_automation": _b("exported_to_automation", False),
        "comment": _t("comment"),
    }
    _asset_repo.insert(params, conn)


def _update_asset(conn, asset_id: int, building_number: int, d: Dict[str, Any], old: Dict[str, Any]) -> None:
    def _b(k: str, default: bool = False):
        if k in d:
            return _extract_boolean(d[k], default)
        return old.get(k) if old.get(k) is not None else default
    def _n(k: str):
        if k in d and d[k] is not None and d[k] != "":
            try:
                return float(d[k])
            except (TypeError, ValueError):
                pass
        return old.get(k)
    def _t(k: str):
        if k in d:
            v = d[k]
            return (v if v is None else str(v).strip()) or None
        return old.get(k)
    def _i(k: str):
        if k in d and d[k] is not None and d[k] != "":
            try:
                return int(d[k])
            except (TypeError, ValueError):
                pass
        return old.get(k)

    params = {
        "asset_id": asset_id,
        "building_number": building_number,
        "payer_id": _t("payer_id"),
        "measurement_date": _t("measurement_date"),
        "main_asset_type": d.get("main_asset_type") or old.get("main_asset_type"),
        "asset_size": _n("asset_size"),
        "tax_region": _i("tax_region"),
        "sub_asset_type_1": _t("sub_asset_type_1"), "sub_asset_size_1": _n("sub_asset_size_1"),
        "sub_asset_type_2": _t("sub_asset_type_2"), "sub_asset_size_2": _n("sub_asset_size_2"),
        "sub_asset_type_3": _t("sub_asset_type_3"), "sub_asset_size_3": _n("sub_asset_size_3"),
        "sub_asset_type_4": _t("sub_asset_type_4"), "sub_asset_size_4": _n("sub_asset_size_4"),
        "sub_asset_type_5": _t("sub_asset_type_5"), "sub_asset_size_5": _n("sub_asset_size_5"),
        "sub_asset_type_6": _t("sub_asset_type_6"), "sub_asset_size_6": _n("sub_asset_size_6"),
        "has_elevator": "elevator" in d, "elevator": _b("elevator", False),
        "has_single_double_family": "single_double_family" in d, "single_double_family": _b("single_double_family", False),
        "has_condo": "condo" in d, "condo": _b("condo", False),
        "has_townhouses": "townhouses" in d, "townhouses": _b("townhouses", False),
        "has_penthouse": "penthouse" in d, "penthouse": _b("penthouse", False),
        "structure_drawing_url": _t("structure_drawing_url"),
        "discount_type": _t("discount_type"), "discount_date_from": _t("discount_date_from"), "discount_date_to": _t("discount_date_to"),
        "business_distribution_area": _n("business_distribution_area"),
        "has_exported": "exported_to_automation" in d, "exported_to_automation": _b("exported_to_automation", False),
        "comment": _t("comment"),
    }
    _asset_repo.update(params, conn)
