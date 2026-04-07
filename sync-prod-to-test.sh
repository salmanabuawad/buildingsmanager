#!/bin/bash
# sync-prod-to-test.sh
# 1. Align test DB schema to match production (adds missing columns)
# 2. Copy all data from production → test (using common columns per table)
# 3. Preserve test 'tester' user so tests keep working

set -e

REMOTE_USER="root"
REMOTE_HOST="profile.wavelync.com"
SSH_KEY="$HOME/.ssh/id_ed25519"

echo "=========================================="
echo "  Prod → Test DB Sync"
echo "  buildingsmanager → buildingsmanager_test"
echo "=========================================="
echo ""

# Upload and run the Python sync script on the server (must run as postgres for peer auth)
ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" "sudo -u postgres python3" << 'PYEOF'
import psycopg2
import psycopg2.extras
import psycopg2.extensions
import json
import sys

PROD_DSN = "dbname=buildingsmanager user=postgres"
TEST_DSN = "dbname=buildingsmanager_test user=postgres"

# Tables to sync in FK-safe order (dependencies first)
SYNC_TABLES = [
    "users",
    "asset_types",
    "operators",
    "managers",
    "address_list",
    "system_configuration",
    "field_configurations",
    "validation_rules",
    "buildings",
    "assets",
    "asset_files",
    "assets_history",
    "audit",
    "inspection_tasks",
    "inspection_reports",
    "inspection_report_files",
    "inspection_task_history",
    "inspection_task_access_tokens",
    "inspector_otp_codes",
    "change_log",
]

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def get_columns(cur, table):
    cur.execute("""
        SELECT column_name, data_type, udt_name
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name=%s
        ORDER BY ordinal_position
    """, (table,))
    return {row[0]: (row[1], row[2]) for row in cur.fetchall()}


def table_exists(cur, table):
    cur.execute("SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=%s", (table,))
    return cur.fetchone() is not None


def get_pk(cur, table):
    cur.execute("""
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema='public' AND tc.table_name=%s
        ORDER BY kcu.ordinal_position
    """, (table,))
    return [r[0] for r in cur.fetchall()]


# ---------------------------------------------------------------------------
# Step 1: Align test schema → add missing columns from production
# ---------------------------------------------------------------------------
print("[1/4] Aligning test schema to production...")

prod_conn = psycopg2.connect(PROD_DSN)
test_conn = psycopg2.connect(TEST_DSN)
prod_conn.autocommit = True
test_conn.autocommit = True
prod_cur = prod_conn.cursor()
test_cur = test_conn.cursor()

for table in SYNC_TABLES:
    if not table_exists(prod_cur, table) or not table_exists(test_cur, table):
        continue
    prod_cols = get_columns(prod_cur, table)
    test_cols = get_columns(test_cur, table)
    missing = {c: t for c, t in prod_cols.items() if c not in test_cols}
    if missing:
        print(f"  {table}: adding {list(missing.keys())}")
        for col, (dtype, udt) in missing.items():
            # Map postgres type to DDL
            if dtype == 'integer':                ddl_type = 'integer'
            elif dtype == 'bigint':
                ddl_type = 'bigint'
            elif dtype == 'numeric':
                ddl_type = 'numeric'
            elif dtype == 'boolean':
                ddl_type = 'boolean'
            elif dtype == 'text':
                ddl_type = 'text'
            elif dtype == 'timestamp with time zone':
                ddl_type = 'timestamptz'
            elif dtype == 'ARRAY':
                ddl_type = f'{udt[1:]}[]'  # strip leading underscore
            else:
                ddl_type = 'text'
            try:
                test_cur.execute(f'ALTER TABLE "{table}" ADD COLUMN IF NOT EXISTS "{col}" {ddl_type}')
                print(f"    + {col} {ddl_type}")
            except Exception as e:
                print(f"    ✗ Could not add {col}: {e}")

print("  Schema alignment done.")

# ---------------------------------------------------------------------------
# Step 2: Save tester user credentials
# ---------------------------------------------------------------------------
print("[2/4] Saving tester user...")
test_cur.execute("SELECT user_id, user_name, user_email, user_role, password_hash, active, full_name FROM users WHERE user_name='tester' LIMIT 1")
tester_row = test_cur.fetchone()
if tester_row:
    print(f"  Saved tester (user_id={tester_row[0]})")

# ---------------------------------------------------------------------------
# Step 3: Truncate test tables, then copy from production
# ---------------------------------------------------------------------------
print("[3/4] Copying data from production...")

# Disable FK checks for the session
test_cur.execute("SET session_replication_role = replica")

# Truncate in reverse dependency order
rev_tables = list(reversed(SYNC_TABLES))
for table in rev_tables:
    if table_exists(test_cur, table):
        try:
            test_cur.execute(f'TRUNCATE TABLE "{table}" CASCADE')
        except Exception as e:
            print(f"  ✗ Truncate {table}: {e}")

