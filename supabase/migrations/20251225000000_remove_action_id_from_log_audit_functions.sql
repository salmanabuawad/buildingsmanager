/*
  # Remove action_id Updates from log_audit Functions
  
  This migration removes action_id updates from log_audit_for_asset and log_audit_for_building
  functions since action_id column no longer exists in assets, assets_history, and buildings tables.
*/

-- ============================================================================
-- FUNCTION: log_audit_for_asset (UPDATED - removed action_id updates)
-- ============================================================================

CREATE OR REPLACE FUNCTION log_audit_for_asset(
  p_asset_id bigint,
  p_operation text, -- 'INSERT', 'UPDATE', 'DELETE'
  p_user_id text DEFAULT NULL, -- auth_user_id (UUID as text)
  p_action_type audit_action_type DEFAULT 'manual_update',
  p_copy_to_history boolean DEFAULT false,
  p_description text DEFAULT NULL
)
RETURNS bigint AS $$
DECLARE
  v_before_data jsonb;
  v_after_data jsonb;
  v_audit_id bigint;
  v_old_asset jsonb;
  v_building_number bigint;
BEGIN
  IF p_operation = 'DELETE' THEN
    -- Get asset data before deletion
    SELECT to_jsonb(a.*) INTO v_old_asset
    FROM assets a
    WHERE a.asset_id = p_asset_id;
    
    IF v_old_asset IS NOT NULL THEN
      v_building_number := (v_old_asset->>'building_number')::bigint;
      v_before_data := get_asset_audit_data(p_asset_id);
      v_after_data := NULL;
    END IF;
  ELSIF p_operation = 'INSERT' THEN
    -- For INSERT, after_data is the new asset
    v_after_data := get_asset_audit_data(p_asset_id);
    v_before_data := NULL;
  ELSIF p_operation = 'UPDATE' THEN
    -- For UPDATE, we need both before and after
    -- Note: This function should ideally be called with before_data passed in
    -- For now, we'll get after_data only
    v_after_data := get_asset_audit_data(p_asset_id);
    v_before_data := NULL; -- Should be passed in if needed
    
    -- If copy_to_history is true, try to get before data from most recent history entry
    IF p_copy_to_history THEN
      SELECT to_jsonb(ah.*) INTO v_old_asset
      FROM assets_history ah
      WHERE ah.asset_id = p_asset_id
      ORDER BY ah.history_created_at DESC NULLS LAST, ah.created_at DESC
      LIMIT 1;
      
      IF v_old_asset IS NOT NULL THEN
        v_before_data := get_asset_audit_data(p_asset_id);
        -- Replace asset in before_data with history version
        v_before_data := jsonb_set(v_before_data, '{asset}', v_old_asset);
      END IF;
    END IF;
  END IF;
  
  -- Create audit entry
  SELECT log_audit_entry(
    p_action_type,
    'asset',
    p_asset_id::text,
    p_user_id,
    v_before_data,
    v_after_data,
    p_description
  ) INTO v_audit_id;
  
  -- Note: action_id is no longer stored in assets or assets_history tables
  -- Audit entries are tracked in the audit table only
  
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_audit_for_asset IS 'Log audit entry for asset operation. Note: action_id is no longer stored in assets or assets_history tables.';

-- ============================================================================
-- FUNCTION: log_audit_for_building (UPDATED - removed action_id updates)
-- ============================================================================

CREATE OR REPLACE FUNCTION log_audit_for_building(
  p_building_number bigint,
  p_operation text, -- 'INSERT', 'UPDATE', 'DELETE'
  p_user_id text DEFAULT NULL, -- auth_user_id (UUID as text)
  p_action_type audit_action_type DEFAULT 'manual_update',
  p_description text DEFAULT NULL
)
RETURNS bigint AS $$
DECLARE
  v_before_data jsonb;
  v_after_data jsonb;
  v_audit_id bigint;
BEGIN
  IF p_operation = 'INSERT' THEN
    v_after_data := get_building_audit_data(p_building_number);
    v_before_data := NULL;
  ELSIF p_operation = 'UPDATE' THEN
    -- Note: This should be called AFTER the update, so v_before_data won't be accurate
    -- The calling code should pass before_data if needed
    v_after_data := get_building_audit_data(p_building_number);
    v_before_data := NULL; -- Will need to be passed in separately if needed
  ELSIF p_operation = 'DELETE' THEN
    v_before_data := NULL; -- Should be passed in before deletion
    v_after_data := NULL;
  END IF;
  
  SELECT log_audit_entry(
    p_action_type,
    'building',
    p_building_number::text,
    p_user_id,
    v_before_data,
    v_after_data,
    p_description
  ) INTO v_audit_id;
  
  -- Note: action_id is no longer stored in buildings table
  -- Audit entries are tracked in the audit table only
  
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_audit_for_building IS 'Log audit entry for building operation. Note: action_id is no longer stored in buildings table.';

-- ============================================================================
-- FUNCTION: copy_asset_to_history_before_update (UPDATED - removed action_id)
-- ============================================================================

CREATE OR REPLACE FUNCTION copy_asset_to_history_before_update(
  p_asset_id bigint
)
RETURNS void AS $$
DECLARE
  v_old_asset jsonb;
