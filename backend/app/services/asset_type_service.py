"""
Asset type service.
Replaces: update_asset_type_with_distribution_reset,
          update_asset_types_bulk_with_distribution_reset RPCs.
"""
from app.database import get_pool


async def update_with_reset(payload: dict) -> dict:
    """
    Update a single asset type and reset distribution flags on related assets.
    """
    type_id = payload.get("p_type_id") or payload.get("type_id")
    if type_id is None:
        raise ValueError("update_asset_type_with_distribution_reset: type_id required")

    allowed = {
        "type_name", "type_description", "default_net_area",
        "default_gross_area", "is_distributed", "distribution_method",
        "category", "sub_category",
    }
    updates = {k: v for k, v in payload.items() if k in allowed}

    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            if updates:
                cols = list(updates.keys())
                vals = list(updates.values())
                set_parts = ", ".join(f"{c} = ${i+2}" for i, c in enumerate(cols))
                row = await conn.fetchrow(
                    f"UPDATE asset_types SET {set_parts}, updated_at = now() "
                    f"WHERE type_id = $1 RETURNING *",
                    type_id, *vals,
                )
            else:
                row = await conn.fetchrow(
                    "SELECT * FROM asset_types WHERE type_id = $1", type_id
                )

            # Reset distribution on related assets
            await conn.execute(
                "UPDATE assets SET distribution_flag = false, updated_at = now() "
                "WHERE type_id = $1",
                type_id,
            )

    return dict(row) if row else {}


async def bulk_update_reset(payload: dict) -> list:
    """
    Bulk update asset types and reset distribution flags.
    payload: {p_asset_types_data: [...]} or {asset_types_data: [...]}
    """
    items = payload.get("p_asset_types_data") or payload.get("asset_types_data") or []
    if not items:
        return []

    allowed = {
        "type_name", "type_description", "default_net_area",
        "default_gross_area", "is_distributed", "distribution_method",
        "category", "sub_category",
    }
    pool = get_pool()
    results = []
    async with pool.acquire() as conn:
        async with conn.transaction():
            for item in items:
                type_id = item.get("type_id")
                if type_id is None:
                    continue
                updates = {k: v for k, v in item.items() if k in allowed}
                if updates:
                    cols = list(updates.keys())
                    vals = list(updates.values())
                    set_parts = ", ".join(f"{c} = ${i+2}" for i, c in enumerate(cols))
                    row = await conn.fetchrow(
                        f"UPDATE asset_types SET {set_parts}, updated_at = now() "
                        f"WHERE type_id = $1 RETURNING *",
                        type_id, *vals,
                    )
                    if row:
                        results.append(dict(row))

                await conn.execute(
                    "UPDATE assets SET distribution_flag = false, updated_at = now() "
                    "WHERE type_id = $1",
                    type_id,
                )
    return results
