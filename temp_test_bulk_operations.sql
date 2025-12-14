-- ============================================================================
-- TEMP SQL for Testing Bulk Operations with Transaction-Based Audit Collection
-- ============================================================================
-- This file can be run directly in the database to test the functions
-- and debug any issues with before/after data collection

-- First, let's check if the functions exist and their signatures
SELECT 
  proname as function_name,
  pg_get_function_arguments(oid) as arguments,
  pg_get_functiondef(oid) as definition
FROM pg_proc
WHERE proname IN ('bulk_update_assets_with_audit', 'bulk_transfer_areas_with_audit')
ORDER BY proname;

-- ============================================================================
-- Test 1: Check if we can collect before data for an existing asset
-- ============================================================================
DO $$
DECLARE
  v_test_asset_id bigint;
  v_asset_data jsonb;
BEGIN
  -- Get a sample asset ID
  SELECT asset_id INTO v_test_asset_id
  FROM assets
  LIMIT 1;
  
  IF v_test_asset_id IS NULL THEN
    RAISE NOTICE 'No assets found in database';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Testing asset_id: %', v_test_asset_id;
  
  -- Try to collect asset data
  SELECT to_jsonb(a.*) INTO v_asset_data
  FROM assets a
  WHERE a.asset_id = v_test_asset_id;
  
  IF v_asset_data IS NULL THEN
    RAISE NOTICE 'Failed to collect asset data';
  ELSE
    RAISE NOTICE 'Successfully collected asset data';
    RAISE NOTICE 'Sample data (first 500 chars): %', substring(v_asset_data::text, 1, 500);
    RAISE NOTICE 'Asset ID: %, Building: %', v_asset_data->>'asset_id', v_asset_data->>'building_number';
  END IF;
END $$;

-- ============================================================================
-- Test 2: Test bulk_update_assets_with_audit with NULL before/after data
-- ============================================================================
DO $$
DECLARE
  v_test_asset_id bigint;
  v_test_building_number bigint;
  v_result jsonb;
  v_before_data jsonb;
  v_after_data jsonb;
BEGIN
  -- Get a sample asset
  SELECT asset_id, building_number 
  INTO v_test_asset_id, v_test_building_number
  FROM assets
  WHERE asset_id IS NOT NULL
  LIMIT 1;
  
  IF v_test_asset_id IS NULL THEN
    RAISE NOTICE 'No assets found for testing';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Testing bulk_update_assets_with_audit with asset_id: %, building_number: %', 
    v_test_asset_id, v_test_building_number;
  
  -- Call the function with NULL before/after data (database should collect automatically)
  SELECT bulk_update_assets_with_audit(
    jsonb_build_array(jsonb_build_object(
      'asset_id', v_test_asset_id,
      'building_number', v_test_building_number,
      'asset_size', 100.5
    )),
    'distribute_shared'::audit_action_type,
    NULL, -- p_user_id
    NULL, -- p_before_data (should be collected automatically)
    NULL, -- p_after_data (should be collected automatically)
    'Test: Database should collect before/after data automatically'
  ) INTO v_result;
  
  RAISE NOTICE 'Function result: %', v_result;
  
  -- Check the audit entry
  IF v_result->>'action_id' IS NOT NULL THEN
    SELECT before_data, after_data 
    INTO v_before_data, v_after_data
    FROM audit
    WHERE action_id = (v_result->>'action_id')::bigint;
    
    RAISE NOTICE 'Audit entry created with action_id: %', v_result->>'action_id';
    
    IF v_before_data IS NULL THEN
      RAISE NOTICE 'ERROR: before_data is NULL in audit entry!';
    ELSE
      RAISE NOTICE 'before_data collected: %', v_before_data;
      IF v_before_data->'assets' IS NULL THEN
        RAISE NOTICE 'ERROR: before_data.assets is NULL!';
      ELSE
        RAISE NOTICE 'before_data.assets array length: %', jsonb_array_length(v_before_data->'assets');
      END IF;
    END IF;
    
    IF v_after_data IS NULL THEN
      RAISE NOTICE 'ERROR: after_data is NULL in audit entry!';
    ELSE
      RAISE NOTICE 'after_data collected: %', v_after_data;
      IF v_after_data->'assets' IS NULL THEN
        RAISE NOTICE 'ERROR: after_data.assets is NULL!';
      ELSE
        RAISE NOTICE 'after_data.assets array length: %', jsonb_array_length(v_after_data->'assets');
      END IF;
    END IF;
  ELSE
    RAISE NOTICE 'ERROR: Function did not return action_id!';
  END IF;
END $$;

-- ============================================================================
-- Test 3: Test bulk_transfer_areas_with_audit with NULL before/after data
-- ============================================================================
DO $$
DECLARE
  v_test_asset_id bigint;
  v_test_building_number bigint;
  v_result jsonb;
  v_before_data jsonb;
  v_after_data jsonb;
  v_original_asset_size numeric;
