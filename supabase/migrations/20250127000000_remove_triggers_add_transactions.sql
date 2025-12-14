-- ============================================================================
-- Migration: Remove Triggers and Add Transaction-Based Operations
-- ============================================================================
-- This migration removes all database triggers and replaces them with
-- transaction-based stored procedures that can be called from the application.

-- ============================================================================
-- Drop all triggers
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_audit_building_changes ON buildings;
DROP TRIGGER IF EXISTS trigger_audit_asset_changes ON assets;
DROP TRIGGER IF EXISTS trigger_reset_new_measurement_flag ON assets;
DROP TRIGGER IF EXISTS trigger_copy_asset_to_history ON assets;
DROP TRIGGER IF EXISTS trigger_update_building_total_area ON assets;

-- ============================================================================
-- Helper function: Log audit and return audit_id
-- ============================================================================
-- Function will be updated in migration 20250129000000 to use user_id FK
-- Placeholder function for now (will be replaced)
-- Drop existing function with all possible signatures
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN 
    SELECT oid::regprocedure as func_signature
    FROM pg_proc
    WHERE proname = 'log_audit_for_building'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
  END LOOP;
EXCEPTION
  WHEN OTHERS THEN
    -- Ignore errors
    NULL;
END $$;

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
  
  -- Update building's action_id if not DELETE
  IF p_operation != 'DELETE' THEN
    UPDATE buildings
    SET action_id = v_audit_id
    WHERE building_number = p_building_number;
  END IF;
  
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_audit_for_building IS 'Log audit entry for building operation';

-- ============================================================================
-- Helper function: Copy asset to history (called BEFORE update for new measurements)
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
    -- Copy to history
    -- Note: history_created_at is set to now() to mark when this record was moved to history
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
      history_created_at,
      action_id
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
      NULL -- action_id will be set after audit entry is created
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION copy_asset_to_history_before_update IS 'Copy asset to history before update (for new measurements)';

-- ============================================================================
-- Helper function: Log audit for asset (called AFTER operation)
-- ============================================================================
-- Function will be updated in migration 20250129000000 to use user_id FK
-- Placeholder function for now (will be replaced)
-- Drop existing function with all possible signatures
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN 
    SELECT oid::regprocedure as func_signature
    FROM pg_proc
    WHERE proname = 'log_audit_for_asset'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
  END LOOP;
EXCEPTION
  WHEN OTHERS THEN
    -- Ignore errors
    NULL;
