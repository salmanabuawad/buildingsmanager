"""
RPC router: POST /api/rpc/{function_name}
Dispatches all supabase.rpc(...) calls to Python service methods.
Auth is required for all RPCs except auth-related ones (login, otp, task-token).
"""
from fastapi import APIRouter, HTTPException, Request

router = APIRouter()

# These RPCs must work without authentication (they ARE the auth mechanism)
_AUTH_BYPASS_RPCS = {
    "auth_login",
    "auth_login_by_otp",
    "auth_login_by_task_token",
}


def _body(data: dict, key: str, alt: str | None = None, default=None):
    v = data.get(key)
    if v is None and alt:
        v = data.get(alt)
    return v if v is not None else default


def _check_auth(function_name: str, request: Request) -> None:
    """Raise 401 if unauthenticated on a non-bypass RPC."""
    if function_name in _AUTH_BYPASS_RPCS:
        return
    import base64, json

    def _decode_b64_session(raw: str) -> bool:
        """Return True if raw decodes to a valid base64 JSON session with user_id."""
        try:
            pad = raw + "=" * (4 - len(raw) % 4) if len(raw) % 4 else raw
            for decoder in (base64.b64decode, base64.urlsafe_b64decode):
                try:
                    payload = json.loads(decoder(pad).decode("utf-8"))
                    if payload.get("user_id") is not None:
                        return True
                except Exception:
                    continue
        except Exception:
            pass
        return False

    # 1. file_session cookie (base64 JSON set by frontend on login)
    file_session = request.cookies.get("file_session")
    if file_session and _decode_b64_session(file_session):
        return

    # 2. X-Users-Table-Session header
    raw_session = (
        request.headers.get("X-Users-Table-Session")
        or request.headers.get("x-users-table-session")
    )
    if raw_session and _decode_b64_session(raw_session):
        return

    # 3. X-User-Id header (frontend apiFetch shim sends numeric user ID)
    x_user_id = request.headers.get("X-User-Id") or request.headers.get("x-user-id")
    if x_user_id:
        try:
            int(x_user_id)
            return  # authenticated
        except (ValueError, TypeError):
            pass

    # 4. Bearer JWT
    auth_header = request.headers.get("Authorization") or request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
        if token:
            try:
                from app.auth import decode_token
                payload = decode_token(token)
                if payload.get("sub") is not None:
                    return  # authenticated
            except Exception:
                pass

    raise HTTPException(status_code=401, detail="Not authenticated")


