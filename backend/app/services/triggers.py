"""
Replicates PostgreSQL trigger logic in Python for Azure deployment.
Called by services when modifying assets, buildings, asset_types, etc.

Trigger -> Python function mapping:
- normalize_asset_boolean_fields (BEFORE INSERT/UPDATE assets) -> normalize_asset_boolean_fields()
- update_asset_business_total_area (BEFORE INSERT/UPDATE assets) -> update_asset_business_total_area()
- reset_export_flags_on_change (BEFORE UPDATE assets) -> reset_export_flags_on_change()
- set_data_from_automation_false_on_asset_change (BEFORE UPDATE assets) -> set_data_from_automation_false_on_asset_change()
- copy_asset_to_history (BEFORE UPDATE/DELETE assets) -> copy_asset_to_history_before_update(), copy_asset_to_history_on_delete()
- auto_update_building_total_area (AFTER INSERT/UPDATE/DELETE assets) -> update_building_total_area()
- auto_set_distribution_flags_on_change (AFTER INSERT/UPDATE assets) -> auto_set_distribution_flags_on_change()
- update_updated_at_column (BEFORE UPDATE on assets, asset_types, field_configurations, etc.) -> updated_at_now()
"""
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text

# --- Normalize boolean (Hebrew/string to bool) ---
_TRUE_VALS = {"כן", "yes", "true", "1", "t"}
_FALSE_VALS = {"לא", "no", "false", "0", "f", "", "null"}


def _to_bool(val: Any, default: bool = False) -> bool:
    if val is None:
        return default
    if isinstance(val, bool):
        return val
    s = (str(val).strip().lower() if val else "").strip('"')
    if s in _TRUE_VALS or s == "true":
        return True
    if s in _FALSE_VALS or not s:
        return False
    try:
        return bool(val)
    except Exception:
        return default


def normalize_asset_boolean_fields(row: dict) -> dict:
    """Replicates trigger normalize_asset_boolean_fields (BEFORE INSERT/UPDATE on assets)."""
    out = dict(row)
    for key in ("elevator", "single_double_family", "condo", "townhouses", "penthouse", "exported_to_automation"):
        if key in out:
            out[key] = _to_bool(out.get(key), default=(False if key != "exported_to_automation" else False))
    return out


def calculate_asset_business_total_area(
    db: Session,
    asset_size: Optional[float],
    business_distribution_area: Optional[float],
    main_asset_type: Optional[str],
) -> Decimal:
    """Replicates function calculate_asset_business_total_area."""
    if not main_asset_type:
        return Decimal("0")
    r = db.execute(
        text("""
            SELECT EXISTS (
                SELECT 1 FROM asset_types at
                WHERE at.name = :name AND at.active = true AND at.business_residence = 'עסקים'
            )
        """),
        {"name": main_asset_type},
    ).scalar()
    if not r:
        return Decimal("0")
    return Decimal(str(asset_size or 0)) + Decimal(str(business_distribution_area or 0))


def update_asset_business_total_area(row: dict, db: Session) -> dict:
    """Replicates trigger update_asset_business_total_area (BEFORE INSERT/UPDATE on assets)."""
    out = dict(row)
    total = calculate_asset_business_total_area(
        db,
        row.get("asset_size"),
        row.get("business_distribution_area"),
        row.get("main_asset_type"),
    )
    out["business_total_area"] = total
    return out


def _asset_data_changed(old: dict, new: dict, data_fields: list) -> bool:
    for k in data_fields:
        ov, nv = old.get(k), new.get(k)
        if ov != nv and (ov is not None or nv is not None):
            return True
    return False


