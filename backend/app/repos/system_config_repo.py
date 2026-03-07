"""
System configuration repository: DB access for system_configuration table.
"""
from typing import Optional

from app.repos.base_repo import BaseRepo


class SystemConfigRepo(BaseRepo):
    """Repository for system_configuration key-value config."""

    def get_value_by_name(self, name: str, conn=None) -> Optional[str]:
        """Return the value for the given config name, or None if not found."""
        rows = self._fetch(
            "SELECT value FROM system_configuration WHERE name = :name LIMIT 1",
            {"name": name},
            conn=conn,
        )
        if not rows:
            return None
        raw = rows[0].get("value")
        return str(raw).strip() if raw is not None else None
