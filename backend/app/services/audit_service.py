"""
Audit service: log entries and change history (Python implementation).
"""
from typing import Any, Dict

from app.transactions import audit as audit_py


class AuditService:
    """Audit and change log."""

    @staticmethod
    def log_entry(payload: Dict[str, Any]) -> Any:
        return audit_py.log_audit_entry(
            p_action_type=payload.get("p_action_type", "manual_update"),
            p_entity_type=payload.get("p_entity_type", ""),
            p_entity_id=payload.get("p_entity_id", ""),
            p_user_id=payload.get("p_user_id"),
            p_before_data=payload.get("p_before_data"),
            p_after_data=payload.get("p_after_data"),
            p_description=payload.get("p_description"),
        )

    @staticmethod
    def log_for_asset(payload: Dict[str, Any]) -> Any:
        return audit_py.log_audit_for_asset(
            p_asset_id=int(payload.get("p_asset_id") or payload.get("asset_id")),
            p_operation=payload.get("p_operation", "UPDATE"),
            p_user_id=payload.get("p_user_id"),
            p_action_type=payload.get("p_action_type", "manual_update"),
            p_copy_to_history=payload.get("p_copy_to_history", False),
            p_description=payload.get("p_description"),
        )

    @staticmethod
    def log_for_building(payload: Dict[str, Any]) -> Any:
        return audit_py.log_audit_for_building(
            p_building_number=int(payload.get("p_building_number") or payload.get("building_number")),
            p_operation=payload.get("p_operation", "UPDATE"),
            p_user_id=payload.get("p_user_id"),
            p_action_type=payload.get("p_action_type", "manual_update"),
            p_description=payload.get("p_description"),
        )

    @staticmethod
    def log_change_entry(payload: Dict[str, Any]) -> Any:
        return audit_py.log_change_entry(
            p_table_name=payload.get("p_table_name", ""),
            p_operation=payload.get("p_operation", ""),
            p_record_id=payload.get("p_record_id", ""),
            p_user_id=payload.get("p_user_id"),
            p_before_data=payload.get("p_before_data"),
            p_after_data=payload.get("p_after_data"),
            p_changed_fields=payload.get("p_changed_fields"),
        )

    @staticmethod
    def get_record_change_history(payload: Dict[str, Any]) -> Any:
        return audit_py.get_record_change_history(
            p_table_name=payload.get("p_table_name", ""),
            p_record_id=payload.get("p_record_id", ""),
            p_limit=int(payload.get("p_limit", 50)),
        )
