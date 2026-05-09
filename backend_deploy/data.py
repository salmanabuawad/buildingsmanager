"""
Generic table data API for frontend (production-format query params).

Filter format:
  col=value          equality
  col__notnull=1     IS NOT NULL
  col__isnull=1      IS NULL
  col__neq=value     !=
  col__in=v1,v2,v3   IN (...)
  order=col.desc     ORDER BY col DESC
  or=col.eq.val,...  OR clause
"""
import re
import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from app.database import get_pool
from app.repositories.base import ALLOWED_TABLES, _safe_col, _format_literal, _cast_value
from app.users_table import get_current_user_users_table

router = APIRouter()
bulk_router = APIRouter()
logger = logging.getLogger(__name__)

RESERVED = {"select", "limit", "offset", "order", "or"}

TABLE_PK: Dict[str, str] = {
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

DELETE_BY_QUERY_ALLOWED_FILTERS: Dict[str, Optional[set]] = {
    "audit": {"entity_type", "entity_id"},
    "buildings": {"building_number"},
    "change_log": {"log_id", "table_name", "record_id", "user_id"},
}

_COL_PAT = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


def _check_table(table: str) -> None:
    if table not in ALLOWED_TABLES:
        raise HTTPException(status_code=400, detail=f"Table not allowed: {table}")


def _validate_select(select: str) -> str:
    raw = (select or "").strip().replace(" ", "")
    if not raw or raw == "*":
        return "*"
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    valid = [p for p in parts if _COL_PAT.match(p)]
    return ", ".join(valid) if valid else "*"


def _order_clause(order: Optional[str]) -> str:
    if not order:
        return ""
    order = order.strip()
    if "." in order:
        col, direction = order.rsplit(".", 1)
        col = col.strip()
        d = direction.strip().lower()
        if _COL_PAT.match(col) and d in ("asc", "desc"):
            return f"ORDER BY {col} {d.upper()}"
    if _COL_PAT.match(order):
        return f"ORDER BY {order} ASC"
    return ""


def _build_where(qp) -> str:
    conditions: List[str] = []
    # OR clauses
    or_vals = qp.getlist("or") if hasattr(qp, "getlist") else ([qp["or"]] if "or" in qp else [])
    for or_str in or_vals:
        parts = [p.strip() for p in or_str.split(",") if p.strip()]
        or_conds: List[str] = []
        for part in parts:
            segs = part.rsplit(".", 2)
            if len(segs) != 3:
                continue
            c, op, v = segs[0].strip(), segs[1].strip().lower(), segs[2].strip()
            if not _COL_PAT.match(c):
                continue
            if op == "is" and v.lower() == "null":
                or_conds.append(f"{c} IS NULL")
            elif op == "eq":
                or_conds.append(f"{c} = {_format_literal(_cast_value(v))}")
        if or_conds:
            conditions.append("(" + " OR ".join(or_conds) + ")")
    # Column filters
    items = qp.multi_items() if hasattr(qp, "multi_items") else list(qp.items())
    for col, val in items:
        if col in RESERVED:
            continue
        if col.endswith("__notnull"):
            cn = col[:-9]
            if _COL_PAT.match(cn):
                conditions.append(f"{cn} IS NOT NULL")
        elif col.endswith("__isnull"):
            cn = col[:-8]
            if _COL_PAT.match(cn):
                conditions.append(f"{cn} IS NULL")
        elif col.endswith("__neq"):
            cn = col[:-5]
            if _COL_PAT.match(cn):
                conditions.append(f"{cn} != {_format_literal(_cast_value(str(val)))}")
        elif col.endswith("__in"):
            cn = col[:-4]
            if _COL_PAT.match(cn):
                raw_parts = [p.strip() for p in str(val).split(",") if p.strip()]
                if raw_parts:
                    lits = ", ".join(_format_literal(_cast_value(p)) for p in raw_parts)
                    conditions.append(f"{cn} IN ({lits})")
        else:
            if not _COL_PAT.match(col):
                continue
            conditions.append(f"{col} = {_format_literal(_cast_value(str(val)))}")
    return (" WHERE " + " AND ".join(conditions)) if conditions else ""


# ── GET /{table} ──────────────────────────────────────────────────────────────
@router.get("/{table}")
async def get_table(
    request: Request,
    table: str,
    select: str = Query("*"),
    limit: Optional[int] = Query(1000, le=10000),
    offset: Optional[int] = Query(0, ge=0),
    order: Optional[str] = None,
    _user=Depends(get_current_user_users_table),
):
    _check_table(table)
    cols = _validate_select(select)
    where = _build_where(request.query_params)
    ord_sql = _order_clause(order)
    sql = f"SELECT {cols} FROM {table}{where}"
    if ord_sql:
        sql += " " + ord_sql
    sql += f" LIMIT {limit} OFFSET {offset}"
    pool = get_pool()
    async with pool.acquire() as conn:
        try:
            rows = await conn.fetch(sql)
            return [dict(r) for r in rows]
        except Exception as e:
            logger.exception("GET /api/data/%s: %s", table, e)
            raise HTTPException(status_code=500, detail=str(e))


# ── POST /{table}/upsert ──────────────────────────────────────────────────────
@router.post("/{table}/upsert")
async def upsert_table(
    table: str,
    body: Dict[str, Any],
    _user=Depends(get_current_user_users_table),
):
    _check_table(table)
    rows_in = body.get("rows")
    if rows_in is None:
        rows_in = [body] if "onConflict" in body else []
    on_conflict = body.get("onConflict", "")
    if not on_conflict:
        raise HTTPException(status_code=400, detail="onConflict required")
    conflict_cols = [c.strip() for c in str(on_conflict).split(",") if c.strip()]
    for c in conflict_cols:
        if not _COL_PAT.match(c):
            raise HTTPException(status_code=400, detail="Invalid onConflict")
    if not rows_in:
        return []
    out = []
    pool = get_pool()
    async with pool.acquire() as conn:
        for row in rows_in:
            if not isinstance(row, dict):
                continue
            cols = [k for k in row.keys() if k != "onConflict"]
            if not cols:
                continue
            col_names = ", ".join(_safe_col(c) for c in cols)
            ph = ", ".join(f"${i+1}" for i in range(len(cols)))
            vals = [row.get(c) for c in cols]
            non_pk = [c for c in cols if c not in conflict_cols]
            if non_pk:
                upd = ", ".join(f"{_safe_col(c)} = EXCLUDED.{_safe_col(c)}" for c in non_pk)
                oc = f"ON CONFLICT ({', '.join(_safe_col(c) for c in conflict_cols)}) DO UPDATE SET {upd}"
            else:
                oc = f"ON CONFLICT ({', '.join(_safe_col(c) for c in conflict_cols)}) DO NOTHING"
            sql = f"INSERT INTO {table} ({col_names}) VALUES ({ph}) {oc} RETURNING *"
            try:
                r = await conn.fetchrow(sql, *vals)
                if r:
                    out.append(dict(r))
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e))
    return out[0] if len(out) == 1 else out


