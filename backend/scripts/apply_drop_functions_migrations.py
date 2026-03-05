"""Apply ONLY the drop-functions/triggers migrations. Safe to run on any DB.
Removes DB functions and triggers; logic lives in Python.
Run from repo root:
  python backend/scripts/apply_drop_functions_migrations.py
"""
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

os.chdir(REPO_ROOT)
sys.path.insert(0, BACKEND)

for name in (".env.local", ".env"):
    path = os.path.join(BACKEND, name)
    if os.path.isfile(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, _, v = line.partition("=")
                    if k.strip() == "DATABASE_URL":
                        os.environ.setdefault("DATABASE_URL", v.strip().strip("'\""))
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

DROP_MIGRATIONS = [
    "20260249000000_drop_triggers_and_functions_supabase_truth.sql",
    "20260250000000_drop_app_functions_moved_to_python.sql",
    "20260251000000_drop_remaining_app_functions_moved_to_python.sql",
]

conn = psycopg2.connect(db_url)
conn.autocommit = False
try:
    cur = conn.cursor()
    for name in DROP_MIGRATIONS:
        path = os.path.join(REPO_ROOT, "migrations", name)
        if not os.path.isfile(path):
            print(f"  SKIP {name} (not found)")
            continue
        with open(path, encoding="utf-8") as f:
            sql = f.read()
        try:
            cur.execute(sql)
            conn.commit()
            print(f"  OK {name}")
        except Exception as e:
            conn.rollback()
            print(f"  FAILED {name}: {e}")
    cur.close()
    print("Done.")
finally:
    conn.close()