# Copy each table
for table in SYNC_TABLES:
    if not table_exists(prod_cur, table):
        print(f"  · {table}: not in production, skipped")
        continue
    if not table_exists(test_cur, table):
        print(f"  · {table}: not in test DB, skipped")
        continue

    prod_cols = get_columns(prod_cur, table)
    test_cols = get_columns(test_cur, table)
    common = [c for c in prod_cols if c in test_cols]

    if not common:
        print(f"  · {table}: no common columns, skipped")
        continue

    # Count rows
    prod_cur.execute(f'SELECT COUNT(*) FROM "{table}"')
    count = prod_cur.fetchone()[0]
    if count == 0:
        print(f"  · {table}: empty")
        continue

    print(f"  → {table}: {count} rows ({len(common)} common columns)")

    # Fetch from prod
    cols_sql = ", ".join(f'"{c}"' for c in common)
    prod_cur.execute(f'SELECT {cols_sql} FROM "{table}"')
    rows = prod_cur.fetchall()

    # Serialize any dict/list values (JSONB → text columns)
    def _adapt(v):
        if isinstance(v, (dict, list)):
            return json.dumps(v, ensure_ascii=False)
        return v
    rows = [tuple(_adapt(v) for v in row) for row in rows]

    # Insert into test using executemany
    placeholders = ", ".join(["%s"] * len(common))
    insert_sql = f'INSERT INTO "{table}" ({cols_sql}) VALUES ({placeholders}) ON CONFLICT DO NOTHING'
    try:
        psycopg2.extras.execute_batch(test_cur, insert_sql, rows, page_size=500)
        print(f"     inserted {len(rows)} rows")
    except Exception as e:
        print(f"  ✗ Failed {table}: {e}")
        test_conn.rollback()
        test_cur.execute("SET session_replication_role = replica")

# Re-enable FK
test_cur.execute("SET session_replication_role = DEFAULT")

# ---------------------------------------------------------------------------
# Step 4: Restore tester user
# ---------------------------------------------------------------------------
print("[4/4] Restoring tester user...")
# Remove any production user named 'tester' (different user_id) to avoid conflict
test_cur.execute("DELETE FROM users WHERE user_name='tester'")
if tester_row:
    uid, uname, uemail, urole, phash, active, fname = tester_row
    test_cur.execute("""
        INSERT INTO users (user_id, user_name, user_email, user_role, password_hash, active, full_name)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (user_id) DO UPDATE SET
            user_name     = EXCLUDED.user_name,
            user_role     = EXCLUDED.user_role,
            password_hash = EXCLUDED.password_hash,
            active        = EXCLUDED.active
    """, (uid, uname, uemail, urole, phash, active, fname))
    print(f"  tester restored (user_id={uid})")
else:
    # No existing tester — create one with default password tester123
    test_cur.execute("""
        INSERT INTO users (user_name, user_email, user_role, password_hash, active)
        VALUES ('tester', 'tester@test.local', 'admin',
          '$2b$12$/SqfQVJipThvoxsiLCKATOzzClsV3ZFbtwAS2jQBN74oyfingqFS6', TRUE)
        ON CONFLICT (user_name) DO UPDATE SET user_role='admin', active=TRUE
    """)
    print("  tester user created with default password")

# Reset sequences
print("  Resetting sequences...")
seqs = [
    ("users_user_id_seq",           "users",              "user_id"),
    ("asset_types_id_seq",          "asset_types",        "id"),
    ("operators_operator_id_seq",   "operators",          "operator_id"),
    ("managers_manager_id_seq",     "managers",           "manager_id"),
    ("address_list_id_seq",         "address_list",       "id"),
    ("asset_files_id_seq",          "asset_files",        "id"),
    ("inspection_tasks_id_seq",     "inspection_tasks",   "id"),
    ("inspection_reports_id_seq",   "inspection_reports", "id"),
    ("system_configuration_id_seq", "system_configuration", "id"),
]
for seq, tbl, col in seqs:
    try:
        test_cur.execute(f"SELECT setval('{seq}', COALESCE((SELECT MAX(\"{col}\") FROM \"{tbl}\"), 1))")
    except Exception:
        pass

# ---------------------------------------------------------------------------
# Final verification
# ---------------------------------------------------------------------------
print("\n=== Final counts (test DB) ===")
for table in ["buildings","assets","asset_types","operators","managers",
              "address_list","asset_files","audit","assets_history",
              "field_configurations","users"]:
    if table_exists(test_cur, table):
        test_cur.execute(f'SELECT COUNT(*) FROM "{table}"')
        n = test_cur.fetchone()[0]
        print(f"  {table:<30} {n}")

prod_conn.close()
test_conn.close()
print("\n==========================================")
print("  Sync complete!")
print("==========================================")
PYEOF
