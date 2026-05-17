from __future__ import annotations

import json
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import RowMapping
from sqlalchemy.orm import Session


IMMUTABLE_BUILDING_COLUMNS = {
    "id",
    "building_number",
    "created_at",
    "created_by",
}

IMMUTABLE_ASSET_TYPE_COLUMNS = {
    "id",
    "created_at",
}

IMMUTABLE_ASSET_COLUMNS = {
    "id",
    "created_at",
}


def _get_columns(db: Session, table: str) -> set[str]:
    rows = db.execute(
        text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = :table"
        ),
        {"table": table},
    ).fetchall()
    return {row[0] for row in rows}


def _serialize_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def _serialize_row(row: Any) -> dict[str, Any]:
    if isinstance(row, (dict, RowMapping)):
        mapping = row
    else:
        mapping = row._mapping
    return {key: _serialize_value(value) for key, value in mapping.items()}


def _build_update_sql(
    table: str,
    key_column: str,
    key_param_name: str,
    key_value: Any,
    updates: dict[str, Any],
    columns: set[str],
) -> tuple[str, dict[str, Any]]:
    params: dict[str, Any] = {key_param_name: key_value}
    set_clauses: list[str] = []

    for index, (column, value) in enumerate(updates.items()):
        param_name = f"value_{index}"
        params[param_name] = value
        set_clauses.append(f'"{column}" = :{param_name}')

    if "updated_at" in columns and "updated_at" not in updates:
        set_clauses.append('"updated_at" = NOW()')

    sql = (
        f'UPDATE "{table}" SET {", ".join(set_clauses)} '
        f'WHERE "{key_column}" = :{key_param_name} RETURNING *'
    )
    return sql, params


def _build_insert_sql(
    table: str,
    values: dict[str, Any],
) -> tuple[str, dict[str, Any]]:
    params: dict[str, Any] = {}
    columns: list[str] = []
    placeholders: list[str] = []

    for index, (column, value) in enumerate(values.items()):
        param_name = f"value_{index}"
        columns.append(f'"{column}"')
        placeholders.append(f":{param_name}")
        params[param_name] = value

    sql = (
        f'INSERT INTO "{table}" ({", ".join(columns)}) '
        f'VALUES ({", ".join(placeholders)}) RETURNING *'
    )
    return sql, params


def _normalize_business_residence(value: Any) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip().lower()
    if normalized in {"עסקים", "business"}:
        return "business"
    if normalized in {"מגורים", "residence"}:
        return "residence"
    return None


def _parse_uuid_or_none(value: Any) -> str | None:
    if value is None:
        return None
    try:
        return str(uuid.UUID(str(value)))
    except Exception:
        return None


def _parse_user_id_int(value: Any) -> int | None:
    """Parse integer user_id from 'uid:N' format or plain integer."""
    if value is None:
        return None
    s = str(value).strip()
    if s.startswith("uid:"):
        try:
            return int(s[4:])
        except ValueError:
            return None
    try:
        return int(s)
    except (ValueError, TypeError):
        return None


def update_buildings_with_distribution_flags(
    db: Session,
    items: list[dict[str, Any]],
) -> dict[str, Any]:
    columns = _get_columns(db, "buildings")
    updated_rows: list[dict[str, Any]] = []

    for item in items:
        building_number = int(item["building_number"])
        current_row = db.execute(
            text('SELECT * FROM "buildings" WHERE "building_number" = :building_number FOR UPDATE'),
            {"building_number": building_number},
        ).mappings().first()

        if current_row is None:
            raise ValueError(f"Building {building_number} not found")

        updates = {
            key: value
            for key, value in (item.get("updates") or {}).items()
            if key in columns and key not in IMMUTABLE_BUILDING_COLUMNS
        }

        if not updates:
            updated_rows.append(_serialize_row(current_row))
            continue

        old_residence = current_row.get("residence_shared_area")
        old_business = current_row.get("business_shared_area")

        if (
            "residence_shared_area" in updates
            and updates["residence_shared_area"] != old_residence
            and "need_residence_distribution" in columns
        ):
            updates["need_residence_distribution"] = True

        if (
            "business_shared_area" in updates
            and updates["business_shared_area"] != old_business
            and "need_business_distribution" in columns
        ):
            updates["need_business_distribution"] = True

        sql, params = _build_update_sql(
            table="buildings",
            key_column="building_number",
            key_param_name="building_number",
            key_value=building_number,
            updates=updates,
            columns=columns,
        )
        updated_row = db.execute(text(sql), params).mappings().first()
        if updated_row is None:
            raise ValueError(f"Building {building_number} update failed")
        updated_rows.append(_serialize_row(updated_row))

    return {
        "success": True,
        "count": len(updated_rows),
        "buildings": updated_rows,
    }


