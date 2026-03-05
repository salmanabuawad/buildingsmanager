"""Apply 20260303000000_inspection_tasks_tables.sql. From repo root: python backend/scripts/apply_inspection_tables_migration.py"""
import os
import sys
_script_dir = os.path.dirname(os.path.abspath(__file__))
_backend_dir = os.path.dirname(_script_dir)
os.chdir(_backend_dir)
sys.path.insert(0, _backend_dir)
REPO_ROOT = os.path.dirname(_backend_dir)
from sqlalchemy import text
from app.database import engine

path = os.path.join(REPO_ROOT, "migrations", "20260303000000_inspection_tasks_tables.sql")
with open(path, "r", encoding="utf-8-sig", errors="replace") as f:
    sql = f.read()
with engine.connect() as conn:
    conn.execute(text(sql))
    conn.commit()
print("Migration 20260303000000_inspection_tasks_tables applied.")
