"""
Add inspector user (inspector / inspector123) with role inspector to the DB.
Uses backend DATABASE_URL (e.g. from backend/.env). Safe to run multiple times.
From repo root:  python backend/scripts/add_inspector_user.py
From backend:    python scripts/add_inspector_user.py
"""
import os
import sys

_script_dir = os.path.dirname(os.path.abspath(__file__))
_backend_dir = os.path.dirname(_script_dir)
os.chdir(_backend_dir)
sys.path.insert(0, _backend_dir)

from sqlalchemy import text
from app.database import engine

REPO_ROOT = os.path.dirname(_backend_dir)
MIGRATIONS_DIR = os.path.join(REPO_ROOT, "migrations")


def main():
    # 1) Allow inspector role in users table
    role_sql_path = os.path.join(MIGRATIONS_DIR, "20260301000000_add_inspector_role.sql")
    if not os.path.isfile(role_sql_path):
        print(f"Migration not found: {role_sql_path}")
        sys.exit(1)
    with open(role_sql_path, "r", encoding="utf-8-sig", errors="replace") as f:
        role_sql = f.read()

    # 2) Insert inspector user (and set auth_user_id)
    user_sql_path = os.path.join(MIGRATIONS_DIR, "20260302000000_add_inspector_user.sql")
    if not os.path.isfile(user_sql_path):
        print(f"Migration not found: {user_sql_path}")
        sys.exit(1)
    with open(user_sql_path, "r", encoding="utf-8-sig", errors="replace") as f:
        user_sql = f.read()

    with engine.connect() as conn:
        conn.execute(text(role_sql))
        conn.commit()
        conn.execute(text(user_sql))
        conn.commit()
    print("Inspector role and user added: inspector / inspector123 (role: inspector).")


if __name__ == "__main__":
    main()
