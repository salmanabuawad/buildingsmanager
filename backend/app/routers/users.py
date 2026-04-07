from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.auth import get_password_hash, decode_token

router = APIRouter()
_bearer = HTTPBearer()


def _require_jwt(credentials: HTTPAuthorizationCredentials = Depends(_bearer)):
    return decode_token(credentials.credentials)


@router.post("/internal")
def create_user_internal(
    body: dict,
    _payload: dict = Depends(_require_jwt),
    db: Session = Depends(get_db),
):
    """Create a new user with hashed password. Accepts p_user_name, p_user_email, p_password, p_user_role, full_name, phone."""
    user_name = (body.get("p_user_name") or "").strip()
    user_email = (body.get("p_user_email") or "").strip()
    password = body.get("p_password") or ""
    user_role = (body.get("p_user_role") or "user").strip()
    full_name = (body.get("full_name") or "").strip() or None
    phone = (body.get("phone") or "").strip() or None

    if not user_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="user_name is required")
    if not password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="password is required")

    # Check for duplicate user_name
    existing = db.execute(
        text("SELECT user_id FROM users WHERE user_name = :un LIMIT 1"),
        {"un": user_name},
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")

    password_hash = get_password_hash(password)

    row = db.execute(
        text(
            "INSERT INTO users (user_name, user_email, password_hash, user_role, full_name, phone, active) "
            "VALUES (:un, :ue, :ph, :ur, :fn, :p, TRUE) "
            "RETURNING user_id"
        ),
        {
            "un": user_name,
            "ue": user_email or None,
            "ph": password_hash,
            "ur": user_role,
            "fn": full_name,
            "p": phone,
        },
    ).fetchone()
    db.commit()

    if not row:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create user")

    return {"user_id": row[0], "auth_user_id": None}


@router.post("/set-password")
def set_password(
    body: dict,
    _payload: dict = Depends(_require_jwt),
    db: Session = Depends(get_db),
):
    """Update password for a user. Accepts user_id and new_password."""
    user_id = body.get("p_user_id") or body.get("user_id")
    new_password = body.get("p_new_password") or body.get("new_password") or body.get("password") or ""

    if not user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="user_id is required")
    if not new_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="password is required")

    password_hash = get_password_hash(new_password)
    result = db.execute(
        text("UPDATE users SET password_hash = :ph WHERE user_id = :uid"),
        {"ph": password_hash, "uid": user_id},
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return {"ok": True}
