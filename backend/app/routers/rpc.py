"""
RPC router: POST /api/rpc/{function_name}
Dispatches all supabase.rpc(...) calls to Python service methods.
"""
from fastapi import APIRouter, HTTPException, Request

router = APIRouter()


def _body(data: dict, key: str, alt: str | None = None, default=None):
    v = data.get(key)
    if v is None and alt:
        v = data.get(alt)
    return v if v is not None else default


@router.post("/{function_name}")
async def call_rpc(function_name: str, request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}

    try:
        result = await _dispatch(function_name, body)
        return {"data": result, "error": None}
    except (ValueError, PermissionError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def _dispatch(fn: str, p: dict):  # noqa: C901
    # ---- Auth ----
    if fn == "auth_login":
        from app.services import auth_service
        return await auth_service.login(
            p.get("p_user_name", ""),
            p.get("p_password", ""),
        )

    if fn == "auth_login_by_otp":
        from app.services import auth_service
        return await auth_service.login_otp(p.get("p_otp", ""))

    if fn == "auth_login_by_task_token":
        from app.services import auth_service
        return await auth_service.login_task_token(p.get("p_token", ""))

    if fn == "users_create_internal":
        from app.services import auth_service
        return await auth_service.create_user(
            p.get("p_user_name", ""),
            p.get("p_user_email", ""),
            p.get("p_password", ""),
            p.get("p_user_role", "user"),
        )

    if fn == "users_set_password":
        from app.services import auth_service
        await auth_service.set_password(
            p.get("p_user_id"),
            p.get("p_new_password", ""),
        )
        return {}

    if fn == "users_ensure_defaults":
        from app.services import auth_service
        return await auth_service.ensure_defaults()

    # ---- Assets ----
    if fn == "save_assets_bulk_transactional":
        from app.services import asset_service
        return await asset_service.save_bulk(
            assets_data=p.get("p_assets_data") or p.get("assets_data") or [],
            p_user_id=p.get("p_user_id"),
            validation_passed=p.get("p_validation_passed", True),
            validation_errors=p.get("p_validation_errors"),
            action_type=p.get("p_action_type", "manual_update"),
            before_data=p.get("p_before_data"),
            after_data=p.get("p_after_data"),
            description=p.get("p_description"),
            is_business_context=p.get("p_is_business_context"),
        )

    if fn == "delete_asset_transactional":
        from app.services import asset_service
        return await asset_service.delete(
            p.get("p_asset_id") or p.get("asset_id"),
            p.get("p_user_id"),
            p.get("p_description"),
        )

    if fn == "delete_assets_bulk_transactional":
        from app.services import asset_service
        return await asset_service.delete_bulk(
            p.get("p_asset_ids") or p.get("asset_ids") or [],
            p.get("p_user_id"),
            p.get("p_description"),
        )

    if fn == "copy_asset_to_history_before_update":
        from app.services import asset_service
        await asset_service.copy_to_history(p.get("p_asset_id"))
        return {}

    if fn == "get_assets_by_ids":
        from app.services import asset_service
        ids = p.get("p_asset_ids") or []
        return await asset_service.get_by_ids(ids)

    if fn == "mark_assets_as_exported_to_automation":
        from app.services import asset_service
        return await asset_service.mark_exported()

    if fn == "search_assets_by_range":
        from app.services import asset_service
        return await asset_service.search_by_range(
            p.get("from_id") or p.get("p_from_id"),
            p.get("to_id") or p.get("p_to_id"),
        )

    # ---- Buildings ----
    if fn == "update_building_total_area":
        from app.services import building_service
        return await building_service.update_total_area(p.get("p_building_number"))

    if fn == "update_buildings_bulk_with_distribution_flags":
        from app.services import building_service
        return await building_service.bulk_update_flags(
            p.get("p_buildings_data") or p.get("buildings_data") or []
        )

    # ---- Asset types ----
    if fn == "update_asset_type_with_distribution_reset":
        from app.services import asset_type_service
        return await asset_type_service.update_with_reset(p)

    if fn == "update_asset_types_bulk_with_distribution_reset":
        from app.services import asset_type_service
        return await asset_type_service.bulk_update_reset(p)

    # ---- Audit / change log ----
    if fn == "log_audit_entry":
        from app.services import audit_service
        return await audit_service.log_audit(
            table_name=p.get("p_table_name") or p.get("table_name", ""),
            record_id=p.get("p_record_id") or p.get("record_id"),
            action_type=p.get("p_action_type") or p.get("action_type", "update"),
            p_user_id=p.get("p_user_id"),
            old_data=p.get("p_old_data") or p.get("old_data"),
            new_data=p.get("p_new_data") or p.get("new_data"),
            description=p.get("p_description") or p.get("description"),
            building_number=p.get("p_building_number") or p.get("building_number"),
            asset_id=p.get("p_asset_id") or p.get("asset_id"),
            validation_passed=p.get("p_validation_passed"),
            validation_errors=p.get("p_validation_errors"),
            is_business_context=p.get("p_is_business_context"),
        )

    if fn == "log_audit_for_asset":
        from app.services import audit_service
        return await audit_service.log_audit_for_asset(p)

    if fn == "log_audit_for_building":
        from app.services import audit_service
        return await audit_service.log_audit_for_building(p)

    if fn == "log_change_entry":
        from app.services import audit_service
        return await audit_service.log_change(p)

    # ---- Inspection ----
    if fn == "inspector_create_otp":
        from app.services import inspection_service
        return await inspection_service.create_otp(
            user_id=p.get("p_user_id"),
            task_id=p.get("p_task_id"),
            caller_user_id=p.get("p_caller_user_id"),
        )

    if fn == "inspection_task_create_access_token":
        from app.services import inspection_service
        return await inspection_service.create_access_token(
            task_id=p.get("p_task_id"),
            user_id=p.get("p_user_id"),
            caller_user_id=p.get("p_caller_user_id", ""),
        )

    # ---- Metadata ----
    if fn == "get_tables_fields_types":
        from app.database import fetch_all
        rows = await fetch_all(
            """SELECT table_name, column_name, data_type
               FROM information_schema.columns
               WHERE table_schema = 'public'
               ORDER BY table_name, ordinal_position"""
        )
        # Group by table
        result: dict = {}
        for r in rows:
            t = r["table_name"]
            result.setdefault(t, {})[r["column_name"]] = r["data_type"]
        return result

    raise HTTPException(status_code=404, detail=f"RPC not found: {fn}")