def _insert_audit_row(
    db: Session,
    *,
    entity_type: str,
    entity_id: str,
    action_type: str,
    old_values: dict[str, Any] | None,
    new_values: dict[str, Any] | None,
    changed_by: Any = None,
    tax_region: Any = None,
) -> None:
    columns = _get_columns(db, "audit")
    if not columns:
        return

    payload: dict[str, Any] = {}
    if "entity_type" in columns:
        payload["entity_type"] = entity_type
    if "entity_id" in columns:
        payload["entity_id"] = entity_id
    if "action_type" in columns:
        payload["action_type"] = action_type
    # Support both column naming conventions
    before_col = "before_data" if "before_data" in columns else ("old_values" if "old_values" in columns else None)
    after_col = "after_data" if "after_data" in columns else ("new_values" if "new_values" in columns else None)
    if before_col:
        payload[before_col] = json.dumps(old_values, ensure_ascii=False) if old_values is not None else None
    if after_col:
        payload[after_col] = json.dumps(new_values, ensure_ascii=False) if new_values is not None else None

    if "changed_at" in columns:
        payload["changed_at"] = datetime.utcnow().isoformat()
    if "tax_region" in columns and tax_region is not None:
        payload["tax_region"] = str(tax_region)

    # user_id (integer, NOT NULL in current schema) — parsed from 'uid:N' format
    user_id_int = _parse_user_id_int(changed_by)
    if "user_id" in columns:
        if user_id_int is None:
            return  # cannot insert without required user_id
        payload["user_id"] = user_id_int

    # legacy changed_by (UUID) for older schemas
    changed_by_uuid = _parse_uuid_or_none(changed_by)
    if "changed_by" in columns and changed_by_uuid is not None:
        payload["changed_by"] = changed_by_uuid

    if not payload:
        return

    sql, params = _build_insert_sql("audit", payload)
    db.execute(text(sql), params)


def copy_asset_to_history(db: Session, asset_id: int) -> bool:
    asset_row = db.execute(
        text('SELECT * FROM "assets" WHERE "asset_id" = :asset_id'),
        {"asset_id": asset_id},
    ).mappings().first()
    if asset_row is None:
        return False

    history_columns = _get_columns(db, "assets_history")
    if not history_columns:
        return False

    payload: dict[str, Any] = {}
    for key, value in dict(asset_row).items():
        if key in history_columns and key != "id":
            payload[key] = value

    if "history_created_at" in history_columns:
        payload["history_created_at"] = datetime.utcnow().isoformat()

    if not payload:
        return False

    sql, params = _build_insert_sql("assets_history", payload)
    db.execute(text(sql), params)
    return True


def _get_building_shared_areas(db: Session, building_number: Any) -> tuple[float, float]:
    """Return (residence_shared_area, business_shared_area). Returns (0, 0) if building not found."""
    row = db.execute(
        text(
            'SELECT COALESCE("residence_shared_area", 0) AS res_area, '
            'COALESCE("business_shared_area", 0) AS biz_area '
            'FROM "buildings" WHERE "building_number" = :building_number'
        ),
        {"building_number": building_number},
    ).mappings().first()
    if row is None:
        return 0.0, 0.0
    return float(row["res_area"]), float(row["biz_area"])


def _get_asset_type_details(db: Session, type_name: Any) -> tuple[str | None, bool]:
    if type_name is None or str(type_name).strip() == "":
        return None, False

    row = db.execute(
        text(
            'SELECT "business_residence", COALESCE("non_accountable_for_distribution", false) AS "non_accountable_for_distribution" '
            'FROM "asset_types" WHERE "name" = :type_name'
        ),
        {"type_name": str(type_name)},
    ).mappings().first()
    if row is None:
        return None, False

    return _normalize_business_residence(row.get("business_residence")), bool(row.get("non_accountable_for_distribution"))


