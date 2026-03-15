"""
Audit and change-log service.
Replaces: log_audit_entry, log_audit_for_asset, log_audit_for_building, log_change_entry RPCs.
"""
from datetime import datetime, timezone
from typing import Any
from app.database import fetch_all, fetch_one, get_pool
from app.auth import parse_user_id


async def log_audit(
    table_name: str,
    record_id: Any,
    action_type: str,
    p_user_id: str | None = None,
    old_data: Any = None,
    new_data: Any = None,
    description: str | None = None,
    building_number: int | None = None,
    asset_id: int | None = None,
    validation_passed: bool | None = None,
    validation_errors: Any = None,
    is_business_context: bool | None = None,
) -> dict:
    user_id = parse_user_id(p_user_id)
    import json as _json

    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO audit
               (table_name, record_id, action_type, user_id, old_data, new_data,
                description, building_number, asset_id,
                validation_passed, validation_errors, is_business_context, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
               RETURNING id""",
            table_name,
            str(record_id) if record_id is not None else None,
            action_type,
            user_id,
            _json.dumps(old_data) if old_data is not None else None,
            _json.dumps(new_data) if new_data is not None else None,
            description,
            building_number,
            asset_id,
            validation_passed,
            _json.dumps(validation_errors) if validation_errors is not None else None,
            is_business_context,
        )
    return {"id": row["id"]} if row else {}


async def log_audit_for_asset(payload: dict) -> list:
    user_id = parse_user_id(payload.get("p_user_id"))
    asset_id = payload.get("p_asset_id") or payload.get("asset_id")
    action_type = payload.get("p_action_type") or payload.get("action_type", "update")
    description = payload.get("p_description") or payload.get("description")
    old_data = payload.get("p_old_data") or payload.get("old_data")
    new_data = payload.get("p_new_data") or payload.get("new_data")
    validation_passed = payload.get("p_validation_passed")
    validation_errors = payload.get("p_validation_errors")
    is_business_context = payload.get("p_is_business_context")

    import json as _json
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO audit
               (table_name, record_id, action_type, user_id, old_data, new_data,
                description, asset_id, validation_passed, validation_errors,
                is_business_context, created_at)
               VALUES ('assets',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
               RETURNING id""",
            str(asset_id) if asset_id is not None else None,
            action_type,
            user_id,
            _json.dumps(old_data) if old_data is not None else None,
            _json.dumps(new_data) if new_data is not None else None,
            description,
            asset_id,
            validation_passed,
            _json.dumps(validation_errors) if validation_errors is not None else None,
            is_business_context,
        )
    return [{"id": row["id"]}] if row else []


async def log_audit_for_building(payload: dict) -> list:
    user_id = parse_user_id(payload.get("p_user_id"))
    building_number = payload.get("p_building_number") or payload.get("building_number")
    action_type = payload.get("p_action_type") or payload.get("action_type", "update")
    description = payload.get("p_description") or payload.get("description")
    old_data = payload.get("p_old_data") or payload.get("old_data")
    new_data = payload.get("p_new_data") or payload.get("new_data")

    import json as _json
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO audit
               (table_name, record_id, action_type, user_id, old_data, new_data,
                description, building_number, created_at)
               VALUES ('buildings',$1,$2,$3,$4,$5,$6,$7,now())
               RETURNING id""",
            str(building_number) if building_number is not None else None,
            action_type,
            user_id,
            _json.dumps(old_data) if old_data is not None else None,
            _json.dumps(new_data) if new_data is not None else None,
            description,
            building_number,
        )
    return [{"id": row["id"]}] if row else []


async def log_change(payload: dict) -> dict:
    """Insert a change_log row.

    Maps legacy field-level params (field_name/old_value/new_value) to the
    actual schema (before_data jsonb, after_data jsonb, changed_fields text[]).
    """
    import json as _json
    user_id = parse_user_id(payload.get("p_user_id"))
    table_name = payload.get("p_table_name") or payload.get("table_name", "")
    record_id = payload.get("p_record_id") or payload.get("record_id")
    field_name = payload.get("p_field_name") or payload.get("field_name")
    old_value = payload.get("p_old_value") or payload.get("old_value")
    new_value = payload.get("p_new_value") or payload.get("new_value")

    before_data = _json.dumps({field_name: old_value}) if field_name else None
    after_data = _json.dumps({field_name: new_value}) if field_name else None
    changed_fields = [field_name] if field_name else []

    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO change_log
               (table_name, record_id, operation, before_data, after_data,
                changed_fields, user_id, created_at)
               VALUES ($1,$2,'UPDATE',$3,$4,$5,$6,now())
               RETURNING log_id""",
            table_name,
            str(record_id) if record_id is not None else None,
            before_data,
            after_data,
            changed_fields,
            user_id,
        )
    return {"id": row["log_id"]} if row else {}
