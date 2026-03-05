"""
Auth service: session login using public.users table.
Returns JWT for authenticated API calls.
"""
from datetime import timedelta
from typing import Optional

from app.auth import create_access_token
from app.config import settings
from app.users_table import login_with_users_table


class AuthService:
    """Session-based auth (users table) with JWT for API access."""

    @staticmethod
    def session_login(user_name: str, password: str) -> Optional[dict]:
        """
        Authenticate with user_name + password. Returns session payload + access_token for API auth.
        """
        current = login_with_users_table(user_name.strip(), password)
        if not current:
            return None
        expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": str(current.user_id), "role": current.user_role},
            expires_delta=expires,
        )
        return {
            "user_id": current.user_id,
            "user_name": current.user_name,
            "user_role": current.user_role,
            "access_token": access_token,
        }
