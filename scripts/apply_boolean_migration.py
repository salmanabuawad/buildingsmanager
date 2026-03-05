#!/usr/bin/env python3
"""
Apply the convert-ken/lo-to-boolean migration to the database.
Uses DATABASE_URL from backend/.env (or .env). Safe to run multiple times (idempotent).

Usage:
  python scripts/apply_boolean_migration.py              # local DB (DATABASE_URL)
  DATABASE_URL=postgresql://... python scripts/apply_boolean_migration.py   # e.g. Supabase
"""
import os
import sys

try:
    from dotenv import load_dotenv
    _root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    load_dotenv(os.path.join(_root, ".env"))
    load_dotenv(os.path.join(_root, "backend", ".env"))
except ImportError:
    pass

try:
    import psycopg2
except ImportError:
    print("Install: pip install psycopg2-binary")
    sys.exit(1)

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIGRATION_FILE = os.path.join(REPO_ROOT, "supabase", "migrations", "20260247100000_convert_ken_lo_text_to_boolean.sql")


def main():
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Set DATABASE_URL (e.g. in backend/.env) or pass it in the environment.")
        sys.exit(1)
    if not os.path.isfile(MIGRATION_FILE):
        print("Migration file not found:", MIGRATION_FILE)
        sys.exit(1)

    with open(MIGRATION_FILE, "r", encoding="utf-8-sig") as f:
        sql = f.read()

    conn = psycopg2.connect(url)
    try:
        conn.autocommit = False
        cur = conn.cursor()
        cur.execute(sql)
        conn.commit()
        cur.close()
        print("Applied 20260247100000_convert_ken_lo_text_to_boolean.sql (DB updated to boolean columns).")
    except Exception as e:
        conn.rollback()
        print("Error:", e)
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