BEGIN
  -- Get old asset data
  SELECT to_jsonb(a.*) INTO v_old_asset
  FROM assets a
  WHERE a.asset_id = p_asset_id;
  
  IF v_old_asset IS NOT NULL THEN
    -- Copy to history (without action_id)
    INSERT INTO assets_history (
      building_number, payer_id, asset_id, measurement_date,
      main_asset_type, asset_size,
      sub_asset_type_1, sub_asset_size_1,
      sub_asset_type_2, sub_asset_size_2,
      sub_asset_type_3, sub_asset_size_3,
      sub_asset_type_4, sub_asset_size_4,
      sub_asset_type_5, sub_asset_size_5,
      sub_asset_type_6, sub_asset_size_6,
      structure_drawing_url, created_at, updated_at,
      elevator, single_double_family, condo, townhouses, penthouse,
      tax_region, floor, discount_type, discount_date_from, discount_date_to,
      history_created_at, business_distribution_area, exported_to_automation, comment
    ) VALUES (
      (v_old_asset->>'building_number')::bigint,
      v_old_asset->>'payer_id',
      (v_old_asset->>'asset_id')::bigint,
      v_old_asset->>'measurement_date',
      v_old_asset->>'main_asset_type',
      (v_old_asset->>'asset_size')::numeric,
      v_old_asset->>'sub_asset_type_1',
      (v_old_asset->>'sub_asset_size_1')::numeric,
      v_old_asset->>'sub_asset_type_2',
      (v_old_asset->>'sub_asset_size_2')::numeric,
      v_old_asset->>'sub_asset_type_3',
      (v_old_asset->>'sub_asset_size_3')::numeric,
      v_old_asset->>'sub_asset_type_4',
      (v_old_asset->>'sub_asset_size_4')::numeric,
      v_old_asset->>'sub_asset_type_5',
      (v_old_asset->>'sub_asset_size_5')::numeric,
      v_old_asset->>'sub_asset_type_6',
      (v_old_asset->>'sub_asset_size_6')::numeric,
      v_old_asset->>'structure_drawing_url',
      COALESCE((v_old_asset->>'created_at')::timestamptz, now()),
      COALESCE((v_old_asset->>'updated_at')::timestamptz, now()),
      v_old_asset->>'elevator',
      v_old_asset->>'single_double_family',
      v_old_asset->>'condo',
      v_old_asset->>'townhouses',
      v_old_asset->>'penthouse',
      (v_old_asset->>'tax_region')::integer,
      (v_old_asset->>'floor')::smallint,
      v_old_asset->>'discount_type',
      v_old_asset->>'discount_date_from',
      v_old_asset->>'discount_date_to',
      now(), -- history_created_at: timestamp when this record was moved to history
      (v_old_asset->>'business_distribution_area')::numeric,
      COALESCE((v_old_asset->>'exported_to_automation')::boolean, false),
      v_old_asset->>'comment'
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION copy_asset_to_history_before_update IS 'Copy asset to history before update (for new measurements). Note: action_id is no longer stored in assets_history table.';

-- ============================================================================
-- FUNCTION: get_asset_audit_data (UPDATED - remove action_id from JSONB)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_asset_audit_data(p_asset_id bigint)
RETURNS jsonb AS $$
DECLARE
  v_asset jsonb;
  v_building jsonb;
  v_result jsonb;
BEGIN
  -- Get asset data
  SELECT to_jsonb(a.*) INTO v_asset
  FROM assets a
  WHERE a.asset_id = p_asset_id;
  
  -- Remove action_id from asset JSONB if it exists
  IF v_asset IS NOT NULL THEN
    v_asset := v_asset - 'action_id';
  END IF;
  
  -- Get building data if asset exists
  IF v_asset IS NOT NULL THEN
    SELECT to_jsonb(b.*) INTO v_building
    FROM buildings b
    WHERE b.building_number = (v_asset->>'building_number')::bigint;
    
    -- Remove action_id from building JSONB if it exists
    IF v_building IS NOT NULL THEN
      v_building := v_building - 'action_id';
    END IF;
  END IF;
  
  -- Combine into result
  v_result := jsonb_build_object(
    'asset', v_asset,
    'building', v_building
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_asset_audit_data IS 'Get asset data with building data for audit logging. Note: action_id is removed from JSONB if present.';

-- ============================================================================
-- FUNCTION: get_building_audit_data (UPDATED - remove action_id from JSONB)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_building_audit_data(p_building_number bigint)
RETURNS jsonb AS $$
DECLARE
  v_building jsonb;
  v_assets jsonb;
  v_result jsonb;
BEGIN
  -- Get building data
  SELECT to_jsonb(b.*) INTO v_building
  FROM buildings b
  WHERE b.building_number = p_building_number;
  
  -- Remove action_id from building JSONB if it exists
  IF v_building IS NOT NULL THEN
    v_building := v_building - 'action_id';
  END IF;
  
  -- Get all assets for this building
  SELECT COALESCE(jsonb_agg(elem - 'action_id'), '[]'::jsonb) INTO v_assets
  FROM (
    SELECT to_jsonb(a.*) as elem
    FROM assets a
    WHERE a.building_number = p_building_number
  ) subquery;
  
  -- Combine into result
  v_result := jsonb_build_object(
    'building', v_building,
    'assets', v_assets
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_building_audit_data IS 'Get building data with all related assets for audit logging. Note: action_id is removed from JSONB if present.';

