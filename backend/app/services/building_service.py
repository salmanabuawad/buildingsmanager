"""
Building service.
Replaces: update_building_total_area, update_buildings_bulk_with_distribution_flags RPCs.

Trigger-equivalent logic:
  - auto_set_distribution_flags_on_building_change (AFTER INSERT/UPDATE on buildings)
"""
from app.database import get_pool


async def _recompute_distribution_flags(conn, building_number: int) -> None:
    """
    Set need_business_distribution / need_residence_distribution flags.
    Replaces auto_set_distribution_flags_on_building_change trigger.
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


async def update_total_area(building_number: int) -> dict:
    """Recalculate total_building_area from asset measurements and save."""
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            area = await conn.fetchval(
                """SELECT COALESCE(SUM(asset_size), 0)
                   FROM assets
                   WHERE building_number = $1""",
                building_number,
            )
            await conn.execute(
                "UPDATE buildings SET total_building_area = $1 WHERE building_number = $2",
                area,
                building_number,
            )
            row = await conn.fetchrow(
                "SELECT building_number, total_building_area FROM buildings WHERE building_number = $1",
                building_number,
            )
    return dict(row) if row else {}


def _to_float(val) -> float | None:
    if val is None or val == "":
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


async def bulk_update_flags(buildings_data: list) -> dict:
    """
    Bulk update buildings.
    Sets need_*_distribution = True ONLY when the corresponding shared area value changes.
    Respects explicit need_*_distribution values passed in updates (e.g. False after distribution).
    """
    if not buildings_data:
        return {"success": True, "buildings": [], "count": 0}

    # All updatable columns (excludes PK, action_id, created_at)
    ALLOWED_FIELDS = {
        "total_building_area", "tax_region", "elevator", "single_double_family",
        "condo", "townhouses", "residence_shared_area", "business_shared_area",
        "area_for_control", "building_address", "address", "gosh", "helka",
        "building_number_in_street", "overload_ratio", "need_residence_distribution",
        "need_business_distribution", "note", "net_area", "asset_count",
        "shared_parking_area", "number_of_parking_units",
        # legacy aliases some frontend versions send
        "distribution_flag", "storage_area", "pergola_area", "balcony_area",
        "building_name", "city",
    }

    pool = get_pool()
    results = []
    async with pool.acquire() as conn:
        async with conn.transaction():
            for b in buildings_data:
                building_number = b.get("building_number")
                if building_number is None:
                    continue
                building_number = int(building_number)

                # Support both {building_number, updates: {...}} and flat {building_number, field: val}
                raw_updates = b.get("updates") if isinstance(b.get("updates"), dict) else {
                    k: v for k, v in b.items() if k != "building_number"
                }
                updates = {k: v for k, v in raw_updates.items() if k in ALLOWED_FIELDS}
                if not updates:
                    continue

                # ── Read old values to detect shared-area changes ─────────
                old = await conn.fetchrow(
                    "SELECT business_shared_area, residence_shared_area, shared_parking_area "
                    "FROM buildings WHERE building_number = $1",
                    building_number,
                )
                if old:
                    old_biz = _to_float(old["business_shared_area"])
                    old_res = _to_float(old["residence_shared_area"])
                    old_park = _to_float(old["shared_parking_area"])
                    new_biz = _to_float(updates.get("business_shared_area", old_biz))
                    new_res = _to_float(updates.get("residence_shared_area", old_res))
                    new_park = _to_float(updates.get("shared_parking_area", old_park))

                    # Only set True if area changed AND caller didn't explicitly provide the flag
                    if "need_business_distribution" not in updates:
                        if old_biz != new_biz or old_park != new_park:
                            updates["need_business_distribution"] = True
                    if "need_residence_distribution" not in updates:
                        if old_res != new_res:
                            updates["need_residence_distribution"] = True

                cols = list(updates.keys())
                vals = list(updates.values())
                set_parts = ", ".join(f"{c} = ${i + 2}" for i, c in enumerate(cols))
                row = await conn.fetchrow(
                    f"UPDATE buildings SET {set_parts} "
                    f"WHERE building_number = $1 RETURNING *",
                    building_number, *vals,
                )
                if row:
                    results.append(dict(row))

    return {"success": True, "buildings": results, "count": len(results)}


async def set_distribution_flags_for_asset_type_change(asset_type_name: str) -> dict:
    """
    After an asset type's business_residence changes, recompute distribution flags
    for all buildings that have assets of that type.
    Replaces set_distribution_flags_for_asset_type_change Supabase function.
    """
    pool = get_pool()
    affected: list[int] = []
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT DISTINCT building_number FROM assets WHERE main_asset_type = $1 AND building_number IS NOT NULL",
            asset_type_name,
        )
        async with conn.transaction():
            for r in rows:
                bn = int(r["building_number"])
                await _recompute_distribution_flags(conn, bn)
                affected.append(bn)
    return {"success": True, "affected_buildings": affected}