@router.post("/{function_name}")
async def call_rpc(function_name: str, request: Request):
    _check_auth(function_name, request)
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
    # ── Auth ──────────────────────────────────────────────────────────────────
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

    # ── Assets ────────────────────────────────────────────────────────────────
    if fn in ("save_assets_bulk_transactional", "save_asset_transactional",
              "bulk_update_assets_with_audit", "bulk_transfer_areas_with_audit"):
        from app.services import asset_service
        action_map = {
            "bulk_transfer_areas_with_audit": "transfer_area",
            "bulk_update_assets_with_audit": "manual_update",
        }
        action_type = p.get("p_action_type", action_map.get(fn, "manual_update"))
        return await asset_service.save_bulk(
            assets_data=p.get("p_assets_data") or p.get("assets_data") or [],
            p_user_id=p.get("p_user_id"),
            validation_passed=p.get("p_validation_passed", True),
            validation_errors=p.get("p_validation_errors"),
            action_type=action_type,
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

    if fn == "reset_export_to_automation":
        from app.services import asset_service
        return await asset_service.reset_export()

    if fn == "search_assets_by_range":
        from app.services import asset_service
        return await asset_service.search_by_range(
            p.get("from_id") or p.get("p_from_id"),
            p.get("to_id") or p.get("p_to_id"),
        )

    # ── Buildings ─────────────────────────────────────────────────────────────
    if fn == "update_building_total_area":
        from app.services import building_service
        return await building_service.update_total_area(p.get("p_building_number"))

    if fn == "update_buildings_bulk_with_distribution_flags":
        from app.services import building_service
        return await building_service.bulk_update_flags(
            p.get("p_buildings_data") or p.get("buildings_data") or []
        )

    if fn == "set_distribution_flags_for_asset_type_change":
        from app.services import building_service
        type_name = (
            p.get("p_asset_type_name") or p.get("asset_type_name")
            or p.get("p_type_name") or p.get("type_name") or ""
        )
        return await building_service.set_distribution_flags_for_asset_type_change(type_name)

    if fn == "get_building_stats":
        from app.database import fetch_one
        bn = p.get("p_building_number") or p.get("building_number")
        if bn is None:
            raise ValueError("get_building_stats: building_number required")
        row = await fetch_one(
            """SELECT b.building_number, b.total_building_area, b.net_area, b.asset_count,
                      b.need_business_distribution, b.need_residence_distribution,
                      b.business_shared_area, b.residence_shared_area,
                      COUNT(a.asset_id)::int AS computed_asset_count,
                      COALESCE(SUM(a.asset_size), 0) AS computed_total_area
               FROM buildings b
               LEFT JOIN assets a ON a.building_number = b.building_number
               WHERE b.building_number = $1
               GROUP BY b.building_number""",
            int(bn),
        )
        return dict(row) if row else {}

    # ── Asset types ───────────────────────────────────────────────────────────
    if fn == "update_asset_type_with_distribution_reset":
        from app.services import asset_type_service
        return await asset_type_service.update_with_reset(p)

    if fn == "update_asset_types_bulk_with_distribution_reset":
        from app.services import asset_type_service
        return await asset_type_service.bulk_update_reset(p)

    # ── Audit / change log ────────────────────────────────────────────────────
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

    if fn == "get_asset_audit_data":
        from app.database import fetch_all
        asset_id = p.get("p_asset_id") or p.get("asset_id")
        if asset_id is None:
            raise ValueError("get_asset_audit_data: asset_id required")
        return await fetch_all(
            "SELECT * FROM audit WHERE asset_id = $1 ORDER BY created_at DESC",
            int(asset_id),
        )

    if fn == "get_building_audit_data":
        from app.database import fetch_all
        bn = p.get("p_building_number") or p.get("building_number")
        if bn is None:
            raise ValueError("get_building_audit_data: building_number required")
        return await fetch_all(
            "SELECT * FROM audit WHERE building_number = $1 ORDER BY created_at DESC",
            int(bn),
        )

    # ── Inspection ────────────────────────────────────────────────────────────
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

    # ── Configuration ─────────────────────────────────────────────────────────
    if fn == "get_config_value":
        from app.database import fetch_one
        name = p.get("p_name") or p.get("name") or p.get("p_key") or p.get("key", "")
        row = await fetch_one(
            "SELECT value FROM system_configuration WHERE name = $1 LIMIT 1",
            name,
        )
        return {"value": row["value"] if row else None}

    if fn == "get_configuration_by_type":
        from app.database import fetch_all
        config_type = p.get("p_type") or p.get("type") or p.get("p_config_type") or ""
        return await fetch_all(
            "SELECT * FROM system_configuration WHERE type = $1 ORDER BY name",
            config_type,
        )

    if fn == "get_active_email_configuration":
        from app.database import fetch_all, fetch_one
        # Try dedicated email_configuration table first
        try:
            rows = await fetch_all(
                "SELECT * FROM email_configuration WHERE active = true LIMIT 1"
            )
            return rows[0] if rows else {}
        except Exception:
            pass
        # Fall back: read smtp_* / email_* keys from system_configuration
        rows = await fetch_all(
            "SELECT name, value FROM system_configuration "
            "WHERE name LIKE 'smtp_%' OR name LIKE 'email_%'"
        )
        return {r["name"]: r["value"] for r in rows}

    # ── Metadata ──────────────────────────────────────────────────────────────
    if fn == "get_tables_fields_types":
        from app.database import fetch_all
        rows = await fetch_all(
            """SELECT table_name, column_name, data_type
               FROM information_schema.columns
               WHERE table_schema = 'public'
               ORDER BY table_name, ordinal_position"""
        )
        result: dict = {}
        for r in rows:
            t = r["table_name"]
            result.setdefault(t, {})[r["column_name"]] = r["data_type"]
        return result

    raise HTTPException(status_code=404, detail=f"RPC not found: {fn}")
