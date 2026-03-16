"""
Asset service.
Replaces: save_assets_bulk_transactional, delete_asset_transactional,
          delete_assets_bulk_transactional, copy_asset_to_history_before_update,
          get_assets_by_ids, mark_assets_as_exported_to_automation,
          search_assets_by_range RPCs.

Trigger-equivalent logic (all Supabase triggers ported to Python):
  - normalize_asset_boolean_fields  (BEFORE INSERT/UPDATE)
  - reset_export_flags_on_change    (AFTER UPDATE — clears exported_to_automation when data changes)
  - update_asset_business_total_area (AFTER INSERT/UPDATE/DELETE — recomputes building total)
  - auto_set_distribution_flags_on_change (AFTER INSERT/UPDATE/DELETE — sets need_*_distribution)
  - copy_asset_to_history           (conditional — only when is_new_measurement=True)
"""
from datetime import datetime, timezone
from typing import Any, Optional

from app.database import get_pool, fetch_all
from app.auth import parse_user_id


# ── Boolean field names that need Hebrew/string normalization ──────────────
_BOOL_FIELDS = {
    "elevator", "single_double_family", "condo", "townhouses", "penthouse",
    "exported_to_automation", "data_from_automation",
}

# ── Fields whose change triggers export-flag reset ────────────────────────
_EXPORT_RESET_FIELDS = {
    "payer_id", "main_asset_type", "asset_size", "measurement_date",
    "sub_asset_type_1", "sub_asset_size_1",
    "sub_asset_type_2", "sub_asset_size_2",
    "sub_asset_type_3", "sub_asset_size_3",
    "sub_asset_type_4", "sub_asset_size_4",
    "sub_asset_type_5", "sub_asset_size_5",
    "sub_asset_type_6", "sub_asset_size_6",
}

# ── Cached shared column list for history copy ────────────────────────────
_shared_cols: list[str] | None = None


# ─────────────────────────────────────────────────────────────────────────────
# Helper functions
# ─────────────────────────────────────────────────────────────────────────────

def _extract_boolean(val: Any, default: bool = False) -> bool:
    """Normalize Hebrew/string boolean. Replaces normalize_asset_boolean_fields trigger."""
    if val is None:
        return default
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        return val != 0
    s = str(val).strip().strip('"').lower()
    if s in ("yes", "true", "1", "t", "כן"):
        return True
    if s in ("no", "false", "0", "f", "לא", ""):
        return False
    return default


def _normalize_booleans(data: dict) -> dict:
    """Apply boolean normalization to all bool fields in an asset data dict."""
    result = dict(data)
    for field in _BOOL_FIELDS:
        if field in result:
            result[field] = _extract_boolean(result[field])
    return result


def _should_reset_export_flags(old: dict, new_data: dict) -> bool:
    """Return True if any tracked field value changed. Replaces reset_export_flags_on_change trigger."""
    for field in _EXPORT_RESET_FIELDS:
        if field not in new_data:
            continue
        old_val = old.get(field)
        new_val = new_data[field]
        if old_val == new_val:
            continue
        # Numeric comparison for sizes
        try:
            if float(str(old_val or 0)) != float(str(new_val or 0)):
                return True
        except (TypeError, ValueError):
            if str(old_val) != str(new_val):
                return True
    return False


async def _get_shared_cols(conn) -> list[str]:
    """Return columns present in both assets and assets_history (excl. history_created_at)."""
    global _shared_cols
    if _shared_cols is None:
        history_rows = await conn.fetch(
            """SELECT column_name
               FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'assets_history'
                 AND column_name != 'history_created_at'
               ORDER BY ordinal_position"""
        )
        assets_rows = await conn.fetch(
            """SELECT column_name
               FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'assets'
               ORDER BY ordinal_position"""
        )
        assets_set = {r["column_name"] for r in assets_rows}
        _shared_cols = [r["column_name"] for r in history_rows if r["column_name"] in assets_set]
    return _shared_cols


async def _copy_to_history_conn(conn, asset_id: int) -> None:
    """Copy a single asset row to assets_history using an explicit column list."""
    cols = await _get_shared_cols(conn)
    col_list = ", ".join(cols)
    await conn.execute(
        f"""INSERT INTO assets_history ({col_list}, history_created_at)
            SELECT {col_list}, now()
            FROM assets WHERE asset_id = $1""",
        asset_id,
    )


async def _update_building_total_area(conn, building_number: int) -> None:
    """Recompute total_building_area from sum of asset_size. Replaces update_asset_business_total_area trigger."""
    await conn.execute(
        """UPDATE buildings
           SET total_building_area = COALESCE(
               (SELECT SUM(asset_size) FROM assets WHERE building_number = $1), 0
           )
           WHERE building_number = $1""",
        building_number,
    )


