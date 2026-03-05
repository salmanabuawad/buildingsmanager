"""
Auth and current user using the public.users table.
user_id (bigint), user_name, user_email, password_hash, user_role, active.
Uses UsersRepo for all DB access.
"""
from typing import Optional
from dataclasses import dataclass
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passlib.context import CryptContext

from app.repos import UsersRepo

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

_users_repo = UsersRepo()


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


def verify_password(plain: str, hashed: Optional[str]) -> bool:
    if not hashed:
        return False
    return pwd_context.verify(plain, hashed)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def get_user_by_name(user_name: str) -> Optional[dict]:
    """Load user from public.users by user_name."""
    return _users_repo.get_by_name(user_name)


def get_user_by_id(user_id: int) -> Optional[dict]:
    """Load user from public.users by user_id."""
    return _users_repo.get_by_id(user_id)


def login_with_users_table(user_name: str, password: str) -> Optional[CurrentUser]:
    """
    Authenticate using public.users (user_name + password_hash).
    Returns CurrentUser or None.
    """
    row = get_user_by_name(user_name)
    if not row:
        return None
    if not verify_password(password, row.get("password_hash")):
        return None
    return CurrentUser(
        user_id=row["user_id"],
        user_name=row["user_name"],
        user_email=row.get("user_email"),
        user_role=row.get("user_role") or "user",
        active=row.get("active", True),
    )


def get_current_user_users_table(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> CurrentUser:
    """
    Dependency: require JWT and resolve current user from public.users by user_id (sub in token).
    """
    from app.auth import decode_token
    token = credentials.credentials
    payload = decode_token(token)
    sub = payload.get("sub")
    if sub is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    try:
        user_id = int(sub)
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    row = get_user_by_id(user_id)
    if not row or not row.get("active", True):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return CurrentUser(
        user_id=row["user_id"],
        user_name=row["user_name"],
        user_email=row.get("user_email"),
        user_role=row.get("user_role") or "user",
        active=row.get("active", True),
    )
