"""
Python implementations of building/asset transaction logic (replacing DB functions).
Use transaction() from app.repos for connection; all DB access via repos.
"""
from typing import Any, Dict, List, Optional

from app.repos import (
    transaction,
    BuildingRepo,
    AssetRepo,
    AuditRepo,
    UsersRepo,
    AssetTypeRepo,
)

_building_repo = BuildingRepo()
_asset_repo = AssetRepo()
_audit_repo = AuditRepo()
_users_repo = UsersRepo()
_asset_type_repo = AssetTypeRepo()


def update_building_total_area(
    p_building_number: int,
    conn=None,
) -> None:
    """
    Recalculate and set total_building_area, net_area, and asset_count for a building.
    If conn is provided, runs in that transaction; otherwise runs in a new transaction.
    """
    if conn is not None:
        _building_repo.update_total_area(p_building_number, conn=conn)
        return
    with transaction() as conn:
        _building_repo.update_total_area(p_building_number, conn=conn)


def copy_asset_to_history_before_update(
    p_asset_id: int,
    conn=None,
) -> None:
    """
    Copy current asset row to assets_history (before an update/delete).
    If conn is provided, runs in that transaction; otherwise runs in a new transaction.
    """
    if conn is not None:
        _asset_repo.copy_to_history(p_asset_id, conn)
        return
    with transaction() as conn:
        _asset_repo.copy_to_history(p_asset_id, conn)


def _resolve_user_id_on_conn(conn, p_user_id: Optional[str]) -> Optional[int]:
    if not p_user_id:
        return None
    uid = _users_repo.get_user_id_by_auth_user_id(p_user_id, conn=conn)
    if uid is not None:
        return uid
    if p_user_id.startswith("uid:"):
        try:
            return _users_repo.get_user_id_by_uid(int(p_user_id.split(":")[1]), conn=conn)
        except (ValueError, IndexError):
            return None
    return None


def _delete_one_asset_on_conn(
    conn,
    p_asset_id: int,
    p_user_id: Optional[str] = None,
    p_description: Optional[str] = None,
) -> Dict[str, Any]:
    """Delete one asset on the given connection."""
    row = _asset_repo.get_building_and_type(p_asset_id, conn=conn)
    if not row:
        raise ValueError(f"Asset not found: {p_asset_id}")
    building_number = row["building_number"]
    main_asset_type = row.get("main_asset_type")

    before_data = _asset_repo.get_by_id(p_asset_id, conn=conn)
    _asset_repo.copy_to_history(p_asset_id, conn)
    _asset_repo.delete(p_asset_id, conn=conn)
    _building_repo.update_total_area(building_number, conn=conn)

    building_row = _building_repo.get_shared_areas(building_number, conn=conn)
    if building_row:
        business_residence = _asset_type_repo.get_business_residence_by_name(main_asset_type, conn=conn)
        bn_shared = float(building_row.get("business_shared_area") or 0)
        res_shared = float(building_row.get("residence_shared_area") or 0)
        if business_residence == "עסקים" and bn_shared > 0:
            _building_repo.set_need_business_distribution(building_number, conn=conn)
        elif business_residence == "מגורים" and res_shared > 0:
            _building_repo.set_need_residence_distribution(building_number, conn=conn)
        else:
            if bn_shared > 0:
                _building_repo.set_need_business_distribution(building_number, conn=conn)
            if res_shared > 0:
                _building_repo.set_need_residence_distribution(building_number, conn=conn)

    user_id = _resolve_user_id_on_conn(conn, p_user_id)
    if user_id is None:
        user_id = _users_repo.get_default_user_id(conn=conn)
    action_id = None
    if user_id:
        action_id = _audit_repo.log_audit_before_only(
            user_id, "manual_update", "asset", str(p_asset_id),
            before_data=before_data,
            description=p_description or "Asset deleted",
            conn=conn,
        )
    return {"success": True, "asset_id": p_asset_id, "building_number": building_number, "action_id": action_id}


def delete_asset_transactional(
    p_asset_id: int,
    p_user_id: Optional[str] = None,
    p_description: Optional[str] = None,
    conn=None,
) -> Dict[str, Any]:
    """Delete asset with copy to history, update building total area, set distribution flags, audit."""
    if conn is not None:
        return _delete_one_asset_on_conn(conn, p_asset_id, p_user_id, p_description)
    with transaction() as conn_inner:
        return _delete_one_asset_on_conn(conn_inner, p_asset_id, p_user_id, p_description)


def delete_assets_bulk_transactional(
    p_asset_ids: List[int],
    p_user_id: Optional[str] = None,
    p_description: Optional[str] = None,
) -> Dict[str, Any]:
    """Delete multiple assets."""
    deleted = []
    for aid in p_asset_ids:
        try:
            out = delete_asset_transactional(p_asset_id=aid, p_user_id=p_user_id, p_description=p_description)
            deleted.append({"asset_id": out["asset_id"], "building_number": out["building_number"], "action_id": out.get("action_id")})
        except Exception as e:
            raise RuntimeError(f"Bulk delete failed at asset_id={aid}: {e}") from e
    return {"success": True, "deleted": deleted}


def delete_building_with_related(
    p_building_number: int,
    p_user_id: Optional[str] = None,
    p_description: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Delete a building and all related data in one transaction.
    """
    with transaction() as conn:
        if not _building_repo.exists(p_building_number, conn=conn):
            raise ValueError(f"Building not found: {p_building_number}")

        asset_ids = _building_repo.get_asset_ids(p_building_number, conn=conn)
        deleted_assets = []
        for aid in asset_ids:
            out = _delete_one_asset_on_conn(conn, aid, p_user_id, p_description or "Building deleted")
            deleted_assets.append({"asset_id": out["asset_id"], "action_id": out.get("action_id")})

        _audit_repo.delete_by_entity(["building", "bulk_asset"], str(p_building_number), conn=conn)
        _building_repo.delete_by_number(p_building_number, conn=conn)

    return {
        "success": True,
        "building_number": p_building_number,
        "deleted_assets_count": len(deleted_assets),
        "deleted": deleted_assets,
    }