async def _recompute_distribution_flags(conn, building_number: int) -> None:
    """
    Set need_business_distribution / need_residence_distribution based on
    building shared areas and asset types. Replaces auto_set_distribution_flags_on_change trigger.
    """
    building_row = await conn.fetchrow(
        "SELECT business_shared_area, residence_shared_area FROM buildings WHERE building_number = $1",
        building_number,
    )
    if not building_row:
        return
    bn_business = float(building_row["business_shared_area"] or 0)
    bn_residence = float(building_row["residence_shared_area"] or 0)
    if bn_business <= 0 and bn_residence <= 0:
        return

    type_rows = await conn.fetch(
        "SELECT DISTINCT main_asset_type FROM assets WHERE building_number = $1 AND main_asset_type IS NOT NULL",
        building_number,
    )
    need_business = False
    need_residence = False
    for r in type_rows:
        at_row = await conn.fetchrow(
            "SELECT business_residence FROM asset_types WHERE name = $1 LIMIT 1",
            r["main_asset_type"],
        )
        br = at_row["business_residence"] if at_row else None
        if br == "עסקים" and bn_business > 0:
            need_business = True
        elif br == "מגורים" and bn_residence > 0:
            need_residence = True
        else:
            if bn_business > 0:
                need_business = True
            if bn_residence > 0:
                need_residence = True

    sets: list[str] = []
    params: list = [building_number]
    idx = 2
    if bn_business > 0:
        sets.append(f"need_business_distribution = ${idx}")
        params.append(need_business)
        idx += 1
    if bn_residence > 0:
        sets.append(f"need_residence_distribution = ${idx}")
        params.append(need_residence)
        idx += 1
    if sets:
        await conn.execute(
            f"UPDATE buildings SET {', '.join(sets)} WHERE building_number = $1",
            *params,
        )


# ─────────────────────────────────────────────────────────────────────────────
# Public service functions
# ─────────────────────────────────────────────────────────────────────────────

async def copy_to_history(asset_id: int) -> None:
    """Copy current asset snapshot to assets_history."""
    pool = get_pool()
    async with pool.acquire() as conn:
        await _copy_to_history_conn(conn, asset_id)


async def save_bulk(
    assets_data: list,
    p_user_id: str | None = None,
    validation_passed: bool = True,
    validation_errors=None,
    action_type: str = "manual_update",
    before_data=None,
    after_data=None,
    description: str | None = None,
    is_business_context: bool | None = None,
) -> dict:
    """
    Upsert multiple assets in a single transaction.

    Trigger logic embedded:
    - Boolean normalization (normalize_asset_boolean_fields)
    - Conditional history copy only when is_new_measurement=True (copy_asset_to_history)
    - Export flags reset when data fields change (reset_export_flags_on_change)
    - Building total area recompute after saves (update_asset_business_total_area)
    - Distribution flags recompute on manual_update (auto_set_distribution_flags_on_change)
    """
    if not assets_data:
        return {"success": True, "updated": 0, "inserted": 0}

    parse_user_id(p_user_id)  # validate user_id format
    pool = get_pool()

    updated = 0
    inserted = 0
    affected_buildings: set[int] = set()

    async with pool.acquire() as conn:
        async with conn.transaction():
            for raw_asset in assets_data:
                # Strip UI-only fields
                asset = {
                    k: v for k, v in raw_asset.items()
                    if k not in ("_isNew", "_isDirty", "_validationErrors", "_isMasterRow")
                }
                # ── Trigger: normalize_asset_boolean_fields ──────────────
                asset = _normalize_booleans(asset)

                asset_id = asset.get("asset_id")
                building_number = asset.get("building_number")
                is_new_measurement = _extract_boolean(asset.get("is_new_measurement"), False)

                if asset_id:
                    asset_id = int(asset_id)
                    # Fetch existing row for export-flags comparison
                    old_row = await conn.fetchrow(
                        "SELECT * FROM assets WHERE asset_id = $1", asset_id
                    )

                    # ── Trigger: copy_asset_to_history (conditional) ─────
                    if is_new_measurement:
                        await _copy_to_history_conn(conn, asset_id)

                    excluded = {"asset_id", "created_at", "is_new_measurement"}
                    cols = [k for k in asset if k not in excluded]
                    if not cols:
                        continue

                    # ── Trigger: reset_export_flags_on_change ────────────
                    if old_row and _should_reset_export_flags(dict(old_row), asset):
                        if "exported_to_automation" not in cols:
                            cols.append("exported_to_automation")
                            asset["exported_to_automation"] = False
                        if "export_to_automation_at" not in cols:
                            cols.append("export_to_automation_at")
                            asset["export_to_automation_at"] = None

                    vals = [asset[c] for c in cols]
                    set_parts = ", ".join(f"{c} = ${i + 2}" for i, c in enumerate(cols))
                    row = await conn.fetchrow(
                        f"UPDATE assets SET {set_parts}, updated_at = now() "
                        f"WHERE asset_id = $1 RETURNING asset_id, building_number",
                        asset_id, *vals,
                    )
                    if row:
                        updated += 1
                        if row["building_number"] is not None:
                            affected_buildings.add(int(row["building_number"]))
                else:
                    excluded_ins = {"asset_id", "is_new_measurement"}
                    cols = [k for k in asset if k not in excluded_ins]
                    vals = [asset[c] for c in cols]
                    placeholders = ", ".join(f"${i + 1}" for i in range(len(cols)))
                    col_names = ", ".join(cols)
                    row = await conn.fetchrow(
                        f"INSERT INTO assets ({col_names}) VALUES ({placeholders}) RETURNING asset_id, building_number",
                        *vals,
                    )
                    if row:
                        inserted += 1
                        if row["building_number"] is not None:
                            affected_buildings.add(int(row["building_number"]))

                if building_number is not None:
                    affected_buildings.add(int(building_number))

            # ── Trigger: update_asset_business_total_area ────────────────
            for bn in affected_buildings:
                await _update_building_total_area(conn, bn)

            # ── Trigger: auto_set_distribution_flags_on_change ──────────
            if action_type == "manual_update":
                for bn in affected_buildings:
                    await _recompute_distribution_flags(conn, bn)

    return {"success": True, "updated": updated, "inserted": inserted}


