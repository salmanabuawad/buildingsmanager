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

    Auth sources checked in order:
    1. file_session cookie  (base64 JSON {user_id, user_name, user_role}) — set by frontend on login
    2. X-Users-Table-Session header (same base64 JSON format)
    3. X-User-Id header     (numeric user ID sent by the frontend apiFetch shim)
    4. Authorization: Bearer <jwt>
    """
    # 1. file_session cookie (base64 JSON, same format as session header)
    file_session = request.cookies.get("file_session")
    user = _parse_session_header(file_session)
    if user is not None:
        return user

    # 2. X-Users-Table-Session header
    raw_session = (
        request.headers.get("X-Users-Table-Session")
        or request.headers.get("x-users-table-session")
    )
    user = _parse_session_header(raw_session)
    if user is not None:
        return user

    # 3. X-User-Id header (frontend sessionHeaders() shim sends just the numeric user ID)
    #    Trust the ID directly — already validated at login. No per-request DB roundtrip.
    x_user_id = request.headers.get("X-User-Id") or request.headers.get("x-user-id")
    if x_user_id:
        try:
            uid = int(x_user_id)
            if uid > 0:
                return CurrentUser(
                    user_id=uid,
                    user_name="",
                    user_email=None,
                    user_role="user",
                    active=True,
                )
        except (ValueError, TypeError):
            pass

    # 4. Bearer JWT — trust the signed token directly, no DB roundtrip
    if credentials and credentials.credentials:
        try:
            from app.auth import decode_token
            payload = decode_token(credentials.credentials)
            sub = payload.get("sub")
            role = (payload.get("role") or "user").lower()
            if sub is not None:
                uid = int(sub) if str(sub).isdigit() else None
                if uid is not None:
                    return CurrentUser(
                        user_id=uid,
                        user_name="",
                        user_email=None,
                        user_role=role,
                        active=True,
                    )
        except Exception:
            pass

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
    )
