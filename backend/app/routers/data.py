"""
Generic table data API for frontend (replaces direct Supabase .from(table) calls).
Whitelisted tables only; uses DataRepo for local Postgres access. All endpoints require JWT auth.
"""
import logging
import re
from fastapi import APIRouter, Depends, Query, HTTPException, Request
from typing import Any, Dict, List, Optional

from app.repos import DataRepo
from app.users_table import get_current_user_users_table

router = APIRouter()
_data_repo = DataRepo()
# Separate router for fixed paths so they are matched before /{table}
bulk_router = APIRouter()
logger = logging.getLogger(__name__)

ALLOWED_TABLES = {
    "address_list", "validation_rules", "buildings", "assets", "assets_history",
    "field_configurations", "users", "audit", "change_log", "asset_files",
    "asset_types", "system_configuration", "operators", "managers",
}

# Primary key column per table
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

RESERVED = {"select", "limit", "offset", "order", "or"}

# Columns that are numeric (bigint/int) in DB - coerce string filter values to int for equality
NUMERIC_FILTER_COLUMNS = {
    "building_number", "asset_id", "id", "user_id", "operator_id", "manager_id",
    "log_id", "file_id", "gosh", "helka", "building_number_in_street",
}


def _order_clause(order: Optional[str]) -> str:
    """Convert PostgREST-style order (e.g. uploaded_at.desc) to safe SQL ORDER BY fragment."""
    if not order or not isinstance(order, str):
        return ""
    order = order.strip()
    if "." in order:
        part, direction = order.rsplit(".", 1)
        col = part.strip()
        dir_lower = direction.strip().lower()
        if col.replace("_", "").isalnum() and dir_lower in ("asc", "desc"):
            return f'ORDER BY "{col}" {dir_lower.upper()}'
    if order.replace("_", "").isalnum():
        return f'ORDER BY "{order}" ASC'
    return f"ORDER BY {order}"

# For delete-by-query: only these tables and only these filter columns are allowed.
# Reduces risk of over-broad deletes (e.g. audit only by entity_type + entity_id, buildings only by building_number).
DELETE_BY_QUERY_ALLOWED_FILTERS: Dict[str, Optional[set]] = {
    "audit": {"entity_type", "entity_id"},
    "buildings": {"building_number"},
    "change_log": {"log_id", "table_name", "record_id", "user_id"},
}
# Tables not listed: delete-by-query not allowed (use table-specific endpoints or DELETE by PK).

# Valid column name: alphanumeric + underscore only (no subqueries, etc.)
_COLUMN_PATTERN = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


def _check_table(table: str) -> None:
    if table not in ALLOWED_TABLES:
        raise HTTPException(status_code=400, detail=f"Table not allowed: {table}")


def _validate_select(select: str) -> str:
    """Validate and sanitize SELECT column list. Prevents SQL injection via select param."""
    raw = (select or "").strip().replace(" ", "")
    if not raw or raw == "*":
        return "*"
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    valid = []
    for p in parts:
        if _COLUMN_PATTERN.match(p):
            valid.append(p)
    if not valid:
        return "*"
    return ", ".join(valid)


