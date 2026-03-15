"""
Authentication service.
Replaces: auth_login, auth_login_by_otp, auth_login_by_task_token,
          users_create_internal, users_set_password, users_ensure_defaults RPCs.
"""
from datetime import datetime, timezone
from app.database import fetch_one, execute, fetch_val
from app.auth import hash_password, verify_password


async def login(user_name: str, password: str) -> dict:
    """Verify user_name + password. Returns {user_id, user_name, user_role}."""
    if not user_name or not password or len(password) < 6:
        raise ValueError("auth_login: user_name and password (min 6 chars) required")

    row = await fetch_one(
        "SELECT user_id, user_name, user_role, password_hash FROM users "
        "WHERE user_name = $1 AND active = true LIMIT 1",
        user_name.strip(),
    )
    if not row:
        raise ValueError("auth_login: invalid credentials")
    if not row["password_hash"]:
        raise ValueError("auth_login: user has no password set")
    if not verify_password(password, row["password_hash"]):
        raise ValueError("auth_login: invalid credentials")

    return {
        "user_id": row["user_id"],
        "user_name": row["user_name"],
        "user_role": row["user_role"] or "user",
    }


async def login_otp(otp: str) -> dict:
    """Consume a one-time OTP. Returns {user_id, user_name, user_role, task_id}."""
    if not otp or len(otp.strip()) < 6:
        raise ValueError("auth_login_by_otp: valid OTP required")

    pool = __import__("app.database", fromlist=["get_pool"]).get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE inspector_otp_codes SET used_at = now() "
            "WHERE otp_code = $1 AND used_at IS NULL AND expires_at > now() "
            "RETURNING user_id, task_id",
            otp.strip(),
        )
    if not row:
        raise ValueError("auth_login_by_otp: invalid or expired OTP")

    user = await fetch_one(
        "SELECT user_name, user_role FROM users WHERE user_id = $1 AND active = true",
        row["user_id"],
    )
    if not user:
        raise ValueError("auth_login_by_otp: user not found or inactive")

    return {
        "user_id": row["user_id"],
        "user_name": user["user_name"],
        "user_role": user["user_role"] or "user",
        "task_id": row["task_id"],
    }


async def login_task_token(token: str) -> dict:
    """Consume a task access token. Returns {user_id, user_name, user_role, task_id}."""
    if not token or not token.strip():
        raise ValueError("auth_login_by_task_token: token required")

    pool = __import__("app.database", fromlist=["get_pool"]).get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE inspection_task_access_tokens SET used_at = now() "
            "WHERE token = $1 AND used_at IS NULL AND expires_at > now() "
            "RETURNING task_id, user_id",
            token.strip(),
        )
    if not row:
        raise ValueError("auth_login_by_task_token: invalid or expired token")

    user = await fetch_one(
        "SELECT user_name, user_role FROM users WHERE user_id = $1 AND active = true",
        row["user_id"],
    )
    if not user:
        raise ValueError("auth_login_by_task_token: user not found or inactive")

    return {
        "user_id": row["user_id"],
        "user_name": user["user_name"],
        "user_role": user["user_role"] or "user",
        "task_id": row["task_id"],
    }


async def create_user(user_name: str, user_email: str, password: str, user_role: str = "user") -> dict:
    """Create a user with password hash. Returns {user_id, auth_user_id}."""
    if not user_name or not user_name.strip():
        raise ValueError("users_create_internal: user_name required")
    if not password or len(password) < 6:
        raise ValueError("users_create_internal: password min 6 chars required")
    if user_role not in ("admin", "user", "inspector"):
        user_role = "user"

    pool = __import__("app.database", fromlist=["get_pool"]).get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            user_id = await conn.fetchval(
                "INSERT INTO users (user_name, user_email, user_role, password_hash, active) "
                "VALUES ($1, $2, $3, $4, true) RETURNING user_id",
                user_name.strip(),
                user_email.strip() if user_email and user_email.strip() else None,
                user_role,
                hash_password(password),
            )
            auth_id = f"uid:{user_id}"
            await conn.execute(
                "UPDATE users SET auth_user_id = $1 WHERE user_id = $2",
                auth_id,
                user_id,
            )
    return {"user_id": user_id, "auth_user_id": auth_id}


async def set_password(user_id: int, new_password: str) -> None:
    """Set password for existing user."""
    if not user_id or not new_password or len(new_password) < 6:
        raise ValueError("users_set_password: user_id and new password (min 6 chars) required")
    result = await execute(
        "UPDATE users SET password_hash = $1, updated_at = now() WHERE user_id = $2",
        hash_password(new_password),
        user_id,
    )
    if result == "UPDATE 0":
        raise ValueError("users_set_password: user not found")


async def ensure_defaults() -> dict:
    """Create admin/user with default passwords if missing."""
    pool = __import__("app.database", fromlist=["get_pool"]).get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            for uname, uemail, urole, upw in [
                ("admin", "admin@buildingsmanager.local", "admin", "admin123"),
                ("user", "user@buildingsmanager.local", "user", "user123"),
            ]:
                exists = await conn.fetchval(
                    "SELECT user_id FROM users WHERE user_name = $1", uname
                )
                if not exists:
                    uid = await conn.fetchval(
                        "INSERT INTO users (user_name, user_email, user_role, password_hash, active) "
                        "VALUES ($1, $2, $3, $4, true) RETURNING user_id",
                        uname, uemail, urole, hash_password(upw),
                    )
                    await conn.execute(
                        "UPDATE users SET auth_user_id = $1 WHERE user_id = $2",
                        f"uid:{uid}", uid,
                    )
                else:
                    await conn.execute(
                        "UPDATE users SET auth_user_id = $1 WHERE user_id = $2 AND auth_user_id IS NULL",
                        f"uid:{exists}", exists,
                    )
    return {"success": True}
