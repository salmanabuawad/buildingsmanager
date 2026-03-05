"""
API v1: Repository-layer example routes.
Pattern: API → Service → Repo → DB.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.repos.user_repo import UserRepo
from app.services.user_service import UserService
from app.schemas.user import UserCreate, UserOut

router = APIRouter(tags=["API v1 (Repository pattern)"])


@router.get("/health")
def health():
    """Repository-layer API health (e.g. GET /api/v1/health)."""
    return {"status": "ok"}


@router.get("/users", response_model=list[UserOut])
def get_users(db: Session = Depends(get_db)):
    service = UserService(UserRepo(db))
    return service.list_users()


@router.get("/users/{user_id}", response_model=UserOut)
def get_user(user_id: str, db: Session = Depends(get_db)):
    service = UserService(UserRepo(db))
    user = service.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("/users", response_model=UserOut, status_code=201)
def post_user(payload: UserCreate, db: Session = Depends(get_db)):
    service = UserService(UserRepo(db))
    try:
        return service.create_user(payload)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
