"""
Users repository: DB access for public.users table (user_id, user_name, user_email, password_hash, user_role).
This is for the REAL users table used by auth (not the legacy ORM User model).
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

    def get_user_id_by_auth_user_id(self, auth_user_id: str, conn=None) -> Optional[int]:
        rows = self._fetch(
            "SELECT user_id FROM users WHERE auth_user_id = :aid",
            {"aid": auth_user_id},
            conn=conn,
        )
        return int(rows[0]["user_id"]) if rows else None

    def get_user_id_by_uid(self, uid: int, conn=None) -> Optional[int]:
        rows = self._fetch(
            "SELECT user_id FROM users WHERE user_id = :uid",
            {"uid": uid},
            conn=conn,
        )
        return int(rows[0]["user_id"]) if rows else None

    def get_default_user_id(self, conn=None) -> Optional[int]:
        rows = self._fetch(
            "SELECT user_id FROM users WHERE user_name = 'default' AND auth_user_id IS NULL LIMIT 1",
            {},
            conn=conn,
        )
        return int(rows[0]["user_id"]) if rows else None

    def create_with_auth(
        self,
        user_name: str,
        user_email: Optional[str],
        user_role: str,
        password_hash: str,
        full_name: Optional[str] = None,
        phone: Optional[str] = None,
        conn=None,
    ) -> Dict[str, Any]:
        """Create user and set auth_user_id. Returns { user_id, auth_user_id }."""
        rows = self._fetch(
            """INSERT INTO users (user_name, user_email, user_role, password_hash, active, full_name, phone)
               VALUES (:name, NULLIF(TRIM(:email), ''), :role, :hash, true, NULLIF(TRIM(:full_name), ''), NULLIF(TRIM(:phone), ''))
               RETURNING user_id""",
            {
                "name": user_name,
                "email": (user_email or "").strip(),
                "role": user_role,
                "hash": password_hash,
                "full_name": (full_name or "").strip() or None,
                "phone": (phone or "").strip() or None,
            },
            conn=conn,
        )
        if not rows:
            raise RuntimeError("users_create_internal: insert failed")
        user_id = rows[0]["user_id"]
        auth_user_id = f"uid:{user_id}"
        self._run(
            "UPDATE users SET auth_user_id = :aid WHERE user_id = :uid",
            {"aid": auth_user_id, "uid": user_id},
            conn=conn,
        )
        return {"user_id": user_id, "auth_user_id": auth_user_id}

    def ensure_auth_user_id(self, auth_user_id: str, conn=None) -> Optional[int]:
        """Insert or update user with auth_user_id, return user_id."""
        self._run(
            """INSERT INTO users (auth_user_id, user_name, user_email)
               VALUES (:aid, :aid, NULL)
               ON CONFLICT (auth_user_id) DO UPDATE SET updated_at = now()""",
            {"aid": auth_user_id},
            conn=conn,
        )
        rows = self._fetch(
            "SELECT user_id FROM users WHERE auth_user_id = :aid",
            {"aid": auth_user_id},
            conn=conn,
        )
        return int(rows[0]["user_id"]) if rows else None

    def set_password(self, user_id: int, password_hash: str, conn=None) -> None:
        self._run(
            "UPDATE users SET password_hash = :hash, updated_at = now() WHERE user_id = :uid",
            {"hash": password_hash, "uid": user_id},
            conn=conn,
        )

    def get_user_for_inspector_check(self, user_id: int, conn=None) -> Optional[Dict[str, Any]]:
        """Get user_id and user_role for access token validation."""
        rows = self._fetch(
            "SELECT user_id, user_role FROM users WHERE user_id = :uid AND active = true",
            {"uid": user_id},
            conn=conn,
        )
        return rows[0] if rows else None

    def ensure_defaults(self, admin_hash: str, user_hash: str, conn=None) -> None:
        """Create admin/user with default passwords if missing."""
        self._run(
            """INSERT INTO users (user_name, user_email, user_role, password_hash, active)
               SELECT 'admin', 'admin@buildingsmanager.local', 'admin', :hash, true
               WHERE NOT EXISTS (SELECT 1 FROM users WHERE user_name = 'admin')""",
            {"hash": admin_hash},
            conn=conn,
        )
        admin_row = self._fetch("SELECT user_id FROM users WHERE user_name = 'admin' LIMIT 1", {}, conn=conn)
        if admin_row:
            uid = admin_row[0]["user_id"]
            self._run("UPDATE users SET auth_user_id = :aid WHERE user_id = :uid", {"aid": f"uid:{uid}", "uid": uid}, conn=conn)

        self._run(
            """INSERT INTO users (user_name, user_email, user_role, password_hash, active)
               SELECT 'user', 'user@buildingsmanager.local', 'user', :hash, true
               WHERE NOT EXISTS (SELECT 1 FROM users WHERE user_name = 'user')""",
            {"hash": user_hash},
            conn=conn,
        )
        user_row = self._fetch("SELECT user_id FROM users WHERE user_name = 'user' LIMIT 1", {}, conn=conn)
        if user_row:
            uid = user_row[0]["user_id"]
            self._run("UPDATE users SET auth_user_id = :aid WHERE user_id = :uid", {"aid": f"uid:{uid}", "uid": uid}, conn=conn)

        self._run(
            "UPDATE users SET auth_user_id = CONCAT('uid:', user_id) WHERE auth_user_id IS NULL AND user_name IN ('admin', 'user')",
            {},
            conn=conn,
        )