async def delete(asset_id: int, p_user_id: str | None = None, description: str | None = None) -> dict:
    """Delete a single asset (copy to history first, then recompute building totals/flags)."""
    pool = get_pool()
    building_number = None
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT building_number FROM assets WHERE asset_id = $1", asset_id
            )
            if row:
                building_number = row["building_number"]
            await _copy_to_history_conn(conn, asset_id)
            deleted = await conn.fetchrow(
                "DELETE FROM assets WHERE asset_id = $1 RETURNING asset_id",
                asset_id,
            )
            if building_number:
                await _update_building_total_area(conn, building_number)
                await _recompute_distribution_flags(conn, building_number)
    return {"success": deleted is not None, "asset_id": asset_id}


async def delete_bulk(asset_ids: list, p_user_id: str | None = None, description: str | None = None) -> dict:
    """Delete multiple assets (copy to history, recompute totals/flags)."""
    if not asset_ids:
        return {"success": True, "deleted": 0}

    pool = get_pool()
    affected_buildings: set[int] = set()
    async with pool.acquire() as conn:
        async with conn.transaction():
            for aid in asset_ids:
                row = await conn.fetchrow(
                    "SELECT building_number FROM assets WHERE asset_id = $1", int(aid)
                )
                if row and row["building_number"] is not None:
                    affected_buildings.add(int(row["building_number"]))
                await _copy_to_history_conn(conn, int(aid))
            result = await conn.execute(
                "DELETE FROM assets WHERE asset_id = ANY($1::bigint[])",
                [int(x) for x in asset_ids],
            )
            for bn in affected_buildings:
                await _update_building_total_area(conn, bn)
                await _recompute_distribution_flags(conn, bn)
    deleted = int(result.split()[-1]) if result else 0
    return {"success": True, "deleted": deleted}


async def get_by_ids(asset_ids: list) -> list:
    """Fetch assets by list of IDs."""
    if not asset_ids:
        return []
    return await fetch_all(
        "SELECT * FROM assets WHERE asset_id = ANY($1::bigint[]) ORDER BY asset_id",
        asset_ids,
    )


async def mark_exported() -> dict:
    """Mark all unmeasured-but-not-exported assets as exported."""
    now_str = datetime.utcnow().strftime("%d/%m/%Y")
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """UPDATE assets
               SET exported_to_automation = true,
                   export_to_automation_at = $1,
                   updated_at = now()
               WHERE (exported_to_automation IS NOT TRUE)
                 AND measurement_date IS NOT NULL
                 AND TRIM(COALESCE(measurement_date::text, '')) <> ''
               RETURNING asset_id""",
            now_str,
        )
    ids = [r["asset_id"] for r in rows]
    return {"updated_count": len(ids), "asset_ids": ids}


async def reset_export() -> dict:
    """Reset the most recent export batch (undo mark_exported for latest date)."""
    pool = get_pool()
    async with pool.acquire() as conn:
        # Find the latest export date
        latest = await conn.fetchval(
            """SELECT export_to_automation_at FROM assets
               WHERE exported_to_automation = true AND export_to_automation_at IS NOT NULL
               ORDER BY export_to_automation_at DESC LIMIT 1"""
        )
        if not latest:
            return {"success": True, "count": 0, "next_latest_date": None}
        result = await conn.execute(
            """UPDATE assets
               SET exported_to_automation = false, export_to_automation_at = null, updated_at = now()
               WHERE export_to_automation_at = $1""",
            latest,
        )
        count = int(result.split()[-1]) if result else 0
        next_latest = await conn.fetchval(
            """SELECT export_to_automation_at FROM assets
               WHERE exported_to_automation = true AND export_to_automation_at IS NOT NULL
               ORDER BY export_to_automation_at DESC LIMIT 1"""
        )
    return {"success": True, "count": count, "next_latest_date": next_latest}


async def search_by_range(from_id, to_id) -> list:
    """Search assets by asset_id range."""
    try:
        fid = int(from_id)
        tid = int(to_id)
    except (TypeError, ValueError):
        return []
    return await fetch_all(
        "SELECT * FROM assets WHERE asset_id >= $1 AND asset_id <= $2 ORDER BY asset_id",
        fid, tid,
    )
