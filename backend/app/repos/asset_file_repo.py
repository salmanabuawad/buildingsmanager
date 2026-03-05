"""
Asset files repository: DB access for asset_files table.
"""
from typing import Any, Dict, List, Optional

from app.repos.base_repo import BaseRepo


class AssetFileRepo(BaseRepo):
    def insert(
        self,
        asset_id: int,
        file_url: str,
        file_name: str,
        file_type: Optional[str] = None,
        uploaded_by: Optional[str] = None,
        conn=None,
    ) -> None:
        self._run(
            """INSERT INTO asset_files (asset_id, file_url, file_name, file_type, uploaded_by)
               VALUES (:aid, :url, :fname, :ftype, :uby)""",
            {"aid": asset_id, "url": file_url, "fname": file_name, "ftype": file_type, "uby": uploaded_by},
            conn=conn,
        )

    def get_by_asset_id(self, asset_id: int, conn=None) -> List[Dict[str, Any]]:
        return self._fetch(
            "SELECT * FROM asset_files WHERE asset_id = :aid ORDER BY uploaded_at DESC",
            {"aid": asset_id},
            conn=conn,
        )
