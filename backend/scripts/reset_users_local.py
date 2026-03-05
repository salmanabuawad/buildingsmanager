"""
Run reset_users_to_defaults.sql against the local DB (uses backend/.env DATABASE_URL).
From repo root:  python backend/scripts/reset_users_local.py
From backend:    python scripts/reset_users_local.py
"""
import os
import sys

_script_dir = os.path.dirname(os.path.abspath(__file__))
_backend_dir = os.path.dirname(_script_dir)
# Load backend/.env regardless of CWD
os.chdir(_backend_dir)
sys.path.insert(0, _backend_dir)

from sqlalchemy import text
from app.database import engine

REPO_ROOT = os.path.dirname(_backend_dir)
SQL_PATH = os.path.join(REPO_ROOT, "scripts", "db", "reset_users_to_defaults.sql")


def main():
    if not os.path.isfile(SQL_PATH):
        print(f"SQL file not found: {SQL_PATH}")
        sys.exit(1)
    with open(SQL_PATH, "r", encoding="utf-8-sig", errors="replace") as f:
        sql = f.read()
    with engine.connect() as conn:
        conn.execute(text(sql))
        conn.commit()
    print("Users reset: all removed, admin/admin123 and user/user123 added.")


if __name__ == "__main__":
    main()
