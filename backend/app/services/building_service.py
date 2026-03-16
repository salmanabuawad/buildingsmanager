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


async def bulk_update_flags(buildings_data: list) -> dict:
    """
    Bulk update buildings with distribution flags.
    After update, recompute distribution flags for each building.
    buildings_data: list of dicts with building fields to update.
    """
    if not buildings_data:
        return []

    pool = get_pool()
    results = []
    async with pool.acquire() as conn:
        async with conn.transaction():
            for b in buildings_data:
                building_number = b.get("building_number")
                if building_number is None:
                    continue
                # Support both {building_number, updates: {...}} and flat {building_number, field: val}
                raw_updates = b.get("updates") if isinstance(b.get("updates"), dict) else {
                    k: v for k, v in b.items() if k != "building_number"
                }
                # All updatable columns (excludes PK, action_id, created_at)
                allowed_fields = {
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
                updates = {k: v for k, v in raw_updates.items() if k in allowed_fields}
                if not updates:
                    continue
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

            # ── Trigger: auto_set_distribution_flags_on_building_change ──
            for b in buildings_data:
                bn = b.get("building_number")
                if bn:
                    await _recompute_distribution_flags(conn, int(bn))

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
