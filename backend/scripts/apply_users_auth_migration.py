"""Apply 20260128000000_users_table_auth.sql so users_create_internal exists. Run from repo root: python backend/scripts/apply_users_auth_migration.py"""
import os
import sys
_script_dir = os.path.dirname(os.path.abspath(__file__))
_backend_dir = os.path.dirname(_script_dir)
os.chdir(_backend_dir)
sys.path.insert(0, _backend_dir)

from sqlalchemy import text
from app.database import engine

REPO_ROOT = os.path.dirname(_backend_dir)
PATH = os.path.join(REPO_ROOT, "migrations", "20260128000000_users_table_auth.sql")

def main():
    raw = engine.raw_connection()
    try:
        cur = raw.cursor()
        # Drop so CREATE OR REPLACE can change param order (auth_login_param_order may have been applied)
        cur.execute("DROP FUNCTION IF EXISTS auth_login(TEXT, TEXT);")
        with open(PATH, "r", encoding="utf-8-sig", errors="replace") as f:
            cur.execute(f.read())
        raw.commit()
    finally:
        raw.close()
    print("Users table auth migration applied.")

if __name__ == "__main__":
    main()
