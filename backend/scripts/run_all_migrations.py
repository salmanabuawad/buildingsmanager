"""Apply all migrations in order. Run from repo root:
  python backend/scripts/run_all_migrations.py
Uses DATABASE_URL from backend/.env or backend/.env.local.
"""
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIGRATIONS_DIR = os.path.join(REPO_ROOT, "migrations")

os.chdir(REPO_ROOT)
sys.path.insert(0, BACKEND)

# Load env from backend/.env.local or backend/.env
for name in (".env.local", ".env"):
    path = os.path.join(BACKEND, name)
    if os.path.isfile(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, _, v = line.partition("=")
                    k = k.strip()
                    v = v.strip().strip("'\"").strip()
                    if k == "DATABASE_URL":
                        os.environ.setdefault("DATABASE_URL", v)
        break

db_url = os.environ.get("DATABASE_URL")
if not db_url:
    print("Set DATABASE_URL in backend/.env or backend/.env.local")
    sys.exit(1)

try:
    import psycopg2
except ImportError:
    print("pip install psycopg2-binary")
    sys.exit(1)

if not os.path.isdir(MIGRATIONS_DIR):
    print("Migrations directory not found:", MIGRATIONS_DIR)
    sys.exit(1)

files = sorted(f for f in os.listdir(MIGRATIONS_DIR) if f.endswith(".sql"))
if not files:
    print("No .sql files in migrations/")
    sys.exit(0)

print(f"Applying {len(files)} migrations...")

conn = psycopg2.connect(db_url)
conn.autocommit = False
try:
    cur = conn.cursor()
    success = 0
    for i, name in enumerate(files, 1):
        path = os.path.join(MIGRATIONS_DIR, name)
        try:
            with open(path, encoding="utf-8") as f:
                sql = f.read().strip()
            # Skip placeholder/empty migrations (comments only)
            executable = "".join(
                line for line in sql.split("\n")
                if line.strip() and not line.strip().startswith("--")
            ).strip()
            if not executable:
                print(f"  [{i}/{len(files)}] {name} SKIP (no executable SQL)")
                success += 1
                continue
            cur.execute(sql)
            conn.commit()
            success += 1
            print(f"  [{i}/{len(files)}] {name} OK")
        except Exception as e:
            conn.rollback()
            print(f"  [{i}/{len(files)}] {name} FAILED: {e}")
            sys.exit(1)
    cur.close()
    print(f"Done. Applied {success} migrations.")
finally:
    conn.close()
