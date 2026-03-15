from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://bm_user:bm_pass_2024@localhost:5432/buildings_manager"
    SECRET_KEY: str = "change-me-in-production-32-char-key!!"
    FILES_BASE_PATH: str = "/home/profilegroup/app/files"
    ALLOWED_ORIGINS: str = "https://profile.wavelync.com,http://localhost:5173"
    ENVIRONMENT: str = "production"
    PORT: int = 8002

    @property
    def cors_origins(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    model_config = {"env_file": ".env"}


settings = Settings()
