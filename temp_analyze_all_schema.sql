-- ============================================================================
-- Comprehensive analysis of all tables, triggers, and functions
-- Checks for missing columns, old column names, and function issues
-- ============================================================================

-- Summary: List all tables
SELECT 
  'TABLES' as category,
  COUNT(DISTINCT table_name) as count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';

-- Summary: List all functions
SELECT 
  'FUNCTIONS' as category,
  COUNT(*) as count
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prokind IN ('f', 'p');

-- Summary: List all triggers
SELECT 
  'TRIGGERS' as category,
  COUNT(*) as count
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal;

-- ============================================================================
-- Check for old column names that should be removed
-- ============================================================================

-- Check for not_accountable in asset_types
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
      AND table_name = 'asset_types' 
      AND column_name = 'not_accountable'
  ) THEN
    RAISE NOTICE 'WARNING: Old column not_accountable still exists in asset_types (should be removed)';
  ELSE
    RAISE NOTICE 'OK: Old column not_accountable does not exist in asset_types';
  END IF;
END $$;

-- Check for distribution_area in assets (should be business_distribution_area)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
      AND table_name = 'assets' 
      AND column_name = 'distribution_area'
  ) THEN
    RAISE NOTICE 'WARNING: Old column distribution_area still exists in assets (should be business_distribution_area)';
  ELSE
    RAISE NOTICE 'OK: Old column distribution_area does not exist in assets';
  END IF;
END $$;

-- Check for distribution_area in assets_history
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
      AND table_name = 'assets_history' 
      AND column_name = 'distribution_area'
  ) THEN
    RAISE NOTICE 'WARNING: Old column distribution_area still exists in assets_history (should be business_distribution_area)';
  ELSE
    RAISE NOTICE 'OK: Old column distribution_area does not exist in assets_history';
  END IF;
END $$;

-- ============================================================================
-- Check for required columns in key tables
-- ============================================================================

-- Check asset_types table
DO $$
DECLARE
  missing_cols text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'asset_types' 
    AND column_name = 'non_accountable_for_total_area'
  ) THEN
    missing_cols := array_append(missing_cols, 'non_accountable_for_total_area');
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'asset_types' 
    AND column_name = 'non_accountable_for_distribution'
  ) THEN
    missing_cols := array_append(missing_cols, 'non_accountable_for_distribution');
  END IF;
  
  IF array_length(missing_cols, 1) > 0 THEN
    RAISE WARNING 'MISSING columns in asset_types: %', array_to_string(missing_cols, ', ');
  ELSE
    RAISE NOTICE 'OK: All required columns exist in asset_types';
  END IF;
END $$;

-- Check assets table
DO $$
DECLARE
  missing_cols text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'assets' 
    AND column_name = 'business_distribution_area'
  ) THEN
    missing_cols := array_append(missing_cols, 'business_distribution_area');
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'assets' 
    AND column_name = 'action_id'
  ) THEN
    missing_cols := array_append(missing_cols, 'action_id');
  END IF;
  
  IF array_length(missing_cols, 1) > 0 THEN
    RAISE WARNING 'MISSING columns in assets: %', array_to_string(missing_cols, ', ');
  ELSE
    RAISE NOTICE 'OK: All required columns exist in assets';
  END IF;
END $$;

-- Check assets_history table
DO $$
DECLARE
  missing_cols text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'assets_history' 
    AND column_name = 'business_distribution_area'
  ) THEN
    missing_cols := array_append(missing_cols, 'business_distribution_area');
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'assets_history' 
    AND column_name = 'action_id'
  ) THEN
    missing_cols := array_append(missing_cols, 'action_id');
  END IF;
  
  IF array_length(missing_cols, 1) > 0 THEN
    RAISE WARNING 'MISSING columns in assets_history: %', array_to_string(missing_cols, ', ');
  ELSE
    RAISE NOTICE 'OK: All required columns exist in assets_history';
  END IF;
END $$;

-- Check buildings table
DO $$
DECLARE
  missing_cols text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'buildings' 
    AND column_name = 'residence_shared_area_distributed'
  ) THEN
    missing_cols := array_append(missing_cols, 'residence_shared_area_distributed');
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'buildings' 
    AND column_name = 'business_shared_area_distributed'
  ) THEN
    missing_cols := array_append(missing_cols, 'business_shared_area_distributed');
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'buildings' 
    AND column_name = 'action_id'
  ) THEN
    missing_cols := array_append(missing_cols, 'action_id');
  END IF;
  
  IF array_length(missing_cols, 1) > 0 THEN
    RAISE WARNING 'MISSING columns in buildings: %', array_to_string(missing_cols, ', ');
  ELSE
    RAISE NOTICE 'OK: All required columns exist in buildings';
  END IF;
END $$;

-- ============================================================================
-- Check for foreign key constraints
-- ============================================================================

DO $$
DECLARE
  missing_constraints text[] := ARRAY[]::text[];
  expected_constraints text[] := ARRAY[
    'fk_audit_user_id',
    'assets_action_id_fkey',
    'buildings_action_id_fkey',
    'assets_history_action_id_fkey',
    'fk_change_log_user_id'
  ];
  constraint_name text;
BEGIN
  FOREACH constraint_name IN ARRAY expected_constraints
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = constraint_name
    ) THEN
      missing_constraints := array_append(missing_constraints, constraint_name);
    END IF;
  END LOOP;
  
  IF array_length(missing_constraints, 1) > 0 THEN
    RAISE WARNING 'MISSING foreign key constraints: %', array_to_string(missing_constraints, ', ');
  ELSE
    RAISE NOTICE 'OK: All required foreign key constraints exist';
  END IF;
END $$;

-- ============================================================================
-- Check update_building_total_area function for correct column name
-- ============================================================================

DO $$
DECLARE
  func_def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO func_def
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'update_building_total_area';
  
  IF func_def IS NULL THEN
    RAISE WARNING 'Function update_building_total_area does not exist';
  ELSIF func_def LIKE '%not_accountable%' AND func_def NOT LIKE '%non_accountable_for_total_area%' THEN
    RAISE WARNING 'Function update_building_total_area uses old column name (not_accountable)';
  ELSIF func_def LIKE '%non_accountable_for_total_area%' THEN
    RAISE NOTICE 'OK: Function update_building_total_area uses correct column name';
  ELSE
    RAISE NOTICE 'INFO: Function update_building_total_area does not reference non_accountable columns';
  END IF;
END $$;

-- ============================================================================
-- List all tables with their column counts
-- ============================================================================

SELECT 
  'TABLE' as type,
  table_name,
  COUNT(*) as column_count
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name NOT LIKE 'pg_%'
GROUP BY table_name
ORDER BY table_name;

-- ============================================================================
-- List all functions
-- ============================================================================

SELECT 
  'FUNCTION' as type,
  n.nspname || '.' || p.proname || '(' || 
  COALESCE(pg_get_function_arguments(p.oid), '') || ')' as function_name,
  pg_get_function_result(p.oid) as return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prokind IN ('f', 'p')
ORDER BY p.proname;

-- ============================================================================
-- List all triggers
-- ============================================================================

SELECT 
  'TRIGGER' as type,
  n.nspname || '.' || c.relname || '.' || t.tgname as trigger_name,
  CASE 
    WHEN t.tgtype & 2 = 2 THEN 'BEFORE'
    WHEN t.tgtype & 64 = 64 THEN 'INSTEAD OF'
    ELSE 'AFTER'
  END as timing,
  CASE WHEN t.tgtype & 4 = 4 THEN 'ROW' ELSE 'STATEMENT' END as level
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;

