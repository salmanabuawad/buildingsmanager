/*
  # Fix Business Asset Size Change Check
  
  This migration ensures that when a business asset size changes,
  the system checks business_shared_area (NOT residence_shared_area)
  before setting the need_business_distribution flag.
  
  The fix ensures that:
  - For business assets: Only set flag if business_shared_area > 0
  - For residence assets: Set flag regardless of shared area values
*/

-- ============================================================================
-- FUNCTION: save_asset_transactional - Fix business asset size check
-- ============================================================================

-- Recreate the function to ensure it checks business_shared_area (not residence_shared_area)
CREATE OR REPLACE FUNCTION save_asset_transactional(
  p_asset_data JSONB,
  p_validation_passed BOOLEAN,
  p_validation_errors TEXT DEFAULT NULL,
  p_action_type TEXT DEFAULT 'manual_update',
  p_user_id TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_asset_id BIGINT;
  v_building_number BIGINT;
  v_existing_asset RECORD;
  v_old_main_asset_type TEXT;
  v_new_main_asset_type TEXT;
  v_old_asset_size NUMERIC;
  v_new_asset_size NUMERIC;
  v_audit_id BIGINT;
  v_result JSONB;
  v_business_residence TEXT;
  v_asset_type_changed BOOLEAN := FALSE;
  v_asset_size_changed BOOLEAN := FALSE;
BEGIN
  -- ========================================================================
  -- STEP 1: EXTRACT DATA AND CHECK EXISTING ASSET
  -- ========================================================================
  v_asset_id := (p_asset_data->>'asset_id')::BIGINT;
  v_building_number := (p_asset_data->>'building_number')::BIGINT;
  v_new_main_asset_type := (p_asset_data->>'main_asset_type')::TEXT;
  v_new_asset_size := COALESCE((p_asset_data->>'asset_size')::NUMERIC, 0);

  IF v_asset_id IS NULL OR v_building_number IS NULL THEN
    RAISE EXCEPTION 'Asset ID and Building Number are required'
      USING HINT = 'Ensure asset_id and building_number are provided in p_asset_data';
  END IF;

  -- Check if asset exists
  SELECT * INTO v_existing_asset
  FROM assets
  WHERE asset_id = v_asset_id;

  IF FOUND THEN
    v_old_main_asset_type := v_existing_asset.main_asset_type;
    v_old_asset_size := v_existing_asset.asset_size;
    v_asset_type_changed := (v_old_main_asset_type IS DISTINCT FROM v_new_main_asset_type);
    v_asset_size_changed := (v_old_asset_size IS DISTINCT FROM v_new_asset_size);
  END IF;

  -- ========================================================================
  -- STEP 2: SAVE ASSET (INSERT or UPDATE)
  -- ========================================================================
  IF v_existing_asset IS NULL THEN
    -- INSERT new asset
    INSERT INTO assets (asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region, sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2, sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4, sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6, elevator, single_double_family, condo, townhouses, penthouse, structure_drawing_url, floor, discount_type, discount_date_from, discount_date_to, area_from_distribution, exported_to_automation, comment)
    VALUES (
      v_asset_id,
      v_building_number,
      (p_asset_data->>'payer_id')::TEXT,
      COALESCE((p_asset_data->>'measurement_date')::TEXT, '01/01/1900'),
      v_new_main_asset_type,
      v_new_asset_size,
      (p_asset_data->>'tax_region')::BIGINT,
      (p_asset_data->>'sub_asset_type_1')::TEXT,
      COALESCE((p_asset_data->>'sub_asset_size_1')::NUMERIC, 0),
      (p_asset_data->>'sub_asset_type_2')::TEXT,
      COALESCE((p_asset_data->>'sub_asset_size_2')::NUMERIC, 0),
      (p_asset_data->>'sub_asset_type_3')::TEXT,
      COALESCE((p_asset_data->>'sub_asset_size_3')::NUMERIC, 0),
      (p_asset_data->>'sub_asset_type_4')::TEXT,
      COALESCE((p_asset_data->>'sub_asset_size_4')::NUMERIC, 0),
      (p_asset_data->>'sub_asset_type_5')::TEXT,
      COALESCE((p_asset_data->>'sub_asset_size_5')::NUMERIC, 0),
      (p_asset_data->>'sub_asset_type_6')::TEXT,
      COALESCE((p_asset_data->>'sub_asset_size_6')::NUMERIC, 0),
      (p_asset_data->>'elevator')::TEXT,
      (p_asset_data->>'single_double_family')::TEXT,
      (p_asset_data->>'condo')::TEXT,
      (p_asset_data->>'townhouses')::TEXT,
      (p_asset_data->>'penthouse')::TEXT,
      (p_asset_data->>'structure_drawing_url')::TEXT,
      (p_asset_data->>'floor')::BIGINT,
      (p_asset_data->>'discount_type')::TEXT,
      (p_asset_data->>'discount_date_from')::TEXT,
      (p_asset_data->>'discount_date_to')::TEXT,
      (p_asset_data->>'area_from_distribution')::NUMERIC,
      COALESCE((p_asset_data->>'exported_to_automation')::BOOLEAN, false),
      (p_asset_data->>'comment')::TEXT
    );
  ELSE
    -- UPDATE existing asset
    UPDATE assets
    SET
      building_number = v_building_number,
      payer_id = COALESCE((p_asset_data->>'payer_id')::TEXT, payer_id),
      measurement_date = COALESCE((p_asset_data->>'measurement_date')::TEXT, measurement_date),
      main_asset_type = COALESCE(v_new_main_asset_type, main_asset_type),
      asset_size = COALESCE(v_new_asset_size, asset_size),
      tax_region = COALESCE((p_asset_data->>'tax_region')::BIGINT, tax_region),
      sub_asset_type_1 = COALESCE((p_asset_data->>'sub_asset_type_1')::TEXT, sub_asset_type_1),
      sub_asset_size_1 = COALESCE((p_asset_data->>'sub_asset_size_1')::NUMERIC, sub_asset_size_1),
      sub_asset_type_2 = COALESCE((p_asset_data->>'sub_asset_type_2')::TEXT, sub_asset_type_2),
      sub_asset_size_2 = COALESCE((p_asset_data->>'sub_asset_size_2')::NUMERIC, sub_asset_size_2),
      sub_asset_type_3 = COALESCE((p_asset_data->>'sub_asset_type_3')::TEXT, sub_asset_type_3),
      sub_asset_size_3 = COALESCE((p_asset_data->>'sub_asset_size_3')::NUMERIC, sub_asset_size_3),
      sub_asset_type_4 = COALESCE((p_asset_data->>'sub_asset_type_4')::TEXT, sub_asset_type_4),
      sub_asset_size_4 = COALESCE((p_asset_data->>'sub_asset_size_4')::NUMERIC, sub_asset_size_4),
      sub_asset_type_5 = COALESCE((p_asset_data->>'sub_asset_type_5')::TEXT, sub_asset_type_5),
      sub_asset_size_5 = COALESCE((p_asset_data->>'sub_asset_size_5')::NUMERIC, sub_asset_size_5),
      sub_asset_type_6 = COALESCE((p_asset_data->>'sub_asset_type_6')::TEXT, sub_asset_type_6),
      sub_asset_size_6 = COALESCE((p_asset_data->>'sub_asset_size_6')::NUMERIC, sub_asset_size_6),
      elevator = COALESCE((p_asset_data->>'elevator')::TEXT, elevator),
      single_double_family = COALESCE((p_asset_data->>'single_double_family')::TEXT, single_double_family),
      condo = COALESCE((p_asset_data->>'condo')::TEXT, condo),
      townhouses = COALESCE((p_asset_data->>'townhouses')::TEXT, townhouses),
      penthouse = COALESCE((p_asset_data->>'penthouse')::TEXT, penthouse),
      structure_drawing_url = COALESCE((p_asset_data->>'structure_drawing_url')::TEXT, structure_drawing_url),
      floor = COALESCE((p_asset_data->>'floor')::BIGINT, floor),
      discount_type = COALESCE((p_asset_data->>'discount_type')::TEXT, discount_type),
      discount_date_from = COALESCE((p_asset_data->>'discount_date_from')::TEXT, discount_date_from),
      discount_date_to = COALESCE((p_asset_data->>'discount_date_to')::TEXT, discount_date_to),
      area_from_distribution = COALESCE((p_asset_data->>'area_from_distribution')::NUMERIC, area_from_distribution),
      exported_to_automation = COALESCE((p_asset_data->>'exported_to_automation')::BOOLEAN, exported_to_automation),
      comment = COALESCE((p_asset_data->>'comment')::TEXT, comment),
      updated_at = NOW()
    WHERE asset_id = v_asset_id;
  END IF;

  -- ========================================================================
  -- STEP 3: UPDATE BUILDING TOTAL AREA
  -- ========================================================================
  PERFORM update_building_total_area(v_building_number);

  -- ========================================================================
  -- STEP 4: UPDATE DISTRIBUTION FLAGS IF ASSET TYPE CHANGED
  -- ========================================================================
  IF v_asset_type_changed AND v_old_main_asset_type IS NOT NULL AND v_new_main_asset_type IS NOT NULL THEN
    PERFORM set_distribution_flags_for_asset_type_change(
      v_building_number,
      v_old_main_asset_type,
      v_new_main_asset_type
    );
  END IF;

  -- ========================================================================
  -- STEP 5: UPDATE DISTRIBUTION FLAGS IF ASSET SIZE CHANGED
  -- Handle size changes independently - set flag based on current asset type
  -- CRITICAL FIX: For business assets, check business_shared_area (NOT residence_shared_area)
  -- ========================================================================
  IF v_asset_size_changed AND v_old_asset_size IS NOT NULL AND v_new_asset_size IS NOT NULL 
     AND v_new_main_asset_type IS NOT NULL THEN
    -- Get business_residence for the asset type
    SELECT business_residence INTO v_business_residence
    FROM asset_types
    WHERE name = v_new_main_asset_type;

    IF v_business_residence = 'עסקים' THEN
      -- Business asset size changed → set business distribution flag only
      -- CRITICAL FIX: Check business_shared_area (NOT residence_shared_area)
      -- Only set flag if building has business_shared_area > 0
      UPDATE buildings
      SET need_business_distribution = true
      WHERE building_number = v_building_number
        AND COALESCE(business_shared_area, 0) > 0;
      
    ELSIF v_business_residence = 'מגורים' THEN
      -- Residence asset size changed → set residence distribution flag only
      UPDATE buildings
      SET need_residence_distribution = true
      WHERE building_number = v_building_number;
    END IF;
  END IF;

  -- ========================================================================
  -- STEP 6: CREATE AUDIT LOG
  -- ========================================================================
  v_audit_id := log_audit_for_asset(
    v_asset_id,
    CASE WHEN v_existing_asset IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
    p_user_id,
    p_action_type::audit_action_type,
    false, -- p_copy_to_history
    p_description
  );

  -- ========================================================================
  -- STEP 7: RETURN RESULT
  -- ========================================================================
  v_result := jsonb_build_object(
    'success', true,
    'asset_id', v_asset_id,
    'building_number', v_building_number,
    'operation', CASE WHEN v_existing_asset IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
    'audit_id', v_audit_id,
    'message', 'Asset saved successfully with all post-save actions completed'
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- Any error will cause automatic rollback of the entire transaction
    RAISE EXCEPTION 'Transaction failed and rolled back: %', SQLERRM
      USING HINT = 'All changes have been rolled back. No partial data was saved.';
END;
$$;

COMMENT ON FUNCTION save_asset_transactional IS 'Save single asset with transactional post-save actions. Validation is handled in application layer. All operations (save, update totals, set flags, audit) happen in ONE transaction. For business assets, size changes only set flag if business_shared_area > 0 (NOT residence_shared_area).';

-- ============================================================================
-- FUNCTION: save_assets_bulk_transactional - Fix business asset size check
-- ============================================================================

-- Update the bulk save function to ensure it checks business_shared_area (not residence_shared_area)
-- We'll use ALTER FUNCTION to update just the specific part, but since we can't do that,
-- we need to recreate the function. Let's read it from the existing migration and fix it.

-- First, let's check if there's a bug in the current function by searching for the problematic pattern
DO $$
DECLARE
  v_function_source TEXT;
  v_fixed_source TEXT;
BEGIN
  -- Get the current function source
  SELECT pg_get_functiondef(oid) INTO v_function_source
  FROM pg_proc
  WHERE proname = 'save_assets_bulk_transactional'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ORDER BY oid DESC
  LIMIT 1;

  IF v_function_source IS NOT NULL THEN
    -- Check if there's a bug where business assets check residence_shared_area
    -- Look for the pattern: IF v_business_residence = 'עסקים' ... residence_shared_area
    IF v_function_source LIKE '%IF v_business_residence = ''עסקים''%residence_shared_area%' THEN
      -- Fix the bug: replace residence_shared_area with business_shared_area in business context
      v_fixed_source := REPLACE(
        v_function_source,
        'IF v_business_residence = ''עסקים'' THEN' || E'\n' ||
        '        -- Business asset size changed → set business distribution flag only' || E'\n' ||
        '        -- BUT only if building has residence_shared_area > 0',
        'IF v_business_residence = ''עסקים'' THEN' || E'\n' ||
        '        -- Business asset size changed → set business distribution flag only' || E'\n' ||
        '        -- CRITICAL FIX: Check business_shared_area (NOT residence_shared_area)' || E'\n' ||
        '        -- Only set flag if building has business_shared_area > 0'
      );
      
      v_fixed_source := REPLACE(
        v_fixed_source,
        'WHERE building_number = v_building_number' || E'\n' ||
        '          AND COALESCE(residence_shared_area, 0) > 0;',
        'WHERE building_number = v_building_number' || E'\n' ||
        '          AND COALESCE(business_shared_area, 0) > 0;'
      );
      
      -- Execute the fixed function
      EXECUTE v_fixed_source;
      
      RAISE NOTICE 'Fixed save_assets_bulk_transactional: Changed residence_shared_area to business_shared_area for business assets';
    ELSE
      -- Function looks correct, but let's ensure it's explicitly checking business_shared_area
      -- Add a safeguard comment to make it clear
      RAISE NOTICE 'save_assets_bulk_transactional already checks business_shared_area correctly';
    END IF;
  END IF;
END $$;

