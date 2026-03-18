#!/usr/bin/env python3
"""
Import audit, buildings, assets, assets_history from JSON files into target DB.
Run on the server with only TARGET_DATABASE_URL (no Supabase credentials needed).

Expects in current dir: export_audit.json, export_buildings.json, export_assets.json, export_assets_history.json, export_asset_files.json (optional), export_users.json (optional).
Usage: TARGET_DATABASE_URL=postgresql://... python3 import_from_json.py [--replace]
"""

import argparse
import json
import os
import sys
from pathlib import Path

try:
    import psycopg2
    from psycopg2.extras import execute_batch
    from psycopg2.extras import Json
except ImportError:
    print("Install: pip3 install psycopg2-binary", file=sys.stderr)
    sys.exit(1)

TARGET_URL = os.environ.get("TARGET_DATABASE_URL")
TABLES = ["users", "audit", "buildings", "assets", "assets_history", "asset_files"]
TRUNCATE_ORDER = ["asset_files", "assets_history", "assets", "buildings", "audit", "users"]


def row_to_values(row, columns):
    out = []
    for c in columns:
        v = row.get(c)
        if isinstance(v, dict) or isinstance(v, list):
            v = Json(v)
        out.append(v)
    return out


def get_target_columns(cur, table: str):
    cur.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = %s ORDER BY ordinal_position",
        (table,),
    )
    return [r[0] for r in cur.fetchall()]


def load_table(conn, table: str, replace: bool):
    path = Path(f"export_{table}.json")
    if not path.exists():
        print(f"  {table}: skip (no {path.name})")
        return 0
    with open(path, "r", encoding="utf-8") as f:
        rows = json.load(f)
    if not rows:
        print(f"  {table}: 0 rows")
        return 0
    cur = conn.cursor()
    target_cols = get_target_columns(cur, table)
    if not target_cols:
        print(f"  {table}: skip (table missing or no columns)")
        return 0
    # For asset_files: if target has file_path but no file_url and source has file_url, put URL in file_path so copy_asset_files_from_supabase.py can use it
    if table == "asset_files" and "file_path" in target_cols and "file_url" not in target_cols:
        for r in rows:
            if r.get("file_url") and not r.get("file_path"):
                r["file_path"] = r["file_url"]
    # Only use columns that exist in target
    columns = [c for c in rows[0].keys() if c in target_cols]
    if not columns:
        print(f"  {table}: skip (no matching columns)")
        return 0
    cols_list = ", ".join(f'"{c}"' for c in columns)
    placeholders = ", ".join("%s" for _ in columns)
    insert_sql = f'INSERT INTO {table} ({cols_list}) VALUES ({placeholders})'
    values = [row_to_values(r, columns) for r in rows]
    execute_batch(cur, insert_sql, values, page_size=500)
    conn.commit()
    print(f"  {table}: {len(rows)} rows")
    return len(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--replace", action="store_true", help="Truncate tables before import")
    ap.add_argument("--only", type=str, default="", help="Comma-separated table names to load only (e.g. asset_files)")
    args = ap.parse_args()
    if not TARGET_URL:
        print("Set TARGET_DATABASE_URL", file=sys.stderr)
        sys.exit(1)
    tables = [t.strip() for t in args.only.split(",") if t.strip()] if args.only else TABLES
    conn = psycopg2.connect(TARGET_URL)
    try:
        if args.replace:
            cur = conn.cursor()
            for t in TRUNCATE_ORDER:
                if t in tables:
                    cur.execute(f"TRUNCATE TABLE {t} CASCADE")
                    print(f"  Truncated {t}")
            conn.commit()
        total = 0
        for table in tables:
            total += load_table(conn, table, args.replace)
        print(f"Done. Total: {total}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
