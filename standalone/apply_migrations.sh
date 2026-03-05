#!/usr/bin/env bash
# Apply all Supabase migrations to a standalone Postgres database in order.
# Usage: DATABASE_URL="postgresql://user:pass@host:5432/dbname" ./apply_migrations.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-$REPO_ROOT/migrations}"

if [ -z "${DATABASE_URL}" ]; then
  echo "Error: set DATABASE_URL" >&2
  exit 1
fi

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "Error: migrations dir not found: $MIGRATIONS_DIR" >&2
  exit 1
fi

# Skip optional/data-only files
skip="import_asset_types_latest.sql"
count=0
while IFS= read -r -d '' f; do
  name=$(basename "$f")
  if [[ " $skip " == *" $name "* ]]; then
    echo "Skipping: $name"
    continue
  fi
  echo "Applying: $name"
  if ! psql "$DATABASE_URL" -f "$f"; then
    echo "Failed: $f" >&2
    exit 1
  fi
  ((count++)) || true
done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -name "*.sql" -print0 | sort -z)

echo "Applied $count migrations."
