"""
Users repository: DB access for public.users table (user_id, user_name, user_email, password_hash, user_role).
"""
from typing import Any, Dict, List, Optional

from app.repos.base_repo import BaseRepo


class UsersRepo(BaseRepo):
    """Repository for public.users (auth users)."""

    def get_by_name(self, user_name: str, conn=None) -> Optional[Dict[str, Any]]:
        rows = self._fetch(
            "SELECT user_id, user_name, user_email, password_hash, user_role, active FROM users WHERE user_name = :n AND active = true",
            {"n": user_name},
            conn=conn,
        )
        if not rows:
            return None
        row = rows[0]
        return {str(k).lower(): v for k, v in row.items()} if isinstance(row, dict) else row

    def get_by_id(self, user_id: int, conn=None) -> Optional[Dict[str, Any]]:
        rows = self._fetch(
            "SELECT user_id, user_name, user_email, password_hash, user_role, active FROM users WHERE user_id = :id",
            {"id": user_id},
            conn=conn,
        )
        if not rows:
            return None
        row = rows[0]
        return {str(k).lower(): v for k, v in row.items()} if isinstance(row, dict) else row

    def get_user_name_by_id(self, user_id: int, conn=None) -> Optional[str]:
        rows = self._fetch(
            "SELECT user_name FROM users WHERE user_id = :uid LIMIT 1",
            {"uid": user_id},
            conn=conn,
        )
        return str(rows[0]["user_name"]) if rows and rows[0].get("user_name") else None

    def get_user_for_inspector_check(self, user_id: int, conn=None) -> Optional[Dict[str, Any]]:
        """Get user_id and user_role for access token validation."""
        rows = self._fetch(
            "SELECT user_id, user_role FROM users WHERE user_id = :uid AND active = true",
            {"uid": user_id},
            conn=conn,
        )
        return rows[0] if rows else None

    def set_password(self, user_id: int, password_hash: str, conn=None) -> None:
        self._run(
            "UPDATE users SET password_hash = :hash, updated_at = now() WHERE user_id = :uid",
            {"hash": password_hash, "uid": user_id},
            conn=conn,
        )
