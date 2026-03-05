"""
User repository: DB access for users table only.
Pattern: API → Service → Repo → DB.
"""
from sqlalchemy.orm import Session

from app.models import User


class UserRepo:
    def __init__(self, db: Session):
        self.db = db

    def list(self) -> list[User]:
        return self.db.query(User).order_by(User.created_at.desc()).all()

    def get_by_email(self, email: str) -> User | None:
        return self.db.query(User).filter(User.email == email).one_or_none()

    def get_by_id(self, user_id: str) -> User | None:
        return self.db.query(User).filter(User.id == user_id).one_or_none()

    def create(
        self,
        *,
        email: str,
        full_name: str | None = None,
        username: str | None = None,
        hashed_password: str = "",
    ) -> User:
        if username is None:
            username = email.split("@")[0] if "@" in email else email
        user = User(
            email=email,
            full_name=full_name,
            username=username,
            hashed_password=hashed_password,
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user
