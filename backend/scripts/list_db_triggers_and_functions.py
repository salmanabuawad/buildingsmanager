"""List triggers and functions in public schema (read-only)."""
import sys
sys.path.insert(0, ".")
from app.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    r = conn.execute(text("""
        SELECT tgname, relname
        FROM pg_trigger t
        JOIN pg_class cl ON t.tgrelid = cl.oid
        JOIN pg_namespace n ON cl.relnamespace = n.oid
        WHERE n.nspname = 'public' AND NOT t.tgisinternal
        ORDER BY relname, tgname
    """))
    rows = r.fetchall()
    print("TRIGGERS:", len(rows))
    for row in rows:
        print(" ", row[0], "ON", row[1])
    r2 = conn.execute(text("""
        SELECT proname
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.prokind = 'f'
        ORDER BY proname
    """))
    funcs = r2.fetchall()
    print("FUNCTIONS:", len(funcs))
    for row in funcs:
        print(" ", row[0])
