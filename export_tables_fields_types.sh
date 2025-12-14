#!/bin/bash
# Bash script to export tables, fields, and types to CSV
# Usage: ./export_tables_fields_types.sh

# Database connection parameters - UPDATE THESE
DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="your_database"
DB_USER="your_user"
DB_PASSWORD="your_password"

# Output file
OUTPUT_FILE="tables_fields_types.csv"

# SQL query
QUERY="SELECT 
    table_name,
    column_name as field_name,
    CASE 
        WHEN character_maximum_length IS NOT NULL 
        THEN data_type || '(' || character_maximum_length || ')'
        WHEN numeric_precision IS NOT NULL AND numeric_scale IS NOT NULL
        THEN data_type || '(' || numeric_precision || ',' || numeric_scale || ')'
        WHEN numeric_precision IS NOT NULL
        THEN data_type || '(' || numeric_precision || ')'
        ELSE data_type
    END as field_type
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;"

# Export using psql
export PGPASSWORD=$DB_PASSWORD

echo "Exporting tables, fields, and types to $OUTPUT_FILE..."

psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "COPY ($QUERY) TO STDOUT WITH CSV HEADER" -o $OUTPUT_FILE

if [ $? -eq 0 ]; then
    echo "Export completed successfully! File saved to: $OUTPUT_FILE"
else
    echo "Export failed. Please check your database connection parameters."
fi

unset PGPASSWORD
