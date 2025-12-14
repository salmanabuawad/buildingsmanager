-- ============================================================================
-- Export Public Schema Tables, Field Names, and Types to CSV
-- Run this with: psql -d your_database -f export_tables_fields_types.sql
-- ============================================================================

\copy (
    SELECT 
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
    ORDER BY table_name, ordinal_position
) TO 'tables_fields_types.csv' WITH CSV HEADER;
