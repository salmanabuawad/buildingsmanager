#!/bin/bash
# Temporary script to run all migrations in order
# Usage: ./run_all_migrations.sh [database_url]

set -e  # Exit on error

MIGRATIONS_DIR="supabase/migrations"
DB_URL="${1:-postgresql://postgres:postgres@localhost:5432/postgres}"

echo "Running all migrations from $MIGRATIONS_DIR"
echo "Database URL: $DB_URL"
echo ""

# Get all migration files sorted by name (timestamp)
MIGRATION_FILES=$(ls -1 "$MIGRATIONS_DIR"/*.sql | sort)

for migration_file in $MIGRATION_FILES; do
    filename=$(basename "$migration_file")
    echo "Running migration: $filename"
    
    # Execute the migration file
    psql "$DB_URL" -f "$migration_file"
    
    if [ $? -eq 0 ]; then
        echo "  ✓ Success"
    else
        echo "  ✗ Failed!"
        exit 1
    fi
    echo ""
done

echo "All migrations completed successfully!"

