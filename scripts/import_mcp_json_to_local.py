"""
Import table data from JSON files (e.g. from Supabase MCP export) into local Postgres.
Reads standalone/seed/data/<table>.json (array of row objects). Uses local DB column order.

Usage:
  set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/buildingsmanager
  python scripts/import_mcp_json_to_local.py
  python scripts/import_mcp_json_to_local.py --data-dir standalone/seed/data --truncate
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
    from psycopg2.extensions import adapt as pg_adapt
except ImportError:
    print("Install: pip install psycopg2-binary")
    sys.exit(1)

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DATA_DIR = os.path.join(REPO_ROOT, "standalone", "seed", "data")

TABLE_ORDER = [
    "address_list", "validation_rules", "asset_types", "users", "operators", "managers",
    "audit", "buildings", "assets", "assets_history", "change_log", "asset_files",
    "field_configurations", "system_configuration",
]


def get_columns(conn, table):
    cur = conn.cursor()
    cur.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s
        ORDER BY ordinal_position
    """, (table,))
    return [r[0] for r in cur.fetchall()]


def json_value_to_py(val):
    if val is None:
        return None
    if isinstance(val, str) and val.startswith("202") and "T" not in val and "-" in val:
        return val  # date
    return val


def row_to_tuple(row_dict, cols):
    return tuple(row_dict.get(c) for c in cols)


def main():
    p = argparse.ArgumentParser(description="Import MCP/JSON table data into local Postgres")
    p.add_argument("--db", default=os.environ.get("DATABASE_URL"))
    p.add_argument("--data-dir", default=DEFAULT_DATA_DIR)
    p.add_argument("--truncate", action="store_true")
    args = p.parse_args()
    if not args.db:
        print("Set DATABASE_URL or pass --db")
        sys.exit(1)
    if not os.path.isdir(args.data_dir):
        print("Data dir not found:", args.data_dir)
        sys.exit(1)

    conn = psycopg2.connect(args.db)
    reverse_order = list(reversed(TABLE_ORDER))
    if args.truncate:
        cur = conn.cursor()
        cur.execute("""
            SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY(%s)
        """, (reverse_order,))
        existing = [r[0] for r in cur.fetchall()]
        to_truncate = [t for t in reverse_order if t in existing]
        if to_truncate:
            tables_str = ", ".join(f'"{t}"' for t in to_truncate)
            try:
                cur.execute(f"TRUNCATE TABLE {tables_str} CASCADE")
                conn.commit()
                print("Truncated", len(to_truncate), "tables.")
            except Exception as e:
                conn.rollback()
                print("Truncate warning:", str(e).encode("ascii", errors="replace").decode("ascii")[:80])
        cur.close()

    total = 0
    for table in TABLE_ORDER:
        path = os.path.join(args.data_dir, f"{table}.json")
        if table == "field_configurations" and not os.path.isfile(path):
            alt = os.path.join(args.data_dir, "field_configurations_supabase.json")
            if os.path.isfile(alt):
                path = alt
        if not os.path.isfile(path):
            continue
        cols = get_columns(conn, table)
        if not cols:
            print("  [skip]", table, "(no columns in local)")
            continue
        with open(path, "r", encoding="utf-8") as f:
            rows_raw = json.load(f)
        if not isinstance(rows_raw, list) or not rows_raw:
            print("  ", table, ": 0 rows")
            continue
        # Supabase uses rule_key; local schema may use rule_name
        if table == "validation_rules":
            for r in rows_raw:
                if isinstance(r, dict) and "rule_key" in r and "rule_name" not in r:
                    r["rule_name"] = r["rule_key"]
        # Fill NOT NULL booleans in asset_types (Supabase may have null)
        if table == "asset_types":
            for r in rows_raw:
                if not isinstance(r, dict):
                    continue
                for k in ("non_accountable_for_total_area", "non_accountable_for_distribution",
                          "not_accountable_for_statistics", "use_shared_area", "active",
                          "elevator", "single_double_family", "penthouse", "condo", "townhouses",
                          "use_for_parking_shared_area", "not_accountable"):
                    if k in r and r[k] is None:
                        r[k] = False
        # Fill NOT NULL booleans in assets (Supabase/MCP export may omit or null them)
        # Set action_id to None to avoid FK violation (audit table may not have matching id)
        if table == "assets":
            asset_bool_keys = ("elevator", "single_double_family", "penthouse", "condo", "townhouses",
                              "exported_to_automation", "is_new_measurement", "data_from_automation")
            for r in rows_raw:
                if not isinstance(r, dict):
                    continue
                for k in asset_bool_keys:
                    if r.get(k) is None:
                        r[k] = False
                r["action_id"] = None  # FK to audit; seed has no matching audit entries
        # Use keys from first row; align to local columns (only include keys that exist locally)
        first = rows_raw[0]
        if isinstance(first, dict):
            row_tuples = []
            for r in rows_raw:
                t = tuple(r.get(c) for c in cols)
                row_tuples.append(t)
        else:
            print("  [skip]", table, "(unexpected JSON format)")
            continue
        col_list = ", ".join(f'"{c}"' for c in cols)
        placeholders = ", ".join("%s" for _ in cols)
        use_conflict = table != "assets_history"
        insert_sql = f'INSERT INTO "{table}" ({col_list}) VALUES ({placeholders})'
        if use_conflict:
            insert_sql += " ON CONFLICT DO NOTHING"
        cur = conn.cursor()
        try:
            cur.executemany(insert_sql, row_tuples)
            conn.commit()
            n = cur.rowcount
            total += n
            print("  ", table, ":", n, "rows")
        except Exception as e:
            conn.rollback()
            err = str(e).encode("ascii", errors="replace").decode("ascii")[:120]
            print("  [fail]", table, "-", err)
        finally:
            cur.close()
    conn.close()
    print("Done. Total rows imported:", total)


if __name__ == "__main__":
    main()
