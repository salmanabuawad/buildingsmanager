"""
User management service: internal user creation, set password, ensure defaults.
Uses Python transaction layer (no DB RPCs).
"""
from typing import Any, Dict

from app.transactions.users import (
    users_create_internal as users_create_internal_py,
    users_set_password as users_set_password_py,
    users_ensure_defaults as users_ensure_defaults_py,
)


class UserManagementService:
    """Users table management (internal API)."""

    @staticmethod
    def create_internal(payload: Dict[str, Any]) -> Any:
        return users_create_internal_py(
            p_user_name=payload.get("user_name", ""),
            p_user_email=payload.get("user_email"),
            p_full_name=payload.get("full_name"),
            p_phone=payload.get("phone"),
            p_password=payload.get("password", ""),
            p_user_role=payload.get("user_role", "user"),
        )

    @staticmethod
    def set_password(payload: Dict[str, Any]) -> Any:
        users_set_password_py(
            p_user_id=int(payload["user_id"]),
            p_new_password=payload.get("new_password", ""),
        )
        return None

    @staticmethod
    def ensure_defaults() -> Any:
        return users_ensure_defaults_py()
