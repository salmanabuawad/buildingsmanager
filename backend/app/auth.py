"""
Auth utilities: passlib bcrypt + session parsing.
The frontend stores sessions in sessionStorage as { user_id, user_name, user_role }
and sends the user_id as uid:{user_id} in RPC payloads (p_user_id).
File endpoints accept a base64-encoded 'file_session' cookie.
"""
import base64
import json
from passlib.context import CryptContext

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


def parse_file_session(cookie_value: str | None) -> dict | None:
    """Decode base64 file_session cookie → {user_id, user_name, user_role}."""
    if not cookie_value:
        return None
    try:
        raw = base64.b64decode(cookie_value + "==").decode("utf-8")
        return json.loads(raw)
    except Exception:
        return None
