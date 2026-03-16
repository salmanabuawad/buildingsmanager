"""
Asset type service.
Replaces: update_asset_type_with_distribution_reset,
          update_asset_types_bulk_with_distribution_reset RPCs.
"""
from app.database import get_pool

# All updatable columns on asset_types (excludes PK and timestamps)
ALLOWED_FIELDS = {
    "name", "description", "tax_region",
    "area_description_for_tab", "elevator", "single_double_family",
    "penthouse", "condo", "townhouses", "business_residence", "active",
    "non_accountable_for_total_area", "non_accountable_for_distribution",
    "not_accountable_for_statistics", "use_shared_area",
    "use_for_parking_shared_area", "min_size", "max_size",
}


async def update_with_reset(payload: dict) -> dict:
    """
    Update a single asset type and reset distribution flags on related assets.
    Frontend sends: {p_id: <id>, p_updates: {field: value, ...}}
    Returns: {after_data: {...row...}, affected_buildings: []}
    """
    # Support p_id (frontend) or p_type_id / type_id (legacy)
    type_id = (
        payload.get("p_id")
        or payload.get("p_type_id")
        or payload.get("type_id")
    )
    if type_id is None:
        raise ValueError("update_asset_type_with_distribution_reset: id required")

    # Updates may be nested under p_updates or flat in the payload root
    raw_updates = payload.get("p_updates")
    if not isinstance(raw_updates, dict):
        raw_updates = {
            k: v for k, v in payload.items()
            if k not in ("p_id", "p_type_id", "type_id", "p_updates")
        }

    updates = {k: v for k, v in raw_updates.items() if k in ALLOWED_FIELDS}

    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            if updates:
                cols = list(updates.keys())
                vals = list(updates.values())
                set_parts = ", ".join(f"{c} = ${i + 2}" for i, c in enumerate(cols))
                row = await conn.fetchrow(
                    f"UPDATE asset_types SET {set_parts}, updated_at = now() "
                    f"WHERE id = $1 RETURNING *",
                    type_id, *vals,
                )
            else:
                row = await conn.fetchrow(
                    "SELECT * FROM asset_types WHERE id = $1", type_id
                )

            # Reset distribution flag on assets using this type
            await conn.execute(
                "UPDATE assets SET distribution_flag = false, updated_at = now() "
                "WHERE main_asset_type = (SELECT name FROM asset_types WHERE id = $1)",
                type_id,
            )

    after = dict(row) if row else {}
    return {"after_data": after, "affected_buildings": []}


async def bulk_update_reset(payload: dict) -> dict:
    """
    Bulk update asset types and reset distribution flags.
    Frontend sends: {p_asset_types_data: [{id: <id>, updates: {field: val}}, ...]}
    Returns: {success: True, count: N, affected_buildings: []}
    """
    items = (
        payload.get("p_asset_types_data")
        or payload.get("asset_types_data")
        or []
    )
    if not items:
        return {"success": True, "count": 0, "affected_buildings": []}

    pool = get_pool()
    results = []
    async with pool.acquire() as conn:
        async with conn.transaction():
            for item in items:
                # Support id (frontend) or type_id (legacy)
                type_id = item.get("id") or item.get("type_id")
                if type_id is None:
                    continue

                # Updates may be nested under "updates" key or flat in item root
                raw_updates = item.get("updates")
                if not isinstance(raw_updates, dict):
                    raw_updates = {
                        k: v for k, v in item.items()
                        if k not in ("id", "type_id", "updates")
                    }

                updates = {k: v for k, v in raw_updates.items() if k in ALLOWED_FIELDS}

                if updates:
                    cols = list(updates.keys())
                    vals = list(updates.values())
                    set_parts = ", ".join(f"{c} = ${i + 2}" for i, c in enumerate(cols))
                    row = await conn.fetchrow(
                        f"UPDATE asset_types SET {set_parts}, updated_at = now() "
                        f"WHERE id = $1 RETURNING *",
                        type_id, *vals,
                    )
                    if row:
                        results.append(dict(row))

                # Reset distribution flag on assets using this type
                await conn.execute(
                    "UPDATE assets SET distribution_flag = false, updated_at = now() "
                    "WHERE main_asset_type = (SELECT name FROM asset_types WHERE id = $1)",
                    type_id,
                )

    return {"success": True, "count": len(results), "affected_buildings": []}
