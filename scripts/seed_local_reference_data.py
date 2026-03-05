"""
Seed local Postgres with reference data (asset_types, etc.) when tables are empty.
Run after setup_local_db.py. Uses DATABASE_URL from env or backend/.env.

Usage:
  set PGPASSWORD=postgres
  set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/buildingsmanager
  python scripts/seed_local_reference_data.py

  cd backend && python ../scripts/seed_local_reference_data.py
"""
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIGRATIONS = os.path.join(REPO_ROOT, "migrations")

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(REPO_ROOT, ".env"))
    load_dotenv(os.path.join(REPO_ROOT, "backend", ".env"))
except ImportError:
    pass

try:
    import psycopg2
except ImportError:
    print("Install: pip install psycopg2-binary")
    sys.exit(1)


def main():
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Set DATABASE_URL (e.g. postgresql://postgres:postgres@localhost:5432/buildingsmanager)")
        sys.exit(1)

    conn = psycopg2.connect(url)
    conn.autocommit = False

    # 1. Asset types (required for dropdowns and asset creation)
    path = os.path.join(MIGRATIONS, "import_asset_types_latest.sql")
    if not os.path.isfile(path):
        print("Not found:", path)
        sys.exit(1)
    with open(path, "r", encoding="utf-8-sig", errors="replace") as f:
        sql = f.read()
    cur = conn.cursor()
    try:
        cur.execute(sql)
        conn.commit()
        print("OK: asset_types seeded from import_asset_types_latest.sql")
    except Exception as e:
        conn.rollback()
        # May already be populated
        cur.execute("SELECT COUNT(*) FROM asset_types")
        n = cur.fetchone()[0]
        if n > 0:
            print("asset_types already has", n, "rows; skip import.", str(e)[:80])
        else:
            print("Failed to seed asset_types:", e)
            sys.exit(1)
    finally:
        cur.close()
    conn.close()
    print("Done. For full data (buildings, assets, etc.) use: python scripts/import_from_supabase.py")


if __name__ == "__main__":
    main()
