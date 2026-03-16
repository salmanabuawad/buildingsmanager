"""
SQL execution utilities for Postgres using psycopg2 (synchronous).
Independent of the asyncpg pool used by async services.
Only base_repo imports this; all other code uses repos.
"""
import re
from contextlib import contextmanager
from decimal import Decimal
from typing import Any, Dict, List, Optional

import psycopg2
import psycopg2.extras

from app.config import settings


def _dsn() -> str:
    """Return psycopg2-compatible DSN from settings."""
    return settings.DATABASE_URL


def _json_serializable(val: Any) -> Any:
    """Convert DB values to JSON-serializable types."""
    if isinstance(val, Decimal):
        return float(val)
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return val


def _to_psycopg2(sql: str) -> str:
    """Convert SQLAlchemy :name style to psycopg2 %(name)s style."""
    return re.sub(r":(\w+)", r"%(\1)s", sql)


@contextmanager
def get_connection():
    """Yield a raw psycopg2 connection. Commit/rollback managed by caller."""
    conn = psycopg2.connect(dsn=_dsn())
    try:
        yield conn
    finally:
        conn.close()


def execute_sql(sql: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Run named-param SQL (:name style) and return rows as list of dicts.
    For INSERT/UPDATE/DELETE without RETURNING, returns [].
    """
    params = params or {}
    psql = _to_psycopg2(sql)
    conn = psycopg2.connect(dsn=_dsn())
    try:
        with conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(psql, params)
                if cur.description:
                    rows = cur.fetchall()
                    return [{k: _json_serializable(v) for k, v in dict(r).items()} for r in rows]
                return []
    finally:
        conn.close()


def execute_sql_scalar(sql: str, params: Optional[Dict[str, Any]] = None) -> Any:
    """Run SQL and return the first column of the first row."""
    params = params or {}
    psql = _to_psycopg2(sql)
    conn = psycopg2.connect(dsn=_dsn())
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(psql, params)
                if cur.description:
                    row = cur.fetchone()
                    return row[0] if row else None
                return None
    finally:
        conn.close()


@contextmanager
def transaction():
    """Context manager yielding a psycopg2 connection with an open transaction.
    Commits on success, rolls back on exception.
    """
    conn = psycopg2.connect(dsn=_dsn())
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def execute_in_transaction(conn, sql: str, params: Optional[Dict[str, Any]] = None) -> Any:
    """Execute SQL on an open connection (%(name)s style, already converted by base_repo)."""
    params = params or {}
    cur = conn.cursor()
    try:
        cur.execute(sql, params)
        return cur
    finally:
        cur.close()


def fetch_in_transaction(conn, sql: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Execute SELECT on an open connection and return rows as list of dicts."""
    params = params or {}
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(sql, params)
        rows = cur.fetchall()
        return [{k: _json_serializable(v) for k, v in dict(r).items()} for r in rows]
    finally:
        cur.close()
