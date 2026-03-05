import logging
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from datetime import timedelta
from pydantic import BaseModel
from app.database import get_db
from app.models import User
from app.schemas import UserLogin, Token, UserResponse
from app.auth import verify_password, create_access_token, get_current_user, decode_token
from app.config import settings
from app.users_table import login_with_users_table, get_current_user_users_table, get_user_by_id
from app.services.auth_service import AuthService

from app.limiter import limiter

logger = logging.getLogger(__name__)
router = APIRouter()


class SessionLoginRequest(BaseModel):
    user_name: str
    password: str


class SessionByTaskTokenRequest(BaseModel):
    token: str


class SessionByTaskTokenResponse(BaseModel):
    user_id: int
    user_name: str
    user_role: str
    task_id: int
    access_token: str


class SessionLoginResponse(BaseModel):
    user_id: int
    user_name: str
    user_role: str
    access_token: str


def _login_via_users_table(user_name: str, password: str):
    """Authenticate using public.users. Returns (access_token, user_dict) or None."""
    current = login_with_users_table(user_name, password)
    if not current:
        return None
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(current.user_id), "role": current.user_role},
        expires_delta=access_token_expires,
    )
    user_dict = {
        "id": str(current.user_id),
        "username": current.user_name,
        "email": current.user_email,
        "full_name": current.user_name,
        "role": current.user_role,
    }
    return access_token, user_dict


@router.post("/session", response_model=SessionLoginResponse)
@limiter.limit("10/minute")
def session_login(request: Request, body: SessionLoginRequest):
    """REST session login (users table). Returns user_id, user_name, user_role for sessionStorage."""
    try:
        session = AuthService.session_login(body.user_name or "", body.password or "")
    except Exception as e:
        logger.exception("Session login failed: %s", e)
        detail = str(e) if settings.ENVIRONMENT == "development" else "Login failed. Check server logs."
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=detail,
        ) from e
    if not session:
        logger.warning("Session login failed for user=%s", (body.user_name or "")[:50])
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return SessionLoginResponse(**session)


@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
def login(request: Request, user_login: UserLogin, db: Session = Depends(get_db)):
    # Prefer public.users table
    result = _login_via_users_table(user_login.username, user_login.password)
    if result is not None:
        access_token, user_dict = result
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": user_dict,
        }

    # Fallback: legacy User model (if your DB has that schema)
    user = db.query(User).filter(User.username == user_login.username).first()
    if not user or not verify_password(user_login.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is inactive")

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role},
        expires_delta=access_token_expires,
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
        },
    }


@router.get("/me", response_model=UserResponse)
def get_current_user_info(
    current_user_legacy=Depends(get_current_user),
):
    """Current user (legacy User model). Use GET /me/users-table when using public.users auth."""
    u = current_user_legacy
    return UserResponse(
        id=str(u.id),
        username=u.username,
        email=u.email,
        full_name=u.full_name,
        role=u.role,
        active=u.active,
    )


@router.post("/session-by-task-token", response_model=SessionByTaskTokenResponse)
@limiter.limit("10/minute")
def session_by_task_token(request: Request, body: SessionByTaskTokenRequest):
    """Login using one-time inspection task token (from email deep link). No password required."""
    from app.repos import InspectionTaskAccessTokenRepo
    token_repo = InspectionTaskAccessTokenRepo()
    token = (body.token or "").strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token required",
        )
    r = token_repo.validate_and_get(token)
    if not r:
        logger.warning("Task token login failed (invalid or expired)")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    token_repo.mark_used(token)
    access_token = create_access_token(
        data={"sub": str(r["user_id"]), "role": r["user_role"] or "inspector"},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return SessionByTaskTokenResponse(
        user_id=r["user_id"],
        user_name=r["user_name"],
        user_role=r["user_role"] or "inspector",
        task_id=r["task_id"],
        access_token=access_token,
    )


@router.get("/me/users-table")
def get_me_users_table(current_user=Depends(get_current_user_users_table)):
    """Current user from public.users."""
    return {
        "id": str(current_user.user_id),
        "username": current_user.user_name,
        "email": current_user.user_email,
        "full_name": current_user.user_name,
        "role": current_user.user_role,
        "active": current_user.active,
    }
