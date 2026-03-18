from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import timedelta
from app.database import get_db
from app.models import User
from app.schemas import UserLogin, Token, UserResponse, SessionLogin, SessionLoginResponse
from app.auth import verify_password, create_access_token, get_current_user
from app.config import settings

router = APIRouter()


def _session_login_from_users_table(body: SessionLogin, db: Session) -> SessionLoginResponse:
    """Query the actual users table (user_id, user_name, user_role, password_hash) used by Supabase/migration."""
    row = db.execute(
        text(
            "SELECT user_id, user_name, user_role, password_hash, active FROM users WHERE user_name = :un LIMIT 1"
        ),
        {"un": body.user_name.strip()},
    ).first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id, user_name, user_role, password_hash, active = row
    if not active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )
    if not password_hash or not verify_password(body.password, password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": f"uid:{user_id}", "role": user_role or "user"},
        expires_delta=access_token_expires,
    )
    return SessionLoginResponse(
        user_id=user_id,
        user_name=user_name or "",
        user_role=user_role or "user",
        access_token=access_token,
    )


@router.post("/login", response_model=Token)
def login(user_login: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == user_login.username).first()

    if not user or not verify_password(user_login.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role},
        expires_delta=access_token_expires
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role
        }
    }


@router.post("/session", response_model=SessionLoginResponse)
def session_login(body: SessionLogin, db: Session = Depends(get_db)):
    """Session login: accepts user_name/password (frontend convention). Uses users table (user_id, user_name, password_hash)."""
    return _session_login_from_users_table(body, db)


@router.get("/me", response_model=UserResponse)
def get_current_user_info(current_user: User = Depends(get_current_user)):
    return UserResponse(
        id=str(current_user.id),
        username=current_user.username,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role,
        active=current_user.active
    )