@router.get("/{table}")
async def get_table(
    request: Request,
    table: str,
    select: str = Query("*", description="Columns, comma-separated"),
    limit: Optional[int] = Query(1000, le=10000),
    offset: Optional[int] = Query(0, ge=0),
    order: Optional[str] = None,
    id: Optional[str] = Query(None, description="Optional filter by id (or use any column as query param)"),
    _user=Depends(get_current_user_users_table),
):
    """GET rows. Query params other than select/limit/offset/order are used as AND equality filters."""
    _check_table(table)
    cols = _validate_select(select)
    sql = f'SELECT {cols} FROM "{table}"'
    params: Dict[str, Any] = {"limit": limit, "offset": offset}
    q = dict(request.query_params)
    for k in list(q.keys()):
        if k in RESERVED or k.lower() == "or":
            q.pop(k, None)
    if q:
        conditions = []
        for i, (col, val) in enumerate(q.items()):
            if not col.replace("_", "").replace(".", "").isalnum():
                continue
            key = f"f{i}"
            if col.endswith("__notnull"):
                col_name = col[:-9]  # strip __notnull (9 chars)
                if col_name.replace("_", "").isalnum():
                    conditions.append(f'"{col_name}" IS NOT NULL')
            elif col.endswith("__isnull"):
                col_name = col[:-8]  # strip __isnull (8 chars)
                if col_name.replace("_", "").isalnum():
                    conditions.append(f'"{col_name}" IS NULL')
            elif col.endswith("__neq"):
                col_name = col[:-5]
                if col_name.replace("_", "").isalnum():
                    params[key] = val
                    conditions.append(f'"{col_name}" != :{key}')
            elif col.endswith("__in"):
                col_name = col[:-4]  # strip __in
                if col_name.replace("_", "").isalnum():
                    # val is comma-separated list (e.g. "1,2,3")
                    parts = [p.strip() for p in str(val).split(",") if p.strip()]
                    if parts:
                        # Build IN (...) with individual params (works for any length; ANY/array had type issues)
                        in_keys = []
                        for j, part in enumerate(parts):
                            k = f"f{i}_{j}"
                            try:
                                params[k] = int(part)
                            except ValueError:
                                try:
                                    params[k] = float(part)
                                except ValueError:
                                    params[k] = part
                            in_keys.append(f":{k}")
                        conditions.append(f'"{col_name}" IN ({", ".join(in_keys)})')
            else:
                # Coerce "true"/"false" to boolean; numeric columns (e.g. building_number) to int
                pval = val
                if isinstance(val, str):
                    v = val.strip().lower()
                    if v == "true":
                        pval = True
                    elif v == "false":
                        pval = False
                    elif col in NUMERIC_FILTER_COLUMNS and (v.isdigit() or (v.startswith("-") and v[1:].isdigit())):
                        pval = int(val.strip())
                params[key] = pval
                conditions.append(f'"{col}" = :{key}')
        # OR clauses: each "or" param is "col1.op1.val1,col2.op2.val2" (AND of ORs)
        or_list = request.query_params.getlist("or")
        if or_list:
            param_idx = len(params)
            for or_str in or_list:
                parts = [p.strip() for p in or_str.split(",") if p.strip()]
                or_conditions = []
                for part in parts:
                    # part = "column.operator.value" (value may contain dots/slashes)
                    segs = part.rsplit(".", 2)
                    if len(segs) != 3:
                        continue
                    col_name, op, val = segs[0].strip(), segs[1].strip().lower(), segs[2].strip()
                    if not col_name.replace("_", "").isalnum():
                        continue
                    col_quoted = f'"{col_name}"'
                    if op == "is" and val.lower() == "null":
                        or_conditions.append(f"{col_quoted} IS NULL")
                    elif op == "eq":
                        key = f"o{param_idx}"
                        param_idx += 1
                        if val.lower() == "true":
                            params[key] = True
                        elif val.lower() == "false":
                            params[key] = False
                        else:
                            try:
                                params[key] = int(val)
                            except ValueError:
                                try:
                                    params[key] = float(val)
                                except ValueError:
                                    params[key] = val
                        or_conditions.append(f"{col_quoted} = :{key}")
                if or_conditions:
                    conditions.append("(" + " OR ".join(or_conditions) + ")")
        if conditions:
            sql += " WHERE " + " AND ".join(conditions)
    order_sql = _order_clause(order)
    if order_sql:
        sql += " " + order_sql
    sql += " LIMIT :limit OFFSET :offset"
    try:
        rows = _data_repo._fetch(sql, params)
        return rows
    except Exception as e:
        logger.exception("GET /api/data/%s failed: %s", table, e)
        raise HTTPException(status_code=500, detail=str(e))


