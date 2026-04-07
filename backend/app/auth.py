from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_jwt(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Validate JWT and return payload. Use for routes that don't need the User ORM (e.g. session users with sub=uid:123)."""
    return decode_token(credentials.credentials)


def _parse_uid(sub: str | None) -> int | None:
    """Extract integer user_id from JWT sub claim ('uid:123' or plain int)."""
    if sub is None:
        return None
    s = str(sub).strip()
    if s.startswith("uid:"):
        try:
            return int(s[4:])
        except ValueError:
            return None
    try:
        return int(s)
    except (ValueError, TypeError):
        return None


class _UserRow:
    """Lightweight user object built from raw DB row (avoids ORM model mismatch)."""
    def __init__(self, row):
        m = row._mapping
        self.user_id = m["user_id"]
        self.id = m["user_id"]  # alias for compatibility
        self.user_name = m.get("user_name")
        self.user_email = m.get("user_email")
        self.full_name = m.get("full_name")
        self.phone = m.get("phone")
        self.active = m.get("active", True)
        self.role = "user"  # default; role comes from JWT, not DB


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    token = credentials.credentials
    payload = decode_token(token)
    sub: str = payload.get("sub")
    if sub is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )

    uid = _parse_uid(sub)
    if uid is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not parse user id",
        )

    from sqlalchemy import text
    row = db.execute(text("SELECT * FROM users WHERE user_id = :uid"), {"uid": uid}).fetchone()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    user = _UserRow(row)
    user.role = payload.get("role", "user")
    return user
