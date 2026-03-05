"""
Python implementations of asset query RPCs (replacing DB functions).
All DB access via AssetRepo.
"""
from typing import Any, Dict, List, Optional

from app.repos import AssetRepo

_asset_repo = AssetRepo()


def get_assets_by_ids(p_asset_ids: List[int]) -> Any:
    """Return assets for given asset IDs."""
    if not p_asset_ids:
        return []
    placeholders = ", ".join(f":id{i}" for i in range(len(p_asset_ids)))
    params = {f"id{i}": aid for i, aid in enumerate(p_asset_ids)}
    return _asset_repo._fetch(
        f"SELECT * FROM assets WHERE asset_id IN ({placeholders}) ORDER BY asset_id",
        params,
    )


def get_assets_with_history(p_building_number: int) -> Dict[str, Any]:
    """Return { master: assets[], details: assets_history[] } for building."""
    master = _asset_repo._fetch(
        "SELECT * FROM assets WHERE building_number = :bn ORDER BY asset_id",
        {"bn": p_building_number},
    )
    details = _asset_repo._fetch(
        """SELECT * FROM assets_history WHERE building_number = :bn
           ORDER BY asset_id, history_created_at DESC NULLS LAST""",
        {"bn": p_building_number},
    )
    return {"master": master or [], "details": details or []}


def search_assets_by_range(from_id: int, to_id: int) -> List[Dict[str, Any]]:
    """Return assets with asset_id between from_id and to_id."""
    return _asset_repo._fetch(
        """SELECT building_number, asset_id, payer_id, main_asset_type, asset_size,
                  sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
                  sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
                  sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
                  measurement_date, created_at, updated_at
           FROM assets WHERE asset_id >= :from_id AND asset_id <= :to_id ORDER BY asset_id""",
        {"from_id": from_id, "to_id": to_id},
    )


def get_measured_not_exported_assets(building_number: Optional[int] = None) -> List[Dict[str, Any]]:
    """Return assets that have measurement_date set and are not yet exported."""
    sql = """SELECT * FROM assets
             WHERE (exported_to_automation IS NULL OR exported_to_automation = false
                    OR LOWER(TRIM(COALESCE(exported_to_automation::text, ''))) IN ('false', 'f', '0', ''))
               AND (data_from_automation IS NULL OR data_from_automation = false
                    OR LOWER(TRIM(COALESCE(data_from_automation::text, ''))) IN ('false', 'f', '0', ''))
               AND measurement_date IS NOT NULL AND TRIM(COALESCE(measurement_date::text, '')) <> ''"""
    params: Dict[str, Any] = {}
    if building_number is not None:
        sql += " AND building_number = :building_number"
        params["building_number"] = building_number
    sql += " ORDER BY building_number, asset_id"
    return _asset_repo._fetch(sql, params) or []


def reset_export_to_automation() -> Dict[str, Any]:
    """Reset the most recent export batch."""
    rows = _asset_repo._fetch(
        """SELECT asset_id, export_to_automation_at FROM assets
           WHERE exported_to_automation = true AND export_to_automation_at IS NOT NULL""",
        {},
    )
    if not rows:
        return {"success": True, "count": 0, "next_latest_date": None}
    from datetime import datetime
    dates = [r["export_to_automation_at"] for r in rows if r.get("export_to_automation_at")]
    if not dates:
        return {"success": True, "count": 0, "next_latest_date": None}

    def parse_dd_mm_yyyy(s: str) -> Optional[datetime]:
        if not s:
            return None
        try:
            parts = s.strip().split("/")
            if len(parts) == 3:
                d, m, y = int(parts[0]), int(parts[1]), int(parts[2])
                return datetime(y, m, d)
        except (ValueError, IndexError):
            pass
        return None

    latest_dt: Optional[datetime] = None
    latest_str: Optional[str] = None
    for d in dates:
        dt = parse_dd_mm_yyyy(str(d))
        if dt and (latest_dt is None or dt > latest_dt):
            latest_dt = dt
            latest_str = str(d)
    if not latest_str:
        return {"success": True, "count": 0, "next_latest_date": None}
    asset_ids = [r["asset_id"] for r in rows if r.get("export_to_automation_at") == latest_str]
    if not asset_ids:
        return {"success": True, "count": 0, "next_latest_date": latest_str}
    placeholders = ", ".join(f":id{i}" for i in range(len(asset_ids)))
    params = {f"id{i}": aid for i, aid in enumerate(asset_ids)}
    _asset_repo._run(
        f"""UPDATE assets SET exported_to_automation = false, export_to_automation_at = null
            WHERE asset_id IN ({placeholders})""",
        params,
    )
    remaining = _asset_repo._fetch(
        """SELECT export_to_automation_at FROM assets
           WHERE exported_to_automation = true AND export_to_automation_at IS NOT NULL""",
        {},
    )
    next_latest: Optional[str] = None
    if remaining:
        next_dates = [r["export_to_automation_at"] for r in remaining if r.get("export_to_automation_at")]
        next_dt = None
        for d in next_dates:
            dt = parse_dd_mm_yyyy(str(d))
            if dt and (next_dt is None or dt > next_dt):
                next_dt = dt
                next_latest = str(d)
    return {"success": True, "count": len(asset_ids), "next_latest_date": next_latest}


def mark_assets_as_exported_to_automation() -> Dict[str, Any]:
    """Mark all eligible assets as exported."""
    from datetime import datetime
    rows = _asset_repo._fetch(
        """SELECT asset_id FROM assets
           WHERE (exported_to_automation IS NULL OR exported_to_automation = false
                  OR LOWER(TRIM(COALESCE(exported_to_automation::text, ''))) IN ('false', 'f', '0', ''))
             AND (data_from_automation IS NULL OR data_from_automation = false
                  OR LOWER(TRIM(COALESCE(data_from_automation::text, ''))) IN ('false', 'f', '0', ''))
             AND measurement_date IS NOT NULL AND TRIM(COALESCE(measurement_date::text, '')) <> ''""",
        {},
    )
    asset_ids = [r["asset_id"] for r in rows]
    if not asset_ids:
        return {"updated_count": 0, "asset_ids": []}
    now_str = datetime.utcnow().strftime("%d/%m/%Y")
    placeholders = ", ".join(f":id{i}" for i in range(len(asset_ids)))
    params = {f"id{i}": aid for i, aid in enumerate(asset_ids)}
    params["now_str"] = now_str
    _asset_repo._run(
        f"""UPDATE assets SET exported_to_automation = true, export_to_automation_at = :now_str
            WHERE asset_id IN ({placeholders})""",
        params,
    )
    return {"updated_count": len(asset_ids), "asset_ids": asset_ids}


def mark_assets_as_exported_to_automation_by_ids(asset_ids: List[int]) -> Dict[str, Any]:
    """Mark the given asset IDs as exported."""
    from datetime import datetime
    if not asset_ids:
        return {"updated_count": 0, "asset_ids": []}
    placeholders = ", ".join(f":id{i}" for i in range(len(asset_ids)))
    params = {f"id{i}": aid for i, aid in enumerate(asset_ids)}
    params["now_str"] = datetime.utcnow().strftime("%d/%m/%Y")
    _asset_repo._run(
        f"""UPDATE assets SET exported_to_automation = true, export_to_automation_at = :now_str
            WHERE asset_id IN ({placeholders})""",
        params,
    )
    return {"updated_count": len(asset_ids), "asset_ids": asset_ids}
