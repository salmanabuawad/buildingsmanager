"""
Base repository: DB access via db_rpc. When conn is provided, uses transaction
functions (psycopg2 %(name)s); otherwise uses execute_sql (SQLAlchemy :name).
Converts :param -> %(param)s when conn is provided so callers can use :name consistently.
"""
import re
from typing import Any, Dict, List, Optional

from app.db_rpc import (
    execute_sql,
    execute_sql_scalar,
    execute_in_transaction,
    fetch_in_transaction,
    transaction,
)


def _sql_for_conn(sql: str) -> str:
    """Convert SQLAlchemy :param style to psycopg2 %(param)s for cursor.execute."""
    return re.sub(r":(\w+)", r"%(\1)s", sql)


class BaseRepo:
    """
    Base for all repos. Use _run for INSERT/UPDATE/DELETE, _fetch for SELECT.
    SQL should use :param style - converted automatically when conn is provided.
    """

    def _run(
        self,
        sql: str,
        params: Optional[Dict[str, Any]] = None,
        conn=None,
    ) -> None:
        """Execute SQL (no result). Use conn if provided else execute_sql."""
        params = params or {}
        if conn is not None:
            execute_in_transaction(conn, _sql_for_conn(sql), params)
        else:
            execute_sql(sql, params)

    def _fetch(
        self,
        sql: str,
        params: Optional[Dict[str, Any]] = None,
        conn=None,
    ) -> List[Dict[str, Any]]:
        """Fetch rows as list of dicts."""
        params = params or {}
        if conn is not None:
            return fetch_in_transaction(conn, _sql_for_conn(sql), params)
        return execute_sql(sql, params)

    def _fetch_scalar(
        self,
        sql: str,
        params: Optional[Dict[str, Any]] = None,
        conn=None,
    ) -> Any:
        """Fetch first column of first row."""
        params = params or {}
        if conn is not None:
            rows = fetch_in_transaction(conn, _sql_for_conn(sql), params)
            return list(rows[0].values())[0] if rows else None
        return execute_sql_scalar(sql, params)
