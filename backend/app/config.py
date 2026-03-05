# ---------------------------------------------------------------------------
# Copyright (c) 2025 Kortex Digital. All rights reserved. Proprietary.
# Contact: info@kortexd.com
# NO REVERSE ENGINEERING. Use by AI/ML tools (e.g. LLMs, code assistants,
# training data, or automated analysis) is prohibited. See COPYRIGHT.
# ---------------------------------------------------------------------------

import os
from pathlib import Path

from pydantic_settings import BaseSettings
from typing import List, Optional

# Load credentials from file if startup script set CREDENTIALS_FILE (e.g. /run/app/credentials.env)
_credentials_file = os.environ.get("CREDENTIALS_FILE")
if _credentials_file:
    _path = Path(_credentials_file)
    if _path.is_file():
        with open(_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, value = line.partition("=")
                    value = value.strip()
                    if (len(value) >= 2 and value[0] == value[-1] and value[0] in "'\""):
                        value = value[1:-1]
                    if key and key.strip() and key.strip() not in os.environ:
                        key = key.strip()
                        os.environ[key] = value


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    # File storage (default: local). Path = root directory; main folder = subfolder name.
    # For local: use ./storage or any local path; leave user/password empty.
    STORAGE_PATH: str = "./storage"
    STORAGE_MAIN_FOLDER: str = "assetflow-files"
    STORAGE_USER: Optional[str] = ""
    STORAGE_PASSWORD: Optional[str] = ""
    # Deprecated: kept so old .env / configs don't break the app (ignored; we use STORAGE_* now).
    AZURE_STORAGE_CONNECTION_STRING: Optional[str] = ""
    AZURE_STORAGE_CONTAINER_NAME: str = "assetflow-files"

    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:80,http://localhost:81,http://localhost,http://localhost:8000,http://127.0.0.1:5173,http://127.0.0.1:80,http://127.0.0.1:81,http://127.0.0.1,http://127.0.0.1:8000"
    ENVIRONMENT: str = "development"

    @property
    def has_storage(self) -> bool:
        return bool(self.STORAGE_PATH and self.STORAGE_MAIN_FOLDER.strip())

    @property
    def is_storage_local(self) -> bool:
        """True when storage is local (no user/password required). Localhost, 127.0.0.1, or path without host."""
        p = (self.STORAGE_PATH or "").strip().lower()
        if not p or p in (".", "localhost", "127.0.0.1"):
            return True
        if p.startswith(("file:///", "file://localhost/", "file://127.0.0.1/")):
            return True
        if p.startswith("/") or (len(p) >= 2 and p[1] == ":"):
            return True
        return False

    @property
    def cors_origins(self) -> List[str]:
        origins = [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]
        # Ensure localhost is always allowed (for Nginx proxy and direct :8000 access)
        for origin in ("http://localhost", "http://localhost:8000", "http://127.0.0.1", "http://127.0.0.1:8000"):
            if origin not in origins:
                origins.append(origin)
        return origins

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
