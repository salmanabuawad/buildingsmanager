/*
  # Update Audit Table and Logging
  
  This migration:
  1. Adds composite unique constraint on (building_number, created_at, action_type) to audit table
  2. Updates save_assets_bulk_transactional to log to audit for both distribute_shared and transfer_area actions
  3. Ensures overload_ratio and shared_area_size are properly saved
  
  Note: This assumes distribution_audit table will be renamed to audit in a subsequent migration
*/

-- ============================================================================
-- UPDATE AUDIT TABLE: Add composite unique constraint
-- ============================================================================

-- Add composite unique constraint (keeping id as primary key for foreign key relationships)
-- This works for both distribution_audit (before rename) and audit (after rename)
DO $$
BEGIN
  -- Try distribution_audit first (if it exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'distribution_audit') THEN
    ALTER TABLE distribution_audit 
      DROP CONSTRAINT IF EXISTS distribution_audit_building_created_action_unique;
    
    ALTER TABLE distribution_audit 
      ADD CONSTRAINT distribution_audit_building_created_action_unique 
      UNIQUE (building_number, created_at, action_type);
  -- Otherwise try audit table
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit' 
                AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit' AND column_name = 'building_number')) THEN
    ALTER TABLE audit 
      DROP CONSTRAINT IF EXISTS audit_building_created_action_unique;
    
    ALTER TABLE audit 
      ADD CONSTRAINT audit_building_created_action_unique 
      UNIQUE (building_number, created_at, action_type);
  END IF;
END $$;

-- ============================================================================
-- UPDATE: save_assets_bulk_transactional to log distribution_audit
-- ============================================================================