# We'll use a single endpoint that accepts query params for filters. Let the frontend pass filters as JSON in GET body or as repeated params. Actually Supabase uses .eq('col', val) so the client will send col=val or col=eq.val. For simplicity, add a POST /api/data/{table}/query that accepts body: { select, filters: { col: value } }.
@router.post("/{table}/query")
async def query_table(
    table: str,
    body: Dict[str, Any],
    _user=Depends(get_current_user_users_table),
):
    """Run a query: body = { select: '*', filters: { col: val }, limit?, offset?, order? }. Returns list of rows."""
    _check_table(table)
    select = _validate_select(body.get("select") or "*")
    filters = body.get("filters") or {}
    limit = min(int(body.get("limit", 1000)), 10000)
    offset = int(body.get("offset", 0))
    order = body.get("order")

    sql = f'SELECT {select} FROM "{table}"'
    params: Dict[str, Any] = {}
    if filters:
        conditions = []
        for i, (col, val) in enumerate(filters.items()):
            key = f"p{i}"
            params[key] = val
            conditions.append(f'"{col}" = :{key}')
        sql += " WHERE " + " AND ".join(conditions)
    order_sql = _order_clause(order)
    if order_sql:
        sql += " " + order_sql
    sql += " LIMIT :limit OFFSET :offset"
    params["limit"] = limit
    params["offset"] = offset
    try:
        rows = _data_repo._fetch(sql, params)
        return rows
    except Exception as e:
        logger.exception("POST /api/data/%s/query failed: %s", table, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{table}/upsert")
async def upsert_table(
    table: str,
    body: Dict[str, Any],
    _user=Depends(get_current_user_users_table),
):
    """Body: { rows: [ {...} ] or single {...}, onConflict: "column_name" }. INSERT ... ON CONFLICT DO UPDATE, returns upserted row(s)."""
    _check_table(table)
    rows_in = body.get("rows")
    if rows_in is None:
        rows_in = [body] if isinstance(body.get("onConflict"), str) else []
    on_conflict = body.get("onConflict")
    if not on_conflict or not isinstance(on_conflict, str):
        raise HTTPException(status_code=400, detail="onConflict required (e.g. 'name', 'street_code', 'grid_name,field_name')")
    conflict_col = on_conflict.strip()
    if not conflict_col.replace("_", "").replace(",", "").replace(" ", "").isalnum():
        raise HTTPException(status_code=400, detail="Invalid onConflict")
    if not rows_in:
        return []
    out = []
    for row in rows_in:
        if not isinstance(row, dict):
            continue
        cols = [k for k in row.keys() if k != "onConflict"]
        if not cols:
            continue
        col_list = ", ".join(f'"{c}"' for c in cols)
        placeholders = ", ".join(f":{c}" for c in cols)
        # ON CONFLICT (col) DO UPDATE SET col1 = EXCLUDED.col1, ...
        conflict_cols = [c.strip() for c in conflict_col.split(",") if c.strip()]
        set_parts = [f'"{c}" = EXCLUDED."{c}"' for c in cols if c not in conflict_cols]
        if not set_parts:
            set_parts = [f'"{c}" = EXCLUDED."{c}"' for c in cols]
        conflict_sql = ", ".join(f'"{c}"' for c in conflict_cols)
        sql = f'INSERT INTO "{table}" ({col_list}) VALUES ({placeholders}) ON CONFLICT ({conflict_sql}) DO UPDATE SET {", ".join(set_parts)} RETURNING *'
        try:
            result = _data_repo._fetch(sql, row)
            out.append(result[0] if result else {})
        except Exception as e:
            logger.exception("upsert %s failed: %s", table, e)
            raise HTTPException(status_code=500, detail=str(e))
    return out if len(out) != 1 else out[0]


def _build_delete_where(
    filters: Dict[str, Any],
    param_prefix: str = "p",
) -> tuple[List[str], Dict[str, Any]]:
    """Build WHERE conditions and params from filters. filters[col] can be scalar or list (IN)."""
    conditions: List[str] = []
    params: Dict[str, Any] = {}
    idx = [0]

    def next_key():
        k = f"{param_prefix}{idx[0]}"
        idx[0] += 1
        return k

    for col, val in filters.items():
        if not col.replace("_", "").isalnum():
            continue
        if val is None or (isinstance(val, (list, tuple)) and len(val) == 0):
            continue
        vals = [val] if not isinstance(val, (list, tuple)) else list(val)
        vals = [x for x in vals if x is not None and str(x).strip() != ""]
        if not vals:
            continue
        if len(vals) == 1:
            key = next_key()
            params[key] = vals[0]
            conditions.append(f'"{col}" = :{key}')
        else:
            placeholders = []
            for v in vals:
                key = next_key()
                params[key] = v
                placeholders.append(f":{key}")
            conditions.append(f'"{col}" IN ({", ".join(placeholders)})')
    return conditions, params


@bulk_router.post("/bulk/delete-by-query")
async def delete_by_query_body(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    """Delete row(s) by body: { table: str, filters: { col: val } }. Only allowed tables and filter columns."""
    table = body.get("table")
    if not table or not isinstance(table, str):
        raise HTTPException(status_code=400, detail="Body must include table: string")
    if table not in DELETE_BY_QUERY_ALLOWED_FILTERS:
        raise HTTPException(status_code=400, detail=f"delete-by-query not allowed for table: {table}")
    allowed_cols = DELETE_BY_QUERY_ALLOWED_FILTERS[table]
    if allowed_cols is None:
        raise HTTPException(status_code=400, detail=f"delete-by-query not configured for table: {table}")
    filters = body.get("filters") or body.get("query") or {}
    if not isinstance(filters, dict):
        raise HTTPException(status_code=400, detail="filters must be an object")
    for col in filters.keys():
        if col not in allowed_cols:
            raise HTTPException(status_code=400, detail=f"Filter column '{col}' not allowed for delete-by-query on {table}")
    conditions, params = _build_delete_where(filters)
    if not conditions:
        raise HTTPException(status_code=400, detail="filters must have at least one key")
    sql = f'DELETE FROM "{table}" WHERE {" AND ".join(conditions)} RETURNING *'
    try:
        rows = _data_repo._fetch(sql, params)
        return rows[0] if len(rows) == 1 else (rows if rows else {})
    except Exception as e:
        logger.exception("delete_by_query %s failed: %s", table, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{table}")
async def insert_table(table: str, row: Dict[str, Any] | List[Dict[str, Any]], _user=Depends(get_current_user_users_table)):
    """Insert one or more rows. Accepts a single dict or a list of dicts."""
    _check_table(table)
    is_bulk = isinstance(row, list)
    rows_in = row if is_bulk else [row]
    if not rows_in:
        return [] if is_bulk else {}
    out = []
    for r in rows_in:
        if not isinstance(r, dict):
            raise HTTPException(status_code=422, detail="Input should be a valid dictionary")
        cols = list(r.keys())
        col_list = ", ".join(f'"{c}"' for c in cols)
        placeholders = ", ".join(f":{c}" for c in cols)
        sql = f'INSERT INTO "{table}" ({col_list}) VALUES ({placeholders}) RETURNING *'
        try:
            result = _data_repo._fetch(sql, r)
            if result:
                out.append(result[0])
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    return out if is_bulk or len(out) != 1 else out[0]


@router.patch("/{table}")
async def update_table(table: str, body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    """Body: { pk_col: pk_val, ...updates }. Updates one row by PK."""
    _check_table(table)
    pk = TABLE_PK.get(table)
    if not pk or pk not in body:
        raise HTTPException(status_code=400, detail=f"Provide primary key: {pk}")
    pk_val = body.pop(pk)
    if not body:
        raise HTTPException(status_code=400, detail="No fields to update")
    sets = ", ".join(f'"{c}" = :{c}' for c in body.keys())
    sql = f'UPDATE "{table}" SET {sets} WHERE "{pk}" = :_pk RETURNING *'
    params = dict(body)
    params["_pk"] = pk_val
    try:
        rows = _data_repo._fetch(sql, params)
        return rows[0] if rows else {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{table}", summary="Delete by query params")
async def delete_table(request: Request, table: str, _user=Depends(get_current_user_users_table)):
    """Delete row(s). Query params: col=val or col=val1,val2,val3 (IN). No body."""
    _check_table(table)
    qp = request.query_params
    filters: Dict[str, Any] = {}
    seen_keys = set()
    for col in qp.keys():
        if col in seen_keys or not col.replace("_", "").isalnum():
            continue
        seen_keys.add(col)
        raw_vals = qp.getlist(col)
        vals: List[str] = []
        for r in raw_vals:
            vals.extend(x.strip() for x in str(r).split(",") if x.strip())
        if not vals:
            continue
        filters[col] = vals[0] if len(vals) == 1 else vals
    conditions, params = _build_delete_where(filters, param_prefix="q")
    if not conditions:
        raise HTTPException(status_code=400, detail="Delete requires at least one query param (e.g. id=... or col=val)")
    sql = f'DELETE FROM "{table}" WHERE {" AND ".join(conditions)} RETURNING *'
    try:
        rows = _data_repo._fetch(sql, params)
        return rows[0] if len(rows) == 1 else (rows if rows else {})
    except Exception as e:
        logger.exception("delete %s failed: %s", table, e)
        raise HTTPException(status_code=500, detail=str(e))
