-- ============================================================================
-- Create function to get tables, fields, and types from public schema
-- ============================================================================

CREATE OR REPLACE FUNCTION get_tables_fields_types()
RETURNS TABLE (
    table_name text,
    field_name text,
    field_type text
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.table_name::text,
        c.column_name::text as field_name,
        CASE 
            WHEN c.character_maximum_length IS NOT NULL 
            THEN c.data_type || '(' || c.character_maximum_length || ')'
            WHEN c.numeric_precision IS NOT NULL AND c.numeric_scale IS NOT NULL
            THEN c.data_type || '(' || c.numeric_precision || ',' || c.numeric_scale || ')'
            WHEN c.numeric_precision IS NOT NULL
            THEN c.data_type || '(' || c.numeric_precision || ')'
            ELSE c.data_type
        END::text as field_type
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
    ORDER BY c.table_name, c.ordinal_position;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_tables_fields_types IS 'Returns all tables, field names, and types from the public schema';
