"""
Inspection repository: DB access for inspection_tasks, inspection_reports, inspection_report_files.
"""
from typing import Any, Dict, List, Optional

from app.repos.base_repo import BaseRepo


class InspectionTaskRepo(BaseRepo):
    def get_by_id(self, task_id: int, conn=None) -> Optional[Dict[str, Any]]:
        rows = self._fetch(
            "SELECT id, title, building_number, asset_ids, assigned_to, status, created_at, created_by, "
            "updated_at, taken_at, submitted_at, approved_at, approved_by, note, priority "
            "FROM inspection_tasks WHERE id = :id",
            {"id": task_id},
            conn=conn,
        )
        return rows[0] if rows else None

    def list_with_filters(
        self,
        conditions: List[str],
        params: Dict[str, Any],
        skip: int = 0,
        limit: int = 100,
        conn=None,
    ) -> List[Dict[str, Any]]:
        where = " AND ".join(conditions)
        params = dict(params, skip=skip, limit=limit)
        return self._fetch(
            f"""SELECT t.id, t.title, t.building_number, t.asset_ids, t.assigned_to, t.status,
                   t.created_at, t.created_by, t.updated_at, t.taken_at, t.submitted_at, t.approved_at, t.approved_by, t.note
            FROM inspection_tasks t
            WHERE {where}
            ORDER BY t.created_at DESC
            OFFSET :skip LIMIT :limit""",
            params,
            conn=conn,
        )

    def create(
        self,
        title: Optional[str],
        building_number: int,
        asset_ids: List[int],
        assigned_to: Optional[int],
        created_by: int,
        note: Optional[str],
        priority: str,
        conn=None,
    ) -> List[Dict[str, Any]]:
        return self._fetch(
            """INSERT INTO inspection_tasks (title, building_number, asset_ids, assigned_to, status, created_by, note, priority)
               VALUES (:title, :building_number, :asset_ids, :assigned_to, 'new', :created_by, :note, :priority)
               RETURNING id, title, building_number, asset_ids, assigned_to, status, created_at, created_by, updated_at, taken_at, submitted_at, approved_at, approved_by, note, priority""",
            {
                "title": title,
                "building_number": building_number,
                "asset_ids": asset_ids,
                "assigned_to": assigned_to,
                "created_by": created_by,
                "note": note,
                "priority": priority,
            },
            conn=conn,
        )

    def update(self, task_id: int, updates: List[str], params: Dict[str, Any], conn=None) -> None:
        if not updates:
            return
        sets = ", ".join(updates)
        params = dict(params, id=task_id)
        self._run(f"UPDATE inspection_tasks SET {sets} WHERE id = :id", params, conn=conn)

    def add_history(
        self,
        task_id: int,
        created_by: Optional[int],
        action: str,
        comment_text: Optional[str] = None,
        conn=None,
    ) -> None:
        self._run(
            "INSERT INTO inspection_task_history (task_id, created_by, action, comment_text) VALUES (:task_id, :created_by, :action, :comment_text)",
            {"task_id": task_id, "created_by": created_by, "action": action, "comment_text": comment_text},
            conn=conn,
        )

    def get_history(self, task_id: int, conn=None) -> List[Dict[str, Any]]:
        return self._fetch(
            "SELECT id, task_id, created_at, created_by, action, comment_text FROM inspection_task_history WHERE task_id = :tid ORDER BY created_at ASC",
            {"tid": task_id},
            conn=conn,
        )

    def building_exists(self, building_number: int, conn=None) -> bool:
        val = self._fetch_scalar("SELECT 1 FROM buildings WHERE building_number = :bn", {"bn": building_number}, conn=conn)
        return val is not None


