"""
Building service.
Replaces: update_building_total_area, update_buildings_bulk_with_distribution_flags RPCs.
"""
from app.database import get_pool


async def update_total_area(building_number: int) -> dict:
    """Recalculate total_building_area from asset measurements and save."""
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Sum net areas from assets for this building
            area = await conn.fetchval(
                """SELECT COALESCE(SUM(net_area), 0)
                   FROM assets
                   WHERE building_number = $1""",
                building_number,
            )
            await conn.execute(
                "UPDATE buildings SET total_building_area = $1, updated_at = now() "
                "WHERE building_number = $2",
                area,
                building_number,
            )
            row = await conn.fetchrow(
                "SELECT building_number, total_building_area FROM buildings WHERE building_number = $1",
                building_number,
            )
    return dict(row) if row else {}


async def bulk_update_flags(buildings_data: list) -> list:
    """
    Bulk update buildings with distribution flags.
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
                # Build SET clause for provided fields
                allowed_fields = {
                    "distribution_flag", "storage_area", "pergola_area",
                    "balcony_area", "total_building_area", "building_name",
                    "address", "city",
                }
                updates = {k: v for k, v in b.items() if k in allowed_fields}
                if not updates:
                    continue
                cols = list(updates.keys())
                vals = list(updates.values())
                set_parts = ", ".join(f"{c} = ${i+2}" for i, c in enumerate(cols))
                row = await conn.fetchrow(
                    f"UPDATE buildings SET {set_parts}, updated_at = now() "
                    f"WHERE building_number = $1 RETURNING *",
                    building_number, *vals,
                )
                if row:
                    results.append(dict(row))
    return results
