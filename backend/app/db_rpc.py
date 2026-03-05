"""
SQL execution utilities for Postgres. Connection management, transactions, run parameterized SQL.
Only base_repo imports this; all other code uses repos.
"""
from contextlib import contextmanager
from decimal import Decimal
from typing import Any, Dict, List, Optional
from sqlalchemy import text
from app.database import engine


def _json_serializable(val: Any) -> Any:
    """Convert DB values to JSON-serializable (e.g. Decimal -> float)."""
    if isinstance(val, Decimal):
        return float(val)
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return val


@contextmanager
def get_connection():
    """Yield a raw connection (commit/rollback managed by caller)."""
    conn = engine.raw_connection()
    try:
        yield conn
    finally:
        conn.close()


def execute_sql(sql: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Run parameterized SQL and return rows as list of dicts (JSON-serializable).
    For INSERT/UPDATE/DELETE without RETURNING, returns [] (avoids 'result does not return rows' error).
    """
    params = params or {}
    with engine.connect() as conn:
        result = conn.execute(text(sql), params)
        if not result.returns_rows:
            conn.commit()
            return []
        rows = result.fetchall()
        conn.commit()
    keys = list(result.keys())
    out = []
    for row in rows:
        d = {k: _json_serializable(v) for k, v in zip(keys, row)}
        out.append(d)
    return out


def execute_sql_scalar(sql: str, params: Optional[Dict[str, Any]] = None) -> Any:
    """Run SQL and return the first column of the first row.
    For statements that do not return rows, returns None (avoids 'result does not return rows' error).
    """
    params = params or {}
    with engine.connect() as conn:
        result = conn.execute(text(sql), params)
        if not result.returns_rows:
            conn.commit()
            return None
        row = result.fetchone()
        conn.commit()
    return row[0] if row else None


@contextmanager
def transaction():
    """
    Context manager that yields a connection with an open transaction.
    Commits on success, rolls back on exception. Use for multi-statement
    transactional logic (replacing DB functions/triggers in Python).
    """
    conn = engine.raw_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def execute_in_transaction(conn, sql: str, params: Optional[Dict[str, Any]] = None) -> Any:
    """Execute parameterized SQL on an open connection; return cursor result (fetchall/fetchone as needed)."""
    params = params or {}
    cursor = conn.cursor()
    try:
        cursor.execute(sql, params)
        return cursor
    finally:
        cursor.close()


def fetch_in_transaction(conn, sql: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Execute SELECT on an open connection and return rows as list of dicts."""
    params = params or {}
    cursor = conn.cursor()
    try:
        cursor.execute(sql, params)
        keys = [d[0] for d in cursor.description]
        rows = cursor.fetchall()
        out = []
        for row in rows:
            d = dict(zip(keys, row))
            for k, v in d.items():
                if hasattr(v, "isoformat"):
                    d[k] = v.isoformat()
            out.append(d)
        return out
    finally:
        cursor.close()