def _set_distribution_flags_for_asset_type_change(
    db: Session,
    *,
    building_number: Any,
    old_main_asset_type: Any,
    new_main_asset_type: Any,
) -> dict[str, bool]:
    if building_number is None:
        return {"business_flag_set": False, "residence_flag_set": False}

    if old_main_asset_type == new_main_asset_type:
        return {"business_flag_set": False, "residence_flag_set": False}

    old_business_residence, old_non_accountable = _get_asset_type_details(db, old_main_asset_type)
    new_business_residence, new_non_accountable = _get_asset_type_details(db, new_main_asset_type)

    if not old_non_accountable and not new_non_accountable:
        return {"business_flag_set": False, "residence_flag_set": False}

    business_residence = new_business_residence or old_business_residence
    res_area, biz_area = _get_building_shared_areas(db, building_number)

    if business_residence == "business":
        if biz_area > 0:
            db.execute(
                text('UPDATE "buildings" SET "need_business_distribution" = true WHERE "building_number" = :building_number'),
                {"building_number": building_number},
            )
        return {"business_flag_set": biz_area > 0, "residence_flag_set": False}
    if business_residence == "residence":
        if res_area > 0:
            db.execute(
                text('UPDATE "buildings" SET "need_residence_distribution" = true WHERE "building_number" = :building_number'),
                {"building_number": building_number},
            )
        return {"business_flag_set": False, "residence_flag_set": res_area > 0}

    biz_set = biz_area > 0
    res_set = res_area > 0
    if biz_set and res_set:
        db.execute(
            text(
                'UPDATE "buildings" SET '
                '"need_business_distribution" = true, '
                '"need_residence_distribution" = true '
                'WHERE "building_number" = :building_number'
            ),
            {"building_number": building_number},
        )
    elif biz_set:
        db.execute(
            text('UPDATE "buildings" SET "need_business_distribution" = true WHERE "building_number" = :building_number'),
            {"building_number": building_number},
        )
    elif res_set:
        db.execute(
            text('UPDATE "buildings" SET "need_residence_distribution" = true WHERE "building_number" = :building_number'),
            {"building_number": building_number},
        )
    return {"business_flag_set": biz_set, "residence_flag_set": res_set}


def _re_flag_distribution_for_asset_change(
    db: Session,
    *,
    building_number: Any,
    main_asset_type: Any,
    existing_row: Any,
    new_row: Any,
    action_type: str,
) -> None:
    """
    Re-flag need_business/residence_distribution when an accountable asset
    in a building with matching shared_area > 0 is inserted or has a
    distribution-relevant size change. Complements the narrower
    `_set_distribution_flags_for_asset_type_change` (which only triggers on
    accountable↔non-accountable transitions) so that adding a new business
    asset, or resizing one, doesn't leave stale per-asset distribution
    values unreviewed.
    """
    if building_number is None:
        return
    # The distribution actions themselves write per-asset fields; they must
    # never re-flag (would undo the clearing that happens in the same tx).
    if action_type in ("business_distribution", "residence_distribution"):
        return

    business_residence, non_accountable = _get_asset_type_details(db, main_asset_type)
    if non_accountable:
        return  # non-accountable assets never participate in distribution

    is_insert = existing_row is None
    size_fields = ("asset_size", "sub_asset_size_1")
    size_changed = False
    if not is_insert:
        for fld in size_fields:
            old_v = existing_row.get(fld) if existing_row is not None else None
            new_v = new_row.get(fld) if new_row is not None else None
            if old_v != new_v:
                size_changed = True
                break
    if not is_insert and not size_changed:
        return

    res_area, biz_area = _get_building_shared_areas(db, building_number)

    if business_residence == "business" and biz_area > 0:
        db.execute(
            text('UPDATE "buildings" SET "need_business_distribution" = true WHERE "building_number" = :building_number'),
            {"building_number": building_number},
        )
    elif business_residence == "residence" and res_area > 0:
        db.execute(
            text('UPDATE "buildings" SET "need_residence_distribution" = true WHERE "building_number" = :building_number'),
            {"building_number": building_number},
        )
    elif business_residence is None:
        # Unknown / unmapped asset type: be conservative — flag whichever
        # shared area exists.
        if biz_area > 0:
            db.execute(
                text('UPDATE "buildings" SET "need_business_distribution" = true WHERE "building_number" = :building_number'),
                {"building_number": building_number},
            )
        if res_area > 0:
            db.execute(
                text('UPDATE "buildings" SET "need_residence_distribution" = true WHERE "building_number" = :building_number'),
                {"building_number": building_number},
            )


