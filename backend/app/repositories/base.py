"""
Generic PostgREST-compatible repository.
Translates PostgREST-style query params to SQL.

Filter values are inlined as SQL literals (not $N params) to avoid
asyncpg type-mismatch errors when column types differ from inferred types.
Column names and table names are validated strictly; values are escaped.
"""
import re
from typing import Any
from datetime import datetime, timezone
from app.database import get_pool

ALLOWED_TABLES = {
    "address_list", "asset_types", "validation_rules", "buildings",
    "assets", "assets_history", "field_configurations", "users", "audit",
    "change_log", "system_configuration", "mailing_list", "operators",
    "managers", "asset_files", "inspection_tasks", "inspection_task_history",
    "inspection_reports", "inspection_report_files",
    "inspection_task_access_tokens", "inspector_otp_codes",
}

RESERVED_PARAMS = {"select", "order", "limit", "offset", "or"}


def _safe_col(col: str) -> str:
    if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', col):
        raise ValueError(f"Invalid column name: {col}")
    return col


def _cast_value(raw: str) -> Any:
    if raw.lower() == "null":
        return None
    if raw.lower() == "true":
        return True
    if raw.lower() == "false":
        return False
    try:
        if "." in raw:
            return float(raw)
        return int(raw)
    except ValueError:
        return raw


def _format_literal(val: Any) -> str:
    """Format a Python value as a safe SQL literal (inlined, not parameterised).

    Numbers are formatted as quoted string constants (e.g. '123') rather than
    bare numeric literals. PostgreSQL treats untyped string constants as "unknown"
    and casts them to the column type — so '123' works for both TEXT and BIGINT
    columns without requiring knowledge of the column type.
    """
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "TRUE" if val else "FALSE"
    # Quote everything (including numbers) as untyped string constants
    escaped = str(val).replace("'", "''")
    return f"'{escaped}'"


def _parse_filter(col: str, expr: str) -> str:
    """Return a SQL fragment for one filter (values inlined as literals)."""
    col = _safe_col(col)

    if expr.startswith("not."):
        return f"NOT ({_parse_filter(col, expr[4:])})"

    if expr.startswith("is."):
        val = expr[3:]
        if val.lower() == "null":
            return f"{col} IS NULL"
        if val.lower() == "true":
            return f"{col} IS TRUE"
        if val.lower() == "false":
            return f"{col} IS FALSE"

    if expr.startswith("in.(") and expr.endswith(")"):
        inner = expr[4:-1]
        values = [_cast_value(v.strip()) for v in inner.split(",") if v.strip()]
        if not values:
            return "FALSE"
        # Use IN (...) not ANY(ARRAY[...]) to avoid explicit array type binding
        literals = ", ".join(_format_literal(v) for v in values)
        return f"{col} IN ({literals})"

    parts = expr.split(".", 1)
    if len(parts) != 2:
        raise ValueError(f"Cannot parse filter: {col}={expr}")

    op, raw_val = parts
    val = _cast_value(raw_val)
    op_map = {"eq": "=", "neq": "!=", "gt": ">", "gte": ">=", "lt": "<", "lte": "<=",
              "like": "LIKE", "ilike": "ILIKE"}
    if op not in op_map:
        raise ValueError(f"Unknown operator: {op}")
    if val is None:
        return f"{col} IS NULL"
    return f"{col} {op_map[op]} {_format_literal(val)}"


def _parse_or(or_expr: str) -> str:
    """Parse or=(col.op.val,...) into a SQL OR fragment."""
    parts = []
    depth = 0
    current = ""
    for ch in or_expr:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(current.strip())
            current = ""
        else:
            current += ch
    if current.strip():
        parts.append(current.strip())

    clauses = []
    for part in parts:
        dot1 = part.index(".")
        col = part[:dot1]
        rest = part[dot1 + 1:]
        clauses.append(_parse_filter(col, rest))
    return f"({' OR '.join(clauses)})"


def _build_where(params: dict) -> str:
    """Build a WHERE clause string with all values inlined as literals."""
    where_parts: list[str] = []

    if "or" in params:
        or_val = params["or"][0] if isinstance(params["or"], list) else params["or"]
        if or_val.startswith("(") and or_val.endswith(")"):
            or_val = or_val[1:-1]
        where_parts.append(_parse_or(or_val))

    for key, values in params.items():
        if key in RESERVED_PARAMS:
            continue
        vals = values if isinstance(values, list) else [values]
        for val_expr in vals:
            where_parts.append(_parse_filter(key, str(val_expr)))

    return f" WHERE {' AND '.join(where_parts)}" if where_parts else ""


def _build_order(params: dict) -> str:
    if "order" not in params:
        return ""
    order_vals = params["order"]
    if isinstance(order_vals, str):
        order_vals = [order_vals]
    parts = []
    for ov in order_vals:
        for part in ov.split(","):
            part = part.strip()
            if "." in part:
                col, direction = part.rsplit(".", 1)
                col = _safe_col(col.strip())
                d = "DESC" if direction.strip().lower() == "desc" else "ASC"
                parts.append(f"{col} {d}")
            else:
                col = _safe_col(part.strip())
                parts.append(f"{col} ASC")
    return f" ORDER BY {', '.join(parts)}" if parts else ""


