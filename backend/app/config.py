from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",  # ignore extra env vars (e.g. PORT from systemd) so they don't crash startup
    )

    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    # Local filesystem storage root for uploaded/downloadable assets.
    # Server .env currently defines FILES_BASE_PATH.
    FILES_BASE_PATH: str = "/home/profilegroup/app/uploads"
    # Optional root for structure-drawings / asset_files blobs (used for automation exports).
    ASSET_FILES_STORAGE_PATH: str = "/home/profilegroup/app/asset_files_storage"
    ALLOWED_ORIGINS: str = "http://localhost:5173"
    ENVIRONMENT: str = "development"

    @property
    def cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",")]


settings = Settings()
