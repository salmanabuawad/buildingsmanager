"""
Asset repository: DB access for assets and assets_history.
Includes copy_to_history logic (requires conn).
"""
from typing import Any, Dict, List, Optional

from app.repos.base_repo import BaseRepo

_GET_HISTORY_COLUMNS_SQL = """
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'assets_history'
ORDER BY ordinal_position;
"""
_GET_ASSETS_COLUMNS_SQL = """
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'assets'
ORDER BY ordinal_position;
"""
_copy_to_history_sql_cache: Dict[tuple, Optional[str]] = {}

_COPY_ASSET_TO_HISTORY_FALLBACKS = [
    """INSERT INTO assets_history (
  building_number, payer_id, asset_id, measurement_date, main_asset_type, asset_size,
  sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
  sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
  sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
  structure_drawing_url,
  elevator, single_double_family, condo, townhouses, penthouse,
  tax_region, floor, discount_type, discount_date_from, discount_date_to,
  area_from_distribution, exported_to_automation, export_to_automation_at, comment,
  created_at
)
SELECT
  building_number, payer_id, asset_id, measurement_date, main_asset_type, asset_size,
  sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
  sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
  sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
  structure_drawing_url,
  elevator, single_double_family, condo, townhouses, penthouse,
  tax_region, floor, discount_type, discount_date_from, discount_date_to,
  COALESCE(business_distribution_area, area_from_distribution),
  exported_to_automation, export_to_automation_at, comment,
  now()
FROM assets
WHERE asset_id = :p_asset_id""",
    """INSERT INTO assets_history (
  building_number, payer_id, asset_id, measurement_date, main_asset_type, asset_size,
  sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
  sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
  sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
  structure_drawing_url,
  elevator, single_double_family, condo, townhouses, penthouse,
  tax_region, floor, discount_type, discount_date_from, discount_date_to,
  area_from_distribution, exported_to_automation, export_to_automation_at, comment,
  created_at
)
SELECT
  building_number, payer_id, asset_id, measurement_date, main_asset_type, asset_size,
  sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
  sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
  sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
  structure_drawing_url,
  elevator, single_double_family, condo, townhouses, penthouse,
  tax_region, floor, discount_type, discount_date_from, discount_date_to,
  business_distribution_area AS area_from_distribution,
  exported_to_automation, export_to_automation_at, comment,
  now()
FROM assets
WHERE asset_id = :p_asset_id""",
    """INSERT INTO assets_history (
  building_number, payer_id, asset_id, measurement_date, main_asset_type, asset_size,
  sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
  sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
  sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
  structure_drawing_url,
  elevator, single_double_family, condo, townhouses, penthouse,
  tax_region, discount_type, discount_date_from, discount_date_to,
  area_from_distribution, exported_to_automation, export_to_automation_at, comment,
  created_at
)
SELECT
  building_number, payer_id, asset_id, measurement_date, main_asset_type, asset_size,
  sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
  sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
  sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
  structure_drawing_url,
  elevator, single_double_family, condo, townhouses, penthouse,
  tax_region, discount_type, discount_date_from, discount_date_to,
  COALESCE(business_distribution_area, area_from_distribution),
  exported_to_automation, export_to_automation_at, comment,
  now()
FROM assets
WHERE asset_id = :p_asset_id""",
    """INSERT INTO assets_history (
  building_number, payer_id, asset_id, measurement_date, main_asset_type, asset_size,
  sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
  sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
  sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
  structure_drawing_url, created_at, updated_at,
  elevator, single_double_family, condo, townhouses, penthouse,
  tax_region, discount_type, discount_date_from, discount_date_to,
  history_created_at, business_distribution_area, exported_to_automation,
  comment, shared_parking_area, number_of_parking_units, use_nature, data_from_automation
)
SELECT
  building_number, payer_id, asset_id, measurement_date, main_asset_type, asset_size,
  sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
  sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
  sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
  structure_drawing_url, created_at, updated_at,
  elevator, single_double_family, condo, townhouses, penthouse,
  tax_region, discount_type, discount_date_from, discount_date_to,
  now() AS history_created_at,
  business_distribution_area, exported_to_automation,
  comment, shared_parking_area, number_of_parking_units, use_nature, data_from_automation
FROM assets
WHERE asset_id = :p_asset_id""",
    """INSERT INTO assets_history (
  building_number, payer_id, asset_id, measurement_date, main_asset_type, asset_size,
  sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
  sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
  sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
  structure_drawing_url, created_at, updated_at,
  elevator, single_double_family, condo, townhouses, penthouse,
  tax_region, discount_type, discount_date_from, discount_date_to,
  history_created_at, business_distribution_area, exported_to_automation
)
SELECT
  building_number, payer_id, asset_id, measurement_date, main_asset_type, asset_size,
  sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
  sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
  sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
  structure_drawing_url, created_at, updated_at,
  elevator, single_double_family, condo, townhouses, penthouse,
  tax_region, discount_type, discount_date_from, discount_date_to,
  now() AS history_created_at,
  business_distribution_area, exported_to_automation
FROM assets
WHERE asset_id = :p_asset_id""",
    """INSERT INTO assets_history (
  building_number, payer_id, asset_id, measurement_date, main_asset_type, asset_size,
  sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
  sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
  sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
  structure_drawing_url, created_at, updated_at,
  elevator, single_double_family, condo, townhouses, penthouse,
  tax_region, floor, discount_type, discount_date_from, discount_date_to,
  history_created_at, business_distribution_area, exported_to_automation
)
SELECT
  building_number, payer_id, asset_id, measurement_date, main_asset_type, asset_size,
  sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
  sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
  sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
  structure_drawing_url, created_at, updated_at,
  elevator, single_double_family, condo, townhouses, penthouse,
  tax_region, floor, discount_type, discount_date_from, discount_date_to,
  now() AS history_created_at,
  business_distribution_area, exported_to_automation
FROM assets
WHERE asset_id = :p_asset_id""",
]


