#!/usr/bin/env python3
"""
Copy assets, buildings, assets_history, and audit from MCP (Supabase) to new server DB.

Source = Supabase Postgres (the DB your MCP user-supabase is connected to).
Target = New server Postgres (e.g. backend DATABASE_URL).

Usage:
  # Required env (or .env in repo root or this folder):
  #   SOURCE_DATABASE_URL = Supabase: postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
  #   TARGET_DATABASE_URL = New server (e.g. postgresql://user:pass@host:5432/default)

  python scripts/migrate-data/copy_mcp_to_new_server.py [--with-users] [--replace]

  --with-users   Also copy users table (so audit.user_id and other FKs resolve).
  --replace      Truncate target tables before copy (default: append; may conflict on PKs).

Order of copy respects FKs: users (if used) -> audit -> buildings -> assets -> assets_history.
"""

import argparse
import os
import sys
from pathlib import Path

try:
    import psycopg2
    from psycopg2.extras import execute_batch
except ImportError:
    print("Install psycopg2: pip install psycopg2-binary", file=sys.stderr)
    sys.exit(1)

# Optional: load .env from repo root or this script's directory
for _path in [Path(__file__).resolve().parent.parent.parent, Path(__file__).resolve().parent]:
    _env = _path / ".env"
    if _env.exists():
        try:
            from dotenv import load_dotenv
            load_dotenv(_env)
            break
        except ImportError:
            pass

SOURCE_URL = os.environ.get("SOURCE_DATABASE_URL")
TARGET_URL = os.environ.get("TARGET_DATABASE_URL")

# Tables to copy in dependency order (users -> audit -> buildings -> assets -> assets_history)
TABLES_WITH_USERS = ["users", "audit", "buildings", "assets", "assets_history"]
TABLES_WITHOUT_USERS = ["audit", "buildings", "assets", "assets_history"]
# Truncate order (reverse FK) for --replace
TRUNCATE_ORDER = ["assets_history", "assets", "buildings", "audit", "users"]


def get_columns(cursor, table: str):
    cursor.execute(f'SELECT * FROM {table} LIMIT 0')
    return [d.name for d in cursor.description]


def copy_table(src_conn, tgt_conn, table: str):
    src_cur = src_conn.cursor()
    tgt_cur = tgt_conn.cursor()
    cols = get_columns(src_cur, table)
    cols_list = ", ".join(f'"{c}"' for c in cols)
    placeholders = ", ".join("%s" for _ in cols)
    insert_sql = f'INSERT INTO {table} ({cols_list}) VALUES ({placeholders})'
    src_cur.execute(f'SELECT {cols_list} FROM {table}')
    rows = src_cur.fetchall()
    if not rows:
        print(f"  {table}: 0 rows (skip)")
        return 0
    execute_batch(tgt_cur, insert_sql, rows, page_size=500)
    tgt_conn.commit()
    print(f"  {table}: {len(rows)} rows")
    return len(rows)


def main():
    ap = argparse.ArgumentParser(description="Copy assets, buildings, history, audit from MCP (Supabase) to new server DB")
    ap.add_argument("--with-users", action="store_true", help="Also copy users table")
    ap.add_argument("--replace", action="store_true", help="Truncate target tables before copy")
    args = ap.parse_args()

    tables = TABLES_WITH_USERS if args.with_users else TABLES_WITHOUT_USERS

    if not SOURCE_URL or not TARGET_URL:
        print("Set SOURCE_DATABASE_URL and TARGET_DATABASE_URL (Supabase and new server).", file=sys.stderr)
        sys.exit(1)
    if args.replace:
        print("Replace mode: target tables will be truncated before copy.")
    print("Connecting to source and target...")
    src_conn = psycopg2.connect(SOURCE_URL)
    tgt_conn = psycopg2.connect(TARGET_URL)
    try:
        if args.replace:
            tgt_cur = tgt_conn.cursor()
            for table in TRUNCATE_ORDER:
                if table in tables:
                    tgt_cur.execute(f"TRUNCATE TABLE {table} CASCADE")
                    print(f"  Truncated {table}")
            tgt_conn.commit()
            tgt_cur.close()
        total = 0
        for table in tables:
            total += copy_table(src_conn, tgt_conn, table)
        print(f"Done. Total rows copied: {total}")
    finally:
        src_conn.close()
        tgt_conn.close()


if __name__ == "__main__":
    main()