END $$;

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
    -- Get old asset before deletion (should have been copied to history already)
    SELECT to_jsonb(ah.*) INTO v_old_asset
    FROM assets_history ah
    WHERE ah.asset_id = p_asset_id
      AND ah.action_id IS NULL
    ORDER BY COALESCE(ah.history_created_at, ah.created_at) DESC NULLS LAST
    LIMIT 1;
    
    IF v_old_asset IS NOT NULL THEN
      v_building_number := (v_old_asset->>'building_number')::bigint;
      v_before_data := jsonb_build_object(
        'asset', v_old_asset,
        'building', get_building_audit_data(v_building_number)
      );
    END IF;
    
    v_after_data := jsonb_build_object(
      'asset', NULL,
      'building', get_building_audit_data(v_building_number)
    );
  ELSIF p_operation = 'UPDATE' THEN
    -- For UPDATE, get before data from history if it was copied
    IF p_copy_to_history THEN
      SELECT to_jsonb(ah.*) INTO v_old_asset
      FROM assets_history ah
      WHERE ah.asset_id = p_asset_id
        AND ah.action_id IS NULL
      ORDER BY COALESCE(ah.history_created_at, ah.created_at) DESC NULLS LAST
      LIMIT 1;
      
      IF v_old_asset IS NOT NULL THEN
        v_building_number := (v_old_asset->>'building_number')::bigint;
        v_before_data := jsonb_build_object(
          'asset', v_old_asset,
          'building', get_building_audit_data(v_building_number)
        );
      END IF;
    ELSE
      -- For regular UPDATE, before_data is not available
      -- Get building number from current asset
      SELECT building_number INTO v_building_number
      FROM assets
      WHERE asset_id = p_asset_id;
      
      IF v_building_number IS NOT NULL THEN
        v_before_data := jsonb_build_object(
          'asset', NULL,
          'building', get_building_audit_data(v_building_number)
        );
      END IF;
    END IF;
    
    -- Get after data
    v_after_data := get_asset_audit_data(p_asset_id);
  ELSIF p_operation = 'INSERT' THEN
    -- Get after data
    v_after_data := get_asset_audit_data(p_asset_id);
    
    -- Get building state for before_data (asset didn't exist before)
    SELECT building_number INTO v_building_number
    FROM assets
    WHERE asset_id = p_asset_id;
    
    IF v_building_number IS NOT NULL THEN
      v_before_data := jsonb_build_object(
        'asset', NULL,
        'building', get_building_audit_data(v_building_number)
      );
    END IF;
  END IF;
  
  -- Log audit entry
  SELECT log_audit_entry(
    p_action_type,
    'asset',
    p_asset_id::text,
    p_user_id,
    v_before_data,
    v_after_data,
    p_description
  ) INTO v_audit_id;
  
  -- Update asset's action_id if not DELETE
  IF p_operation != 'DELETE' THEN
    UPDATE assets
    SET action_id = v_audit_id
    WHERE asset_id = p_asset_id;
  END IF;
  
  -- Update history entry's action_id if one exists (for DELETE or UPDATE with copy_to_history)
  IF p_operation = 'DELETE' OR (p_operation = 'UPDATE' AND p_copy_to_history) THEN
    -- Update the most recent history entry without action_id
    -- Use a subquery in WHERE clause to identify the row
    UPDATE assets_history
    SET action_id = v_audit_id
    WHERE asset_id = p_asset_id
      AND action_id IS NULL
      AND (building_number, measurement_date, COALESCE(history_created_at, created_at)) = (
        SELECT building_number, measurement_date, COALESCE(history_created_at, created_at)
        FROM assets_history
        WHERE asset_id = p_asset_id
          AND action_id IS NULL
        ORDER BY COALESCE(history_created_at, created_at) DESC NULLS LAST
        LIMIT 1
      );
  END IF;
  
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_audit_for_asset IS 'Log audit entry for asset operation';

-- ============================================================================
-- Function to update building total area from assets
-- ============================================================================
-- Drop the old trigger function (no parameters, returns TRIGGER)
DROP FUNCTION IF EXISTS update_building_total_area();

-- Create new function with parameter (returns void)
CREATE OR REPLACE FUNCTION update_building_total_area(p_building_number bigint)
RETURNS void AS $$
BEGIN
  UPDATE buildings
  SET total_building_area = COALESCE((
    SELECT SUM(a.asset_size)
    FROM (
      SELECT DISTINCT ON (asset_id)
        asset_id,
        asset_size,
        main_asset_type
      FROM assets
      WHERE building_number = p_building_number
      ORDER BY asset_id, updated_at DESC
    ) a
    WHERE (
      a.main_asset_type IS NULL 
      OR EXISTS (
        SELECT 1 
        FROM asset_types at 
        WHERE at.name = a.main_asset_type 
          AND at.active = 'כן'
          AND (at.not_accountable IS NULL OR at.not_accountable = false)
      )
    )
    -- Exclude residence assets where asset_id % 1000 = 0 (like 0, 1000, 2000, 3000, etc.)
    AND NOT (
      EXISTS (
        SELECT 1 
        FROM asset_types at 
        WHERE at.name = a.main_asset_type 
          AND at.business_residence = 'מגורים'
          AND a.asset_id % 1000 = 0
      )
    )
  ), 0)
  WHERE building_number = p_building_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_building_total_area IS 'Update building total area based on sum of asset sizes (excluding not_accountable assets)';
