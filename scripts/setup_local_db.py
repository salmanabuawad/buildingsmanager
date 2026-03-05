"""
Full local DB setup without psql: create database, run extensions/roles, apply all migrations, post-migration.
Requires: PostgreSQL running, psycopg2 (pip install psycopg2-binary).
Usage:
  set PGPASSWORD=postgres
  python scripts/setup_local_db.py
  python scripts/setup_local_db.py --dbname buildingsmanager --host localhost --user postgres --password postgres
"""
import os
import sys
import argparse

try:
    import psycopg2
    from psycopg2 import sql
    from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
except ImportError:
    print("Install psycopg2-binary: pip install psycopg2-binary")
    sys.exit(1)

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STANDALONE = os.path.join(REPO_ROOT, "standalone")
MIGRATIONS = os.path.join(REPO_ROOT, "migrations")
SEED_DIR = os.path.join(STANDALONE, "seed")
SKIP_FILES = {
    # Supabase-only (storage/auth)
    "20260126035251_create_storage_bucket_structure_drawings_v2.sql",
    "20260126183451_20260126035251_create_storage_bucket_structure_drawings_v2.sql",
    "20260126040000_add_storage_rls_policies.sql",
    "20260126183515_20260126040000_add_storage_rls_policies.sql",
    "20260131000002_create_storage_bucket_dwg_files.sql",
    "20260131000003_add_storage_rls_policies_dwg_files.sql",
    "20260131000004_ensure_all_storage_buckets_exist.sql",
    "20260208000000_add_document_file_types_to_storage_buckets.sql",
    # Column already text in consolidated path
    "20260126212743_change_export_to_automation_at_to_text_ddmmyyyy.sql",
    # Meta-script (uses \i), not a standalone migration
    "install_fresh_database.sql",
}
# Migrations that often fail on standalone (multiple overloads, etc.) - script continues and skips them
OPTIONAL_SKIP = set()  # script now continues on error instead of exiting


def main():
    p = argparse.ArgumentParser(description="Setup local Postgres for buildingsmanager")
    p.add_argument("--dbname", default="buildingsmanager")
    p.add_argument("--host", default="localhost")
    p.add_argument("--port", type=int, default=5432)
    p.add_argument("--user", default="postgres")
    p.add_argument("--password", default=os.environ.get("PGPASSWORD"))
    p.add_argument("--force", action="store_true", help="Drop and recreate DB")
    p.add_argument("--skip-post", action="store_true", help="Skip post_migration_standalone.sql")
    p.add_argument("--seed", action="store_true", help="Apply standalone/seed/*.sql after migrations (if present)")
    args = p.parse_args()
    if not args.password:
        print("Set PGPASSWORD or pass --password")
        sys.exit(1)

    base_conn_str = f"host={args.host} port={args.port} user={args.user} password={args.password} dbname=postgres"
    target_conn_str = f"host={args.host} port={args.port} user={args.user} password={args.password} dbname={args.dbname}"

    print(f"Target database: {args.dbname} on {args.host}:{args.port}")

    # Create DB
    conn = psycopg2.connect(base_conn_str)
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cur = conn.cursor()
    if args.force:
        print("Terminating connections and dropping DB...")
        cur.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = %s AND pid <> pg_backend_pid()",
            (args.dbname,),
        )
        cur.execute(sql.SQL("DROP DATABASE IF EXISTS {}").format(sql.Identifier(args.dbname)))
    cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (args.dbname,))
    if not cur.fetchone():
        cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(args.dbname)))
        print(f"Created database {args.dbname}")
    else:
        print(f"Database {args.dbname} already exists.")
    cur.close()
    conn.close()

    def run_sql_file(conn, path):
        with open(path, "r", encoding="utf-8-sig", errors="replace") as f:
            content = f.read()
        cur = conn.cursor()
        try:
            cur.execute(content)
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            raise e
        cur.close()

    # Extensions and roles
    print("Running 00_extensions_and_roles.sql...")
    conn = psycopg2.connect(target_conn_str)
    run_sql_file(conn, os.path.join(STANDALONE, "00_extensions_and_roles.sql"))
    conn.close()

    # Migrations: run consolidated initial first, then all migrations newer than it
    if not os.path.isdir(MIGRATIONS):
        print("Migrations folder not found:", MIGRATIONS)
        sys.exit(1)
    all_files = sorted(f for f in os.listdir(MIGRATIONS) if f.endswith(".sql") and f not in SKIP_FILES)
    consolidated = "20260101000000_consolidated_initial_schema.sql"
    if consolidated in all_files:
        # Base: consolidated schema only (avoids conflict between old initial_schema and add_distribution_audit)
        run_first = [consolidated]
        rest = [f for f in all_files if f != consolidated and f > consolidated]
        files = run_first + rest
    else:
        files = all_files
    print(f"Applying {len(files)} migrations (consolidated base + newer)...")
    conn = psycopg2.connect(target_conn_str)
    failed = []
    for name in files:
        path = os.path.join(MIGRATIONS, name)
        try:
            run_sql_file(conn, path)
            print("  OK:", name)
        except Exception as e:
            err = str(e).encode("ascii", errors="replace").decode("ascii")[:80]
            print("  SKIP (standalone):", name, "-", err)
            failed.append((name, str(e)))
    conn.close()
    if failed:
        print(f"\nSkipped {len(failed)} migrations (Supabase-specific or order-dependent). DB is still usable.")

    # Post-migration
    if not args.skip_post:
        print("Running post_migration_standalone.sql...")
        conn = psycopg2.connect(target_conn_str)
        run_sql_file(conn, os.path.join(STANDALONE, "post_migration_standalone.sql"))
        conn.close()

    # Optional: apply seed data (standalone/seed/*.sql)
    if args.seed and os.path.isdir(SEED_DIR):
        seed_files = sorted(f for f in os.listdir(SEED_DIR) if f.endswith(".sql"))
        if seed_files:
            print(f"Applying seed ({len(seed_files)} files)...")
            conn = psycopg2.connect(target_conn_str)
            for name in seed_files:
                path = os.path.join(SEED_DIR, name)
                with open(path, "r", encoding="utf-8-sig", errors="replace") as f:
                    content = f.read()
                cur = conn.cursor()
                try:
                    cur.execute(content)
                    conn.commit()
                    print("  OK:", name)
                except Exception as e:
                    conn.rollback()
                    print("  SKIP:", name, "-", str(e).encode("ascii", errors="replace").decode("ascii")[:60])
                finally:
                    cur.close()
            conn.close()

    url = f"postgresql://{args.user}:{args.password}@{args.host}:{args.port}/{args.dbname}"
    print("")
    print("Done. Set in backend/.env:")
    print("  DATABASE_URL=" + url)
    print("")
    print("Then: cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000")
    print("      python scripts/create_local_admin.py admin admin admin@local.dev admin")
    print("      (from repo root) npm install && npm run dev")


if __name__ == "__main__":
    main()
