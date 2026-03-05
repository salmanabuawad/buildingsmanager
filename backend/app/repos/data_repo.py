"""
Data repository: Generic table CRUD for data router (select, insert, update, delete by table name).
"""
from typing import Any, Dict, List, Optional

from app.repos.base_repo import BaseRepo


# Whitelisted tables for data API
ALLOWED_TABLES = {
    "address_list", "validation_rules", "buildings", "assets", "assets_history",
    "field_configurations", "users", "audit", "change_log", "asset_files",
    "asset_types", "system_configuration", "operators", "managers",
}

TABLE_PK = {
    "address_list": "id",
    "validation_rules": "id",
    "buildings": "building_number",
    "assets": "asset_id",
    "assets_history": "id",
    "asset_types": "id",
    "users": "user_id",
    "audit": "id",
    "change_log": "log_id",
    "asset_files": "id",
    "operators": "operator_id",
    "managers": "manager_id",
    "system_configuration": "id",
}


class DataRepo(BaseRepo):
    """Generic table access for data router."""

    def select(
        self,
        table: str,
        select_cols: str = "*",
        conditions: Optional[List[str]] = None,
        params: Optional[Dict[str, Any]] = None,
        order: Optional[str] = None,
        limit: int = 1000,
        offset: int = 0,
        conn=None,
    ) -> List[Dict[str, Any]]:
        params = params or {}
        params["limit"] = limit
        params["offset"] = offset
        sql = f'SELECT {select_cols} FROM "{table}"'
        if conditions:
            sql += " WHERE " + " AND ".join(conditions)
        if order:
            sql += " " + order
        sql += " LIMIT :limit OFFSET :offset"
        return self._fetch(sql, params, conn=conn)

    def insert_one(
        self,
        table: str,
        row: Dict[str, Any],
        conn=None,
    ) -> Optional[Dict[str, Any]]:
        cols = list(row.keys())
        col_list = ", ".join(f'"{c}"' for c in cols)
        placeholders = ", ".join(f":{c}" for c in cols)
        sql = f'INSERT INTO "{table}" ({col_list}) VALUES ({placeholders}) RETURNING *'
        rows = self._fetch(sql, row, conn=conn)
        return rows[0] if rows else None

    def insert_many(
        self,
        table: str,
        rows: List[Dict[str, Any]],
        conn=None,
    ) -> List[Dict[str, Any]]:
        out = []
        for r in rows:
            result = self.insert_one(table, r, conn=conn)
            if result:
                out.append(result)
        return out

    def update_by_pk(
        self,
        table: str,
        pk_col: str,
        pk_val: Any,
        updates: Dict[str, Any],
        conn=None,
    ) -> Optional[Dict[str, Any]]:
        if not updates:
            return None
        sets = ", ".join(f'"{c}" = :{c}' for c in updates.keys())
        params = dict(updates)
        params["_pk"] = pk_val
        sql = f'UPDATE "{table}" SET {sets} WHERE "{pk_col}" = :_pk RETURNING *'
        rows = self._fetch(sql, params, conn=conn)
        return rows[0] if rows else None

    def delete_by_filters(
        self,
        table: str,
        conditions: List[str],
        params: Dict[str, Any],
        conn=None,
    ) -> List[Dict[str, Any]]:
        sql = f'DELETE FROM "{table}" WHERE {" AND ".join(conditions)} RETURNING *'
        return self._fetch(sql, params, conn=conn)

    def upsert(
        self,
        table: str,
        row: Dict[str, Any],
        conflict_cols: str,
        conn=None,
    ) -> Optional[Dict[str, Any]]:
        cols = [k for k in row.keys() if k != "onConflict"]
        if not cols:
            return None
        col_list = ", ".join(f'"{c}"' for c in cols)
        placeholders = ", ".join(f":{c}" for c in cols)
        conflict_cols_list = [c.strip() for c in conflict_cols.split(",") if c.strip()]
        set_parts = [f'"{c}" = EXCLUDED."{c}"' for c in cols if c not in conflict_cols_list]
        if not set_parts:
            set_parts = [f'"{c}" = EXCLUDED."{c}"' for c in cols]
        conflict_sql = ", ".join(f'"{c}"' for c in conflict_cols_list)
        sql = f'INSERT INTO "{table}" ({col_list}) VALUES ({placeholders}) ON CONFLICT ({conflict_sql}) DO UPDATE SET {", ".join(set_parts)} RETURNING *'
        rows = self._fetch(sql, row, conn=conn)
        return rows[0] if rows else None
