#!/usr/bin/env bash
# Full local installation: create DB, run migrations, optional post-migration.
# Requires: PostgreSQL client (psql) in PATH.
# Usage:
#   PGPASSWORD=secret ./scripts/setup_local.sh
#   PGPASSWORD=secret ./scripts/setup_local.sh mydb localhost 5432 postgres

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STANDALONE="$REPO_ROOT/standalone"
MIGRATIONS="$REPO_ROOT/migrations"

DB_NAME="${1:-buildingsmanager}"
PG_HOST="${2:-localhost}"
PG_PORT="${3:-5432}"
PG_USER="${4:-postgres}"
PG_PASSWORD="${PGPASSWORD}"
SKIP_POST="${SKIP_POST_MIGRATION:-}"
FORCE="${FORCE_RECREATE:-}"

if [ -z "$PG_PASSWORD" ]; then
  echo "Set PGPASSWORD or pass it when running."
  exit 1
fi

BASE_CONN="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/postgres"
TARGET_CONN="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${DB_NAME}"

echo "Target database: $DB_NAME on $PG_HOST:$PG_PORT"

if [ -n "$FORCE" ]; then
  echo "Dropping existing database (if any)..."
  psql "$BASE_CONN" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" 2>/dev/null || true
  psql "$BASE_CONN" -c "DROP DATABASE IF EXISTS \"$DB_NAME\";"
fi

echo "Creating database (if not exists)..."
EXISTS=$(psql "$BASE_CONN" -t -A -c "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" 2>/dev/null || echo "")
if [ "$EXISTS" != "1" ]; then
  psql "$BASE_CONN" -c "CREATE DATABASE \"$DB_NAME\";"
  echo "Created database $DB_NAME"
else
  echo "Database $DB_NAME already exists."
fi

echo "Running 00_extensions_and_roles.sql..."
psql "$TARGET_CONN" -f "$STANDALONE/00_extensions_and_roles.sql"

echo "Applying migrations..."
export DATABASE_URL="$TARGET_CONN"
"$REPO_ROOT/standalone/apply_migrations.sh"
if [ $? -ne 0 ]; then exit 1; fi

if [ -z "$SKIP_POST" ]; then
  echo "Running post_migration_standalone.sql..."
  psql "$TARGET_CONN" -f "$STANDALONE/post_migration_standalone.sql"
fi

echo ""
echo "Done. Set in backend/.env:"
echo "  DATABASE_URL=$TARGET_CONN"
echo ""
echo "Then start backend:  cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
echo "And frontend:        npm run dev"