def save_assets_bulk_transactional(
    db: Session,
    *,
    assets_data: list[dict[str, Any]],
    validation_passed: bool | None,
    validation_errors: str | None,
    action_type: str = "manual_update",
    user_id: Any = None,
) -> dict[str, Any]:
    if validation_passed is None:
        raise ValueError("Validation status is required")
    if validation_passed is False:
        raise ValueError(validation_errors or "Validation failed")

    asset_columns = _get_columns(db, "assets")
    if not asset_columns:
        raise ValueError("assets table not found")

    affected_asset_ids: list[int] = []
    affected_buildings: set[int] = set()

    # ── Bulk audit: pre-snapshot for distribution-class actions ──────────
    # The UI's DistributionHistoryModal reads entity_type='bulk_asset' audit
    # rows (one per building per distribution) with before_data / after_data
    # each containing { building, assets[] }. Per-asset audit rows (written
    # inside the loop below) are kept as-is for fine-grained tracking.
    DISTRIBUTION_BULK_ACTIONS = {
        "business_distribution",
        "residence_distribution",
        "distribute_shared",
        "transfer_area",
    }
    distribution_bulk = action_type in DISTRIBUTION_BULK_ACTIONS
    pre_building_snapshots: dict[int, dict[str, Any]] = {}
    if distribution_bulk:
        pre_building_nums: set[int] = set()
        for _ad in assets_data:
            try:
                _bn = int(_ad.get("building_number"))
                pre_building_nums.add(_bn)
            except (TypeError, ValueError):
                continue
        for _bn in pre_building_nums:
            _b_row = db.execute(
                text('SELECT * FROM "buildings" WHERE "building_number" = :bn'),
                {"bn": _bn},
            ).mappings().first()
            _a_rows = db.execute(
                text('SELECT * FROM "assets" WHERE "building_number" = :bn ORDER BY "asset_id"'),
                {"bn": _bn},
            ).mappings().all()
            pre_building_snapshots[_bn] = {
                "building": _serialize_row(_b_row) if _b_row else None,
                "assets": [_serialize_row(r) for r in _a_rows],
            }

    for asset_data in assets_data:
        asset_id = asset_data.get("asset_id")
        building_number = asset_data.get("building_number")
        if asset_id is None or building_number is None:
            raise ValueError("asset_id and building_number are required")

        asset_id = int(asset_id)
        building_number = int(building_number)

        existing_row = db.execute(
            text('SELECT * FROM "assets" WHERE "asset_id" = :asset_id FOR UPDATE'),
            {"asset_id": asset_id},
        ).mappings().first()

        payload = {
            key: value
            for key, value in asset_data.items()
            if key in asset_columns and key not in IMMUTABLE_ASSET_COLUMNS
        }

        old_building_number = None
        old_main_asset_type = None
        if existing_row is not None:
            old_building_number = existing_row.get("building_number")
            old_main_asset_type = existing_row.get("main_asset_type")
            copy_asset_to_history(db, asset_id)

            sql, params = _build_update_sql(
                table="assets",
                key_column="asset_id",
                key_param_name="asset_id",
                key_value=asset_id,
                updates=payload,
                columns=asset_columns,
            )
            updated_row = db.execute(text(sql), params).mappings().first()
            if updated_row is None:
                raise ValueError(f"Failed to update asset {asset_id}")
            new_row = updated_row
            _insert_audit_row(
                db,
                entity_type="asset",
                entity_id=str(asset_id),
                action_type=action_type,
                old_values=_serialize_row(existing_row),
                new_values=_serialize_row(new_row),
                changed_by=user_id,
                tax_region=new_row.get("tax_region"),
            )
        else:
            if "created_at" not in payload and "created_at" in asset_columns:
                payload["created_at"] = datetime.utcnow().isoformat()
            if "updated_at" not in payload and "updated_at" in asset_columns:
                payload["updated_at"] = datetime.utcnow().isoformat()

            sql, params = _build_insert_sql("assets", payload)
            new_row = db.execute(text(sql), params).mappings().first()
            if new_row is None:
                raise ValueError(f"Failed to create asset {asset_id}")
            _insert_audit_row(
                db,
                entity_type="asset",
                entity_id=str(asset_id),
                action_type=action_type,
                old_values=None,
                new_values=_serialize_row(new_row),
                changed_by=user_id,
                tax_region=new_row.get("tax_region"),
            )

        affected_asset_ids.append(asset_id)
        affected_buildings.add(int(new_row.get("building_number")))
        if old_building_number is not None:
            affected_buildings.add(int(old_building_number))

        _set_distribution_flags_for_asset_type_change(
            db,
            building_number=new_row.get("building_number"),
            old_main_asset_type=old_main_asset_type,
            new_main_asset_type=new_row.get("main_asset_type"),
        )
        _re_flag_distribution_for_asset_change(
            db,
            building_number=new_row.get("building_number"),
            main_asset_type=new_row.get("main_asset_type"),
            existing_row=existing_row,
            new_row=new_row,
            action_type=action_type,
        )

    for building_number in sorted(affected_buildings):
        update_building_total_area(db, building_number)

    # Clear distribution flag atomically in the same transaction
    if action_type == "business_distribution":
        for building_number in sorted(affected_buildings):
            db.execute(
                text('UPDATE "buildings" SET "need_business_distribution" = false WHERE "building_number" = :bn'),
                {"bn": building_number},
            )
    elif action_type == "residence_distribution":
        for building_number in sorted(affected_buildings):
            db.execute(
                text('UPDATE "buildings" SET "need_residence_distribution" = false WHERE "building_number" = :bn'),
                {"bn": building_number},
            )

    # ── Bulk audit: one entity_type='bulk_asset' row per affected building
    # when the action is a distribution/transfer. DistributionHistoryModal
    # reads these rows (per-asset rows are kept for the detail view inside).
    if distribution_bulk:
        for bn in sorted(affected_buildings):
            b_row = db.execute(
                text('SELECT * FROM "buildings" WHERE "building_number" = :bn'),
                {"bn": bn},
            ).mappings().first()
            a_rows = db.execute(
                text('SELECT * FROM "assets" WHERE "building_number" = :bn ORDER BY "asset_id"'),
                {"bn": bn},
            ).mappings().all()
            after_snapshot = {
                "building": _serialize_row(b_row) if b_row else None,
                "assets": [_serialize_row(r) for r in a_rows],
            }
            before_snapshot = pre_building_snapshots.get(bn, {"building": None, "assets": []})
            # tax_region tag lets the UI filter business vs. residence history
            tax_tag = None
            if action_type == "residence_distribution":
                tax_tag = "residence"
            elif action_type == "business_distribution":
                tax_tag = "business"
            _insert_audit_row(
                db,
                entity_type="bulk_asset",
                entity_id=str(bn),
                action_type=action_type,
                old_values=before_snapshot,
                new_values=after_snapshot,
                changed_by=user_id,
                tax_region=tax_tag,
            )

    return {
        "success": True,
        "affected_asset_ids": affected_asset_ids,
        "affected_buildings": sorted(affected_buildings),
        "count": len(affected_asset_ids),
    }


