"""
Inspection service.
Replaces: inspector_create_otp, inspection_task_create_access_token RPCs.
"""
import secrets
from app.database import get_pool
from app.auth import parse_user_id


async def create_otp(
    user_id: int,
    task_id: int | None = None,
    caller_user_id: str | None = None,
) -> str:
    """Generate 6-digit OTP for inspector. Admin only if caller provided."""
    if not user_id:
        raise ValueError("inspector_create_otp: user_id required")

    pool = get_pool()
    async with pool.acquire() as conn:
        # Check caller is admin if provided
        if caller_user_id is not None:
            cid = parse_user_id(caller_user_id)
            if cid:
                role = await conn.fetchval(
                    "SELECT user_role FROM users WHERE user_id = $1", cid
                )
                if role != "admin":
                    raise ValueError("inspector_create_otp: only admin can create OTP")

        # User must be active
        user_role = await conn.fetchval(
            "SELECT user_role FROM users WHERE user_id = $1 AND active = true", user_id
        )
        if user_role is None:
            raise ValueError("inspector_create_otp: user not found or inactive")

        # Invalidate previous OTPs
        if task_id is not None:
            await conn.execute(
                "UPDATE inspector_otp_codes SET used_at = now() "
                "WHERE user_id = $1 AND task_id = $2 AND used_at IS NULL",
                user_id, task_id,
            )
        else:
            await conn.execute(
                "UPDATE inspector_otp_codes SET used_at = now() "
                "WHERE user_id = $1 AND used_at IS NULL",
                user_id,
            )

        # Generate 6-digit OTP
        otp = str(secrets.randbelow(1000000)).zfill(6)
        await conn.execute(
            "INSERT INTO inspector_otp_codes (user_id, task_id, otp_code, expires_at) "
            "VALUES ($1, $2, $3, now() + interval '30 minutes')",
            user_id, task_id, otp,
        )

    return otp


async def create_access_token(
    task_id: int,
    user_id: int,
    caller_user_id: str,
) -> str:
    """Create or reuse one-time access token for a task. Admin only."""
    if not task_id or not user_id or not caller_user_id:
        raise ValueError("inspection_task_create_access_token: task_id, user_id, caller_user_id required")

    pool = get_pool()
    async with pool.acquire() as conn:
        cid = parse_user_id(caller_user_id)
        if cid:
            role = await conn.fetchval(
                "SELECT user_role FROM users WHERE user_id = $1", cid
            )
            if role != "admin":
                raise ValueError("inspection_task_create_access_token: only admin can create tokens")

        # Task must exist
        exists = await conn.fetchval(
            "SELECT created_by FROM inspection_tasks WHERE id = $1", task_id
        )
        if exists is None:
            raise ValueError("inspection_task_create_access_token: task not found")

        # Reuse valid token
        existing = await conn.fetchval(
            "SELECT token FROM inspection_task_access_tokens "
            "WHERE task_id = $1 AND user_id = $2 AND used_at IS NULL AND expires_at > now() "
            "LIMIT 1",
            task_id, user_id,
        )
        if existing:
            return existing

        # Invalidate old tokens
        await conn.execute(
            "UPDATE inspection_task_access_tokens SET used_at = now() "
            "WHERE task_id = $1 AND user_id = $2",
            task_id, user_id,
        )

        token = secrets.token_hex(32)
        await conn.execute(
            "INSERT INTO inspection_task_access_tokens (task_id, user_id, token, expires_at) "
            "VALUES ($1, $2, $3, now() + interval '7 days')",
            task_id, user_id, token,
        )

    return token
