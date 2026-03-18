#!/bin/bash
# Replace data on the new server with the exported dump.
# Run on the new server. Requires: DB_NAME, DB_USER; optional: PGPASSWORD, PGHOST, PGPORT
# Usage: DB_NAME=... DB_USER=... ./import-replace-data.sh [path/to/buildingsmanager_data_export.sql]

set -e
DUMP_FILE="${1:-./buildingsmanager_data_export.sql}"
DB_NAME="${DB_NAME:?Set DB_NAME}"
DB_USER="${DB_USER:?Set DB_USER}"
export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"

if [ ! -f "$DUMP_FILE" ]; then
  echo "Dump file not found: $DUMP_FILE"
  exit 1
fi

# Tables we will truncate (same set as export). CASCADE will truncate dependent tables.
TABLES=(
  audit
  change_log
  asset_files
  assets_history
  assets
  buildings
  field_configurations
  asset_type_fields
  validation_rules
  address_list
  asset_types
  system_configuration
  user_roles
  users
)

echo "WARNING: This will REPLACE all data in the listed tables in database: $DB_NAME"
echo "Dump file: $DUMP_FILE"
read -p "Continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

# Truncate in one go; CASCADE handles FKs. RESTART IDENTITY resets sequences.
TABLES_LIST=$(IFS=,; echo "${TABLES[*]}")
psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "TRUNCATE $TABLES_LIST RESTART IDENTITY CASCADE;"

echo "Loading data from dump..."
psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$DUMP_FILE"

echo "Done. Data replaced. Restart the backend service if it is running."
