-- ============================================================================
-- Compare current database schema with code expectations
-- This script identifies missing columns and other discrepancies
-- ============================================================================

-- Check asset_types table columns
DO $$
DECLARE
  missing_columns text[] := ARRAY[]::text[];
  expected_columns text[] := ARRAY[
    'non_accountable_for_total_area',
    'non_accountable_for_distribution'
  ];
  col text;
BEGIN
  RAISE NOTICE '=== Checking asset_types table ===';
  
  FOREACH col IN ARRAY expected_columns
  LOOP
    IF NOT EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_schema = 'public'
        AND table_name = 'asset_types' 
        AND column_name = col
    ) THEN
      missing_columns := array_append(missing_columns, col);
      RAISE NOTICE 'MISSING: asset_types.%', col;
    ELSE
      RAISE NOTICE 'FOUND: asset_types.%', col;
    END IF;
  END LOOP;
  
  IF array_length(missing_columns, 1) > 0 THEN
    RAISE NOTICE 'Total missing columns in asset_types: %', array_length(missing_columns, 1);
  ELSE
    RAISE NOTICE 'All expected columns found in asset_types';
  END IF;
END $$;

-- Check assets table columns
DO $$
DECLARE
  missing_columns text[] := ARRAY[]::text[];
  expected_columns text[] := ARRAY[
    'business_distribution_area',
    'action_id'
  ];
  col text;
BEGIN
  RAISE NOTICE '=== Checking assets table ===';
  
  FOREACH col IN ARRAY expected_columns
  LOOP
    IF NOT EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_schema = 'public'
        AND table_name = 'assets' 
        AND column_name = col
    ) THEN
      missing_columns := array_append(missing_columns, col);
      RAISE NOTICE 'MISSING: assets.%', col;
    ELSE
      RAISE NOTICE 'FOUND: assets.%', col;
    END IF;
  END LOOP;
  
  IF array_length(missing_columns, 1) > 0 THEN
    RAISE NOTICE 'Total missing columns in assets: %', array_length(missing_columns, 1);
  ELSE
    RAISE NOTICE 'All expected columns found in assets';
  END IF;
END $$;

-- Check assets_history table columns
DO $$
DECLARE
  missing_columns text[] := ARRAY[]::text[];
  expected_columns text[] := ARRAY[
    'business_distribution_area',
    'action_id'
  ];
  col text;
BEGIN
  RAISE NOTICE '=== Checking assets_history table ===';
  
  FOREACH col IN ARRAY expected_columns
  LOOP
    IF NOT EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_schema = 'public'
        AND table_name = 'assets_history' 
        AND column_name = col
    ) THEN
      missing_columns := array_append(missing_columns, col);
      RAISE NOTICE 'MISSING: assets_history.%', col;
    ELSE
      RAISE NOTICE 'FOUND: assets_history.%', col;
    END IF;
  END LOOP;
  
  IF array_length(missing_columns, 1) > 0 THEN
    RAISE NOTICE 'Total missing columns in assets_history: %', array_length(missing_columns, 1);
  ELSE
    RAISE NOTICE 'All expected columns found in assets_history';
  END IF;
END $$;

-- Check buildings table columns
DO $$
DECLARE
  missing_columns text[] := ARRAY[]::text[];
  expected_columns text[] := ARRAY[
    'residence_shared_area_distributed',
    'business_shared_area_distributed',
    'action_id'
  ];
  col text;
BEGIN
  RAISE NOTICE '=== Checking buildings table ===';
  
  FOREACH col IN ARRAY expected_columns
  LOOP
    IF NOT EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_schema = 'public'
        AND table_name = 'buildings' 
        AND column_name = col
    ) THEN
      missing_columns := array_append(missing_columns, col);
      RAISE NOTICE 'MISSING: buildings.%', col;
    ELSE
      RAISE NOTICE 'FOUND: buildings.%', col;
    END IF;
  END LOOP;
  
  IF array_length(missing_columns, 1) > 0 THEN
    RAISE NOTICE 'Total missing columns in buildings: %', array_length(missing_columns, 1);
  ELSE
    RAISE NOTICE 'All expected columns found in buildings';
  END IF;
END $$;

-- Check for foreign key constraints
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
  RAISE NOTICE '=== Checking foreign key constraints ===';
  
  FOREACH constraint_name IN ARRAY expected_constraints
  LOOP
    IF NOT EXISTS (
      SELECT 1 
      FROM pg_constraint 
      WHERE conname = constraint_name
    ) THEN
      missing_constraints := array_append(missing_constraints, constraint_name);
      RAISE NOTICE 'MISSING CONSTRAINT: %', constraint_name;
    ELSE
      RAISE NOTICE 'FOUND CONSTRAINT: %', constraint_name;
    END IF;
  END LOOP;
  
  IF array_length(missing_constraints, 1) > 0 THEN
    RAISE NOTICE 'Total missing constraints: %', array_length(missing_constraints, 1);
  ELSE
    RAISE NOTICE 'All expected constraints found';
  END IF;
END $$;

-- Summary: List all columns in asset_types for comparison
SELECT 
  'asset_types' as table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'asset_types'
ORDER BY ordinal_position;