def delete_asset_transactional(
    db: Session,
    *,
    asset_id: int,
    user_id: Any = None,
    description: str | None = None,
) -> dict[str, Any]:
    row = db.execute(
        text('SELECT * FROM "assets" WHERE "asset_id" = :asset_id FOR UPDATE'),
        {"asset_id": asset_id},
    ).mappings().first()
    if row is None:
        raise ValueError(f"Asset not found: {asset_id}")

    building_number = row.get("building_number")
    main_asset_type = row.get("main_asset_type")
    before_data = _serialize_row(row)

    copy_asset_to_history(db, asset_id)
    db.execute(text('DELETE FROM "assets" WHERE "asset_id" = :asset_id'), {"asset_id": asset_id})
    update_building_total_area(db, int(building_number))

    business_residence, _ = _get_asset_type_details(db, main_asset_type)
    res_area, biz_area = _get_building_shared_areas(db, building_number)

    if business_residence == "business":
        if biz_area > 0:
            db.execute(
                text('UPDATE "buildings" SET "need_business_distribution" = true WHERE "building_number" = :building_number'),
                {"building_number": building_number},
            )
    elif business_residence == "residence":
        if res_area > 0:
            db.execute(
                text('UPDATE "buildings" SET "need_residence_distribution" = true WHERE "building_number" = :building_number'),
                {"building_number": building_number},
            )
    else:
        if biz_area > 0 and res_area > 0:
            db.execute(
                text(
                    'UPDATE "buildings" SET '
                    '"need_business_distribution" = true, '
                    '"need_residence_distribution" = true '
                    'WHERE "building_number" = :building_number'
                ),
                {"building_number": building_number},
            )
        elif biz_area > 0:
            db.execute(
                text('UPDATE "buildings" SET "need_business_distribution" = true WHERE "building_number" = :building_number'),
                {"building_number": building_number},
            )
        elif res_area > 0:
            db.execute(
                text('UPDATE "buildings" SET "need_residence_distribution" = true WHERE "building_number" = :building_number'),
                {"building_number": building_number},
            )

    _insert_audit_row(
        db,
        entity_type="asset",
        entity_id=str(asset_id),
        action_type="delete",
        old_values=before_data,
        new_values=None,
        changed_by=user_id,
        tax_region=before_data.get("tax_region"),
    )

    return {
        "success": True,
        "asset_id": asset_id,
        "building_number": building_number,
        "description": description,
    }


