-- ============================================================================
-- Add functions and triggers to schema export
-- ============================================================================
-- This migration extends the schema export to include database functions and triggers
-- by modifying get_tables_fields_types to return a unified format that includes
-- tables/columns, functions, and triggers

-- Extend get_tables_fields_types to include functions and triggers
-- Returns: table_name (object_type), field_name (object_name), field_type (object_definition)
CREATE OR REPLACE FUNCTION get_tables_fields_types()
RETURNS TABLE (
    table_name text,
    field_name text,
    field_type text
) AS $$
BEGIN
    -- Return tables/columns (existing functionality)
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
    
    -- Return functions (as rows with table_name='FUNCTION')
    RETURN QUERY
    SELECT 
        'FUNCTION'::text as table_name,
        (n.nspname || '.' || p.proname || '(' || 
         COALESCE(pg_get_function_arguments(p.oid), '') || ')')::text as field_name,
        pg_get_functiondef(p.oid)::text as field_type  -- Full function definition
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p') -- 'f' = function, 'p' = procedure
    ORDER BY p.proname;
    
    -- Return triggers (as rows with table_name='TRIGGER')
    RETURN QUERY
    SELECT 
        'TRIGGER'::text as table_name,
        (n.nspname || '.' || quote_ident(c.relname) || '.' || t.tgname)::text as field_name,
        ('CREATE TRIGGER ' || quote_ident(t.tgname) || 
         CASE 
           WHEN t.tgtype & 2 = 2 THEN ' BEFORE'
           WHEN t.tgtype & 64 = 64 THEN ' INSTEAD OF'
           ELSE ' AFTER'
         END ||
         ' ON ' || quote_ident(n.nspname) || '.' || quote_ident(c.relname) ||
         ' FOR EACH ' || CASE WHEN t.tgtype & 4 = 4 THEN 'ROW' ELSE 'STATEMENT' END ||
         ' EXECUTE FUNCTION ' || quote_ident(COALESCE(pn.nspname, 'public')) || '.' || quote_ident(p.proname) || '()')::text as field_type
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    LEFT JOIN pg_proc p ON t.tgfoid = p.oid
    LEFT JOIN pg_namespace pn ON p.pronamespace = pn.oid
    WHERE n.nspname = 'public'
      AND NOT t.tgisinternal  -- Exclude internal triggers
    ORDER BY c.relname, t.tgname;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_tables_fields_types IS 'Returns all tables, field names, types, functions, and triggers from the public schema';