# Fields that count as "data change" for reset_export_flags (same as trigger)
_EXPORT_RESET_FIELDS = [
    "building_number", "asset_id", "payer_id", "main_asset_type", "asset_size", "measurement_date",
    "tax_region", "sub_asset_type_1", "sub_asset_size_1", "sub_asset_type_2", "sub_asset_size_2",
    "sub_asset_type_3", "sub_asset_size_3", "sub_asset_type_4", "sub_asset_size_4",
    "sub_asset_type_5", "sub_asset_size_5", "sub_asset_type_6", "sub_asset_size_6",
    "business_distribution_area", "elevator", "single_double_family", "condo", "townhouses", "penthouse",
    "structure_drawing_url", "discount_type", "discount_date_from", "discount_date_to", "comment",
    "apartment_number", "apartment_floor", "storage_number", "storage_floor",
]


def reset_export_flags_on_change(old_row: Optional[dict], new_row: dict) -> dict:
    """Replicates trigger reset_export_flags_on_change (BEFORE UPDATE on assets)."""
    if old_row is None:
        return new_row
    if _asset_data_changed(old_row, new_row, _EXPORT_RESET_FIELDS):
        out = dict(new_row)
        out["exported_to_automation"] = False
        out["export_to_automation_at"] = None
        return out
    return new_row


def set_data_from_automation_false_on_asset_change(old_row: Optional[dict], new_row: dict) -> dict:
    """Replicates trigger set_data_from_automation_false_on_asset_change (BEFORE UPDATE on assets)."""
    if old_row is None:
        return new_row
    data_fields = [
        "building_number", "payer_id", "measurement_date", "main_asset_type", "asset_size",
        "sub_asset_type_1", "sub_asset_size_1", "sub_asset_type_2", "sub_asset_size_2",
        "sub_asset_type_3", "sub_asset_size_3", "sub_asset_type_4", "sub_asset_size_4",
        "sub_asset_type_5", "sub_asset_size_5", "sub_asset_type_6", "sub_asset_size_6",
        "structure_drawing_url", "elevator", "single_double_family", "condo", "townhouses", "penthouse",
        "tax_region", "discount_type", "discount_date_from", "discount_date_to",
        "business_distribution_area", "comment",
    ]
    if _asset_data_changed(old_row, new_row, data_fields):
        out = dict(new_row)
        out["data_from_automation"] = False
        return out
    return new_row


# Columns copied from assets to assets_history (exclude is_new_measurement)
_HISTORY_COLS = [
    "building_number", "payer_id", "asset_id", "measurement_date", "main_asset_type", "asset_size",
    "sub_asset_type_1", "sub_asset_size_1", "sub_asset_type_2", "sub_asset_size_2",
    "sub_asset_type_3", "sub_asset_size_3", "sub_asset_type_4", "sub_asset_size_4",
    "sub_asset_type_5", "sub_asset_size_5", "sub_asset_type_6", "sub_asset_size_6",
    "structure_drawing_url", "created_at", "updated_at",
    "elevator", "single_double_family", "condo", "townhouses", "penthouse",
    "tax_region", "discount_type", "discount_date_from", "discount_date_to",
    "business_distribution_area", "exported_to_automation", "comment",
    "apartment_number", "storage_number", "apartment_floor", "storage_floor",
    "export_to_automation_at", "data_from_automation", "operator_id", "business_total_area",
]


def _row_to_dict(row) -> dict:
    if hasattr(row, "_mapping"):
        return dict(row._mapping)
    return dict(row) if row else {}


def copy_asset_to_history_before_update(db: Session, asset_id: int) -> None:
    """Replicates copy_asset_to_history_before_update: copy current asset row into assets_history."""
    row = db.execute(
        text("SELECT * FROM assets WHERE asset_id = :aid"),
        {"aid": asset_id},
    ).fetchone()
    if not row:
        return
    r = _row_to_dict(row)
    params = {k: r.get(k) for k in _HISTORY_COLS}
    params["history_created_at"] = datetime.now(timezone.utc)
    params["action_id"] = None
    cols = _HISTORY_COLS + ["history_created_at", "action_id"]
    placeholders = ", ".join(f":{c}" for c in cols)
    col_list = ", ".join(cols)
    db.execute(
        text(f"INSERT INTO assets_history ({col_list}) VALUES ({placeholders})"),
        params,
    )


