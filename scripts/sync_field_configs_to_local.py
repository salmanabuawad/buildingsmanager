"""
Sync field_configurations from Supabase (MCP export or JSON file) to local Postgres.
Uses ON CONFLICT (grid_name, field_name) DO UPDATE so Supabase configs overwrite local.

Usage:
  set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/buildingsmanager
  python scripts/sync_field_configs_to_local.py
  python scripts/sync_field_configs_to_local.py --input path/to/field_configs.json
  python scripts/sync_field_configs_to_local.py --mcp-output path/to/mcp_result.txt

If --mcp-output is given, extracts JSON from MCP tool output (handles untrusted-data wrapper).
"""
import os
import sys
import json
import re
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
except ImportError:
    print("Install: pip install psycopg2-binary")
    sys.exit(1)

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_INPUT = os.path.join(REPO_ROOT, "standalone", "seed", "data", "field_configurations_supabase.json")


def load_json_from_file(path: str, is_mcp_output: bool = False) -> list:
    """Load field config rows from JSON file or MCP output."""
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    if is_mcp_output:
        # MCP may write entire output as one JSON string; decode first
        try:
            outer = json.loads(content)
            if isinstance(outer, str):
                content = outer  # Search within the decoded string
        except json.JSONDecodeError:
            pass
        idx = content.find('[{"grid_name"')
        if idx < 0:
            idx = content.find('[{')
        if idx < 0:
            raise ValueError("Could not find JSON array in MCP output file")
        depth = 0
        for i in range(idx, len(content)):
            if content[i] == "[":
                depth += 1
            elif content[i] == "]":
                depth -= 1
                if depth == 0:
                    return json.loads(content[idx : i + 1])
        raise ValueError("Could not parse JSON array from MCP output")

    data = json.loads(content)
    if not isinstance(data, list):
        raise ValueError("Expected JSON array of field config objects")
    return data


def sync_to_local(rows: list, db_url: str) -> int:
    """Upsert rows into field_configurations. Returns number of rows processed."""
    if not rows:
        print("No rows to sync")
        return 0

    cols = ["grid_name", "field_name", "width_chars", "padding", "hebrew_name", "pinned", "pin_side", "visible", "column_order"]
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    insert_sql = """
        INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (grid_name, field_name) DO UPDATE SET
            width_chars = EXCLUDED.width_chars,
            padding = EXCLUDED.padding,
            hebrew_name = EXCLUDED.hebrew_name,
            pinned = EXCLUDED.pinned,
            pin_side = EXCLUDED.pin_side,
            visible = EXCLUDED.visible,
            column_order = EXCLUDED.column_order,
            updated_at = now()
    """
    n = 0
    for r in rows:
        if not isinstance(r, dict):
            continue
        vals = (
            r.get("grid_name"),
            r.get("field_name"),
            r.get("width_chars", 10),
            r.get("padding", 8),
            r.get("hebrew_name"),
            r.get("pinned", False),
            r.get("pin_side"),
            r.get("visible", True),
            r.get("column_order"),
        )
        if vals[0] is None or vals[1] is None:
            continue
        cur.execute(insert_sql, vals)
        n += 1
    conn.commit()
    cur.close()
    conn.close()
    return n


def main():
    p = argparse.ArgumentParser(description="Sync field_configurations from Supabase to local DB")
    p.add_argument("--db", default=os.environ.get("DATABASE_URL"), help="Postgres connection URL")
    p.add_argument("--input", default=DEFAULT_INPUT, help="Path to field_configurations JSON file")
    p.add_argument("--mcp-output", help="Path to MCP execute_sql output file (extracts JSON from wrapper)")
    args = p.parse_args()

    if not args.db:
        print("Set DATABASE_URL or pass --db")
        sys.exit(1)

    path = args.mcp_output or args.input
    if not os.path.isfile(path):
        print("File not found:", path)
        sys.exit(1)

    is_mcp = bool(args.mcp_output)
    rows = load_json_from_file(path, is_mcp_output=is_mcp)
    print(f"Loaded {len(rows)} field config rows from {path}")

    n = sync_to_local(rows, args.db)
    print(f"Synced {n} rows to local field_configurations")


if __name__ == "__main__":
    main()
