"""
Python implementations of user RPCs (replacing DB functions).
Uses UsersRepo for all DB access.
"""
from typing import Any, Dict, Optional

from app.repos import UsersRepo
from app.users_table import get_password_hash

_users_repo = UsersRepo()


def users_create_internal(
    p_user_name: str,
    p_user_email: Optional[str],
    p_password: str,
    p_full_name: Optional[str] = None,
    p_phone: Optional[str] = None,
    p_user_role: str = "user",
) -> Dict[str, Any]:
    """Create user with password; set auth_user_id = 'uid:' || user_id. Returns { user_id, auth_user_id }."""
    p_user_name = (p_user_name or "").strip()
    if not p_user_name:
        raise ValueError("users_create_internal: user_name required")
    if not p_password or len(p_password) < 6:
        raise ValueError("users_create_internal: password min 6 chars required")
    if p_user_role not in ("admin", "user", "inspector"):
        p_user_role = "user"

    return _users_repo.create_with_auth(
        user_name=p_user_name,
        user_email=(p_user_email or "").strip(),
        user_role=p_user_role,
        password_hash=get_password_hash(p_password),
        full_name=(p_full_name or "").strip() or None,
        phone=(p_phone or "").strip() or None,
    )


def users_set_password(p_user_id: int, p_new_password: str) -> None:
    """Set password for a user (by user_id)."""
    if p_user_id is None or not p_new_password or len(p_new_password) < 6:
        raise ValueError("users_set_password: user_id and new password (min 6 chars) required")
    _users_repo.set_password(p_user_id, get_password_hash(p_new_password))


def users_ensure_defaults() -> Dict[str, Any]:
    """Create admin/user with default passwords if missing. Returns { success: true }."""
    _users_repo.ensure_defaults(
        get_password_hash("admin123"),
        get_password_hash("user123"),
    )
    return {"success": True}