CREATE OR REPLACE FUNCTION save_assets_bulk_transactional(
  p_assets_data JSONB[],
  p_validation_passed BOOLEAN,
  p_validation_errors TEXT DEFAULT NULL,
  p_action_type TEXT DEFAULT 'manual_update',
  p_user_id TEXT DEFAULT NULL,
  p_before_data JSONB DEFAULT NULL,
  p_after_data JSONB DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_asset_data JSONB;
  v_asset_id BIGINT;
  v_building_number BIGINT;
  v_existing_asset RECORD;
  v_old_main_asset_type TEXT;
  v_new_main_asset_type TEXT;
  v_affected_asset_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_affected_buildings BIGINT[] := ARRAY[]::BIGINT[];
  v_action_id BIGINT;
  v_count INTEGER := 0;
  v_result JSONB;
  v_user_id_fk BIGINT;
  v_default_user_id BIGINT := 1;
  v_building_num_for_flag BIGINT;
  v_distribution_type TEXT; -- 'residence' or 'business'
  v_asset_type_name TEXT;
  v_business_residence TEXT;
  v_business_dist_area NUMERIC;
  v_old_asset_size NUMERIC;
  v_new_asset_size NUMERIC;
  -- Store old values for each asset to use in STEP 6
  v_asset_old_values RECORD;
  -- For collecting audit data
  v_before_data_collected JSONB := NULL;
  v_after_data_collected JSONB := NULL;
  v_before_assets JSONB[] := ARRAY[]::JSONB[];
  v_after_assets JSONB[] := ARRAY[]::JSONB[];
  v_building_data JSONB := NULL;
  v_first_building_number BIGINT := NULL;
  v_asset_record RECORD;
  v_asset_jsonb JSONB; -- Separate variable for JSONB results
  v_entity_asset_ids BIGINT[];
  v_overload_ratio NUMERIC := NULL;
  -- For distribution audit logging
  v_audit_action_type distribution_audit_action_type;
  v_distribution_shared_area_size NUMERIC := NULL;
  v_distribution_overload_ratio NUMERIC := NULL;
  v_before_assets_json JSONB;
  v_after_assets_json JSONB;
  v_building_record RECORD;
BEGIN
  -- ========================================================================
  -- STEP 1: GET OR CREATE USER
  -- (Validation checks removed - validation is handled in application layer)
  -- ========================================================================
  IF p_user_id IS NOT NULL THEN
    SELECT user_id INTO v_user_id_fk
    FROM users
    WHERE auth_user_id = p_user_id;
    
    IF v_user_id_fk IS NULL THEN
      INSERT INTO users (auth_user_id, user_name, user_email)
      VALUES (p_user_id, p_user_id, NULL)
      ON CONFLICT (auth_user_id) DO UPDATE
      SET updated_at = now()
      RETURNING user_id INTO v_user_id_fk;
    END IF;
  ELSE
    BEGIN
      SELECT get_or_create_user_from_auth() INTO v_user_id_fk;
    EXCEPTION WHEN OTHERS THEN
      SELECT user_id INTO v_default_user_id
      FROM users
      WHERE user_name = 'default' AND auth_user_id IS NULL
      LIMIT 1;
      v_user_id_fk := v_default_user_id;
    END;
  END IF;
  
  -- If still no user, use default
  IF v_user_id_fk IS NULL THEN
    SELECT user_id INTO v_default_user_id
    FROM users
    WHERE user_name = 'default' AND auth_user_id IS NULL
    LIMIT 1;
    v_user_id_fk := v_default_user_id;
  END IF;

  -- ========================================================================
  -- STEP 2: COLLECT BEFORE DATA (if not provided)
  -- For distribution operations, collect ALL assets in the building
  -- ========================================================================
  -- Get first building number from assets (all assets in distribution belong to same building)
  IF array_length(p_assets_data, 1) > 0 THEN
    v_first_building_number := (p_assets_data[1]->>'building_number')::BIGINT;
  END IF;
  
  -- Collect BEFORE data from database (if not provided)
  IF (p_before_data IS NULL OR p_before_data = 'null'::jsonb OR p_before_data = '{}'::jsonb) 
     AND v_first_building_number IS NOT NULL THEN
    -- For distribution and transfer operations, collect affected assets
    IF p_action_type = 'distribute_shared' OR p_action_type = 'transfer_area' THEN
      -- For distribution, get ALL assets in the building before update
      -- For transfer, get only affected assets
      IF p_action_type = 'distribute_shared' THEN
        -- Get ALL assets in the building before update
        FOR v_asset_record IN 
          SELECT * FROM assets 
          WHERE building_number = v_first_building_number
          ORDER BY asset_id
        LOOP
          v_before_assets := array_append(v_before_assets, to_jsonb(v_asset_record));
        END LOOP;
      ELSE
        -- For transfer operations, only get assets that will be updated
        FOREACH v_asset_data IN ARRAY p_assets_data
        LOOP
          v_asset_id := (v_asset_data->>'asset_id')::BIGINT;
          IF v_asset_id IS NOT NULL THEN
            SELECT to_jsonb(a.*) INTO v_asset_jsonb
            FROM assets a
            WHERE a.asset_id = v_asset_id;
            
            IF v_asset_jsonb IS NOT NULL THEN
              v_before_assets := array_append(v_before_assets, v_asset_jsonb);
            END IF;
          END IF;
        END LOOP;
      END IF;
    ELSE
      -- For non-distribution/transfer operations, only get assets that will be updated
      FOREACH v_asset_data IN ARRAY p_assets_data
      LOOP
        v_asset_id := (v_asset_data->>'asset_id')::BIGINT;
        IF v_asset_id IS NOT NULL THEN
          SELECT to_jsonb(a.*) INTO v_asset_jsonb
          FROM assets a
          WHERE a.asset_id = v_asset_id;
          
          IF v_asset_jsonb IS NOT NULL THEN
            v_before_assets := array_append(v_before_assets, v_asset_jsonb);
          END IF;
        END IF;
      END LOOP;
    END IF;
    
    -- Convert jsonb array to jsonb array for assets
    SELECT jsonb_agg(elem) INTO v_before_data_collected
    FROM unnest(v_before_assets) AS elem;
    
    -- Build before_data structure: simple structure with just assets
    -- Structure: { assets: [...] }
    v_before_data_collected := jsonb_build_object(
      'assets', COALESCE(v_before_data_collected, '[]'::jsonb)
    );
  ELSE
    v_before_data_collected := p_before_data;
  END IF;
  
  -- ========================================================================
  -- STEP 2b: CREATE AUDIT ACTION RECORD (with collected before_data)
  -- ========================================================================
  BEGIN
    INSERT INTO audit (action_type, user_id, entity_type, entity_id, before_data, after_data, description, created_at)
    VALUES (
      p_action_type::audit_action_type,
      v_user_id_fk,
      'bulk_asset', -- entity_type for bulk operations
      NULL, -- entity_id will be set after we know all affected asset IDs
      v_before_data_collected,
      NULL, -- after_data will be collected after updates
      p_description,
      now()
    )
    RETURNING action_id INTO v_action_id;
  EXCEPTION WHEN OTHERS THEN
    -- Ignore if audit table doesn't exist
    v_action_id := NULL;
  END;

  -- ========================================================================
  -- STEP 3: PROCESS EACH ASSET
  -- ========================================================================
  FOREACH v_asset_data IN ARRAY p_assets_data
  LOOP
    -- Remove any fields that don't exist in assets table to prevent errors
    v_asset_data := v_asset_data - 'id' - '_isNew' - '_isDirty' - '_validationErrors' - '_isMasterRow';
    
    v_asset_id := (v_asset_data->>'asset_id')::BIGINT;
    v_building_number := (v_asset_data->>'building_number')::BIGINT;
    v_new_main_asset_type := (v_asset_data->>'main_asset_type')::TEXT;

    IF v_asset_id IS NULL OR v_building_number IS NULL THEN
      RAISE EXCEPTION 'Asset ID and Building Number are required for all assets'
        USING HINT = 'Ensure all assets in p_assets_data have asset_id and building_number';
    END IF;

    -- Store building number for flag removal (use first building if multiple)
    IF v_building_num_for_flag IS NULL THEN
      v_building_num_for_flag := v_building_number;
    END IF;

    -- Check if asset exists
    SELECT * INTO v_existing_asset
    FROM assets
    WHERE asset_id = v_asset_id;

    IF FOUND THEN
      v_old_main_asset_type := v_existing_asset.main_asset_type;
      v_old_asset_size := v_existing_asset.asset_size;
    ELSE
      v_old_main_asset_type := NULL;
      v_old_asset_size := NULL;
    END IF;

    -- Save asset (INSERT or UPDATE)
    IF v_existing_asset IS NULL THEN
      -- INSERT new asset
      INSERT INTO assets (asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region, sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2, sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4, sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6, elevator, single_double_family, condo, townhouses, penthouse, structure_drawing_url, floor, discount_type, discount_date_from, discount_date_to, area_from_distribution, exported_to_automation)
      VALUES (
        v_asset_id,
        v_building_number,
        (v_asset_data->>'payer_id')::TEXT,
        COALESCE((v_asset_data->>'measurement_date')::TEXT, '01/01/1900'),
        v_new_main_asset_type,
        COALESCE((v_asset_data->>'asset_size')::NUMERIC, 0),
        (v_asset_data->>'tax_region')::BIGINT,
        (v_asset_data->>'sub_asset_type_1')::TEXT,
        COALESCE((v_asset_data->>'sub_asset_size_1')::NUMERIC, 0),
        (v_asset_data->>'sub_asset_type_2')::TEXT,
        COALESCE((v_asset_data->>'sub_asset_size_2')::NUMERIC, 0),
        (v_asset_data->>'sub_asset_type_3')::TEXT,
        COALESCE((v_asset_data->>'sub_asset_size_3')::NUMERIC, 0),
        (v_asset_data->>'sub_asset_type_4')::TEXT,
        COALESCE((v_asset_data->>'sub_asset_size_4')::NUMERIC, 0),
        (v_asset_data->>'sub_asset_type_5')::TEXT,
        COALESCE((v_asset_data->>'sub_asset_size_5')::NUMERIC, 0),
        (v_asset_data->>'sub_asset_type_6')::TEXT,
        COALESCE((v_asset_data->>'sub_asset_size_6')::NUMERIC, 0),
        (v_asset_data->>'elevator')::TEXT,
        (v_asset_data->>'single_double_family')::TEXT,
        (v_asset_data->>'condo')::TEXT,
        (v_asset_data->>'townhouses')::TEXT,
        (v_asset_data->>'penthouse')::TEXT,
        (v_asset_data->>'structure_drawing_url')::TEXT,
        (v_asset_data->>'floor')::BIGINT,
        (v_asset_data->>'discount_type')::TEXT,
        (v_asset_data->>'discount_date_from')::TEXT,
        (v_asset_data->>'discount_date_to')::TEXT,
        (v_asset_data->>'area_from_distribution')::NUMERIC,
        COALESCE((v_asset_data->>'exported_to_automation')::BOOLEAN, false)
      );
    ELSE
      -- Check if is_new_measurement is true - if so, copy to history before update
      IF COALESCE((v_asset_data->>'is_new_measurement')::BOOLEAN, false) = true THEN
        -- Copy current asset to history before updating
        BEGIN
          INSERT INTO assets_history (
            asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region,
            sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
            sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
            sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
            elevator, single_double_family, condo, townhouses, penthouse,
            structure_drawing_url, floor, discount_type, discount_date_from, discount_date_to,
            area_from_distribution, exported_to_automation, created_at, updated_at
          )
          SELECT 
            asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region,
            sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
            sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
            sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
            elevator, single_double_family, condo, townhouses, penthouse,
            structure_drawing_url, floor, discount_type, discount_date_from, discount_date_to,
            area_from_distribution, exported_to_automation, created_at, updated_at
          FROM assets
          WHERE asset_id = v_asset_id;
        EXCEPTION WHEN OTHERS THEN
          -- Ignore if assets_history table doesn't exist
          NULL;
        END;
      END IF;
      
      -- UPDATE existing asset - only update fields that are provided
      UPDATE assets
      SET
        building_number = COALESCE(v_building_number, building_number),
        payer_id = COALESCE((v_asset_data->>'payer_id')::TEXT, payer_id),
        measurement_date = COALESCE((v_asset_data->>'measurement_date')::TEXT, measurement_date),
        main_asset_type = COALESCE(v_new_main_asset_type, main_asset_type),
        asset_size = COALESCE((v_asset_data->>'asset_size')::NUMERIC, asset_size),
        tax_region = COALESCE((v_asset_data->>'tax_region')::BIGINT, tax_region),
        sub_asset_type_1 = COALESCE((v_asset_data->>'sub_asset_type_1')::TEXT, sub_asset_type_1),
        sub_asset_size_1 = COALESCE((v_asset_data->>'sub_asset_size_1')::NUMERIC, sub_asset_size_1),
        sub_asset_type_2 = COALESCE((v_asset_data->>'sub_asset_type_2')::TEXT, sub_asset_type_2),
        sub_asset_size_2 = COALESCE((v_asset_data->>'sub_asset_size_2')::NUMERIC, sub_asset_size_2),
        sub_asset_type_3 = COALESCE((v_asset_data->>'sub_asset_type_3')::TEXT, sub_asset_type_3),
        sub_asset_size_3 = COALESCE((v_asset_data->>'sub_asset_size_3')::NUMERIC, sub_asset_size_3),
        sub_asset_type_4 = COALESCE((v_asset_data->>'sub_asset_type_4')::TEXT, sub_asset_type_4),
        sub_asset_size_4 = COALESCE((v_asset_data->>'sub_asset_size_4')::NUMERIC, sub_asset_size_4),
        sub_asset_type_5 = COALESCE((v_asset_data->>'sub_asset_type_5')::TEXT, sub_asset_type_5),
        sub_asset_size_5 = COALESCE((v_asset_data->>'sub_asset_size_5')::NUMERIC, sub_asset_size_5),
        sub_asset_type_6 = COALESCE((v_asset_data->>'sub_asset_type_6')::TEXT, sub_asset_type_6),
        sub_asset_size_6 = COALESCE((v_asset_data->>'sub_asset_size_6')::NUMERIC, sub_asset_size_6),
        elevator = COALESCE((v_asset_data->>'elevator')::TEXT, elevator),
        single_double_family = COALESCE((v_asset_data->>'single_double_family')::TEXT, single_double_family),
        condo = COALESCE((v_asset_data->>'condo')::TEXT, condo),
        townhouses = COALESCE((v_asset_data->>'townhouses')::TEXT, townhouses),
        penthouse = COALESCE((v_asset_data->>'penthouse')::TEXT, penthouse),
        structure_drawing_url = COALESCE((v_asset_data->>'structure_drawing_url')::TEXT, structure_drawing_url),
        floor = COALESCE((v_asset_data->>'floor')::BIGINT, floor),
        discount_type = COALESCE((v_asset_data->>'discount_type')::TEXT, discount_type),
        discount_date_from = COALESCE((v_asset_data->>'discount_date_from')::TEXT, discount_date_from),
        discount_date_to = COALESCE((v_asset_data->>'discount_date_to')::TEXT, discount_date_to),
        area_from_distribution = COALESCE((v_asset_data->>'area_from_distribution')::NUMERIC, area_from_distribution),
        exported_to_automation = COALESCE((v_asset_data->>'exported_to_automation')::BOOLEAN, exported_to_automation),
        is_new_measurement = false, -- Reset flag after copying to history
        updated_at = NOW()
      WHERE asset_id = v_asset_id;
    END IF;

    -- Track affected assets and buildings
    v_affected_asset_ids := array_append(v_affected_asset_ids, v_asset_id);
    IF NOT (v_building_number = ANY(v_affected_buildings)) THEN
      v_affected_buildings := array_append(v_affected_buildings, v_building_number);
    END IF;

    -- Update building total area
    PERFORM update_building_total_area(v_building_number);

    -- Update flags if type changed (using existing function)
    IF v_old_main_asset_type IS NOT NULL AND v_old_main_asset_type != v_new_main_asset_type THEN
      PERFORM set_distribution_flags_for_asset_type_change(
        v_building_number,
        v_old_main_asset_type,
        v_new_main_asset_type
      );
    END IF;

    -- Also set flags if asset_size changed (for business/residence assets)
    v_new_asset_size := COALESCE((v_asset_data->>'asset_size')::NUMERIC, v_old_asset_size);
    IF v_old_asset_size IS NOT NULL AND v_new_asset_size IS NOT NULL 
       AND v_old_asset_size != v_new_asset_size 
       AND v_new_main_asset_type IS NOT NULL THEN
      -- Get business_residence for the asset type
      SELECT business_residence INTO v_business_residence
      FROM asset_types
      WHERE name = v_new_main_asset_type;

      IF v_business_residence = 'עסקים' THEN
        -- Business asset size changed → set business distribution flag only
        UPDATE buildings
        SET need_business_distribution = true
        WHERE building_number = v_building_number;
        
      ELSIF v_business_residence = 'מגורים' THEN
        -- Residence asset size changed → set residence distribution flag only
        UPDATE buildings
        SET need_residence_distribution = true
        WHERE building_number = v_building_number;
      END IF;
    END IF;

    -- For distribution operations, we use the bulk audit entry created at STEP 2b
    -- For other operations, create individual audit log for each asset
    IF p_action_type != 'distribute_shared' AND p_action_type != 'transfer_area' THEN
      BEGIN
        PERFORM log_audit_for_asset(
          v_asset_id,
          CASE WHEN v_existing_asset IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
          p_user_id,
          p_action_type::audit_action_type,
          false, -- p_copy_to_history
          p_description
        );
      EXCEPTION WHEN OTHERS THEN
        -- Ignore if function doesn't exist (audit was removed)
        NULL;
      END;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  -- ========================================================================
  -- STEP 3b: COLLECT AFTER DATA (always collect assets, merge with provided building data)
  -- For distribution operations, collect ALL assets in the building after update
  -- ========================================================================
  -- Always collect assets from database (even if after_data is provided, we need all assets for distribution)
  IF v_first_building_number IS NOT NULL THEN
    -- For distribution operations, collect ALL assets in the building
    -- For transfer operations, only collect affected assets
    -- For other operations, only collect affected assets
    IF p_action_type = 'distribute_shared' THEN
      -- Get ALL assets in the building after update
      FOR v_asset_record IN 
        SELECT * FROM assets 
        WHERE building_number = v_first_building_number
        ORDER BY asset_id
      LOOP
        v_after_assets := array_append(v_after_assets, to_jsonb(v_asset_record));
      END LOOP;
    ELSE
      -- For non-distribution operations, only get assets that were updated
      FOR v_asset_id IN SELECT unnest(v_affected_asset_ids)
      LOOP
        SELECT to_jsonb(a.*) INTO v_asset_jsonb
        FROM assets a
        WHERE a.asset_id = v_asset_id;
        
        IF v_asset_jsonb IS NOT NULL THEN
          v_after_assets := array_append(v_after_assets, v_asset_jsonb);
        END IF;
      END LOOP;
    END IF;
    
    -- Convert jsonb array to jsonb array for assets
    SELECT jsonb_agg(elem) INTO v_after_data_collected
    FROM unnest(v_after_assets) AS elem;
    
    -- Get overload_ratio - use provided data if available, otherwise from database
    IF p_after_data IS NOT NULL AND p_after_data != 'null'::jsonb AND p_after_data != '{}'::jsonb THEN
      -- Extract overload_ratio from provided after_data
      IF p_after_data ? 'overload_ratio' THEN
        v_overload_ratio := (p_after_data->>'overload_ratio')::NUMERIC;
      ELSIF p_after_data ? 'building' AND p_after_data->'building' ? 'building' THEN
        v_building_data := p_after_data->'building'->'building';
        IF v_building_data ? 'overload_ratio' THEN
          v_overload_ratio := (v_building_data->>'overload_ratio')::NUMERIC;
        END IF;
      ELSIF p_after_data ? 'building' THEN
        v_building_data := p_after_data->'building';
        IF v_building_data ? 'overload_ratio' THEN
          v_overload_ratio := (v_building_data->>'overload_ratio')::NUMERIC;
        END IF;
      END IF;
    END IF;
    
    -- If overload_ratio not found in provided data, get from database
    IF v_overload_ratio IS NULL AND p_action_type = 'distribute_shared' THEN
      SELECT b.overload_ratio INTO v_overload_ratio
      FROM buildings b
      WHERE b.building_number = v_first_building_number;
    END IF;
    
    -- Get shared_area_size and overload_ratio from building for distribution operations
    IF p_action_type = 'distribute_shared' THEN
      SELECT * INTO v_building_record
      FROM buildings
      WHERE building_number = v_first_building_number;
      
      IF FOUND THEN
        -- Determine distribution type from description
        IF p_description IS NOT NULL THEN
          IF LOWER(p_description) LIKE '%residence%' OR LOWER(p_description) LIKE '%מגורים%' THEN
            v_distribution_shared_area_size := v_building_record.residence_shared_area;
            -- Residence distributions don't have overload_ratio
            v_distribution_overload_ratio := NULL;
          ELSIF LOWER(p_description) LIKE '%business%' OR LOWER(p_description) LIKE '%עסקים%' THEN
            v_distribution_shared_area_size := v_building_record.business_shared_area;
            v_distribution_overload_ratio := v_building_record.overload_ratio;
          END IF;
        END IF;
      END IF;
    ELSIF p_action_type = 'transfer_area' THEN
      -- For transfers, calculate total transferred area from asset size changes
      -- Sum the difference in asset_size between before and after (only increases)
      IF v_before_data_collected IS NOT NULL AND v_after_data_collected IS NOT NULL THEN
        SELECT COALESCE(
          (
            SELECT SUM((after_elem->>'asset_size')::NUMERIC - (before_elem->>'asset_size')::NUMERIC)
            FROM jsonb_array_elements(COALESCE(v_after_data_collected->'assets', '[]'::jsonb)) AS after_elem,
                 jsonb_array_elements(COALESCE(v_before_data_collected->'assets', '[]'::jsonb)) AS before_elem
            WHERE (after_elem->>'asset_id')::BIGINT = (before_elem->>'asset_id')::BIGINT
              AND (after_elem->>'asset_size')::NUMERIC > (before_elem->>'asset_size')::NUMERIC
          ),
          0
        ) INTO v_distribution_shared_area_size;
      END IF;
      -- Transfers don't have overload_ratio
      v_distribution_overload_ratio := NULL;
    END IF;
    
    -- Build after_data structure: simple structure with assets and overload_ratio
    -- Structure: { assets: [...], overload_ratio: ... }
    v_after_data_collected := jsonb_build_object(
      'assets', COALESCE(v_after_data_collected, '[]'::jsonb)
    );
    
    -- Add overload_ratio if it exists (for business distributions)
    IF v_overload_ratio IS NOT NULL THEN
      v_after_data_collected := v_after_data_collected || jsonb_build_object('overload_ratio', v_overload_ratio);
    END IF;
    
    -- For distribution operations, entity_id should include ALL assets in the building
    -- For other operations, only include affected assets
    IF p_action_type = 'distribute_shared' THEN
      -- Get ALL asset IDs in the building
      SELECT array_agg(asset_id ORDER BY asset_id) INTO v_entity_asset_ids
      FROM assets
      WHERE building_number = v_first_building_number;
    ELSE
      -- For other operations, use affected asset IDs
      v_entity_asset_ids := v_affected_asset_ids;
    END IF;
    
    -- Update audit entry with collected after data and entity_id
    BEGIN
      IF v_action_id IS NOT NULL THEN
        UPDATE audit
        SET 
          after_data = v_after_data_collected,
          entity_id = array_to_string(COALESCE(v_entity_asset_ids, v_affected_asset_ids), ',')
        WHERE action_id = v_action_id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Ignore if audit table doesn't exist
      NULL;
    END;
    
    -- ========================================================================
    -- STEP 3c: LOG TO DISTRIBUTION_AUDIT (for distribute_shared and transfer_area operations)
    -- Part of the same transaction - will rollback if save fails
    -- ========================================================================
    IF (p_action_type = 'distribute_shared' OR p_action_type = 'transfer_area') AND v_first_building_number IS NOT NULL THEN
      -- Map action_type to distribution_audit_action_type enum
      IF p_action_type = 'distribute_shared' THEN
        v_audit_action_type := 'distribution';
      ELSIF p_action_type = 'transfer_area' THEN
        v_audit_action_type := 'transfer';
      END IF;
      
      -- Extract assets arrays from before_data and after_data
      IF v_before_data_collected IS NOT NULL AND v_before_data_collected ? 'assets' THEN
        v_before_assets_json := v_before_data_collected->'assets';
      ELSIF v_before_data_collected IS NOT NULL AND jsonb_typeof(v_before_data_collected) = 'array' THEN
        v_before_assets_json := v_before_data_collected;
      ELSE
        v_before_assets_json := '[]'::jsonb;
      END IF;
      
      IF v_after_data_collected IS NOT NULL AND v_after_data_collected ? 'assets' THEN
        v_after_assets_json := v_after_data_collected->'assets';
      ELSIF v_after_data_collected IS NOT NULL AND jsonb_typeof(v_after_data_collected) = 'array' THEN
        v_after_assets_json := v_after_data_collected;
      ELSE
        v_after_assets_json := '[]'::jsonb;
      END IF;
      
      -- Log to audit table (part of the same transaction)
      PERFORM log_audit(
        v_first_building_number,
        v_audit_action_type,
        v_before_assets_json,
        v_after_assets_json,
        v_distribution_overload_ratio,
        v_distribution_shared_area_size,
        p_description,
        p_user_id
      );
    END IF;
  ELSE
    -- If no building number, use provided after_data as-is or collect minimal data
    IF p_after_data IS NOT NULL AND p_after_data != 'null'::jsonb AND p_after_data != '{}'::jsonb THEN
      v_after_data_collected := p_after_data;
      -- Still update entity_id
      BEGIN
        IF v_action_id IS NOT NULL THEN
          UPDATE audit
          SET 
            after_data = v_after_data_collected,
            entity_id = array_to_string(v_affected_asset_ids, ',')
          WHERE action_id = v_action_id;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    ELSE
      -- No building number and no provided data - just update entity_id
      BEGIN
        IF v_action_id IS NOT NULL THEN
          UPDATE audit
          SET entity_id = array_to_string(v_affected_asset_ids, ',')
          WHERE action_id = v_action_id;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END IF;

  -- ========================================================================
  -- STEP 4: REMOVE DISTRIBUTION FLAGS FOR distribute_shared ACTIONS
  -- Only after successful save, and only the relevant flag
  -- ========================================================================
  IF p_action_type = 'distribute_shared' AND v_building_num_for_flag IS NOT NULL THEN
    -- Determine distribution type by checking description first (most reliable)
    -- Then check asset data fields as fallback
    v_distribution_type := NULL;
    
    -- STEP 4a: Check description (most reliable method)
    IF p_description IS NOT NULL THEN
      IF LOWER(p_description) LIKE '%residence%' OR LOWER(p_description) LIKE '%מגורים%' THEN
        v_distribution_type := 'residence';
      ELSIF LOWER(p_description) LIKE '%business%' OR LOWER(p_description) LIKE '%עסקים%' THEN
        v_distribution_type := 'business';
      END IF;
    END IF;
    
    -- STEP 4b: If description didn't help, check asset data
    IF v_distribution_type IS NULL AND array_length(p_assets_data, 1) > 0 THEN
      -- Check if area_from_distribution is being updated (distribution)
      FOREACH v_asset_data IN ARRAY p_assets_data
      LOOP
        -- Check if area_from_distribution is set and non-zero
        BEGIN
          IF (v_asset_data->>'area_from_distribution') IS NOT NULL THEN
            v_business_dist_area := (v_asset_data->>'area_from_distribution')::NUMERIC;
            IF v_business_dist_area IS NOT NULL AND v_business_dist_area > 0 THEN
              -- Determine distribution type by checking asset type (business_residence)
              -- For now, check description or asset type to determine if business or residence
              -- This will be determined by the asset's business_residence type
              v_distribution_type := 'business'; -- Default, will be refined by description check
              EXIT; -- Found distribution, no need to check more
            END IF;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          -- Ignore conversion errors, continue checking
          NULL;
        END;
      END LOOP;
      
      -- If still not determined, check if main_asset_type is 199 (residence distribution)
      IF v_distribution_type IS NULL THEN
        v_asset_type_name := (p_assets_data[1]->>'main_asset_type');
        -- Check both string and numeric comparison
        IF v_asset_type_name = '199' OR v_asset_type_name::BIGINT = 199 THEN
          v_distribution_type := 'residence';
        END IF;
      END IF;
    END IF;
    
    -- STEP 4c: Remove the relevant flag only
    IF v_distribution_type = 'residence' THEN
      -- Residence distribution → remove residence flag
      UPDATE buildings
      SET need_residence_distribution = false
      WHERE building_number = v_building_num_for_flag;
      
    ELSIF v_distribution_type = 'business' THEN
      -- Business distribution → remove business flag
      UPDATE buildings
      SET need_business_distribution = false
      WHERE building_number = v_building_num_for_flag;
    END IF;
  END IF;

  -- ========================================================================
  -- STEP 5: RETURN RESULT
  -- ========================================================================
  v_result := jsonb_build_object(
    'success', true,
    'action_id', v_action_id,
    'affected_asset_ids', v_affected_asset_ids,
    'affected_buildings', v_affected_buildings,
    'count', v_count,
    'message', format('Successfully saved %s assets with all post-save actions completed', v_count)
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- Any error will cause automatic rollback of the entire transaction
    -- This includes asset updates AND flag removal
    RAISE EXCEPTION 'Bulk transaction failed and rolled back: %', SQLERRM
      USING HINT = 'All changes have been rolled back. No partial data was saved. Distribution flags remain set.';
END;
$$;

COMMENT ON FUNCTION save_assets_bulk_transactional IS 'Bulk save assets with transactional post-save actions. Validation is handled in application layer. All operations (saves, update totals, set flags, remove flags for distribute_shared, audit) happen in ONE transaction. For distribute_shared and transfer_area actions, logs to audit table.';

