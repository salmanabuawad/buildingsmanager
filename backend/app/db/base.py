"""
SQLAlchemy declarative base. Re-exports from app.database for Repository-layer structure.
"""
from app.database import Base

__all__ = ["Base"]
