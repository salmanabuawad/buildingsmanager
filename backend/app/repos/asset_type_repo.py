"""
Asset type repository: DB access for asset_types table.
"""
from typing import Any, Dict, List, Optional

from app.repos.base_repo import BaseRepo


class AssetTypeRepo(BaseRepo):
    def get_by_id(self, type_id: int, conn=None) -> Optional[Dict[str, Any]]:
        rows = self._fetch("SELECT * FROM asset_types WHERE id = :id", {"id": type_id}, conn=conn)
        return rows[0] if rows else None

    def get_business_residence_by_name(self, name: Optional[str], conn=None) -> Optional[str]:
        if not name:
            return None
        rows = self._fetch("SELECT business_residence FROM asset_types WHERE name = :n", {"n": name}, conn=conn)
        return rows[0].get("business_residence") if rows else None

    def get_building_numbers_with_asset_type(self, asset_type_name: str, conn=None) -> List[int]:
        rows = self._fetch(
            "SELECT DISTINCT building_number FROM assets WHERE main_asset_type = :name AND building_number IS NOT NULL",
            {"name": asset_type_name},
            conn=conn,
        )
        return [int(r["building_number"]) for r in rows if r.get("building_number") is not None]

    def update_by_columns(
        self,
        conn,
        type_id: int,
        params: Dict[str, Any],
    ) -> None:
        """Update asset_types by id. Params dict has column=value (excludes id for SET)."""
        exclude = {"id"}
        set_params = {k: v for k, v in params.items() if k not in exclude}
        if not set_params:
            return
        sets = ", ".join(f"{k} = :{k}" for k in set_params)
        params = dict(params, id=type_id)
        self._run(f"UPDATE asset_types SET {sets} WHERE id = :id", params, conn=conn)
