"""Apply 20260249000000_drop_triggers_and_functions_supabase_truth.sql using backend DATABASE_URL."""
import os
import sys

_script_dir = os.path.dirname(os.path.abspath(__file__))
_backend_dir = os.path.dirname(_script_dir)
os.chdir(_backend_dir)
sys.path.insert(0, _backend_dir)

from app.database import engine

REPO_ROOT = os.path.dirname(_backend_dir)
# Can override with APPLY_MIGRATION env var, e.g. APPLY_MIGRATION=20260250000000_drop_app_functions_moved_to_python.sql
MIGRATION_NAME = os.environ.get("APPLY_MIGRATION", "20260250000000_drop_app_functions_moved_to_python.sql")
PATH = os.path.join(REPO_ROOT, "migrations", MIGRATION_NAME)


def main():
    with open(PATH, "r", encoding="utf-8-sig", errors="replace") as f:
        content = f.read()
    # Split into statements: drop comments-only lines, then by semicolon
    statements = []
    for line in content.split("\n"):
        line = line.strip()
        if not line or line.startswith("--"):
            continue
        statements.append(line)
    sql = " ".join(statements)
    # Split by ";" that is at end of a token (not inside parens - simple split)
    parts = [p.strip() for p in sql.split(";") if p.strip()]

    raw = engine.raw_connection()
    try:
        cur = raw.cursor()
        for stmt in parts:
            if not stmt:
                continue
            cur.execute(stmt + ";")
        raw.commit()
        print("Applied:", os.path.basename(PATH))
    except Exception as e:
        raw.rollback()
        raise
    finally:
        raw.close()


if __name__ == "__main__":
    main()
