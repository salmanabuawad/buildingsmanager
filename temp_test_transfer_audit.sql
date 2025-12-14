-- ============================================================================
-- TEMP SQL: Test Transfer Audit Entry Creation
-- ============================================================================
-- This tests if the transfer function is creating audit entries correctly

-- Test 1: Check if bulk_transfer_areas_with_audit function exists
SELECT 
  proname as function_name,
  pg_get_function_arguments(oid) as arguments
FROM pg_proc
WHERE proname = 'bulk_transfer_areas_with_audit'
ORDER BY oid;

-- Test 2: Test transfer function directly with a sample asset
DO $$
DECLARE
  v_test_asset_id bigint;
  v_test_building_number bigint;
  v_original_asset_size numeric;
  v_result jsonb;
  v_audit_count int;
  v_error_text text;
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
  
  RAISE NOTICE 'Testing transfer with asset_id: %, building_number: %, original_size: %', 
    v_test_asset_id, v_test_building_number, v_original_asset_size;
  
  -- Count audit entries before
  SELECT COUNT(*) INTO v_audit_count
  FROM audit
  WHERE action_type = 'transfer_area';
  
  RAISE NOTICE 'Audit entries before test: %', v_audit_count;
  
  BEGIN
    -- Call the transfer function
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
      'Test: Transfer audit entry creation'
    ) INTO v_result;
    
    RAISE NOTICE 'Function returned: %', v_result;
    
    -- Check if audit entry was created
    IF v_result->>'action_id' IS NOT NULL THEN
      RAISE NOTICE 'Function returned action_id: %', v_result->>'action_id';
      
      -- Check if it exists in audit table
      SELECT COUNT(*) INTO v_audit_count
      FROM audit
      WHERE action_id = (v_result->>'action_id')::bigint;
      
      IF v_audit_count > 0 THEN
        RAISE NOTICE 'SUCCESS: Audit entry found in database';
        
        -- Show the audit entry details
        SELECT 
          action_id,
          user_id,
          action_type,
          entity_type,
          entity_id,
          CASE 
            WHEN before_data IS NULL THEN 'NULL'
            WHEN before_data->'assets' IS NULL THEN 'No assets key'
            ELSE 'Has ' || jsonb_array_length(COALESCE(before_data->'assets', '[]'::jsonb))::text || ' assets'
          END as before_data_status,
          CASE 
            WHEN after_data IS NULL THEN 'NULL'
            WHEN after_data->'assets' IS NULL THEN 'No assets key'
            ELSE 'Has ' || jsonb_array_length(COALESCE(after_data->'assets', '[]'::jsonb))::text || ' assets'
          END as after_data_status,
          description
        FROM audit
        WHERE action_id = (v_result->>'action_id')::bigint;
      ELSE
        RAISE NOTICE 'ERROR: Audit entry NOT found in database even though function returned action_id';
      END IF;
    ELSE
      RAISE NOTICE 'ERROR: Function did not return action_id';
    END IF;
    
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_text = MESSAGE_TEXT;
    RAISE NOTICE 'ERROR calling bulk_transfer_areas_with_audit: %', v_error_text;
    RAISE NOTICE 'Error details: %', SQLERRM;
    RAISE NOTICE 'Error context: %', SQLSTATE;
  END;
END $$;

-- Test 3: Check recent transfer audit entries
SELECT 
  action_id,
  user_id,
  action_type,
  entity_type,
  entity_id,
  CASE 
    WHEN before_data IS NULL THEN 'NULL'
    WHEN before_data->'assets' IS NULL THEN 'No assets key'
    ELSE 'Has ' || jsonb_array_length(COALESCE(before_data->'assets', '[]'::jsonb))::text || ' assets'
  END as before_data_status,
  CASE 
    WHEN after_data IS NULL THEN 'NULL'
    WHEN after_data->'assets' IS NULL THEN 'No assets key'
    ELSE 'Has ' || jsonb_array_length(COALESCE(after_data->'assets', '[]'::jsonb))::text || ' assets'
  END as after_data_status,
  description,
  created_at
FROM audit
WHERE action_type = 'transfer_area'
ORDER BY created_at DESC
LIMIT 10;

-- Test 4: Check if log_audit_entry is being called correctly from transfer function
-- This will show if there are any errors in the function execution
DO $$
DECLARE
  v_test_asset_id bigint;
  v_test_building_number bigint;
BEGIN
  -- Get a sample asset
  SELECT asset_id, building_number
  INTO v_test_asset_id, v_test_building_number
  FROM assets
  WHERE asset_id IS NOT NULL
  LIMIT 1;
  
  IF v_test_asset_id IS NULL THEN
    RAISE NOTICE 'No assets found';
    RETURN;
  END IF;
  
  -- Test the before data collection part
  RAISE NOTICE 'Testing before data collection for asset_id: %', v_test_asset_id;
  
  -- Simulate what the function does
  DECLARE
    v_asset_data jsonb;
    v_before_assets jsonb[] := ARRAY[]::jsonb[];
    v_before_data_collected jsonb;
    v_audit_id bigint;
  BEGIN
    -- Get current asset state
    SELECT to_jsonb(a.*) INTO v_asset_data
    FROM assets a
    WHERE a.asset_id = v_test_asset_id;
    
    IF v_asset_data IS NULL THEN
      RAISE NOTICE 'ERROR: Could not find asset with asset_id: %', v_test_asset_id;
    ELSE
      RAISE NOTICE 'SUCCESS: Collected asset data';
      v_before_assets := array_append(v_before_assets, v_asset_data);
      
      -- Convert to jsonb array
      SELECT jsonb_agg(elem) INTO v_before_data_collected
      FROM unnest(v_before_assets) AS elem;
      
      v_before_data_collected := jsonb_build_object('assets', COALESCE(v_before_data_collected, '[]'::jsonb));
      
      RAISE NOTICE 'Before data collected: %', v_before_data_collected;
      
      -- Try to create audit entry
      BEGIN
        SELECT log_audit_entry(
          'transfer_area'::audit_action_type,
          'bulk_asset',
          NULL::text,
          NULL, -- p_user_id
          v_before_data_collected,
          NULL::jsonb,
          'Test: Transfer before data collection'
        ) INTO v_audit_id;
        
        RAISE NOTICE 'SUCCESS: log_audit_entry returned audit_id: %', v_audit_id;
        
        IF EXISTS (SELECT 1 FROM audit WHERE action_id = v_audit_id) THEN
          RAISE NOTICE 'SUCCESS: Audit entry found in database';
        ELSE
          RAISE NOTICE 'ERROR: Audit entry NOT found in database';
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'ERROR calling log_audit_entry: %', SQLERRM;
      END;
    END IF;
  END;
END $$;
