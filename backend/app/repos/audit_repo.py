"""
Audit repository: DB access for audit table.
"""
import json
from decimal import Decimal
from typing import Any, Dict, List, Optional

from app.repos.base_repo import BaseRepo


def _json_default(o: Any) -> Any:
    if isinstance(o, Decimal):
        return float(o)
    raise TypeError(f"Object of type {type(o).__name__} is not JSON serializable")


# Valid values for audit_action_type enum
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


class AuditRepo(BaseRepo):
    def log_audit(
        self,
        user_id: int,
        action_type: str,
        entity_type: str,
        entity_id: str,
        before_data: Optional[Dict] = None,
        after_data: Optional[Dict] = None,
        description: Optional[str] = None,
        conn=None,
    ) -> Optional[int]:
        """Insert audit row. Returns action_id (id column)."""
        action_type = _normalize_audit_action_type(action_type)
        before_json = json.dumps(before_data, default=_json_default) if before_data is not None else None
        after_json = json.dumps(after_data, default=_json_default) if after_data is not None else None
        rows = self._fetch(
            """INSERT INTO audit (user_id, action_type, entity_type, entity_id, before_data, after_data, description)
               VALUES (:uid, CAST(:action_type AS audit_action_type), :entity_type, :entity_id,
                       CAST(:before_data AS jsonb), CAST(:after_data AS jsonb), :desc)
               RETURNING id""",
            {
                "uid": user_id,
                "action_type": action_type,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "before_data": before_json,
                "after_data": after_json,
                "desc": description,
            },
            conn=conn,
        )
        return rows[0].get("id") or rows[0].get("action_id") if rows else None

    def log_audit_before_only(
        self,
        user_id: int,
        action_type: str,
        entity_type: str,
        entity_id: str,
        before_data: Optional[Dict] = None,
        description: Optional[str] = None,
        conn=None,
    ) -> Optional[int]:
        """Insert audit row with before_data only (for deletes)."""
        action_type = _normalize_audit_action_type(action_type)
        before_json = json.dumps(before_data, default=_json_default) if before_data is not None else None
        rows = self._fetch(
            """INSERT INTO audit (user_id, action_type, entity_type, entity_id, before_data, description)
               VALUES (:uid, CAST(:action_type AS audit_action_type), :entity_type, :entity_id,
                       CAST(:before_data AS jsonb), :desc)
               RETURNING id""",
            {
                "uid": user_id,
                "action_type": action_type,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "before_data": before_json,
                "desc": description,
            },
            conn=conn,
        )
        return rows[0].get("id") or rows[0].get("action_id") if rows else None

    def get_asset_data(self, asset_id: int, conn=None) -> Optional[Dict[str, Any]]:
        rows = self._fetch("SELECT * FROM assets WHERE asset_id = :aid", {"aid": asset_id}, conn=conn)
        return rows[0] if rows else None

    def get_building_data(self, building_number: int, conn=None) -> Optional[Dict[str, Any]]:
        rows = self._fetch("SELECT * FROM buildings WHERE building_number = :bn", {"bn": building_number}, conn=conn)
        return rows[0] if rows else None

    def get_record_change_history(
        self,
        table_name: str,
        record_id: str,
        limit: int = 50,
        conn=None,
    ) -> List[Dict[str, Any]]:
        """Return change_log rows for table_name and record_id with user join."""
        return self._fetch(
            """SELECT cl.log_id, cl.operation, cl.user_id, u.user_name, u.user_email,
                      cl.before_data, cl.after_data, cl.changed_fields, cl.created_at
               FROM change_log cl
               LEFT JOIN users u ON cl.user_id = u.user_id
               WHERE cl.table_name = :tbl AND cl.record_id = :rid
               ORDER BY cl.created_at DESC
               LIMIT :lim""",
            {"tbl": table_name, "rid": record_id, "lim": limit},
            conn=conn,
        )

    def log_change_entry(
        self,
        table_name: str,
        operation: str,
        record_id: str,
        user_id: int,
        before_data: Optional[str],
        after_data: Optional[str],
        changed_fields: Optional[List[str]] = None,
        conn=None,
    ) -> Optional[int]:
        """Insert change_log row; return log_id."""
        rows = self._fetch(
            """INSERT INTO change_log (table_name, operation, record_id, user_id, before_data, after_data, changed_fields)
               VALUES (:tbl, :op, :rid, :uid, CAST(:before_data AS jsonb), CAST(:after_data AS jsonb), :changed)
               RETURNING log_id""",
            {
                "tbl": table_name,
                "op": operation,
                "rid": record_id,
                "uid": user_id,
                "before_data": before_data,
                "after_data": after_data,
                "changed": changed_fields,
            },
            conn=conn,
        )
        return rows[0]["log_id"] if rows else None

    def delete_by_entity(
        self,
        entity_types: List[str],
        entity_id: str,
        conn=None,
    ) -> None:
        """Delete audit rows for entity_type IN (...) and entity_id."""
        if not entity_types:
            return
        placeholders = ", ".join(f":et{i}" for i in range(len(entity_types)))
        params = {f"et{i}": et for i, et in enumerate(entity_types)}
        params["eid"] = entity_id
        self._run(
            f"DELETE FROM audit WHERE entity_type IN ({placeholders}) AND entity_id = :eid",
            params,
            conn=conn,
        )
