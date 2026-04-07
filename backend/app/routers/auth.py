from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import timedelta
from app.database import get_db
from app.schemas import UserLogin, Token, UserResponse, SessionLogin, SessionLoginResponse
from app.auth import verify_password, create_access_token, get_current_user, decode_token
from app.config import settings

_bearer = HTTPBearer()

router = APIRouter()


def _session_login_from_users_table(body: SessionLogin, db: Session) -> SessionLoginResponse:
    """Query the users table (user_id, user_name, user_role, password_hash)."""
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
    """Legacy login using user_name field (maps UserLogin.username → user_name column)."""
    row = db.execute(
        text(
            "SELECT user_id, user_name, user_role, password_hash, active, user_email, full_name "
            "FROM users WHERE user_name = :un LIMIT 1"
        ),
        {"un": user_login.username.strip()},
    ).first()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id, user_name, user_role, password_hash, active, user_email, full_name = row

    if not active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )

    if not password_hash or not verify_password(user_login.password, password_hash):
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

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "user_id": user_id,
            "user_name": user_name or "",
            "user_email": user_email,
            "full_name": full_name,
            "user_role": user_role or "user",
        },
    }


@router.post("/session", response_model=SessionLoginResponse)
def session_login(body: SessionLogin, db: Session = Depends(get_db)):
    """Session login: accepts user_name/password (frontend convention). Uses users table (user_id, user_name, password_hash)."""
    return _session_login_from_users_table(body, db)


@router.get("/me", response_model=UserResponse)
def get_current_user_info(current_user=Depends(get_current_user)):
    return UserResponse(
        user_id=current_user.user_id,
        user_name=current_user.user_name or "",
        user_email=current_user.user_email,
        user_role=current_user.role,
        full_name=getattr(current_user, "full_name", None),
        phone=getattr(current_user, "phone", None),
        active=current_user.active,
    )


@router.post("/heartbeat")
def heartbeat(credentials: HTTPAuthorizationCredentials = Depends(_bearer)):
    """Heartbeat / keep-alive: validate the current token and return a fresh one with a reset expiry."""
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    new_token = create_access_token(
        data={"sub": payload.get("sub"), "role": payload.get("role", "user")},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {"access_token": new_token}
