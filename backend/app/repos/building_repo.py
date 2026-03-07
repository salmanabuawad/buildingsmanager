"""
Building repository: DB access for buildings table.
"""
from typing import Any, Dict, List, Optional

from app.repos.base_repo import BaseRepo

_UPDATE_TOTAL_AREA_SQL = """
WITH latest_assets AS (
  SELECT DISTINCT ON (asset_id) asset_id, asset_size, main_asset_type
  FROM assets
  WHERE building_number = :p_building_number
  ORDER BY asset_id, updated_at DESC
),
accountable_sum AS (
  SELECT COALESCE(SUM(a.asset_size), 0) AS v_asset_sum
  FROM latest_assets a
  WHERE (
    a.main_asset_type IS NULL
    OR EXISTS (
      SELECT 1 FROM asset_types at
      WHERE at.name = a.main_asset_type
        AND COALESCE(at.active, false) = true
        AND (at.non_accountable_for_total_area IS NULL OR at.non_accountable_for_total_area = false)
    )
  )
),
asset_count_cte AS (
  SELECT COUNT(*)::INTEGER AS v_asset_count FROM latest_assets
),
building_shared AS (
  SELECT
    COALESCE(residence_shared_area, 0) AS v_residence_shared_area,
    COALESCE(business_shared_area, 0) AS v_business_shared_area,
    COALESCE(shared_parking_area, 0) AS v_shared_parking_area
  FROM buildings
  WHERE building_number = :p_building_number
)
UPDATE buildings b
SET
  total_building_area = COALESCE((SELECT v_asset_sum FROM accountable_sum), 0)
    + COALESCE((SELECT v_residence_shared_area FROM building_shared), 0)
    + COALESCE((SELECT v_business_shared_area FROM building_shared), 0)
    + COALESCE((SELECT v_shared_parking_area FROM building_shared), 0),
  net_area = COALESCE((SELECT v_asset_sum FROM accountable_sum), 0),
  asset_count = COALESCE((SELECT v_asset_count FROM asset_count_cte), 0)
WHERE b.building_number = :p_building_number
"""


