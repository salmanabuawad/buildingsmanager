"""
Replaces Postgres auth_login: validate user_name/password against users table (bcrypt).
"""
from sqlalchemy.orm import Session
from sqlalchemy import text
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def auth_login(db: Session, p_user_name: str, p_password: str) -> dict:
    if not p_user_name or not (p_user_name := p_user_name.strip()):
        raise ValueError("auth_login: user_name and password (min 6 chars) required")
    if not p_password or len(p_password) < 6:
        raise ValueError("auth_login: user_name and password (min 6 chars) required")

    row = db.execute(
        text("""
            SELECT user_id, user_name, user_role, password_hash
            FROM users
            WHERE user_name = :un AND active = true
            LIMIT 1
        """),
        {"un": p_user_name},
    ).fetchone()

    if not row:
        raise ValueError("auth_login: invalid credentials")
    user_id, user_name, user_role, password_hash = row
    if not password_hash:
        raise ValueError("auth_login: user has no password set")

    if not pwd_context.verify(p_password, password_hash):
        raise ValueError("auth_login: invalid credentials")

    return {
        "user_id": user_id,
        "user_name": user_name,
        "user_role": (user_role or "user"),
    }
