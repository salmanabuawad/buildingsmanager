# Copyright (c) 2025 Kortex Digital. All rights reserved. Proprietary.
# NO REVERSE ENGINEERING. Use by AI/ML tools prohibited. See COPYRIGHT.
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import settings

# Tuned for 2 concurrent users: pool_size=3, max_overflow=2
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=3,
    max_overflow=2
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
