"""Apply 20260310000000_add_full_name_and_phone_to_users.sql. Run from repo root:
  python backend/scripts/apply_full_name_phone_migration.py
Uses DATABASE_URL from backend/.env or .env.local.
"""
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
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
                    v = v.strip().strip("'\"")
                    if k == "DATABASE_URL":
                        os.environ.setdefault("DATABASE_URL", v)
        break

db_url = os.environ.get("DATABASE_URL")
if not db_url:
    print("Set DATABASE_URL in backend/.env or .env.local")
    sys.exit(1)

try:
    import psycopg2
except ImportError:
    print("pip install psycopg2-binary")
    sys.exit(1)

migration_path = os.path.join(REPO_ROOT, "migrations", "20260310000000_add_full_name_and_phone_to_users.sql")
if not os.path.isfile(migration_path):
    print("Migration file not found:", migration_path)
    sys.exit(1)

with open(migration_path, encoding="utf-8") as f:
    sql = f.read()

conn = psycopg2.connect(db_url)
try:
    cur = conn.cursor()
    cur.execute(sql)
    conn.commit()
    cur.close()
    print("OK: Applied 20260310000000_add_full_name_and_phone_to_users.sql")
finally:
    conn.close()
