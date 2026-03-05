"""
Python implementations of audit and change_log RPCs (replacing DB functions).
All DB access via repos.
"""
from typing import Any, Dict, List, Optional

from app.repos import AuditRepo, UsersRepo

_audit_repo = AuditRepo()
_users_repo = UsersRepo()

VALID_AUDIT_ACTION_TYPES = frozenset({
    "manual_update", "import_file", "transfer_area", "distribute_shared",
    "business_distribution", "residence_distribution", "tax_region_change",
})
DEFAULT_AUDIT_ACTION_TYPE = "manual_update"


def _normalize_audit_action_type(action_type: Optional[str]) -> str:
    if not action_type or not isinstance(action_type, str):
        return DEFAULT_AUDIT_ACTION_TYPE
    s = action_type.strip().lower()
    return s if s in VALID_AUDIT_ACTION_TYPES else DEFAULT_AUDIT_ACTION_TYPE


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


def log_audit_entry(
    p_action_type: str,
    p_entity_type: str,
    p_entity_id: str,
    p_user_id: Optional[str] = None,
    p_before_data: Optional[Dict] = None,
    p_after_data: Optional[Dict] = None,
    p_description: Optional[str] = None,
    p_building_number: Optional[int] = None,
    p_overload_ratio: Optional[float] = None,
    p_shared_area_size: Optional[float] = None,
) -> Optional[int]:
    """Insert audit row; return action_id."""
    user_id = _resolve_user_id(p_user_id)
    if user_id is None:
        user_id = _get_default_user_id()
    if user_id is None:
        return None
    return _audit_repo.log_audit(
        user_id, p_action_type, p_entity_type, p_entity_id,
        before_data=p_before_data,
        after_data=p_after_data,
        description=p_description,
    )


def log_audit_entry_on_conn(
    conn,
    user_id: int,
    p_action_type: str,
    p_entity_type: str,
    p_entity_id: str,
    p_before_data: Optional[Dict] = None,
    p_after_data: Optional[Dict] = None,
    p_description: Optional[str] = None,
) -> Optional[int]:
    """Insert audit row on the given connection."""
    return _audit_repo.log_audit(
        user_id, p_action_type, p_entity_type, p_entity_id,
        before_data=p_before_data,
        after_data=p_after_data,
        description=p_description,
        conn=conn,
    )


def log_audit_for_asset(
    p_asset_id: int,
    p_operation: str,
    p_user_id: Optional[str] = None,
    p_action_type: str = "manual_update",
    p_copy_to_history: bool = False,
    p_description: Optional[str] = None,
) -> Optional[int]:
    """Log audit for asset operation. Fetches before/after from assets via repo."""
    after_data = _audit_repo.get_asset_data(p_asset_id)
    before_data = after_data if p_operation == "UPDATE" else (after_data if p_operation == "DELETE" else None)
    return log_audit_entry(
        p_action_type=p_action_type,
        p_entity_type="asset",
        p_entity_id=str(p_asset_id),
        p_user_id=p_user_id,
        p_before_data=before_data,
        p_after_data=after_data if p_operation != "DELETE" else None,
        p_description=p_description or f"Asset {p_operation}",
    )


def get_building_audit_data(p_building_number: int) -> Optional[Dict]:
    """Get building row as dict for audit."""
    return _audit_repo.get_building_data(p_building_number)


def log_audit_for_building(
    p_building_number: int,
    p_operation: str,
    p_user_id: Optional[str] = None,
    p_action_type: str = "manual_update",
    p_description: Optional[str] = None,
) -> Optional[int]:
    """Log audit for building operation."""
    after_data = get_building_audit_data(p_building_number)
    return log_audit_entry(
        p_action_type=p_action_type,
        p_entity_type="building",
        p_entity_id=str(p_building_number),
        p_user_id=p_user_id,
        p_before_data=None,
        p_after_data=after_data,
        p_description=p_description or f"Building {p_operation}",
    )


def log_change_entry(
    p_table_name: str,
    p_operation: str,
    p_record_id: str,
    p_user_id: Optional[str] = None,
    p_before_data: Optional[Dict] = None,
    p_after_data: Optional[Dict] = None,
    p_changed_fields: Optional[List[str]] = None,
) -> Optional[int]:
    """Insert change_log row; return log_id."""
    import json
    from decimal import Decimal
    def _json_default(o):
        if isinstance(o, Decimal):
            return float(o)
        raise TypeError(f"Object of type {type(o).__name__} is not JSON serializable")
    user_id = _resolve_user_id(p_user_id)
    if user_id is None:
        user_id = _get_default_user_id()
    if user_id is None:
        return None
    before_json = json.dumps(p_before_data, default=_json_default) if p_before_data is not None else None
    after_json = json.dumps(p_after_data, default=_json_default) if p_after_data is not None else None
    return _audit_repo.log_change_entry(
        p_table_name, p_operation, p_record_id, user_id,
        before_json, after_json, p_changed_fields,
    )


def get_record_change_history(
    p_table_name: str,
    p_record_id: str,
    p_limit: int = 50,
) -> List[Dict[str, Any]]:
    """Return change_log rows for table_name and record_id."""
    return _audit_repo.get_record_change_history(p_table_name, p_record_id, p_limit)