# ── POST /{table} (insert) ────────────────────────────────────────────────────
@router.post("/{table}")
async def insert_table(
    table: str,
    row: Any,
    _user=Depends(get_current_user_users_table),
):
    _check_table(table)
    is_bulk = isinstance(row, list)
    rows_in = row if is_bulk else [row]
    if not rows_in:
        return [] if is_bulk else {}
    out = []
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            for r in rows_in:
                if not isinstance(r, dict):
                    raise HTTPException(status_code=422, detail="Expected dict")
                cols = list(r.keys())
                col_names = ", ".join(_safe_col(c) for c in cols)
                ph = ", ".join(f"${i+1}" for i in range(len(cols)))
                vals = [r.get(c) for c in cols]
                sql = f"INSERT INTO {table} ({col_names}) VALUES ({ph}) RETURNING *"
                try:
                    result = await conn.fetchrow(sql, *vals)
                    if result:
                        out.append(dict(result))
                except Exception as e:
                    raise HTTPException(status_code=500, detail=str(e))
    return out[0] if not is_bulk and len(out) == 1 else out


# ── PATCH /{table} (update by PK) ─────────────────────────────────────────────
@router.patch("/{table}")
async def update_table(
    table: str,
    body: Dict[str, Any],
    _user=Depends(get_current_user_users_table),
):
    _check_table(table)
    pk = TABLE_PK.get(table)
    if not pk or pk not in body:
        raise HTTPException(status_code=400, detail=f"Provide primary key: {pk}")
    pk_val = body.pop(pk)
    if not body:
        raise HTTPException(status_code=400, detail="No fields to update")
    cols = list(body.keys())
    set_sql = ", ".join(f"{_safe_col(c)} = ${i+1}" for i, c in enumerate(cols))
    vals = list(body.values()) + [pk_val]
    sql = f"UPDATE {table} SET {set_sql} WHERE {_safe_col(pk)} = ${len(cols)+1} RETURNING *"
    pool = get_pool()
    async with pool.acquire() as conn:
        try:
            rows = await conn.fetch(sql, *vals)
            return dict(rows[0]) if rows else {}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


# ── DELETE /{table} ───────────────────────────────────────────────────────────
@router.delete("/{table}")
async def delete_table(
    request: Request,
    table: str,
    _user=Depends(get_current_user_users_table),
):
    _check_table(table)
    where = _build_where(request.query_params)
    if not where:
        raise HTTPException(status_code=400, detail="Delete requires at least one filter")
    sql = f"DELETE FROM {table}{where} RETURNING *"
    pool = get_pool()
    async with pool.acquire() as conn:
        try:
            rows = await conn.fetch(sql)
            result = [dict(r) for r in rows]
            return result[0] if len(result) == 1 else (result if result else {})
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


# ── POST /bulk/delete-by-query ────────────────────────────────────────────────
@bulk_router.post("/bulk/delete-by-query")
async def delete_by_query(
    body: Dict[str, Any],
    _user=Depends(get_current_user_users_table),
):
    table = body.get("table")
    if not table:
        raise HTTPException(status_code=400, detail="Body must include table")
    if table not in DELETE_BY_QUERY_ALLOWED_FILTERS:
        raise HTTPException(status_code=400, detail=f"delete-by-query not allowed for: {table}")
    allowed_cols = DELETE_BY_QUERY_ALLOWED_FILTERS[table]
    filters = body.get("filters") or body.get("query") or {}
    if not isinstance(filters, dict):
        raise HTTPException(status_code=400, detail="filters must be an object")
    for col in filters:
        if col not in allowed_cols:
            raise HTTPException(status_code=400, detail=f"Column not allowed: {col}")
    conds: List[str] = []
    for col, val in filters.items():
        if val is None:
            continue
        if isinstance(val, (list, tuple)):
            if val:
                lits = ", ".join(_format_literal(_cast_value(str(v))) for v in val)
                conds.append(f"{_safe_col(col)} IN ({lits})")
        else:
            conds.append(f"{_safe_col(col)} = {_format_literal(_cast_value(str(val)))}")
    if not conds:
        raise HTTPException(status_code=400, detail="filters must have at least one key")
    sql = f"DELETE FROM {table} WHERE {' AND '.join(conds)} RETURNING *"
    pool = get_pool()
    async with pool.acquire() as conn:
        try:
            rows = await conn.fetch(sql)
            result = [dict(r) for r in rows]
            return result[0] if len(result) == 1 else (result if result else {})
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
