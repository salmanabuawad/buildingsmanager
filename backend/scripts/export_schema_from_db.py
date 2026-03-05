"""
Export table structures, functions, and triggers from Postgres (Supabase or local).
Use this to align with Supabase as the single source of truth.

Usage:
  cd backend
  python scripts/export_schema_from_db.py

  Or with Supabase URL:
  SUPABASE_DATABASE_URL="postgresql://..." python scripts/export_schema_from_db.py

Uses SUPABASE_DATABASE_URL if set, else DATABASE_URL (e.g. from .env).
Writes schema_export.json to repo scripts/db/ and prints a short report.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# Allow running from backend/ with app on path
if __name__ == "__main__":
    backend_dir = Path(__file__).resolve().parent.parent
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))
    os.chdir(backend_dir)

    from dotenv import load_dotenv
    load_dotenv()

import psycopg2
from psycopg2.extras import RealDictCursor


def get_url() -> str | None:
    return os.environ.get("SUPABASE_DATABASE_URL") or os.environ.get("DATABASE_URL")


def run_query(conn, sql: str, params: tuple | None = None) -> list[dict]:
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(sql, params or ())
        return [dict(row) for row in cur.fetchall()]


def export_schema(url: str) -> dict:
    out = {"tables": {}, "functions": [], "triggers": []}

    with psycopg2.connect(url) as conn:
        # Table columns (public schema)
        rows = run_query(
            conn,
            """
            SELECT table_name, column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position;
            """
        )
        for r in rows:
            tbl = r["table_name"]
            if tbl not in out["tables"]:
                out["tables"][tbl] = []
            out["tables"][tbl].append({
                "column_name": r["column_name"],
                "data_type": r["data_type"],
                "is_nullable": r["is_nullable"],
                "column_default": r["column_default"],
            })

        # Functions (public schema, exclude extensions)
        rows = run_query(
            conn,
            """
            SELECT p.proname AS name,
                   pg_get_function_identity_arguments(p.oid) AS args,
                   pg_get_functiondef(p.oid) AS definition
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'public'
            ORDER BY p.proname;
            """
        )
        for r in rows:
            out["functions"].append({
                "name": r["name"],
                "args": r["args"],
                "definition": r["definition"][:2000] + "..." if r["definition"] and len(r["definition"]) > 2000 else r["definition"],
            })

        # Triggers
        rows = run_query(
            conn,
            """
            SELECT event_object_table AS table_name, trigger_name, event_manipulation, action_statement
            FROM information_schema.triggers
            WHERE trigger_schema = 'public'
            ORDER BY event_object_table, trigger_name;
            """
        )
        for r in rows:
            out["triggers"].append({
                "table_name": r["table_name"],
                "trigger_name": r["trigger_name"],
                "event_manipulation": r["event_manipulation"],
                "action_statement": (r["action_statement"] or "")[:500],
            })

    return out


def main() -> None:
    url = get_url()
    if not url:
        print("Set SUPABASE_DATABASE_URL or DATABASE_URL (e.g. in backend/.env)", file=sys.stderr)
        sys.exit(1)

    # Redact password in log
    safe_url = url.split("@")[-1] if "@" in url else url
    print(f"Exporting schema from ...{safe_url}")

    data = export_schema(url)

    # Output path: repo root scripts/db/schema_export.json
    repo_root = Path(__file__).resolve().parent.parent.parent
    out_dir = repo_root / "scripts" / "db"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / "schema_export.json"

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Wrote {out_file}")
    print(f"  Tables: {len(data['tables'])}")
    for t, cols in sorted(data["tables"].items()):
        print(f"    - {t}: {len(cols)} columns")
    print(f"  Functions: {len(data['functions'])}")
    for fn in data["functions"][:15]:
        print(f"    - {fn['name']}({fn['args']})")
    if len(data["functions"]) > 15:
        print(f"    ... and {len(data['functions']) - 15} more")
    print(f"  Triggers: {len(data['triggers'])}")
    for tr in data["triggers"]:
        print(f"    - {tr['table_name']}.{tr['trigger_name']} ({tr['event_manipulation']})")


if __name__ == "__main__":
    main()
