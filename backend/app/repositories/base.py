"""
Generic PostgREST-compatible repository.
Translates PostgREST-style query params to SQL.
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


def _parse_filter(col: str, expr: str) -> tuple[str, list]:
    """Parse a single filter like 'eq.123' or 'in.(1,2,3)' or 'not.is.null'."""
    col = _safe_col(col)

    if expr.startswith("not."):
        rest = expr[4:]
        inner_sql, inner_params = _parse_filter(col, rest)
        return f"NOT ({inner_sql})", inner_params

    if expr.startswith("is."):
        val = expr[3:]
        if val.lower() == "null":
            return f"{col} IS NULL", []
        if val.lower() == "true":
            return f"{col} IS TRUE", []
        if val.lower() == "false":
            return f"{col} IS FALSE", []

    if expr.startswith("in.(") and expr.endswith(")"):
        inner = expr[4:-1]
        values = [_cast_value(v.strip()) for v in inner.split(",") if v.strip()]
        if not values:
            return "FALSE", []
        placeholders = ", ".join(f"${i+1}" for i in range(len(values)))
        return f"{col} = ANY(ARRAY[{placeholders}])", values

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
        return f"{col} IS NULL", []
    return f"{col} {op_map[op]} $1", [val]


def _renum(sql: str, params: list, offset: int) -> tuple[str, list]:
    """Renumber $1..$n placeholders in sql starting at offset+1."""
    for i in range(len(params), 0, -1):
        sql = sql.replace(f"${i}", f"__P{offset+i}__")
    sql = re.sub(r'__P(\d+)__', lambda m: f"${m.group(1)}", sql)
    return sql, params


def _parse_or(or_expr: str) -> tuple[str, list]:
    """Parse or=(col.op.val,...) expression."""
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
    all_params: list = []
    param_offset = 0
    for part in parts:
        dot1 = part.index(".")
        col = part[:dot1]
        rest = part[dot1+1:]
        inner_sql, inner_params = _parse_filter(col, rest)
        inner_sql, _ = _renum(inner_sql, inner_params, param_offset)
        param_offset += len(inner_params)
        all_params.extend(inner_params)
        clauses.append(inner_sql)
    return f"({' OR '.join(clauses)})", all_params


def _build_where(params: dict) -> tuple[str, list]:
    where_parts: list[str] = []
    all_params: list = []
    offset = 0

    if "or" in params:
        or_val = params["or"][0] if isinstance(params["or"], list) else params["or"]
        if or_val.startswith("(") and or_val.endswith(")"):
            or_val = or_val[1:-1]
        or_sql, or_params = _parse_or(or_val)
        or_sql, _ = _renum(or_sql, or_params, offset)
        offset += len(or_params)
        all_params.extend(or_params)
        where_parts.append(or_sql)

    for key, values in params.items():
        if key in RESERVED_PARAMS:
            continue
        vals = values if isinstance(values, list) else [values]
        for val_expr in vals:
            inner_sql, inner_params = _parse_filter(key, str(val_expr))
            inner_sql, _ = _renum(inner_sql, inner_params, offset)
            offset += len(inner_params)
            all_params.extend(inner_params)
            where_parts.append(inner_sql)

    where_sql = f" WHERE {' AND '.join(where_parts)}" if where_parts else ""
    return where_sql, all_params


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

    where_sql, where_params = _build_where(query_params)
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
        rows = await conn.fetch(sql, *where_params)
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


async def generic_update(table: str, data: dict, query_params: dict) -> list[dict]:
    if table not in ALLOWED_TABLES:
        raise ValueError(f"Table not allowed: {table}")
    if not data:
        return []

    if "updated_at" not in data:
        data = {**data, "updated_at": datetime.now(timezone.utc)}

    cols = list(data.keys())
    params_list = list(data.values())
    set_sql = ", ".join(f"{_safe_col(c)} = ${i+1}" for i, c in enumerate(cols))
    offset = len(cols)

    where_sql, where_params = _build_where(query_params)
    # Renumber where params after SET params
    for i in range(len(where_params), 0, -1):
        where_sql = where_sql.replace(f"${i}", f"__W{offset+i}__")
    where_sql = re.sub(r'__W(\d+)__', lambda m: f"${m.group(1)}", where_sql)

    select_cols = (query_params.get("select", ["*"]) or ["*"])
    if isinstance(select_cols, list):
        select_cols = select_cols[0] if select_cols else "*"
    return_cols = "*" if select_cols == "*" else ", ".join(
        _safe_col(c.strip()) for c in select_cols.split(","))

    sql = f"UPDATE {table} SET {set_sql}{where_sql} RETURNING {return_cols}"
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *(params_list + where_params))
        return [dict(r) for r in rows]


async def generic_delete(table: str, query_params: dict) -> list[dict]:
    if table not in ALLOWED_TABLES:
        raise ValueError(f"Table not allowed: {table}")
    where_sql, where_params = _build_where(query_params)
    sql = f"DELETE FROM {table}{where_sql} RETURNING *"
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *where_params)
        return [dict(r) for r in rows]
