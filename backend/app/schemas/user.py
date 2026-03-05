"""
Pydantic schemas for User (Repository-layer API).
"""
from typing import Optional
from pydantic import BaseModel, EmailStr


class UserCreate(BaseModel):
    """Payload for creating a user (API → Service → Repo)."""
    email: EmailStr
    full_name: Optional[str] = None
    username: Optional[str] = None  # If omitted, derived from email local part
    password: Optional[str] = None  # If omitted, default hashed "change_me"


class UserOut(BaseModel):
    """User response (no password)."""
    id: str
    username: str
    email: str
    full_name: Optional[str] = None
    role: str = "viewer"
    active: bool = True

    class Config:
        from_attributes = True
