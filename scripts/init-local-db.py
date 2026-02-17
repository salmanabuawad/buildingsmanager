#!/usr/bin/env python3
"""Create tables in local PostgreSQL. Run from repo root: python scripts/init-local-db.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.database import engine, Base
from app.models import *  # noqa: F401, F403 - import models so tables are registered

if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    print("Tables created.")
