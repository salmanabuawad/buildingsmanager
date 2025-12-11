-- ============================================================================
-- Audit Table for Tracking Building and Asset Changes
-- ============================================================================
-- This migration creates an audit table to track all changes to buildings
-- and assets, including the user who made the change, action type, and before/after data.

-- Create enum for action types
DO $$ BEGIN
  CREATE TYPE audit_action_type AS ENUM (
    'manual_update',
    'import_file',
    'transfer_area',
    'distribute_shared'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Drop existing audit table if it exists (to recreate with action_id instead of id)
-- This will also drop dependent objects like foreign keys
DROP TABLE IF EXISTS audit CASCADE;

-- Create audit table
CREATE TABLE audit (
  action_id bigserial PRIMARY KEY,
  user_name text NOT NULL DEFAULT 'default',
  action_type audit_action_type NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('building', 'asset', 'bulk_building', 'bulk_asset')),
  entity_id text, -- Can be building_number, asset_id, or comma-separated IDs for bulk operations
  before_data jsonb, -- JSON containing all related building/asset data before the action
  after_data jsonb, -- JSON containing all related building/asset data after the action
  description text, -- Optional description of the action
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_user_name ON audit(user_name);
CREATE INDEX IF NOT EXISTS idx_audit_action_type ON audit(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_entity_type ON audit(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_entity_id ON audit(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity_type_id ON audit(entity_type, entity_id);

-- Enable RLS
ALTER TABLE audit ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Allow public read access to audit" ON audit;
DROP POLICY IF EXISTS "Allow authenticated users to insert audit" ON audit;

CREATE POLICY "Allow public read access to audit"
  ON audit FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow authenticated users to insert audit"
  ON audit FOR INSERT
  TO authenticated
  WITH CHECK (true);

COMMENT ON TABLE audit IS 'Audit table tracking all changes to buildings and assets';
COMMENT ON COLUMN audit.action_id IS 'Primary key - sequential action ID';
COMMENT ON COLUMN audit.user_name IS 'User who performed the action (default: "default")';
COMMENT ON COLUMN audit.action_type IS 'Type of action: manual_update, import_file, transfer_area, distribute_shared';
COMMENT ON COLUMN audit.entity_type IS 'Type of entity: building, asset, bulk_building, bulk_asset';
COMMENT ON COLUMN audit.entity_id IS 'ID of the entity (building_number, asset_id, or comma-separated IDs for bulk)';
COMMENT ON COLUMN audit.before_data IS 'JSON containing all related building/asset data before the action';
COMMENT ON COLUMN audit.after_data IS 'JSON containing all related building/asset data after the action';

-- ============================================================================
-- Function to log audit entry
-- ============================================================================
-- Drop existing function if it exists (with all possible signatures)
DROP FUNCTION IF EXISTS log_audit_entry(audit_action_type, text, text, text, jsonb, jsonb, text);
DROP FUNCTION IF EXISTS log_audit_entry(text, text, text, text, jsonb, jsonb, text);
DROP FUNCTION IF EXISTS log_audit_entry(audit_action_type, text, text);
DROP FUNCTION IF EXISTS log_audit_entry(text, text, text);

CREATE OR REPLACE FUNCTION log_audit_entry(
  p_action_type audit_action_type,
  p_entity_type text,
  p_entity_id text,
  p_user_name text DEFAULT 'default',
  p_before_data jsonb DEFAULT NULL,
  p_after_data jsonb DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS bigint AS $$
DECLARE
  v_audit_id bigint;
BEGIN
  INSERT INTO audit (
    user_name,
    action_type,
    entity_type,
    entity_id,
    before_data,
    after_data,
    description
  ) VALUES (
    p_user_name,
    p_action_type,
    p_entity_type,
    p_entity_id,
    p_before_data,
    p_after_data,
    p_description
  )
  RETURNING action_id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_audit_entry IS 'Function to manually log an audit entry';

-- ============================================================================
-- Function to get building data with all related assets for audit
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
  
  -- Get all assets for this building
  SELECT COALESCE(jsonb_agg(to_jsonb(a.*)), '[]'::jsonb) INTO v_assets
  FROM assets a
  WHERE a.building_number = p_building_number;
  
  -- Combine into result
  v_result := jsonb_build_object(
    'building', v_building,
    'assets', v_assets
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_building_audit_data IS 'Get building data with all related assets for audit logging';

-- ============================================================================
-- Function to get asset data with building data for audit
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
  
  -- Get building data if asset exists
  IF v_asset IS NOT NULL THEN
    SELECT to_jsonb(b.*) INTO v_building
    FROM buildings b
    WHERE b.building_number = (v_asset->>'building_number')::bigint;
  END IF;
  
  -- Combine into result
  v_result := jsonb_build_object(
    'asset', v_asset,
    'building', v_building
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_asset_audit_data IS 'Get asset data with building data for audit logging';

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
    -- Capture building state before asset insertion
    v_before_data := jsonb_build_object(
      'asset', NULL,
      'building', get_building_audit_data(v_building_number)
    );
    -- Capture asset and building state after insertion
    v_after_data := get_asset_audit_data(NEW.asset_id);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action_type := 'manual_update';
    -- Capture asset and building state BEFORE the update
    -- Note: Since this is an AFTER trigger, the building might have already been updated
    -- by other triggers, but we capture what we can
    v_before_data := jsonb_build_object(
      'asset', to_jsonb(OLD.*),
      'building', get_building_audit_data(v_building_number)
    );
    -- Capture asset and building state AFTER the update
    v_after_data := get_asset_audit_data(NEW.asset_id);
  ELSIF TG_OP = 'DELETE' THEN
    v_action_type := 'manual_update';
    -- Capture asset and building state before deletion
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
-- Add action_id columns to assets, buildings, and assets_history tables
-- ============================================================================

-- Drop existing foreign key constraints if they exist (in case they were created with wrong types)
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_action_id_fkey;
ALTER TABLE buildings DROP CONSTRAINT IF EXISTS buildings_action_id_fkey;
ALTER TABLE assets_history DROP CONSTRAINT IF EXISTS assets_history_action_id_fkey;

-- Drop existing columns if they exist (to recreate with correct type)
ALTER TABLE assets DROP COLUMN IF EXISTS action_id;
ALTER TABLE buildings DROP COLUMN IF EXISTS action_id;
ALTER TABLE assets_history DROP COLUMN IF EXISTS action_id;

-- Add action_id to assets table
ALTER TABLE assets 
ADD COLUMN action_id bigint;

-- Add foreign key constraint
ALTER TABLE assets
ADD CONSTRAINT assets_action_id_fkey 
FOREIGN KEY (action_id) REFERENCES audit(action_id);

CREATE INDEX IF NOT EXISTS idx_assets_action_id ON assets(action_id);

COMMENT ON COLUMN assets.action_id IS 'References the audit entry that caused this asset record to be created or updated';

-- Add action_id to buildings table
ALTER TABLE buildings 
ADD COLUMN action_id bigint;

-- Add foreign key constraint
ALTER TABLE buildings
ADD CONSTRAINT buildings_action_id_fkey 
FOREIGN KEY (action_id) REFERENCES audit(action_id);

CREATE INDEX IF NOT EXISTS idx_buildings_action_id ON buildings(action_id);

COMMENT ON COLUMN buildings.action_id IS 'References the audit entry that caused this building record to be created or updated';

-- Add action_id to assets_history table
ALTER TABLE assets_history 
ADD COLUMN action_id bigint;

-- Add foreign key constraint
ALTER TABLE assets_history
ADD CONSTRAINT assets_history_action_id_fkey 
FOREIGN KEY (action_id) REFERENCES audit(action_id);

CREATE INDEX IF NOT EXISTS idx_assets_history_action_id ON assets_history(action_id);

COMMENT ON COLUMN assets_history.action_id IS 'References the audit entry that caused this history record to be created';

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
-- Create triggers for automatic audit logging
-- ============================================================================

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trigger_audit_building_changes ON buildings;
DROP TRIGGER IF EXISTS trigger_audit_asset_changes ON assets;

-- Create audit triggers (AFTER)
CREATE TRIGGER trigger_audit_building_changes
  AFTER INSERT OR UPDATE OR DELETE ON buildings
  FOR EACH ROW
  EXECUTE FUNCTION audit_building_changes();

CREATE TRIGGER trigger_audit_asset_changes
  AFTER INSERT OR UPDATE OR DELETE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION audit_asset_changes();

-- Function to reset is_new_measurement flag and set session variable
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

-- Drop existing triggers
DROP TRIGGER IF EXISTS trigger_reset_new_measurement_flag ON assets;
DROP TRIGGER IF EXISTS trigger_copy_asset_to_history ON assets;

-- Create BEFORE trigger to reset flag
CREATE TRIGGER trigger_reset_new_measurement_flag
  BEFORE UPDATE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION reset_new_measurement_flag();

-- Create history trigger to run AFTER audit trigger
-- This ensures the audit log entry exists when we try to link it
-- The trigger order is important: audit trigger runs first, then history trigger
CREATE TRIGGER trigger_copy_asset_to_history
  AFTER UPDATE OR DELETE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION copy_asset_to_history();

COMMENT ON TRIGGER trigger_audit_building_changes ON buildings IS 'Automatically logs all building changes to audit';
COMMENT ON TRIGGER trigger_audit_asset_changes ON assets IS 'Automatically logs all asset changes to audit';
COMMENT ON TRIGGER trigger_copy_asset_to_history ON assets IS 'Copies asset data to history table and links to audit entry';
