-- ============================================================================
-- Temporary Triggers SQL - For Testing/Review
-- ============================================================================
-- This file contains all trigger functions and trigger definitions
-- from the audit log migration

-- ============================================================================
-- Trigger function to automatically log building changes
-- ============================================================================
CREATE OR REPLACE FUNCTION audit_building_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_before_data jsonb;
  v_after_data jsonb;
  v_action_type audit_action_type;
  v_audit_id bigint;
  v_user_name text;
BEGIN
  -- Determine action type based on operation
  IF TG_OP = 'INSERT' THEN
    v_action_type := 'manual_update';
    v_before_data := NULL;
    v_after_data := get_building_audit_data(NEW.building_number);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action_type := 'manual_update';
    v_before_data := get_building_audit_data(OLD.building_number);
    v_after_data := get_building_audit_data(NEW.building_number);
  ELSIF TG_OP = 'DELETE' THEN
    v_action_type := 'manual_update';
    v_before_data := get_building_audit_data(OLD.building_number);
    v_after_data := NULL;
  END IF;
  
  -- Get current user from session or use default
  BEGIN
    -- Try to get user from Supabase auth context
    v_user_name := coalesce(
      current_setting('request.jwt.claims', true)::json->>'email',
      current_setting('request.jwt.claims', true)::json->>'sub',
      'default'
    );
  EXCEPTION WHEN OTHERS THEN
    v_user_name := 'default';
  END;

  -- Log the audit entry and update the building's action_id
  SELECT log_audit_entry(
    v_action_type,
    'building',
    COALESCE(NEW.building_number::text, OLD.building_number::text),
    v_user_name,
    v_before_data,
    v_after_data,
    'Automatic audit log: ' || TG_OP || ' operation on building'
  ) INTO v_audit_id;
  
  -- Update the building's action_id
  IF TG_OP != 'DELETE' THEN
    NEW.action_id := v_audit_id;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION audit_building_changes IS 'Trigger function to automatically log building changes';

-- ============================================================================
-- Trigger function to automatically log asset changes
-- ============================================================================
CREATE OR REPLACE FUNCTION audit_asset_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_before_data jsonb;
  v_after_data jsonb;
  v_action_type audit_action_type;
  v_audit_id bigint;
  v_user_name text;
  v_building_number bigint;
BEGIN
  -- Get building number (from OLD for DELETE/UPDATE, from NEW for INSERT)
  v_building_number := COALESCE(OLD.building_number, NEW.building_number);
  
  -- Determine action type based on operation
  IF TG_OP = 'INSERT' THEN
    v_action_type := 'manual_update';
    v_before_data := jsonb_build_object(
      'asset', NULL,
      'building', get_building_audit_data(v_building_number)
    );
    v_after_data := get_asset_audit_data(NEW.asset_id);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action_type := 'manual_update';
    -- Capture building state BEFORE the asset update (which might affect building totals)
    v_before_data := jsonb_build_object(
      'asset', to_jsonb(OLD.*),
      'building', get_building_audit_data(v_building_number)
    );
    -- Capture building state AFTER the asset update
    v_after_data := get_asset_audit_data(NEW.asset_id);
  ELSIF TG_OP = 'DELETE' THEN
    v_action_type := 'manual_update';
    v_before_data := get_asset_audit_data(OLD.asset_id);
    -- Capture building state after asset deletion
    v_after_data := jsonb_build_object(
      'asset', NULL,
      'building', get_building_audit_data(v_building_number)
    );
  END IF;
  
  -- Get current user from session or use default
  BEGIN
    -- Try to get user from Supabase auth context
    v_user_name := coalesce(
      current_setting('request.jwt.claims', true)::json->>'email',
      current_setting('request.jwt.claims', true)::json->>'sub',
      'default'
    );
  EXCEPTION WHEN OTHERS THEN
    v_user_name := 'default';
  END;

  -- Log the audit entry and get the audit_id
  SELECT log_audit_entry(
    v_action_type,
    'asset',
    COALESCE(NEW.asset_id::text, OLD.asset_id::text),
    v_user_name,
    v_before_data,
    v_after_data,
    'Automatic audit log: ' || TG_OP || ' operation on asset'
  ) INTO v_audit_id;
  
  -- Update the asset's action_id
  IF TG_OP != 'DELETE' THEN
    NEW.action_id := v_audit_id;
  END IF;
  
  -- Store audit_id in session variable for history trigger to use
  PERFORM set_config('app.current_audit_id', v_audit_id::text, false);
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION audit_asset_changes IS 'Trigger function to automatically log asset changes';

-- ============================================================================
-- Function to reset is_new_measurement flag and set session variable
-- ============================================================================
CREATE OR REPLACE FUNCTION reset_new_measurement_flag()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND COALESCE(NEW.is_new_measurement, false) = true THEN
    -- Set session variable to indicate this is a new measurement
    PERFORM set_config('app.is_new_measurement', 'true', false);
    NEW.is_new_measurement = false;
  ELSE
    -- Clear the session variable
    PERFORM set_config('app.is_new_measurement', 'false', false);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Update copy_asset_to_history function to include action_id
