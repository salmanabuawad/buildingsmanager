"""
Generic /api/data/{table} endpoint for frontend Supabase-style queries.
GET /api/data/{table}?select=*&limit=1000&offset=0&order=col&col=val&col__neq=val&col__notnull=1&col__isnull=1&col__in=a,b,c
"""
from datetime import date, datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.auth import decode_token
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

router = APIRouter()
security = HTTPBearer()


def require_jwt(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Require valid JWT (any sub format: UUID or uid:123). Does not look up User model."""
    token = credentials.credentials
    payload = decode_token(token)
    return payload


# Tables the frontend is allowed to query via /api/data/{table}
ALLOWED_TABLES = frozenset({
    "validation_rules", "buildings", "assets", "asset_types", "system_configuration",
    "field_configurations", "audit", "assets_history", "asset_files", "address_list",
    "asset_measurements", "operators", "managers",
})


def _get_columns(db: Session, table: str) -> list[str]:
    """Return list of column names for table from information_schema."""
    r = db.execute(
        text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = :t ORDER BY ordinal_position"
        ),
        {"t": table},
    )
    return [row[0] for row in r.fetchall()]


def _validate_select(select: str, columns: list[str]) -> str:
    if not select or select.strip() == "*":
        return ", ".join(f'"{c}"' for c in columns)
    requested = [c.strip() for c in select.split(",") if c.strip()]
    out = []
    for c in requested:
        if c in columns:
            out.append(f'"{c}"')
    return ", ".join(out) if out else ", ".join(f'"{c}"' for c in columns)


def _build_where_and_params(
    columns: list[str],
    query_params: dict,
) -> tuple[str, dict]:
    """Build WHERE clause and params from query string. Ignore select, limit, offset, order."""
    skip = {"select", "limit", "offset", "order", "or"}
    clauses = []
    params: dict = {}
    for key, value in query_params.items():
        if key in skip or value is None or value == "":
            continue
        if key.endswith("__notnull") and value in (1, "1", True):
            col = key.replace("__notnull", "")
            if col in columns:
                clauses.append(f'"{col}" IS NOT NULL')
            continue
        if key.endswith("__isnull") and value in (1, "1", True):
            col = key.replace("__isnull", "")
            if col in columns:
                clauses.append(f'"{col}" IS NULL')
            continue
        if key.endswith("__neq"):
            col = key.replace("__neq", "")
            if col in columns:
                p = f"p_{len(params)}"
                params[p] = value
                clauses.append(f'"{col}" != :{p}')
            continue
        if key.endswith("__in"):
            col = key.replace("__in", "")
            if col in columns:
                parts = str(value).split(",")
                placeholders = []
                for i, v in enumerate(parts):
                    p = f"p_in_{len(params)}_{i}"
                    params[p] = v.strip()
                    placeholders.append(f":{p}")
                clauses.append(f'"{col}" IN ({", ".join(placeholders)})')
            continue
        if key in columns:
            p = f"p_{len(params)}"
            params[p] = value
            clauses.append(f'"{key}" = :{p}')
    where_sql = " AND ".join(clauses) if clauses else "1=1"
    return where_sql, params


def _get_table_data(
    db: Session,
    table: str,
    select: str,
    limit: int,
    offset: int,
    order: str | None,
    query_params: dict,
) -> list[dict]:
    columns = _get_columns(db, table)
    if not columns:
        return []
    select_sql = _validate_select(select, columns)
    where_sql, where_params = _build_where_and_params(columns, query_params)
    order_sql = ""
    if order:
        # Support order=col, order=col.desc, or order=col:1 (1=asc) / order=col:-1 (desc)
        col = order.strip()
        direction = "ASC"
        if ".desc" in col.lower():
            col = col.split(".", 1)[0].strip()
            direction = "DESC"
        elif ":" in col:
            col, suffix = col.split(":", 1)
            col = col.strip()
            direction = "DESC" if str(suffix).strip() == "-1" else "ASC"
        if col in columns:
            order_sql = f' ORDER BY "{col}" {direction}'
    sql = f'SELECT {select_sql} FROM "{table}" WHERE {where_sql}{order_sql} LIMIT :lim OFFSET :off'
    params = {**where_params, "lim": limit, "off": offset}
    rows = db.execute(text(sql), params).fetchall()
    if not rows:
        return []
    keys = list(rows[0]._mapping.keys())

    def _serialize(v):
        if v is None:
            return None
        if isinstance(v, (datetime, date)):
            return v.isoformat()
        if isinstance(v, Decimal):
            return float(v)
        return v

    return [dict((k, _serialize(row._mapping[k])) for k in keys) for row in rows]


@router.get("/{table}")
def get_table(
    request: Request,
    table: str,
    _payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    q = dict(request.query_params)
    select = q.pop("select", "*")
    limit = int(q.pop("limit", 1000))
    offset = int(q.pop("offset", 0))
    order = q.pop("order", None)
    if table not in ALLOWED_TABLES:
        raise HTTPException(status_code=404, detail="Not Found")
    try:
        rows = _get_table_data(db, table, select, limit, offset, order, q)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return rows