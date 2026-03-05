"""
User service: business logic using UserRepo.
Pattern: API → Service → Repo → DB.
"""
from app.models import User
from app.repos.user_repo import UserRepo
from app.schemas.user import UserCreate
from app.auth import get_password_hash


class UserService:
    def __init__(self, repo: UserRepo):
        self.repo = repo

    def list_users(self) -> list[User]:
        return self.repo.list()

    def get_by_email(self, email: str) -> User | None:
        return self.repo.get_by_email(email)

    def get_by_id(self, user_id: str) -> User | None:
        return self.repo.get_by_id(user_id)

    def create_user(self, data: UserCreate) -> User:
        existing = self.repo.get_by_email(str(data.email))
        if existing:
            raise ValueError("Email already exists")
        password = data.password or "change_me"
        hashed = get_password_hash(password)
        return self.repo.create(
            email=str(data.email),
            full_name=data.full_name,
            username=data.username,
            hashed_password=hashed,
        )