-- ============================================================================
CREATE OR REPLACE FUNCTION copy_asset_to_history()
RETURNS TRIGGER AS $$
DECLARE
  v_action_id bigint;
  v_is_new_measurement boolean;
BEGIN
  -- Try to get the audit_id from session variable (set by audit trigger)
  -- If not available, try to get the most recent audit log entry for this asset
  BEGIN
    v_action_id := current_setting('app.current_audit_id', true)::bigint;
  EXCEPTION WHEN OTHERS THEN
    -- If session variable not set, get the most recent audit log entry for this asset
    SELECT action_id INTO v_action_id
    FROM audit
    WHERE entity_type = 'asset'
      AND entity_id = COALESCE(NEW.asset_id::text, OLD.asset_id::text)
    ORDER BY created_at DESC
    LIMIT 1;
  END;

  IF TG_OP = 'UPDATE' THEN
    -- Check if this was a new measurement update using session variable
    BEGIN
      v_is_new_measurement := current_setting('app.is_new_measurement', true)::boolean;
    EXCEPTION WHEN OTHERS THEN
      v_is_new_measurement := false;
    END;
    
    -- Only create history record if this was a new measurement
    IF v_is_new_measurement AND v_action_id IS NOT NULL THEN
        -- Create history record for the OLD asset data
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
          action_id
        ) VALUES (
          OLD.building_number, OLD.payer_id, OLD.asset_id, OLD.measurement_date,
          OLD.main_asset_type, OLD.asset_size,
          OLD.sub_asset_type_1, OLD.sub_asset_size_1,
          OLD.sub_asset_type_2, OLD.sub_asset_size_2,
          OLD.sub_asset_type_3, OLD.sub_asset_size_3,
          OLD.sub_asset_type_4, OLD.sub_asset_size_4,
          OLD.sub_asset_type_5, OLD.sub_asset_size_5,
          OLD.sub_asset_type_6, OLD.sub_asset_size_6,
          OLD.structure_drawing_url, OLD.created_at, OLD.updated_at,
          OLD.elevator, OLD.single_double_family, OLD.condo, OLD.townhouses, OLD.penthouse,
          OLD.tax_region, OLD.floor, OLD.discount_type, OLD.discount_date_from, OLD.discount_date_to,
          v_action_id
        );
    END IF;
    RETURN NEW;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    -- When an asset is deleted, copy it to history
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
      action_id
    ) VALUES (
      OLD.building_number, OLD.payer_id, OLD.asset_id, OLD.measurement_date,
      OLD.main_asset_type, OLD.asset_size,
      OLD.sub_asset_type_1, OLD.sub_asset_size_1,
      OLD.sub_asset_type_2, OLD.sub_asset_size_2,
      OLD.sub_asset_type_3, OLD.sub_asset_size_3,
      OLD.sub_asset_type_4, OLD.sub_asset_size_4,
      OLD.sub_asset_type_5, OLD.sub_asset_size_5,
      OLD.sub_asset_type_6, OLD.sub_asset_size_6,
      OLD.structure_drawing_url, OLD.created_at, OLD.updated_at,
      OLD.elevator, OLD.single_double_family, OLD.condo, OLD.townhouses, OLD.penthouse,
      OLD.tax_region, OLD.floor, OLD.discount_type, OLD.discount_date_from, OLD.discount_date_to,
      v_action_id
    );
    RETURN OLD;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Drop existing triggers if they exist
-- ============================================================================
DROP TRIGGER IF EXISTS trigger_audit_building_changes ON buildings;
DROP TRIGGER IF EXISTS trigger_audit_asset_changes ON assets;
DROP TRIGGER IF EXISTS trigger_reset_new_measurement_flag ON assets;
DROP TRIGGER IF EXISTS trigger_copy_asset_to_history ON assets;

-- ============================================================================
-- Create triggers
-- ============================================================================

-- Building audit trigger (AFTER)
CREATE TRIGGER trigger_audit_building_changes
  AFTER INSERT OR UPDATE OR DELETE ON buildings
  FOR EACH ROW
  EXECUTE FUNCTION audit_building_changes();

-- Asset audit trigger (AFTER)
CREATE TRIGGER trigger_audit_asset_changes
  AFTER INSERT OR UPDATE OR DELETE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION audit_asset_changes();

-- Reset new measurement flag (BEFORE)
CREATE TRIGGER trigger_reset_new_measurement_flag
  BEFORE UPDATE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION reset_new_measurement_flag();

-- Copy to history (AFTER)
CREATE TRIGGER trigger_copy_asset_to_history
  AFTER UPDATE OR DELETE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION copy_asset_to_history();

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON TRIGGER trigger_audit_building_changes ON buildings IS 'Automatically logs all building changes to audit';
COMMENT ON TRIGGER trigger_audit_asset_changes ON assets IS 'Automatically logs all asset changes to audit';
COMMENT ON TRIGGER trigger_copy_asset_to_history ON assets IS 'Copies asset data to history table and links to audit entry';