class InspectionReportRepo(BaseRepo):
    def get_by_task_id(self, task_id: int, conn=None) -> List[Dict[str, Any]]:
        return self._fetch(
            "SELECT id, task_id, report_text, reported_at, reported_by, created_at, updated_at FROM inspection_reports WHERE task_id = :tid",
            {"tid": task_id},
            conn=conn,
        )

    def get_by_id(self, report_id: int, conn=None) -> Optional[Dict[str, Any]]:
        rows = self._fetch(
            "SELECT id, task_id, report_text, reported_at, reported_by, created_at, updated_at FROM inspection_reports WHERE id = :id",
            {"id": report_id},
            conn=conn,
        )
        return rows[0] if rows else None

    def get_id_by_task_id(self, task_id: int, conn=None) -> Optional[int]:
        rows = self._fetch("SELECT id FROM inspection_reports WHERE task_id = :tid", {"tid": task_id}, conn=conn)
        return int(rows[0]["id"]) if rows else None

    def upsert(
        self,
        task_id: int,
        report_text: Optional[str],
        reported_by: Optional[int],
        conn=None,
    ) -> Optional[int]:
        existing = self._fetch("SELECT id FROM inspection_reports WHERE task_id = :tid", {"tid": task_id}, conn=conn)
        if existing:
            self._run(
                "UPDATE inspection_reports SET report_text = :text, reported_at = now(), reported_by = :uid, updated_at = now() WHERE task_id = :tid",
                {"text": report_text, "uid": reported_by, "tid": task_id},
                conn=conn,
            )
            return int(existing[0]["id"])
        rows = self._fetch(
            "INSERT INTO inspection_reports (task_id, report_text, reported_at, reported_by) VALUES (:tid, :text, now(), :uid) RETURNING id",
            {"tid": task_id, "text": report_text, "uid": reported_by},
            conn=conn,
        )
        return int(rows[0]["id"]) if rows else None


class InspectionReportFileRepo(BaseRepo):
    def get_by_report_id(self, report_id: int, conn=None) -> List[Dict[str, Any]]:
        return self._fetch(
            "SELECT id, report_id, file_path, file_name, file_type, uploaded_at, uploaded_by, asset_ids FROM inspection_report_files WHERE report_id = :rid",
            {"rid": report_id},
            conn=conn,
        )

    def insert(
        self,
        report_id: int,
        file_path: str,
        file_name: str,
        file_type: Optional[str],
        uploaded_by: Optional[Any],
        asset_ids: Optional[list],
        conn=None,
    ) -> Optional[int]:
        rows = self._fetch(
            """INSERT INTO inspection_report_files (report_id, file_path, file_name, file_type, uploaded_by, asset_ids)
               VALUES (:rid, :path, :fname, :ftype, :uid, :aids)
               RETURNING id""",
            {"rid": report_id, "path": file_path, "fname": file_name, "ftype": file_type, "uid": uploaded_by, "aids": asset_ids},
            conn=conn,
        )
        return int(rows[0]["id"]) if rows else None

    def get_by_id(self, file_id: int, conn=None) -> Optional[Dict[str, Any]]:
        rows = self._fetch(
            "SELECT id, report_id, file_path FROM inspection_report_files WHERE id = :id",
            {"id": file_id},
            conn=conn,
        )
        return rows[0] if rows else None

    def delete(self, file_id: int, conn=None) -> None:
        self._run("DELETE FROM inspection_report_files WHERE id = :id", {"id": file_id}, conn=conn)


class InspectionTaskAccessTokenRepo(BaseRepo):
    def validate_and_get(self, token: str, conn=None) -> Optional[Dict[str, Any]]:
        rows = self._fetch(
            """SELECT t.task_id, t.user_id, u.user_name, u.user_role
               FROM inspection_task_access_tokens t
               JOIN users u ON u.user_id = t.user_id
               WHERE t.token = :tok AND t.used_at IS NULL AND t.expires_at > now() AND u.active = true""",
            {"tok": token},
            conn=conn,
        )
        return rows[0] if rows else None

    def mark_used(self, token: str, conn=None) -> None:
        self._run("UPDATE inspection_task_access_tokens SET used_at = now() WHERE token = :tok", {"tok": token}, conn=conn)

    def create(self, task_id: int, user_id: int, token: str, conn=None) -> None:
        self._run(
            """INSERT INTO inspection_task_access_tokens (task_id, user_id, token, expires_at)
               VALUES (:task_id, :user_id, :token, now() + interval '7 days')""",
            {"task_id": task_id, "user_id": user_id, "token": token},
            conn=conn,
        )
