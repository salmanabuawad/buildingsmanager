"""
Apply seed SQL files (standalone/seed/) to the local database.
Run after setup_local_db.py and migrations. Uses DATABASE_URL from env or backend/.env.

Usage:
  set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/buildingsmanager
  python scripts/apply_seed.py

  python scripts/apply_seed.py --no-truncate   # only run INSERT files (skip 00_truncate)
"""
import os
import sys
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
SEED_DIR = os.path.join(REPO_ROOT, "standalone", "seed")


def main():
    p = argparse.ArgumentParser(description="Apply standalone/seed/*.sql to local DB")
    p.add_argument("--db", default=os.environ.get("DATABASE_URL"), help="Target DB URL")
    p.add_argument("--seed-dir", default=SEED_DIR, help="Seed directory (default: standalone/seed)")
    p.add_argument("--no-truncate", action="store_true", help="Skip 00_truncate_seed_tables.sql")
    args = p.parse_args()
    if not args.db:
        print("Set DATABASE_URL or pass --db")
        sys.exit(1)
    if not os.path.isdir(args.seed_dir):
        print("Seed directory not found:", args.seed_dir)
        print("Run: python scripts/export_supabase_to_seed.py (with SUPABASE_DATABASE_URL) to generate seed files.")
        sys.exit(1)

    files = sorted(f for f in os.listdir(args.seed_dir) if f.endswith(".sql"))
    if not files:
        print("No .sql files in", args.seed_dir)
        sys.exit(1)
    if args.no_truncate:
        files = [f for f in files if not f.startswith("00_truncate")]
    else:
        # Run truncate first
        if "00_truncate_seed_tables.sql" not in files:
            print("Warning: 00_truncate_seed_tables.sql not found; running all files in order.")

    conn = psycopg2.connect(args.db)
    for name in files:
        path = os.path.join(args.seed_dir, name)
        with open(path, "r", encoding="utf-8-sig", errors="replace") as f:
            sql = f.read()
        cur = conn.cursor()
        try:
            cur.execute(sql)
            conn.commit()
            print("OK:", name)
        except Exception as e:
            conn.rollback()
            print("FAIL:", name, "-", e)
            sys.exit(1)
        finally:
            cur.close()
    conn.close()
    print("Seed applied.")


if __name__ == "__main__":
    main()