def delete_assets_bulk_transactional(
    db: Session,
    *,
    asset_ids: list[int],
    user_id: Any = None,
    description: str | None = None,
) -> dict[str, Any]:
    count = 0
    for asset_id in asset_ids:
        delete_asset_transactional(db, asset_id=int(asset_id), user_id=user_id, description=description)
        count += 1
    return {
        "success": True,
        "count": count,
    }


def get_assets_with_history(db: Session, building_number: int) -> list[dict[str, Any]]:
    history_columns = _get_columns(db, "assets_history")
    if not history_columns:
        return [
            {**_serialize_row(row), "is_latest": True}
            for row in db.execute(
                text('SELECT * FROM "assets" WHERE "building_number" = :building_number ORDER BY "asset_id"'),
                {"building_number": building_number},
            ).mappings().all()
        ]

    master_rows = db.execute(
        text('SELECT * FROM "assets" WHERE "building_number" = :building_number ORDER BY "asset_id"'),
        {"building_number": building_number},
    ).mappings().all()
    if not master_rows:
        return []

    asset_ids = [row["asset_id"] for row in master_rows if row.get("asset_id") is not None]
    if not asset_ids:
        return []

    placeholders = ", ".join(f":asset_id_{idx}" for idx in range(len(asset_ids)))
    params = {f"asset_id_{idx}": asset_id for idx, asset_id in enumerate(asset_ids)}
    order_expression = (
        'COALESCE("history_created_at", "created_at")'
        if "history_created_at" in history_columns and "created_at" in history_columns
        else '"history_created_at"'
        if "history_created_at" in history_columns
        else '"created_at"'
    )
    history_rows = db.execute(
        text(
            f'SELECT * FROM "assets_history" '
            f'WHERE "asset_id" IN ({placeholders}) '
            f"ORDER BY {order_expression} DESC"
        ),
        params,
    ).mappings().all()

    history_by_asset: dict[Any, list[dict[str, Any]]] = {}
    for row in history_rows:
        history_by_asset.setdefault(row.get("asset_id"), []).append(_serialize_row(row))

    results: list[dict[str, Any]] = []
    for row in master_rows:
        master = _serialize_row(row)
        master["is_latest"] = True
        results.append(master)
        for history_row in history_by_asset.get(row.get("asset_id"), []):
            history_row["is_latest"] = False
            results.append(history_row)
    return results