async def generic_select(table: str, query_params: dict) -> list[dict]:
    if table not in ALLOWED_TABLES:
        raise ValueError(f"Table not allowed: {table}")

    select_cols = (query_params.get("select", ["*"]) or ["*"])
    if isinstance(select_cols, list):
        select_cols = select_cols[0] if select_cols else "*"
    if select_cols == "*":
        cols_sql = "*"
    else:
        cols_sql = ", ".join(_safe_col(c.strip()) for c in select_cols.split(","))

    where_sql = _build_where(query_params)
    order_sql = _build_order(query_params)

    limit_sql = ""
    offset_sql = ""
    if "limit" in query_params:
        lv = query_params["limit"]
        lv = lv[0] if isinstance(lv, list) else lv
        limit_sql = f" LIMIT {int(lv)}"
    if "offset" in query_params:
        ov = query_params["offset"]
        ov = ov[0] if isinstance(ov, list) else ov
        offset_sql = f" OFFSET {int(ov)}"

    sql = f"SELECT {cols_sql} FROM {table}{where_sql}{order_sql}{limit_sql}{offset_sql}"
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql)
        return [dict(r) for r in rows]


async def generic_insert(table: str, data: dict | list) -> list[dict]:
    if table not in ALLOWED_TABLES:
        raise ValueError(f"Table not allowed: {table}")
    rows = data if isinstance(data, list) else [data]
    if not rows:
        return []
    cols = list(rows[0].keys())
    col_names = ", ".join(_safe_col(c) for c in cols)
    result = []
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            for row in rows:
                placeholders = ", ".join(f"${i+1}" for i in range(len(cols)))
                values = [row.get(c) for c in cols]
                sql = f"INSERT INTO {table} ({col_names}) VALUES ({placeholders}) RETURNING *"
                r = await conn.fetchrow(sql, *values)
                if r:
                    result.append(dict(r))
    return result


# Cache of primary key columns per table to avoid repeated DB lookups
_pk_cache: dict[str, list[str]] = {}


async def _get_primary_keys(conn, table: str) -> list[str]:
    if table in _pk_cache:
        return _pk_cache[table]
    q = """
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_name = kcu.table_name
        WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = $1
        ORDER BY kcu.ordinal_position
    """
    rows = await conn.fetch(q, table)
    pks = [r["column_name"] for r in rows]
    _pk_cache[table] = pks
    return pks


async def generic_upsert(table: str, data: dict | list) -> list[dict]:
    """INSERT ... ON CONFLICT (pk) DO UPDATE SET ... using the table's primary key."""
    if table not in ALLOWED_TABLES:
        raise ValueError(f"Table not allowed: {table}")
    rows = data if isinstance(data, list) else [data]
    if not rows:
        return []
    cols = list(rows[0].keys())
    result = []
    pool = get_pool()
    async with pool.acquire() as conn:
        pk_cols = await _get_primary_keys(conn, table)
        if not pk_cols:
            # No PK found — fall back to plain insert
            return await generic_insert(table, data)
        non_pk_cols = [c for c in cols if c not in pk_cols]
        col_names = ", ".join(_safe_col(c) for c in cols)
        conflict_cols = ", ".join(_safe_col(c) for c in pk_cols)
        if non_pk_cols:
            update_set = ", ".join(f"{_safe_col(c)} = EXCLUDED.{_safe_col(c)}" for c in non_pk_cols)
            on_conflict = f"ON CONFLICT ({conflict_cols}) DO UPDATE SET {update_set}"
        else:
            on_conflict = f"ON CONFLICT ({conflict_cols}) DO NOTHING"
        async with conn.transaction():
            for row in rows:
                placeholders = ", ".join(f"${i+1}" for i in range(len(cols)))
                values = [row.get(c) for c in cols]
                sql = f"INSERT INTO {table} ({col_names}) VALUES ({placeholders}) {on_conflict} RETURNING *"
                r = await conn.fetchrow(sql, *values)
                if r:
                    result.append(dict(r))
    return result


async def generic_update(table: str, data: dict, query_params: dict) -> list[dict]:
    if table not in ALLOWED_TABLES:
        raise ValueError(f"Table not allowed: {table}")
    if not data:
        return []

    TABLES_WITH_UPDATED_AT = {
        "address_list", "asset_types", "assets", "assets_history",
        "field_configurations", "inspection_reports", "inspection_tasks",
        "managers", "operators", "system_configuration", "users", "validation_rules",
    }
    if table in TABLES_WITH_UPDATED_AT and "updated_at" not in data:
        data = {**data, "updated_at": datetime.now(timezone.utc)}

    cols = list(data.keys())
    params_list = list(data.values())
    set_sql = ", ".join(f"{_safe_col(c)} = ${i+1}" for i, c in enumerate(cols))

    # WHERE uses inlined literals (no params) to avoid type mismatches
    where_sql = _build_where(query_params)

    select_cols = (query_params.get("select", ["*"]) or ["*"])
    if isinstance(select_cols, list):
        select_cols = select_cols[0] if select_cols else "*"
    return_cols = "*" if select_cols == "*" else ", ".join(
        _safe_col(c.strip()) for c in select_cols.split(","))

    sql = f"UPDATE {table} SET {set_sql}{where_sql} RETURNING {return_cols}"
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *params_list)
        return [dict(r) for r in rows]


async def generic_delete(table: str, query_params: dict) -> list[dict]:
    if table not in ALLOWED_TABLES:
        raise ValueError(f"Table not allowed: {table}")
    where_sql = _build_where(query_params)
    sql = f"DELETE FROM {table}{where_sql} RETURNING *"
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql)
        return [dict(r) for r in rows]
