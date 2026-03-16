"""
Auth and current user using the public.users table.
user_id (bigint), user_name, user_email, password_hash, user_role, active.
Uses UsersRepo for all DB access.

Session auth: reads X-Users-Table-Session header (base64-encoded JSON with user_id/user_name/user_role).
Used for REST and RPC route protection.
"""
import base64
import json
from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.repos.users_repo import UsersRepo

_users_repo = UsersRepo()
security_bearer = HTTPBearer(auto_error=False)


@dataclass
class CurrentUser:
    user_id: int
    user_name: str
    user_email: Optional[str]
    user_role: str
    active: bool

    @property
    def is_admin(self) -> bool:
        return self.user_role == "admin"


def _parse_session_header(raw: Optional[str]) -> Optional[CurrentUser]:
    """Decode X-Users-Table-Session base64 JSON → CurrentUser."""
    if not raw:
        return None
    try:
        # Try standard base64 first, then URL-safe
        for decoder in (base64.b64decode, base64.urlsafe_b64decode):
            try:
                pad = raw + "=" * (4 - len(raw) % 4) if len(raw) % 4 else raw
                decoded = decoder(pad).decode("utf-8")
                payload = json.loads(decoded)
                uid = payload.get("user_id")
                role = (payload.get("user_role") or "user").lower()
                if uid is not None:
                    return CurrentUser(
                        user_id=int(uid),
                        user_name=payload.get("user_name") or "",
                        user_email=payload.get("user_email"),
                        user_role=role,
                        active=True,
                    )
            except Exception:
                continue
    except Exception:
        pass
    return None


def get_current_user_users_table(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
) -> CurrentUser:
    """
    FastAPI dependency: require authenticated user.
    Checks X-Users-Table-Session header (base64 JSON) or Bearer token (JWT).
    """
    # 1. Check session header
    raw_session = (
        request.headers.get("X-Users-Table-Session")
        or request.headers.get("x-users-table-session")
    )
    user = _parse_session_header(raw_session)
    if user is not None:
        return user

    # 2. Check Bearer token
    if credentials and credentials.credentials:
        try:
            from app.auth import decode_token
            payload = decode_token(credentials.credentials)
            sub = payload.get("sub")
            role = (payload.get("role") or "user").lower()
            if sub is not None:
                uid = int(sub) if str(sub).isdigit() else None
                if uid is not None:
                    row = _users_repo.get_by_id(uid)
                    if row and row.get("active", True):
                        return CurrentUser(
                            user_id=uid,
                            user_name=row.get("user_name") or "",
                            user_email=row.get("user_email"),
                            user_role=row.get("user_role") or role,
                            active=True,
                        )
        except Exception:
            pass

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
    )
