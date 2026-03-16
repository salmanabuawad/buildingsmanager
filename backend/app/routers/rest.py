"""
Generic PostgREST-compatible REST router.
GET/POST/PATCH/DELETE /api/rest/{table}
Handles PostgREST-style query params: col=eq.value, order=col.asc, limit=n, or=(...), select=col1,col2
"""
from fastapi import APIRouter, Depends, Request, HTTPException
from app.repositories.base import (
    generic_select,
    generic_insert,
    generic_update,
    generic_delete,
    ALLOWED_TABLES,
)
from app.users_table import get_current_user_users_table, CurrentUser

router = APIRouter()


def _table_or_404(table: str) -> str:
    if table not in ALLOWED_TABLES:
        raise HTTPException(status_code=404, detail=f"Table not found: {table}")
    return table


def _query_params(request: Request) -> dict:
    """Convert QueryParams (multi-value) to dict of str | list."""
    result: dict = {}
    for key, value in request.query_params.multi_items():
        if key in result:
            existing = result[key]
            if isinstance(existing, list):
                existing.append(value)
            else:
                result[key] = [existing, value]
        else:
            result[key] = value
    return result


@router.get("/{table}")
async def rest_select(
    table: str,
    request: Request,
    _user: CurrentUser = Depends(get_current_user_users_table),
):
    _table_or_404(table)
    try:
        rows = await generic_select(table, _query_params(request))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return rows


@router.post("/{table}")
async def rest_insert(
    table: str,
    request: Request,
    _user: CurrentUser = Depends(get_current_user_users_table),
):
    _table_or_404(table)
    body = await request.json()
    try:
        rows = await generic_insert(table, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return rows


@router.patch("/{table}")
async def rest_update(
    table: str,
    request: Request,
    _user: CurrentUser = Depends(get_current_user_users_table),
):
    _table_or_404(table)
    body = await request.json()
    params = _query_params(request)
    try:
        rows = await generic_update(table, body, params)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return rows


@router.delete("/{table}")
async def rest_delete(
    table: str,
    request: Request,
    _user: CurrentUser = Depends(get_current_user_users_table),
):
    _table_or_404(table)
    params = _query_params(request)
    try:
        rows = await generic_delete(table, params)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return rows