def update_building_total_area(db: Session, building_number: int) -> dict[str, Any]:
    """
    Recompute net_area and total_building_area for a building.

    net_area:            SUM(asset_size) excluding only non_accountable_for_total_area
                         types. Assets flagged use_shared_area or
                         use_for_parking_shared_area are included in net_area (see
                         commit history for the rationale — previous behavior excluded
                         them, but those exclusions were removed by request).
    total_building_area: net_area + residence_shared_area + business_shared_area
                         + shared_parking_area (from building table)
    """
    # Collect asset type names flagged non-accountable for total area.
    # Previously this also included use_shared_area / use_for_parking_shared_area
    # — those exclusions were removed.
    excluded_type_rows = db.execute(
        text("""
            SELECT name FROM asset_types
            WHERE non_accountable_for_total_area = true
        """)
    ).fetchall()
    non_accountable_type_names = {str(r[0]).strip() for r in excluded_type_rows if r[0]}

    # Fetch all assets for this building (no asset_types join — we resolve
    # accountability via the non_accountable_type_names set built above, which
    # avoids the LIMIT-1 non-determinism on types with multiple variants).
    rows = db.execute(
        text("""
            SELECT a.main_asset_type,
                   a.asset_size,
                   a.sub_asset_type_1, a.sub_asset_size_1,
                   a.sub_asset_type_2, a.sub_asset_size_2,
                   a.sub_asset_type_3, a.sub_asset_size_3,
                   a.sub_asset_type_4, a.sub_asset_size_4,
                   a.sub_asset_type_5, a.sub_asset_size_5,
                   a.sub_asset_type_6, a.sub_asset_size_6
            FROM assets a
            WHERE a.building_number = :bn
        """),
        {"bn": building_number},
    ).mappings().all()

    net_area = 0.0
    for row in rows:
        # Main asset_size: include unless main type is non_accountable_for_total_area.
        # The use_shared_area / use_for_parking_shared_area exclusions were removed.
        main_type = row.get("main_asset_type")
        main_type_name = str(main_type).strip() if main_type is not None else ""
        if main_type_name not in non_accountable_type_names:
            net_area += float(row["asset_size"] or 0)

        # Each sub-type is checked independently — accountable sub-types count
        # even if the main type is non-accountable (e.g. type 199 container).
        for i in range(1, 7):
            sub_type = row.get(f"sub_asset_type_{i}")
            sub_size = row.get(f"sub_asset_size_{i}")
            if sub_type and str(sub_type).strip() not in non_accountable_type_names:
                net_area += float(sub_size or 0)

    building_row = db.execute(
        text("""
            SELECT residence_shared_area, business_shared_area, shared_parking_area
            FROM buildings WHERE building_number = :bn
        """),
        {"bn": building_number},
    ).mappings().first()

    if building_row is None:
        raise ValueError(f"Building {building_number} not found")

    # asset_size in the current data model is RAW (not inflated with the
    # asset's share of building-level shared areas — distribute writes
    # business_distribution_area + shared_parking_area as SEPARATE per-asset
    # columns, never mutates asset_size). The previous code subtracted the
    # building shared totals from net_area to "back out" distributed amounts
    # that were never there, producing a net_area that was too low by the
    # shared totals and a total_building_area that equalled raw sum instead
    # of "raw sum + building-level shared".
    #
    # Current formula:
    #   net_area  = sum of accountable asset physical areas (no subtraction)
    #   total_building_area = net_area + residence + business + parking
    residence_shared = float(building_row["residence_shared_area"] or 0)
    business_shared = float(building_row["business_shared_area"] or 0)
    parking_shared = float(building_row["shared_parking_area"] or 0)

    total_area = (
        net_area
        + residence_shared
        + business_shared
        + parking_shared
    )

    # Keep asset_count in sync with actual row count so the buildings grid
    # reflects new buildings / inserts / deletes immediately.
    asset_count_row = db.execute(
        text('SELECT COUNT(*) AS c FROM "assets" WHERE "building_number" = :bn'),
        {"bn": building_number},
    ).mappings().first()
    asset_count = int(asset_count_row["c"]) if asset_count_row else 0

    updated_row = db.execute(
        text("""
            UPDATE buildings
            SET net_area = :net_area,
                total_building_area = :total_area,
                asset_count = :asset_count
            WHERE building_number = :bn
            RETURNING *
        """),
        {
            "net_area": net_area,
            "total_area": total_area,
            "asset_count": asset_count,
            "bn": building_number,
        },
    ).mappings().first()

    if updated_row is None:
        raise ValueError(f"Building {building_number} not found")

    return _serialize_row(updated_row)