class BuildingRepo(BaseRepo):
    def get_by_number(
        self,
        building_number: int,
        conn=None,
    ) -> Optional[Dict[str, Any]]:
        rows = self._fetch(
            "SELECT * FROM buildings WHERE building_number = :bn",
            {"bn": building_number},
            conn=conn,
        )
        return rows[0] if rows else None

    def exists(self, building_number: int, conn=None) -> bool:
        rows = self._fetch(
            "SELECT 1 FROM buildings WHERE building_number = :bn LIMIT 1",
            {"bn": building_number},
            conn=conn,
        )
        return bool(rows)

    def update_total_area(self, building_number: int, conn=None) -> None:
        self._run(_UPDATE_TOTAL_AREA_SQL, {"p_building_number": building_number}, conn=conn)

    def update_distribution_flags(
        self,
        building_number: int,
        need_business_distribution: Optional[bool] = None,
        need_residence_distribution: Optional[bool] = None,
        conn=None,
    ) -> None:
        if need_business_distribution is not None and need_residence_distribution is not None:
            self._run(
                "UPDATE buildings SET need_business_distribution = :nbd, need_residence_distribution = :nrd WHERE building_number = :bn",
                {"nbd": need_business_distribution, "nrd": need_residence_distribution, "bn": building_number},
                conn=conn,
            )
        elif need_business_distribution is not None:
            self._run(
                "UPDATE buildings SET need_business_distribution = :nbd WHERE building_number = :bn",
                {"nbd": need_business_distribution, "bn": building_number},
                conn=conn,
            )
        elif need_residence_distribution is not None:
            self._run(
                "UPDATE buildings SET need_residence_distribution = :nrd WHERE building_number = :bn",
                {"nrd": need_residence_distribution, "bn": building_number},
                conn=conn,
            )

    def set_need_business_distribution(self, building_number: int, conn=None) -> None:
        self._run(
            "UPDATE buildings SET need_business_distribution = true WHERE building_number = :bn",
            {"bn": building_number},
            conn=conn,
        )

    def set_need_residence_distribution(self, building_number: int, conn=None) -> None:
        self._run(
            "UPDATE buildings SET need_residence_distribution = true WHERE building_number = :bn",
            {"bn": building_number},
            conn=conn,
        )

    def set_both_distribution_flags(self, building_number: int, conn=None) -> None:
        self._run(
            "UPDATE buildings SET need_business_distribution = true, need_residence_distribution = true WHERE building_number = :bn",
            {"bn": building_number},
            conn=conn,
        )

    def clear_business_distribution(self, building_number: int, conn=None) -> None:
        self._run(
            "UPDATE buildings SET need_business_distribution = false WHERE building_number = :bn",
            {"bn": building_number},
            conn=conn,
        )

    def clear_residence_distribution(self, building_number: int, conn=None) -> None:
        self._run(
            "UPDATE buildings SET need_residence_distribution = false WHERE building_number = :bn",
            {"bn": building_number},
            conn=conn,
        )

    def clear_both_distribution(self, building_number: int, conn=None) -> None:
        self._run(
            "UPDATE buildings SET need_business_distribution = false, need_residence_distribution = false WHERE building_number = :bn",
            {"bn": building_number},
            conn=conn,
        )

    def get_shared_areas(self, building_number: int, conn=None) -> Optional[Dict[str, Any]]:
        rows = self._fetch(
            "SELECT business_shared_area, residence_shared_area FROM buildings WHERE building_number = :bn",
            {"bn": building_number},
            conn=conn,
        )
        return rows[0] if rows else None

    def recompute_distribution_flags(self, building_number: int, asset_type_repo, conn=None) -> None:
        """
        Set need_business_distribution / need_residence_distribution based on building shared
        areas and asset types in the building. Replaces DB trigger auto_set_distribution_flags_on_change.
        """
        building_row = self.get_shared_areas(building_number, conn=conn)
        if not building_row:
            return
        bn_business = float(building_row.get("business_shared_area") or 0)
        bn_residence = float(building_row.get("residence_shared_area") or 0)
        if bn_business <= 0 and bn_residence <= 0:
            return
        rows = self._fetch(
            "SELECT DISTINCT main_asset_type FROM assets WHERE building_number = :bn AND main_asset_type IS NOT NULL",
            {"bn": building_number},
            conn=conn,
        )
        need_business = False
        need_residence = False
        for r in rows:
            br = asset_type_repo.get_business_residence_by_name(r.get("main_asset_type"), conn=conn)
            if br == "עסקים" and bn_business > 0:
                need_business = True
            elif br == "מגורים" and bn_residence > 0:
                need_residence = True
            else:
                if bn_business > 0:
                    need_business = True
                if bn_residence > 0:
                    need_residence = True
        if need_business or need_residence:
            self.update_distribution_flags(
                building_number,
                need_business_distribution=need_business if bn_business > 0 else None,
                need_residence_distribution=need_residence if bn_residence > 0 else None,
                conn=conn,
            )

    def get_asset_ids(self, building_number: int, conn=None) -> List[int]:
        rows = self._fetch(
            "SELECT asset_id FROM assets WHERE building_number = :bn ORDER BY asset_id",
            {"bn": building_number},
            conn=conn,
        )
        return [int(r["asset_id"]) for r in rows if r.get("asset_id") is not None]

    def delete_by_number(self, building_number: int, conn=None) -> None:
        self._run("DELETE FROM buildings WHERE building_number = :bn", {"bn": building_number}, conn=conn)

    def update_full(
        self,
        conn,
        building_number: int,
        **kwargs,
    ) -> None:
        """Update building with all common columns. kwargs are column=value."""
        # Build SET clause from kwargs
        allowed = {
            "total_building_area", "tax_region", "elevator", "single_double_family",
            "condo", "townhouses", "residence_shared_area", "business_shared_area",
            "area_for_control", "shared_parking_area", "number_of_parking_units",
            "gosh", "helka", "building_number_in_street", "overload_ratio",
            "need_residence_distribution", "need_business_distribution",
            "building_address", "note",
        }
        params = {"building_number": building_number}
        sets = []
        for k, v in kwargs.items():
            if k in allowed:
                params[k] = v
                sets.append(f"{k} = :{k}")
        if not sets:
            return
        sql = f"UPDATE buildings SET {', '.join(sets)} WHERE building_number = :building_number"
        self._run(sql, params, conn=conn)
