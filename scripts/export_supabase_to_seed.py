"""
Export reference data from Supabase (or any Postgres) to standalone/seed/data/*.json.

Use this to sync reference tables from Supabase (source of truth) into JSON files
that import_mcp_json_to_local.py and sync_field_configs_to_local.py consume.

Usage:
  set SUPABASE_DATABASE_URL=postgresql://postgres.[ref]:[pwd]@...pooler.supabase.com:6543/postgres
  python scripts/export_supabase_to_seed.py

  # Or use DATABASE_URL if it points to Supabase:
  set DATABASE_URL=postgresql://...
  python scripts/export_supabase_to_seed.py

Output: standalone/seed/data/{table}.json for each reference table.
"""
import os
import sys
import json
import argparse

try:
    from dotenv import load_dotenv
    _root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    load_dotenv(os.path.join(_root, ".env"))
    load_dotenv(os.path.join(_root, "backend", ".env"))
except ImportError:
    pass

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    print("Install: pip install psycopg2-binary")
    sys.exit(1)

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(REPO_ROOT, "standalone", "seed", "data")

# Reference tables to export (order matches import_mcp_json_to_local TABLE_ORDER where applicable)
REFERENCE_TABLES = [
    "address_list",
    "validation_rules",
    "asset_types",
    "operators",
    "managers",
    "field_configurations",
    "system_configuration",
]


def json_serializer(obj):
    """Serialize objects for JSON (dates, UUIDs, Decimal)."""
    if hasattr(obj, "isoformat"):
        return obj.isoformat()
    if hasattr(obj, "hex"):  # UUID
        return str(obj)
    if hasattr(obj, "__float__"):  # Decimal
        return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def export_table(conn, table: str, out_dir: str) -> int:
    """Export table to JSON. Returns row count."""
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(f'SELECT * FROM "{table}"')
        rows = cur.fetchall()
    except Exception as e:
        print(f"  [skip] {table}: {e}")
        return 0
    finally:
        cur.close()

    if not rows:
        print(f"  {table}: 0 rows")
        return 0

    # Convert to list of dicts (RealDictRow -> dict for JSON)
    data = [dict(r) for r in rows]
    path = os.path.join(out_dir, f"{table}.json")
    if table == "field_configurations":
        path = os.path.join(out_dir, "field_configurations_supabase.json")
    os.makedirs(out_dir, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, default=json_serializer)
    print(f"  {table}: {len(data)} rows -> {path}")
    return len(data)


def main():
    p = argparse.ArgumentParser(description="Export Supabase reference tables to seed JSON")
    p.add_argument("--db", default=os.environ.get("SUPABASE_DATABASE_URL") or os.environ.get("DATABASE_URL"))
    p.add_argument("--out-dir", default=DATA_DIR)
    p.add_argument("--tables", nargs="*", help="Override: only export these tables")
    args = p.parse_args()

    if not args.db:
        print("Set SUPABASE_DATABASE_URL or DATABASE_URL or pass --db")
        sys.exit(1)

    tables = args.tables or REFERENCE_TABLES
    conn = psycopg2.connect(args.db)
    total = 0
    for table in tables:
        total += export_table(conn, table, args.out_dir)
    conn.close()
    print(f"Done. Total rows exported: {total}")


if __name__ == "__main__":
    main()
