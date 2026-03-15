"""
Asset service.
Replaces: save_assets_bulk_transactional, delete_asset_transactional,
          delete_assets_bulk_transactional, copy_asset_to_history_before_update,
          get_assets_by_ids, mark_assets_as_exported_to_automation,
          search_assets_by_range RPCs.
"""
import json
from datetime import datetime, timezone
from app.database import get_pool, fetch_all
from app.auth import parse_user_id


async def copy_to_history(asset_id: int) -> None:
    """Copy current asset snapshot to assets_history."""
    pool = get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO assets_history
               SELECT *, now() AS history_created_at
               FROM assets WHERE asset_id = $1""",
            asset_id,
        )


async def save_bulk(
    assets_data: list,
    p_user_id: str | None = None,
    validation_passed: bool = True,
    validation_errors: any = None,
    action_type: str = "manual_update",
    before_data: any = None,
    after_data: any = None,
    description: str | None = None,
    is_business_context: bool | None = None,
) -> dict:
    """
    Upsert multiple assets in a single transaction.
    For existing assets (with asset_id): copy to history first, then update.
    For new assets (no asset_id): insert.
    """
    if not assets_data:
        return {"success": True, "updated": 0, "inserted": 0}

    user_id = parse_user_id(p_user_id)
    pool = get_pool()

    updated = 0
    inserted = 0

    async with pool.acquire() as conn:
        async with conn.transaction():
            for asset in assets_data:
                asset_id = asset.get("asset_id")

                if asset_id:
                    # Copy existing row to history
                    await conn.execute(
                        """INSERT INTO assets_history
                           SELECT *, now() AS history_created_at
                           FROM assets WHERE asset_id = $1""",
                        asset_id,
                    )
                    # Build update
                    excluded = {"asset_id", "created_at"}
                    cols = [k for k in asset if k not in excluded]
                    if not cols:
                        continue
                    vals = [asset[c] for c in cols]
                    set_parts = ", ".join(f"{c} = ${i+2}" for i, c in enumerate(cols))
                    row = await conn.fetchrow(
                        f"UPDATE assets SET {set_parts}, updated_at = now() "
                        f"WHERE asset_id = $1 RETURNING asset_id",
                        asset_id, *vals,
                    )
                    if row:
                        updated += 1
                else:
                    # Insert new
                    excluded = {"asset_id"}
                    cols = [k for k in asset if k not in excluded]
                    vals = [asset[c] for c in cols]
                    placeholders = ", ".join(f"${i+1}" for i in range(len(cols)))
                    col_names = ", ".join(cols)
                    row = await conn.fetchrow(
                        f"INSERT INTO assets ({col_names}) VALUES ({placeholders}) RETURNING asset_id",
                        *vals,
                    )
                    if row:
                        inserted += 1

    return {"success": True, "updated": updated, "inserted": inserted}


async def delete(asset_id: int, p_user_id: str | None = None, description: str | None = None) -> dict:
    """Delete a single asset (after copying to history)."""
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """INSERT INTO assets_history
                   SELECT *, now() AS history_created_at
                   FROM assets WHERE asset_id = $1""",
                asset_id,
            )
            row = await conn.fetchrow(
                "DELETE FROM assets WHERE asset_id = $1 RETURNING asset_id",
                asset_id,
            )
    return {"success": row is not None, "asset_id": asset_id}


async def delete_bulk(asset_ids: list, p_user_id: str | None = None, description: str | None = None) -> dict:
    """Delete multiple assets after copying them to history."""
    if not asset_ids:
        return {"success": True, "deleted": 0}

    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            for aid in asset_ids:
                await conn.execute(
                    """INSERT INTO assets_history
                       SELECT *, now() AS history_created_at
                       FROM assets WHERE asset_id = $1""",
                    aid,
                )
            result = await conn.execute(
                "DELETE FROM assets WHERE asset_id = ANY($1::bigint[])",
                asset_ids,
            )
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
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """UPDATE assets
               SET exported_to_automation = true,
                   export_to_automation_at = to_char(now(), 'DD/MM/YYYY'),
                   updated_at = now()
               WHERE exported_to_automation IS NOT TRUE
               RETURNING asset_id"""
        )
    ids = [r["asset_id"] for r in rows]
    return {"updated_count": len(ids), "asset_ids": ids}


async def search_by_range(from_id: any, to_id: any) -> list:
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
