"""
Apply export_email_queue migration. Uses only DATABASE_URL from backend/.env.
Run from repo root: python backend/scripts/apply_migration_export_email_queue.py
Or from backend: python scripts/apply_migration_export_email_queue.py
"""
import os
from pathlib import Path

# Load only DATABASE_URL (avoid loading full app which needs SECRET_KEY, etc.)
backend_dir = Path(__file__).resolve().parent.parent
repo_root = backend_dir.parent
env_file = backend_dir / ".env"
migration_file = repo_root / "supabase" / "migrations" / "20260228000000_add_export_email_queue.sql"

try:
    from dotenv import load_dotenv
    load_dotenv(env_file)
except ImportError:
    pass

url = os.getenv("DATABASE_URL")
if not url:
    raise SystemExit("DATABASE_URL not set. Set it in backend/.env or the environment.")

sql = migration_file.read_text(encoding="utf-8")
from sqlalchemy import create_engine, text
engine = create_engine(url)
with engine.connect() as conn:
    conn.execute(text(sql))
    conn.commit()
print("Applied migration: export_email_queue table and indexes.")
