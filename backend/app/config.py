from urllib.parse import quote_plus
from pydantic_settings import BaseSettings
from typing import List, Optional


class Settings(BaseSettings):
    """Configuration for FastAPI backend. Database is Azure PostgreSQL (Israel)."""
    # Either set DATABASE_URL or (PGHOST, PGUSER, PGPORT, PGDATABASE, PGPASSWORD)
    DATABASE_URL: Optional[str] = None
    PGHOST: Optional[str] = None
    PGUSER: Optional[str] = None
    PGPORT: Optional[int] = 5432
    PGDATABASE: Optional[str] = None
    PGPASSWORD: Optional[str] = None
    PGSSLMODE: Optional[str] = None  # "require" for Azure, "disable" for local PostgreSQL
    SECRET_KEY: str = ""  # Required in production: set in App Service Application settings
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    # Azure Storage (optional: omit for local file storage)
    AZURE_STORAGE_CONNECTION_STRING: Optional[str] = None
    AZURE_STORAGE_CONTAINER_NAME: str = "assetflow-files"
    # CORS and deployment (set ALLOWED_ORIGINS in Azure to add more origins)
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000,https://calm-pebble-0c2b49603.4.azurestaticapps.net,https://wavelync.com,https://www.wavelync.com"
    ENVIRONMENT: str = "development"
    # Deploy to Israel Central
    AZURE_REGION: str = "israelcentral"

    @property
    def cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",")]

    @property
    def use_azure_storage(self) -> bool:
        return bool(self.AZURE_STORAGE_CONNECTION_STRING)

    @property
    def database_url(self) -> str:
        """Resolve DATABASE_URL from either DATABASE_URL or PGHOST/PGUSER/... (password is URL-encoded)."""
        if self.DATABASE_URL:
            return self.DATABASE_URL
        if not all([self.PGHOST, self.PGUSER, self.PGDATABASE]):
            raise ValueError(
                "Set either DATABASE_URL or all of PGHOST, PGUSER, PGDATABASE (and optionally PGPORT, PGPASSWORD)"
            )
        port = self.PGPORT or 5432
        password = quote_plus(self.PGPASSWORD or "")  # e.g. # in password -> %23
        sslmode = self.PGSSLMODE or ("disable" if self.PGHOST in ("localhost", "127.0.0.1") else "require")
        return f"postgresql://{self.PGUSER}:{password}@{self.PGHOST}:{port}/{self.PGDATABASE}?sslmode={sslmode}"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
