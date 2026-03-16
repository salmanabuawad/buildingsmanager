"""
Asset files repository: DB access for asset_files table.
"""
from typing import Any, Dict, List, Optional, Tuple

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

    def create_for_files(
        self,
        asset_id: int,
        file_url: str,
        file_name: str,
        file_type: Optional[str] = None,
        file_size: Optional[int] = None,
        measurement_date: Optional[str] = None,
        uploaded_by: Optional[str] = None,
        conn=None,
    ) -> Optional[Dict[str, Any]]:
        """Insert asset file and return the created row."""
        rows = self._fetch(
            """INSERT INTO asset_files (asset_id, file_url, file_name, file_type, file_size, measurement_date, uploaded_by)
               VALUES (:aid, :url, :fname, :ftype, :fsize, :mdate, :uby)
               RETURNING *""",
            {
                "aid": asset_id,
                "url": file_url,
                "fname": file_name,
                "ftype": file_type,
                "fsize": file_size,
                "mdate": measurement_date,
                "uby": uploaded_by,
            },
            conn=conn,
        )
        return rows[0] if rows else None

    def get_by_id(self, file_id: int, conn=None) -> Optional[Dict[str, Any]]:
        rows = self._fetch(
            "SELECT * FROM asset_files WHERE id = :fid LIMIT 1",
            {"fid": file_id},
            conn=conn,
        )
        return rows[0] if rows else None

    def get_filename_for_blob_path(self, blob_path: str, conn=None) -> Optional[str]:
        """Return file_name for a row matching blob_path."""
        pat = f"%{blob_path}%"
        rows = self._fetch(
            """SELECT file_name FROM asset_files
               WHERE file_url = :path OR file_url LIKE :pat
               LIMIT 1""",
            {"path": blob_path, "pat": pat},
            conn=conn,
        )
        if not rows or not rows[0].get("file_name"):
            return None
        fname = str(rows[0]["file_name"] or "").strip()
        if "/" in fname or "\\" in fname:
            return None
        return fname

    def get_file_meta_for_blob_path(self, blob_path: str, conn=None) -> Tuple[str, str]:
        """Return (file_name, file_type) for response."""
        pat = f"%{blob_path}%"
        rows = self._fetch(
            """SELECT file_name, file_type FROM asset_files
               WHERE file_url = :path OR file_url LIKE :pat
               LIMIT 1""",
            {"path": blob_path, "pat": pat},
            conn=conn,
        )
        filename = blob_path.split("/")[-1] if "/" in blob_path else blob_path
        media_type = "application/octet-stream"
        if rows and rows[0]:
            r = rows[0]
            if r.get("file_name") and "/" not in str(r.get("file_name") or "") and "\\" not in str(r.get("file_name") or ""):
                filename = str(r["file_name"] or "").strip()
            if r.get("file_type") and isinstance(r.get("file_type"), str) and "/" in r["file_type"] and r["file_type"].count("/") == 1:
                media_type = r["file_type"].strip()
        return filename, media_type

    def delete_by_id(self, file_id: int, conn=None) -> None:
        self._run(
            "DELETE FROM asset_files WHERE id = :fid",
            {"fid": file_id},
            conn=conn,
        )

    def get_by_asset_id(self, asset_id: int, conn=None) -> List[Dict[str, Any]]:
        return self._fetch(
            "SELECT * FROM asset_files WHERE asset_id = :aid ORDER BY uploaded_at DESC",
            {"aid": asset_id},
            conn=conn,
        )
