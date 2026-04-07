"""
Service-layer REST endpoints.
All require JWT / session auth.
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Any, Dict, List, Optional
from app.users_table import get_current_user_users_table

router = APIRouter()


def _err(e: Exception) -> str:
    return str(e)


# ── Assets ────────────────────────────────────────────────────────────────────
@router.post("/assets/save-bulk-transactional")
async def assets_save_bulk(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    from app.services import asset_service
    try:
        return await asset_service.save_bulk(
            assets_data=body.get("assets_data") or body.get("p_assets_data") or [],
            p_user_id=body.get("p_user_id") or body.get("user_id"),
            validation_passed=body.get("p_validation_passed", body.get("validation_passed", True)),
            validation_errors=body.get("p_validation_errors") or body.get("validation_errors"),
            action_type=body.get("p_action_type") or body.get("action_type", "manual_update"),
            before_data=body.get("p_before_data") or body.get("before_data"),
            after_data=body.get("p_after_data") or body.get("after_data"),
            description=body.get("p_description") or body.get("description"),
            is_business_context=body.get("p_is_business_context") or body.get("is_business_context"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=_err(e))


@router.post("/assets/delete-transactional")
async def assets_delete(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    from app.services import asset_service
    try:
        return await asset_service.delete(
            body.get("p_asset_id") or body.get("asset_id"),
            body.get("p_user_id") or body.get("user_id"),
            body.get("p_description") or body.get("description"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=_err(e))


@router.post("/assets/delete-bulk-transactional")
async def assets_delete_bulk(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    from app.services import asset_service
    try:
        return await asset_service.delete_bulk(
            body.get("p_asset_ids") or body.get("asset_ids") or [],
            body.get("p_user_id") or body.get("user_id"),
            body.get("p_description") or body.get("description"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=_err(e))


@router.post("/assets/by-ids")
async def assets_by_ids(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    from app.services import asset_service
    try:
        ids = body.get("p_asset_ids") or body.get("asset_ids") or []
        return await asset_service.get_by_ids(ids)
    except Exception as e:
        raise HTTPException(status_code=500, detail=_err(e))


@router.post("/assets/with-history")
async def assets_with_history(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    from app.database import get_pool
    try:
        ids = body.get("p_asset_ids") or body.get("asset_ids") or []
        if not ids:
            return []
        pool = get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT a.*, h.id as history_id FROM assets a "
                "LEFT JOIN assets_history h ON h.asset_id = a.asset_id "
                "WHERE a.asset_id = ANY($1::bigint[])",
                [int(i) for i in ids],
            )
            return [dict(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=_err(e))


@router.post("/assets/copy-to-history")
async def assets_copy_to_history(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    from app.services import asset_service
    try:
        await asset_service.copy_to_history(body.get("p_asset_id") or body.get("asset_id"))
        return {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=_err(e))


@router.post("/assets/mark-exported")
async def assets_mark_exported(_user=Depends(get_current_user_users_table)):
    from app.services import asset_service
    try:
        return await asset_service.mark_exported()
    except Exception as e:
        raise HTTPException(status_code=500, detail=_err(e))


@router.post("/assets/mark-exported-by-ids")
async def assets_mark_exported_by_ids(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    from app.database import get_pool
    from datetime import datetime, timezone
    try:
        ids = [int(x) for x in (body.get("asset_ids") or [])]
        if not ids:
            return {"updated_count": 0, "asset_ids": []}
        export_date = datetime.now(timezone.utc).date()
        pool = get_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                "UPDATE assets SET exported_to_automation = true, measurement_date = $1 "
                "WHERE asset_id = ANY($2::bigint[])",
                export_date,
                ids,
            )
        updated = int(result.split()[-1]) if result else 0
        return {"updated_count": updated, "asset_ids": ids}
    except Exception as e:
        raise HTTPException(status_code=500, detail=_err(e))


@router.get("/assets/measured-not-exported")
async def assets_measured_not_exported(
    building_number: Optional[int] = None,
    _user=Depends(get_current_user_users_table),
):
    """Return only assets that are measured and not yet exported. building_number is required so we never return all assets in the system; callers must pass the building they are exporting for."""
    from app.database import get_pool
    if building_number is None or building_number <= 0:
        return []
    try:
        pool = get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT * FROM assets WHERE measurement_date IS NOT NULL AND "
                "(exported_to_automation IS NULL OR exported_to_automation = false) "
                "AND building_number = $1",
                building_number,
            )
            return [dict(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=_err(e))


@router.post("/assets/reset-export-to-automation")
async def assets_reset_export(_user=Depends(get_current_user_users_table)):
    from app.services import asset_service
    try:
        return await asset_service.reset_export()
    except Exception as e:
        raise HTTPException(status_code=500, detail=_err(e))


@router.post("/assets/search-by-range")
async def assets_search_by_range(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    from app.services import asset_service
    try:
        return await asset_service.search_by_range(
            body.get("from_id") or body.get("p_from_id"),
            body.get("to_id") or body.get("p_to_id"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=_err(e))


# ── Buildings ─────────────────────────────────────────────────────────────────
@router.post("/buildings/update-total-area")
async def buildings_update_area(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    from app.services import building_service
    try:
        bn = body.get("p_building_number") or body.get("building_number")
        return await building_service.update_total_area(int(bn))
    except Exception as e:
        raise HTTPException(status_code=500, detail=_err(e))


@router.post("/buildings/bulk-distribution-flags")
async def buildings_bulk_flags(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    from app.services import building_service
    try:
        return await building_service.bulk_update_flags(
            body.get("p_buildings_data") or body.get("buildings_data") or []
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=_err(e))


@router.delete("/buildings/by-number/{building_number}", status_code=200)
async def buildings_delete(building_number: int, _user=Depends(get_current_user_users_table)):
    from app.database import get_pool
    from app.services import asset_service
    try:
        pool = get_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                count = await conn.fetchval(
                    "SELECT COUNT(*) FROM assets WHERE building_number = $1", building_number
                )
                asset_rows = await conn.fetch(
                    "SELECT asset_id FROM assets WHERE building_number = $1", building_number
                )
                for row in asset_rows:
                    try:
                        from app.services.asset_service import _copy_to_history_conn
                        await _copy_to_history_conn(conn, row["asset_id"])
                    except Exception:
                        pass
                await conn.execute("DELETE FROM audit WHERE building_number = $1", building_number)
                await conn.execute("DELETE FROM assets WHERE building_number = $1", building_number)
                b = await conn.fetchrow(
                    "DELETE FROM buildings WHERE building_number = $1 RETURNING building_number",
                    building_number,
                )
                if not b:
                    raise ValueError(f"Building {building_number} not found")
        return {"success": True, "building_number": building_number, "deleted_assets_count": count}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=_err(e))


# ── Asset types ───────────────────────────────────────────────────────────────
@router.post("/asset-types/update-with-distribution-reset")
async def asset_types_update(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    from app.services import asset_type_service
    try:
        return await asset_type_service.update_with_reset(body)
    except Exception as e:
        raise HTTPException(status_code=500, detail=_err(e))


@router.post("/asset-types/bulk-distribution-reset")
async def asset_types_bulk_reset(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    from app.services import asset_type_service
    try:
        return await asset_type_service.bulk_update_reset(body)
    except Exception as e:
        raise HTTPException(status_code=500, detail=_err(e))


# ── Audit ─────────────────────────────────────────────────────────────────────
@router.post("/audit/entry")
async def audit_entry(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    from app.services import audit_service
    try:
        return await audit_service.log_audit(
            table_name=body.get("p_table_name") or body.get("table_name", ""),
            record_id=body.get("p_record_id") or body.get("record_id"),
            action_type=body.get("p_action_type") or body.get("action_type", "update"),
            p_user_id=body.get("p_user_id") or body.get("user_id"),
            old_data=body.get("p_old_data") or body.get("old_data"),
            new_data=body.get("p_new_data") or body.get("new_data"),
            description=body.get("p_description") or body.get("description"),
            building_number=body.get("p_building_number") or body.get("building_number"),
            asset_id=body.get("p_asset_id") or body.get("asset_id"),
            validation_passed=body.get("p_validation_passed"),
            validation_errors=body.get("p_validation_errors"),
            is_business_context=body.get("p_is_business_context"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=_err(e))


@router.post("/audit/for-asset")
async def audit_for_asset(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    from app.services import audit_service
    try:
        return await audit_service.log_audit_for_asset(body)
    except Exception as e:
        raise HTTPException(status_code=500, detail=_err(e))


@router.post("/audit/for-building")
async def audit_for_building(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    from app.services import audit_service
    try:
        return await audit_service.log_audit_for_building(body)
    except Exception as e:
        raise HTTPException(status_code=500, detail=_err(e))


@router.post("/change-log/entry")
async def change_log_entry(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    from app.services import audit_service
    try:
        return await audit_service.log_change(body)
    except Exception as e:
        raise HTTPException(status_code=500, detail=_err(e))


@router.post("/change-log/history")
async def change_log_history(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    from app.services import audit_service
    try:
        return await audit_service.get_record_change_history(body)
    except Exception as e:
        raise HTTPException(status_code=500, detail=_err(e))


# ── Users ─────────────────────────────────────────────────────────────────────
@router.post("/users/internal")
async def users_create(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    from app.services import auth_service
    try:
        return await auth_service.create_user(
            body.get("p_user_name") or body.get("user_name", ""),
            body.get("p_user_email") or body.get("user_email", ""),
            body.get("p_password") or body.get("password", ""),
            body.get("p_user_role") or body.get("user_role", "user"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=_err(e))


@router.post("/users/set-password")
async def users_set_password(body: Dict[str, Any], _user=Depends(get_current_user_users_table)):
    from app.services import auth_service
    try:
        await auth_service.set_password(
            body.get("p_user_id") or body.get("user_id"),
            body.get("p_new_password") or body.get("new_password", ""),
        )
        return {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=_err(e))


@router.post("/users/ensure-defaults")
async def users_ensure_defaults(_user=Depends(get_current_user_users_table)):
    from app.services import auth_service
    try:
        return await auth_service.ensure_defaults()
    except Exception as e:
        raise HTTPException(status_code=500, detail=_err(e))