def update_asset_type_with_distribution_reset(
    db: Session,
    asset_type_id: int,
    updates_input: dict[str, Any],
) -> dict[str, Any]:
    columns = _get_columns(db, "asset_types")
    current_row = db.execute(
        text('SELECT * FROM "asset_types" WHERE "id" = :asset_type_id FOR UPDATE'),
        {"asset_type_id": asset_type_id},
    ).mappings().first()

    if current_row is None:
        raise ValueError(f"Asset type {asset_type_id} not found")

    updates = {
        key: value
        for key, value in updates_input.items()
        if key in columns and key not in IMMUTABLE_ASSET_TYPE_COLUMNS
    }

    if not updates:
        serialized = _serialize_row(current_row)
        return {
            "before_data": serialized,
            "after_data": serialized,
            "affected_buildings": [],
            "distribution_flags_reset": False,
        }

    old_name = current_row.get("name")
    old_non_accountable = current_row.get("non_accountable_for_distribution")

    sql, params = _build_update_sql(
        table="asset_types",
        key_column="id",
        key_param_name="asset_type_id",
        key_value=asset_type_id,
        updates=updates,
        columns=columns,
    )
    updated_row = db.execute(text(sql), params).mappings().first()
    if updated_row is None:
        raise ValueError(f"Asset type {asset_type_id} update failed")

    affected_buildings: list[int] = []
    new_non_accountable = updated_row.get("non_accountable_for_distribution")
    business_residence = updated_row.get("business_residence")

    if old_non_accountable is not new_non_accountable and old_name:
        building_rows = db.execute(
            text(
                'SELECT DISTINCT "building_number" '
                'FROM "assets" '
                'WHERE "main_asset_type" = :asset_type_name '
                'AND "building_number" IS NOT NULL'
            ),
            {"asset_type_name": old_name},
        ).fetchall()
        affected_buildings = [int(row[0]) for row in building_rows if row[0] is not None]

        if affected_buildings:
            placeholders = ", ".join(f":building_{idx}" for idx in range(len(affected_buildings)))
            params = {f"building_{idx}": building for idx, building in enumerate(affected_buildings)}
            if business_residence == "עסקים":
                db.execute(
                    text(
                        f'UPDATE "buildings" SET "need_business_distribution" = true '
                        f'WHERE "building_number" IN ({placeholders})'
                    ),
                    params,
                )
            elif business_residence == "מגורים":
                db.execute(
                    text(
                        f'UPDATE "buildings" SET "need_residence_distribution" = true '
                        f'WHERE "building_number" IN ({placeholders})'
                    ),
                    params,
                )
            else:
                db.execute(
                    text(
                        f'UPDATE "buildings" SET '
                        f'"need_business_distribution" = true, '
                        f'"need_residence_distribution" = true '
                        f'WHERE "building_number" IN ({placeholders})'
                    ),
                    params,
                )

    return {
        "before_data": _serialize_row(current_row),
        "after_data": _serialize_row(updated_row),
        "affected_buildings": affected_buildings,
        "distribution_flags_reset": len(affected_buildings) > 0,
    }


def bulk_update_asset_types_with_distribution_reset(
    db: Session,
    items: list[dict[str, Any]],
) -> dict[str, Any]:
    affected_buildings: set[int] = set()
    count = 0

    for item in items:
        result = update_asset_type_with_distribution_reset(
            db=db,
            asset_type_id=int(item["id"]),
            updates_input=dict(item.get("updates") or {}),
        )
        affected_buildings.update(int(building) for building in result["affected_buildings"])
        count += 1

    return {
        "success": True,
        "count": count,
        "affected_buildings": sorted(affected_buildings),
    }
