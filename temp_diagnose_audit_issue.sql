-- ============================================================================
-- TEMP SQL: Diagnose Why Audit Entries Are Not Being Saved
-- ============================================================================
-- Run this to check what's happening with audit entries

-- Check 1: Verify log_audit_entry function exists and signature
SELECT 
  proname as function_name,
  pg_get_function_arguments(oid) as arguments
FROM pg_proc
WHERE proname = 'log_audit_entry'
ORDER BY oid;

-- Check 2: Verify get_or_create_user_from_auth function exists
SELECT 
  proname as function_name,
  pg_get_function_arguments(oid) as arguments
FROM pg_proc
WHERE proname = 'get_or_create_user_from_auth'
ORDER BY oid;

-- Check 3: Check if default user exists
SELECT user_id, user_name, auth_user_id
FROM users
WHERE user_name = 'default' AND auth_user_id IS NULL
LIMIT 1;

-- Check 4: Test log_audit_entry directly
DO $$
DECLARE
  v_audit_id bigint;
  v_error_text text;
BEGIN
  BEGIN
    SELECT log_audit_entry(
      'distribute_shared'::audit_action_type,
      'bulk_asset',
      'TEST',
      NULL, -- p_user_id
      '{"test": "before"}'::jsonb,
      '{"test": "after"}'::jsonb,
      'Test audit entry'
    ) INTO v_audit_id;
    
    RAISE NOTICE 'SUCCESS: log_audit_entry returned audit_id: %', v_audit_id;
    
    -- Check if it was actually inserted
    IF EXISTS (SELECT 1 FROM audit WHERE action_id = v_audit_id) THEN
      RAISE NOTICE 'SUCCESS: Audit entry found in database';
    ELSE
      RAISE NOTICE 'ERROR: Audit entry NOT found in database even though function returned ID';
    END IF;
    
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_text = MESSAGE_TEXT;
    RAISE NOTICE 'ERROR calling log_audit_entry: %', v_error_text;
  END;
END $$;

-- Check 5: Check recent audit entries
SELECT 
  action_id,
  user_id,
  action_type,
  entity_type,
  entity_id,
  CASE 
    WHEN before_data IS NULL THEN 'NULL'
    ELSE 'Has data'
  END as before_data_status,
  CASE 
    WHEN after_data IS NULL THEN 'NULL'
    ELSE 'Has data'
  END as after_data_status,
  description,
  created_at
FROM audit
ORDER BY created_at DESC
LIMIT 10;

-- Check 6: Test bulk_update_assets_with_audit with error handling
DO $$
DECLARE
  v_test_asset_id bigint;
  v_test_building_number bigint;
  v_result jsonb;
  v_error_text text;
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
  
  BEGIN
    SELECT bulk_update_assets_with_audit(
      jsonb_build_array(jsonb_build_object(
        'asset_id', v_test_asset_id,
        'building_number', v_test_building_number,
        'asset_size', 100.5
      )),
      'distribute_shared'::audit_action_type,
      NULL, -- p_user_id
      NULL, -- p_before_data
      NULL, -- p_after_data
      'Test: Check if audit is created'
    ) INTO v_result;
    
    RAISE NOTICE 'Function returned: %', v_result;
    
    -- Check if audit entry was created
    IF v_result->>'action_id' IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM audit WHERE action_id = (v_result->>'action_id')::bigint) THEN
        RAISE NOTICE 'SUCCESS: Audit entry found in database';
      ELSE
        RAISE NOTICE 'ERROR: Audit entry NOT found in database';
      END IF;
    ELSE
      RAISE NOTICE 'ERROR: Function did not return action_id';
    END IF;
    
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_text = MESSAGE_TEXT;
    RAISE NOTICE 'ERROR calling bulk_update_assets_with_audit: %', v_error_text;
    RAISE NOTICE 'Error details: %', SQLERRM;
  END;
END $$;

-- Check 7: Check for any errors in PostgreSQL logs (if accessible)
-- This might not work depending on permissions, but worth trying
SELECT * FROM pg_stat_statements 
WHERE query LIKE '%log_audit_entry%' 
ORDER BY calls DESC 
LIMIT 5;