def copy_asset_to_history_on_delete(db: Session, old_row: dict) -> None:
    """Replicates copy_asset_to_history trigger on DELETE: insert OLD into assets_history."""
    params = {c: old_row.get(c) for c in _HISTORY_COLS}
    params["history_created_at"] = datetime.now(timezone.utc)
    params["action_id"] = None
    cols = _HISTORY_COLS + ["history_created_at", "action_id"]
    placeholders = ", ".join(f":{c}" for c in cols)
    col_list = ", ".join(cols)
    db.execute(
        text(f"INSERT INTO assets_history ({col_list}) VALUES ({placeholders})"),
        params,
    )


def copy_asset_to_history_on_update_is_new_measurement(db: Session, old_row: dict) -> None:
    """When is_new_measurement=true on update, copy OLD row to assets_history."""
    copy_asset_to_history_on_delete(db, old_row)


def update_building_total_area(db: Session, building_number: int) -> None:
    """Replicates function update_building_total_area."""
    db.execute(
        text("""
            WITH asset_sum AS (
                SELECT COALESCE(SUM(a.asset_size), 0) AS s
                FROM (
                    SELECT DISTINCT ON (asset_id) asset_id, asset_size, main_asset_type
                    FROM assets
                    WHERE building_number = :bn
                    ORDER BY asset_id, updated_at DESC
                ) a
                WHERE (
                    a.main_asset_type IS NULL
                    OR EXISTS (
                        SELECT 1 FROM asset_types at
                        WHERE at.name = a.main_asset_type AND at.active = true
                          AND (at.non_accountable_for_total_area IS NULL OR at.non_accountable_for_total_area = false)
                    )
                )
            ),
            bus AS (
                SELECT COALESCE(business_shared_area, 0) AS b FROM buildings WHERE building_number = :bn2
            )
            UPDATE buildings
            SET total_building_area = (SELECT s FROM asset_sum) + (SELECT b FROM bus)
            WHERE building_number = :bn3
        """),
        {"bn": building_number, "bn2": building_number, "bn3": building_number},
    )


def auto_set_distribution_flags_on_change(
    db: Session,
    op: str,
    building_number: Optional[int],
    main_asset_type: Optional[str],
    old_row: Optional[dict],
    new_row: Optional[dict],
) -> None:
    """Replicates trigger auto_set_distribution_flags_on_change (AFTER INSERT/UPDATE on assets)."""
    if not building_number or not main_asset_type:
        return
    type_changed = size_changed = False
    if op == "UPDATE" and old_row and new_row:
        type_changed = old_row.get("main_asset_type") != new_row.get("main_asset_type")
        size_changed = old_row.get("asset_size") != new_row.get("asset_size")
    elif op == "INSERT" and new_row:
        type_changed = True
        size_changed = bool(new_row.get("asset_size"))

    if not type_changed and not size_changed:
        return

    res = db.execute(
        text("SELECT business_residence FROM asset_types WHERE name = :name"),
        {"name": main_asset_type},
    ).fetchone()
    business_residence = res[0] if res else None

    if size_changed or type_changed:
        if business_residence == "עסקים":
            db.execute(
                text("""
                    UPDATE buildings SET need_business_distribution = true
                    WHERE building_number = :bn AND COALESCE(business_shared_area, 0) > 0
                """),
                {"bn": building_number},
            )
        elif business_residence == "מגורים":
            db.execute(
                text("""
                    UPDATE buildings SET need_residence_distribution = true
                    WHERE building_number = :bn AND COALESCE(residence_shared_area, 0) > 0
                """),
                {"bn": building_number},
            )


def updated_at_now() -> datetime:
    """Replicates update_updated_at_column (BEFORE UPDATE on various tables)."""
    return datetime.now(timezone.utc)
