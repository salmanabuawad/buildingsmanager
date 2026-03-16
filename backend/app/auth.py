"""
Auth utilities: passlib bcrypt + session parsing + JWT decode.
The frontend stores sessions in sessionStorage as { user_id, user_name, user_role }
and sends the user_id as uid:{user_id} in RPC payloads (p_user_id).
File endpoints accept a base64-encoded 'file_session' cookie.
"""
import base64
import json
from typing import Any, Dict
from passlib.context import CryptContext
from jose import jwt, JWTError
from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def parse_user_id(p_user_id: str | None) -> int | None:
    """Extract integer user_id from uid:{user_id} format."""
    if not p_user_id:
        return None
    if p_user_id.startswith("uid:"):
        try:
            return int(p_user_id[4:])
        except ValueError:
            return None
    try:
        return int(p_user_id)
    except (ValueError, TypeError):
        return None


def decode_token(token: str) -> Dict[str, Any]:
    """Decode a JWT token. Raises ValueError on invalid token."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        return payload
    except JWTError as e:
        raise ValueError(f"Invalid token: {e}")


def create_token(data: Dict[str, Any]) -> str:
    """Create a JWT token."""
    return jwt.encode(data, settings.SECRET_KEY, algorithm="HS256")


def parse_file_session(cookie_value: str | None) -> dict | None:
    """Decode base64 file_session cookie → {user_id, user_name, user_role}."""
    if not cookie_value:
        return None
    try:
        raw = base64.b64decode(cookie_value + "==").decode("utf-8")
        return json.loads(raw)
    except Exception:
        return None