BEGIN
  -- Get a sample asset
  SELECT asset_id, building_number, asset_size
  INTO v_test_asset_id, v_test_building_number, v_original_asset_size
  FROM assets
  WHERE asset_id IS NOT NULL
  LIMIT 1;
  
  IF v_test_asset_id IS NULL THEN
    RAISE NOTICE 'No assets found for testing transfer';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Testing bulk_transfer_areas_with_audit with asset_id: %, building_number: %', 
    v_test_asset_id, v_test_building_number;
  
  -- Call the function with NULL before/after data (database should collect automatically)
  SELECT bulk_transfer_areas_with_audit(
    jsonb_build_array(jsonb_build_object(
      'asset_id', v_test_asset_id,
      'building_number', v_test_building_number
    )),
    jsonb_build_array(jsonb_build_object(
      'asset_id', v_test_asset_id,
      'building_number', v_test_building_number,
      'asset_size', COALESCE(v_original_asset_size, 0) + 10,
      'measurement_date', '01/01/2024'
    )),
    'transfer_area'::audit_action_type,
    NULL, -- p_user_id
    NULL, -- p_before_data (should be collected automatically)
    NULL, -- p_after_data (should be collected automatically)
    'Test: Database should collect before/after data automatically for transfer'
  ) INTO v_result;
  
  RAISE NOTICE 'Function result: %', v_result;
  
  -- Check the audit entry
  IF v_result->>'action_id' IS NOT NULL THEN
    SELECT before_data, after_data 
    INTO v_before_data, v_after_data
    FROM audit
    WHERE action_id = (v_result->>'action_id')::bigint;
    
    RAISE NOTICE 'Audit entry created with action_id: %', v_result->>'action_id';
    
    IF v_before_data IS NULL THEN
      RAISE NOTICE 'ERROR: before_data is NULL in audit entry!';
    ELSE
      RAISE NOTICE 'before_data collected: %', v_before_data;
      IF v_before_data->'assets' IS NULL THEN
        RAISE NOTICE 'ERROR: before_data.assets is NULL!';
      ELSE
        RAISE NOTICE 'before_data.assets array length: %', jsonb_array_length(v_before_data->'assets');
      END IF;
    END IF;
    
    IF v_after_data IS NULL THEN
      RAISE NOTICE 'ERROR: after_data is NULL in audit entry!';
    ELSE
      RAISE NOTICE 'after_data collected: %', v_after_data;
      IF v_after_data->'assets' IS NULL THEN
        RAISE NOTICE 'ERROR: after_data.assets is NULL!';
      ELSE
        RAISE NOTICE 'after_data.assets array length: %', jsonb_array_length(v_after_data->'assets');
      END IF;
    END IF;
  ELSE
    RAISE NOTICE 'ERROR: Function did not return action_id!';
  END IF;
END $$;

-- ============================================================================
-- Test 4: Check recent audit entries to see if before/after data is being collected
-- ============================================================================
SELECT 
  action_id,
  action_type,
  entity_type,
  entity_id,
  CASE 
    WHEN before_data IS NULL THEN 'NULL'
    WHEN before_data->'assets' IS NULL THEN 'No assets key'
    ELSE 'Has assets: ' || jsonb_array_length(COALESCE(before_data->'assets', '[]'::jsonb))::text
  END as before_data_status,
  CASE 
    WHEN after_data IS NULL THEN 'NULL'
    WHEN after_data->'assets' IS NULL THEN 'No assets key'
    ELSE 'Has assets: ' || jsonb_array_length(COALESCE(after_data->'assets', '[]'::jsonb))::text
  END as after_data_status,
  description,
  created_at
FROM audit
WHERE action_type IN ('distribute_shared', 'transfer_area')
ORDER BY created_at DESC
LIMIT 10;

-- ============================================================================
-- Test 5: Check if log_audit_entry function signature is correct
-- ============================================================================
SELECT 
  proname as function_name,
  pg_get_function_arguments(oid) as arguments
FROM pg_proc
WHERE proname = 'log_audit_entry'
ORDER BY oid;

-- ============================================================================
-- Test 6: Manual test of data collection logic
-- ============================================================================
DO $$
DECLARE
  v_test_asset_id bigint;
  v_asset_data jsonb;
  v_assets_array jsonb[] := ARRAY[]::jsonb[];
  v_collected jsonb;
BEGIN
  -- Get a sample asset
  SELECT asset_id INTO v_test_asset_id
  FROM assets
  LIMIT 1;
  
  IF v_test_asset_id IS NULL THEN
    RAISE NOTICE 'No assets found';
    RETURN;
  END IF;
  
  -- Simulate the collection logic
  SELECT to_jsonb(a.*) INTO v_asset_data
  FROM assets a
  WHERE a.asset_id = v_test_asset_id;
  
  IF v_asset_data IS NOT NULL THEN
    v_assets_array := array_append(v_assets_array, v_asset_data);
  END IF;
  
  -- Convert to jsonb array
  SELECT jsonb_agg(elem) INTO v_collected
  FROM unnest(v_assets_array) AS elem;
  
  RAISE NOTICE 'Collected data: %', jsonb_build_object('assets', COALESCE(v_collected, '[]'::jsonb));
  
  -- Check if it's valid JSONB
  IF v_collected IS NULL THEN
    RAISE NOTICE 'ERROR: jsonb_agg returned NULL';
  ELSE
    RAISE NOTICE 'Success: jsonb_agg returned valid JSONB with % elements', jsonb_array_length(v_collected);
  END IF;
END $$;