class AssetRepo(BaseRepo):
    def get_by_id(self, asset_id: int, conn=None) -> Optional[Dict[str, Any]]:
        rows = self._fetch("SELECT * FROM assets WHERE asset_id = :aid", {"aid": asset_id}, conn=conn)
        return rows[0] if rows else None

    def get_by_ids(self, asset_ids: List[int], conn=None) -> List[Dict[str, Any]]:
        """Batch load assets by ID. Returns list in same order as input (missing IDs omitted)."""
        if not asset_ids:
            return []
        unique = list(dict.fromkeys(asset_ids))
        params = {f"id{i}": aid for i, aid in enumerate(unique)}
        placeholders = ", ".join(f":id{i}" for i in range(len(unique)))
        sql = f"SELECT * FROM assets WHERE asset_id IN ({placeholders}) ORDER BY asset_id"
        rows = self._fetch(sql, params, conn=conn)
        by_id = {int(r["asset_id"]): r for r in rows}
        return [by_id[aid] for aid in unique if aid in by_id]

    def get_building_and_type(self, asset_id: int, conn=None) -> Optional[Dict[str, Any]]:
        rows = self._fetch(
            "SELECT building_number, main_asset_type FROM assets WHERE asset_id = :aid",
            {"aid": asset_id},
            conn=conn,
        )
        return rows[0] if rows else None

    def get_all_for_building(self, building_number: int, conn=None) -> List[Dict[str, Any]]:
        return self._fetch(
            "SELECT * FROM assets WHERE building_number = :bn ORDER BY asset_id",
            {"bn": building_number},
            conn=conn,
        )

    def get_ids_for_building(self, building_number: int, conn=None) -> List[int]:
        rows = self._fetch(
            "SELECT asset_id FROM assets WHERE building_number = :bn ORDER BY asset_id",
            {"bn": building_number},
            conn=conn,
        )
        return [int(r["asset_id"]) for r in rows if r.get("asset_id") is not None]

    def copy_to_history(self, asset_id: int, conn) -> None:
        """Copy asset to assets_history. Requires conn (always transactional)."""
        params = {"p_asset_id": asset_id}
        dynamic_sql = self._build_copy_to_history_sql(conn)
        if dynamic_sql:
            try:
                self._run(dynamic_sql, params, conn=conn)
                return
            except Exception:
                pass
        for sql in _COPY_ASSET_TO_HISTORY_FALLBACKS:
            try:
                self._run(sql, params, conn=conn)
                return
            except Exception:
                continue
        raise RuntimeError("copy_to_history: no column set matched assets_history")

    def _build_copy_to_history_sql(self, conn) -> Optional[str]:
        history_rows = self._fetch(_GET_HISTORY_COLUMNS_SQL, {}, conn=conn)
        assets_rows = self._fetch(_GET_ASSETS_COLUMNS_SQL, {}, conn=conn)
        history_cols = [r["column_name"] for r in history_rows]
        assets_cols_set = {r["column_name"] for r in assets_rows}
        key = (tuple(history_cols), tuple(sorted(assets_cols_set)))
        if key in _copy_to_history_sql_cache:
            return _copy_to_history_sql_cache[key]
        insert_cols = []
        select_parts = []
        for col in history_cols:
            if col == "id":
                continue
            if col in assets_cols_set:
                insert_cols.append(col)
                select_parts.append(f"a.{col}")
            elif col == "area_from_distribution" and "business_distribution_area" in assets_cols_set:
                insert_cols.append(col)
                select_parts.append("a.business_distribution_area AS area_from_distribution")
            elif col in ("created_at", "history_created_at", "updated_at"):
                insert_cols.append(col)
                select_parts.append("now() AS " + col)
        if not insert_cols:
            _copy_to_history_sql_cache[key] = None
            return None
        cols_str = ", ".join(insert_cols)
        select_str = ", ".join(select_parts)
        sql = f"INSERT INTO assets_history ({cols_str}) SELECT {select_str} FROM assets a WHERE a.asset_id = :p_asset_id"
        _copy_to_history_sql_cache[key] = sql
        return sql

    def delete(self, asset_id: int, conn=None) -> None:
        self._run("DELETE FROM assets WHERE asset_id = :aid", {"aid": asset_id}, conn=conn)

    def insert(self, params: Dict[str, Any], conn) -> None:
        """Insert one asset. Params built by caller (save_assets_bulk)."""
        self._run(
            """INSERT INTO assets (
               asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region,
               sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
               sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
               sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
               elevator, single_double_family, condo, townhouses, penthouse,
               structure_drawing_url,
               discount_type, discount_date_from, discount_date_to,
               business_distribution_area, exported_to_automation, comment
            ) VALUES (
               :asset_id, :building_number, :payer_id,
               COALESCE(:measurement_date, '01/01/1900'), :main_asset_type, :asset_size, :tax_region,
               :sub_asset_type_1, :sub_asset_size_1, :sub_asset_type_2, :sub_asset_size_2,
               :sub_asset_type_3, :sub_asset_size_3, :sub_asset_type_4, :sub_asset_size_4,
               :sub_asset_type_5, :sub_asset_size_5, :sub_asset_type_6, :sub_asset_size_6,
               :elevator, :single_double_family, :condo, :townhouses, :penthouse,
               :structure_drawing_url,
               :discount_type, :discount_date_from, :discount_date_to,
               :business_distribution_area, :exported_to_automation, :comment
            )""",
            params,
            conn=conn,
        )

    def update(self, params: Dict[str, Any], conn) -> None:
        """Update one asset. Params built by caller (save_assets_bulk)."""
        self._run(
            """UPDATE assets SET
               building_number = COALESCE(:building_number, building_number),
               payer_id = COALESCE(:payer_id, payer_id),
               measurement_date = COALESCE(:measurement_date, measurement_date),
               main_asset_type = COALESCE(:main_asset_type, main_asset_type),
               asset_size = COALESCE(:asset_size, asset_size),
               tax_region = COALESCE(:tax_region, tax_region),
               sub_asset_type_1 = COALESCE(:sub_asset_type_1, sub_asset_type_1),
               sub_asset_size_1 = COALESCE(:sub_asset_size_1, sub_asset_size_1),
               sub_asset_type_2 = COALESCE(:sub_asset_type_2, sub_asset_type_2),
               sub_asset_size_2 = COALESCE(:sub_asset_size_2, sub_asset_size_2),
               sub_asset_type_3 = COALESCE(:sub_asset_type_3, sub_asset_type_3),
               sub_asset_size_3 = COALESCE(:sub_asset_size_3, sub_asset_size_3),
               sub_asset_type_4 = COALESCE(:sub_asset_type_4, sub_asset_type_4),
               sub_asset_size_4 = COALESCE(:sub_asset_size_4, sub_asset_size_4),
               sub_asset_type_5 = COALESCE(:sub_asset_type_5, sub_asset_type_5),
               sub_asset_size_5 = COALESCE(:sub_asset_size_5, sub_asset_size_5),
               sub_asset_type_6 = COALESCE(:sub_asset_type_6, sub_asset_type_6),
               sub_asset_size_6 = COALESCE(:sub_asset_size_6, sub_asset_size_6),
               elevator = CASE WHEN :has_elevator THEN :elevator ELSE elevator END,
               single_double_family = CASE WHEN :has_single_double_family THEN :single_double_family ELSE single_double_family END,
               condo = CASE WHEN :has_condo THEN :condo ELSE condo END,
               townhouses = CASE WHEN :has_townhouses THEN :townhouses ELSE townhouses END,
               penthouse = CASE WHEN :has_penthouse THEN :penthouse ELSE penthouse END,
               structure_drawing_url = COALESCE(:structure_drawing_url, structure_drawing_url),
               discount_type = COALESCE(:discount_type, discount_type),
               discount_date_from = COALESCE(:discount_date_from, discount_date_from),
               discount_date_to = COALESCE(:discount_date_to, discount_date_to),
               business_distribution_area = COALESCE(:business_distribution_area, business_distribution_area),
               exported_to_automation = CASE WHEN :has_exported THEN :exported_to_automation ELSE exported_to_automation END,
               comment = COALESCE(:comment, comment),
               updated_at = NOW()
               WHERE asset_id = :asset_id""",
            params,
            conn=conn,
        )
