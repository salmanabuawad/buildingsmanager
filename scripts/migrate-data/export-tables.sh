#!/bin/bash
# Export buildings, assets, asset_files, assets_history, audit and related tables (data only)
# from the source Postgres. Run on the source server or via SSH.
# Requires: DB_NAME, DB_USER; optional: PGPASSWORD, PGHOST, PGPORT

set -e
OUTPUT_FILE="${OUTPUT_FILE:-/tmp/buildingsmanager_data_export.sql}"
DB_NAME="${DB_NAME:?Set DB_NAME}"
DB_USER="${DB_USER:?Set DB_USER}"
export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"

# Tables to export (order doesn't matter for pg_dump --data-only)
TABLES=(
  address_list
  asset_types
  validation_rules
  buildings
  assets
  assets_history
  field_configurations
  asset_type_fields
  users
  user_roles
  audit
  change_log
  asset_files
  system_configuration
)

echo "Exporting data from database: $DB_NAME (user: $DB_USER)"
echo "Output: $OUTPUT_FILE"

# Build --table args
TABLE_ARGS=()
for t in "${TABLES[@]}"; do
  TABLE_ARGS+=(--table="$t")
done

# Data only; insert format so we can edit if needed
pg_dump \
  --data-only \
  --no-owner \
  --no-acl \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  "${TABLE_ARGS[@]}" \
  -f "$OUTPUT_FILE"

echo "Done. Dump saved to: $OUTPUT_FILE"
ls -la "$OUTPUT_FILE"
