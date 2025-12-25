/*
  # Remove Backend Validation Checks
  
  This migration removes validation enforcement from the database functions.
  Validation is now handled only in the application layer (frontend).
  
  The p_validation_passed parameter is kept for backward compatibility but
  is no longer checked.
*/

-- ============================================================================
-- ENSURE ENUM TYPE EXISTS
-- ============================================================================

-- Create enum for action types (if not exists)
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

-- ============================================================================
-- ENSURE audit TABLE EXISTS WITH CORRECT STRUCTURE
-- ============================================================================

-- Ensure audit table exists with all required columns
-- The table uses 'id' as primary key, not 'action_id'
CREATE TABLE IF NOT EXISTS audit (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL,
  action_type audit_action_type NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('building', 'asset', 'bulk_building', 'bulk_asset')),
  entity_id text, -- Can be building_number, asset_id, or comma-separated IDs for bulk operations
  before_data jsonb, -- JSON containing all related building/asset data before the action
  after_data jsonb, -- JSON containing all related building/asset data after the action
  description text, -- Optional description of the action
  created_at timestamptz DEFAULT now()
);

-- Fix action_type column type if it's using distribution_audit_action_type
DO $$ 
BEGIN
  -- Check if action_type column exists and has wrong type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'audit' 
    AND column_name = 'action_type'
    AND udt_name = 'distribution_audit_action_type'
  ) THEN
    -- Change the column type from distribution_audit_action_type to audit_action_type
    -- First, we need to convert existing values
    -- Map 'distribution' -> 'distribute_shared', 'transfer' -> 'transfer_area'
    ALTER TABLE audit 
      ALTER COLUMN action_type TYPE text;
    
    UPDATE audit 
      SET action_type = CASE 
        WHEN action_type = 'distribution' THEN 'distribute_shared'
        WHEN action_type = 'transfer' THEN 'transfer_area'
        WHEN action_type = 'business_distribution' THEN 'distribute_shared'
        WHEN action_type = 'residence_distribution' THEN 'distribute_shared'
        ELSE action_type
      END;
    
    -- Now change to audit_action_type
    ALTER TABLE audit 
      ALTER COLUMN action_type TYPE audit_action_type 
      USING action_type::audit_action_type;
  END IF;
END $$;

-- Ensure id column exists (rename from action_id if needed)
DO $$ 
BEGIN
  -- If table exists with action_id but no id, rename action_id to id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'audit' AND column_name = 'action_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'audit' AND column_name = 'id'
  ) THEN
    -- Drop any foreign key constraints that reference audit.action_id first
    -- (This should be handled separately if needed, but we'll rename the column)
    ALTER TABLE audit RENAME COLUMN action_id TO id;
  END IF;
END $$;

-- Add entity_type column if it doesn't exist (for cases where table exists but column is missing)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'audit' AND column_name = 'entity_type'
  ) THEN
    -- Add column without NOT NULL constraint first
    ALTER TABLE audit ADD COLUMN entity_type text;
    
    -- Update existing rows to have a default value if needed
    -- (You may want to set appropriate values based on your data)
    UPDATE audit SET entity_type = 'asset' WHERE entity_type IS NULL;
    
    -- Now add NOT NULL constraint and CHECK constraint
    ALTER TABLE audit ALTER COLUMN entity_type SET NOT NULL;
    ALTER TABLE audit ADD CONSTRAINT check_entity_type 
      CHECK (entity_type IN ('building', 'asset', 'bulk_building', 'bulk_asset'));
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'audit' AND column_name = 'entity_type' 
    AND is_nullable = 'YES'
  ) THEN
    -- Column exists but is nullable, add constraint if missing
    -- First update NULL values
    UPDATE audit SET entity_type = 'asset' WHERE entity_type IS NULL;
    
    -- Add NOT NULL constraint
    ALTER TABLE audit ALTER COLUMN entity_type SET NOT NULL;
    
    -- Add CHECK constraint if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'check_entity_type' 
      AND conrelid = 'audit'::regclass
    ) THEN
      ALTER TABLE audit ADD CONSTRAINT check_entity_type 
        CHECK (entity_type IN ('building', 'asset', 'bulk_building', 'bulk_asset'));
    END IF;
  END IF;
END $$;

-- Add entity_id column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'audit' AND column_name = 'entity_id'
  ) THEN
    ALTER TABLE audit ADD COLUMN entity_id text;
  END IF;
END $$;

-- Add before_data column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'audit' AND column_name = 'before_data'
  ) THEN
    ALTER TABLE audit ADD COLUMN before_data jsonb;
  END IF;
END $$;

-- Add after_data column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'audit' AND column_name = 'after_data'
  ) THEN
    ALTER TABLE audit ADD COLUMN after_data jsonb;
  END IF;
END $$;

-- Add description column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'audit' AND column_name = 'description'
  ) THEN
    ALTER TABLE audit ADD COLUMN description text;
  END IF;
END $$;

-- Handle building_number column if it exists (from old migrations)
-- If it exists with NOT NULL, either remove it or make it nullable
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'audit' AND column_name = 'building_number'
  ) THEN
    -- Check if it's NOT NULL
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'audit' 
      AND column_name = 'building_number' 
      AND is_nullable = 'NO'
    ) THEN
      -- Make it nullable first (so we can update existing rows)
      ALTER TABLE audit ALTER COLUMN building_number DROP NOT NULL;
      
      -- Populate building_number from entity_id where entity_type is 'building'
      UPDATE audit 
      SET building_number = (entity_id::bigint)
      WHERE entity_type = 'building' 
        AND entity_id IS NOT NULL 
        AND building_number IS NULL;
      
      -- For asset entities, extract building_number from entity_id if possible
      -- (entity_id could be asset_id, so we might need to look it up)
      -- For now, just leave it NULL for non-building entities
    END IF;
    
    -- Optionally, we could drop the column entirely since we use entity_id/entity_type now
    -- But we'll keep it for backward compatibility and just make it nullable
  END IF;
END $$;

-- ============================================================================
-- ENSURE log_audit_entry FUNCTION EXISTS
-- ============================================================================

-- Ensure log_audit_entry function exists (it's used by log_audit_for_asset)
-- This function should already exist from initial_schema.sql, but we ensure it here
-- to avoid any dependency issues during migration execution
CREATE OR REPLACE FUNCTION log_audit_entry(
  p_action_type audit_action_type,
  p_entity_type text,
  p_entity_id text,
  p_user_id text DEFAULT NULL, -- auth_user_id (UUID as text)
  p_before_data jsonb DEFAULT NULL,
  p_after_data jsonb DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS bigint AS $$
DECLARE
  v_audit_id bigint;
  v_user_id_fk bigint;
  v_default_user_id bigint;
BEGIN
  -- Get or create user
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
    -- Use get_or_create_user_from_auth if it exists, otherwise use default user
    BEGIN
      v_user_id_fk := get_or_create_user_from_auth();
    EXCEPTION WHEN OTHERS THEN
      v_user_id_fk := NULL;
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
  
  INSERT INTO audit (
    user_id,
    action_type,
    entity_type,
    entity_id,
    before_data,
    after_data,
    description
  ) VALUES (
    v_user_id_fk,
    p_action_type,
    p_entity_type,
    p_entity_id,
    p_before_data,
    p_after_data,
    p_description
  )
  RETURNING id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- DROP EXISTING FUNCTIONS TO AVOID NAME CONFLICTS
-- ============================================================================

-- Drop any existing versions with different signatures to avoid ambiguity
DROP FUNCTION IF EXISTS save_assets_bulk_transactional(
  JSONB[],
  BOOLEAN,
  TEXT,
  TEXT,
  TEXT,
  JSONB,
  JSONB,
  TEXT
);

DROP FUNCTION IF EXISTS save_assets_bulk_transactional(
  JSONB[],
  BOOLEAN,
  TEXT,
  TEXT,
  TEXT,
  JSONB,
  JSONB,
  TEXT,
  BOOLEAN
);

-- ============================================================================
-- FUNCTION: save_asset_transactional (UPDATED - validation checks removed)
-- ============================================================================

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
  -- (Validation checks removed - validation is handled in application layer)
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
    INSERT INTO assets (asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region, sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2, sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4, sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6, elevator, single_double_family, condo, townhouses, penthouse, structure_drawing_url, floor, discount_type, discount_date_from, discount_date_to, area_from_distribution, exported_to_automation)
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
      COALESCE((p_asset_data->>'exported_to_automation')::BOOLEAN, false)
    );
  ELSE
    -- UPDATE existing asset
    -- UPDATE existing asset - allow NULL values if explicitly provided
    -- Use CASE to check if key exists: if key exists, use value (even if NULL), otherwise keep existing
    UPDATE assets
    SET
      building_number = v_building_number,
      payer_id = CASE 
        WHEN p_asset_data->'payer_id' IS NULL THEN payer_id
        WHEN p_asset_data->'payer_id' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'payer_id'), '')::TEXT
      END,
      measurement_date = CASE 
        WHEN p_asset_data->'measurement_date' IS NULL THEN measurement_date
        WHEN p_asset_data->'measurement_date' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'measurement_date'), '')::TEXT
      END,
      main_asset_type = COALESCE(v_new_main_asset_type, main_asset_type),
      asset_size = COALESCE(v_new_asset_size, asset_size),
      tax_region = CASE 
        WHEN p_asset_data->'tax_region' IS NULL THEN tax_region
        ELSE (p_asset_data->>'tax_region')::BIGINT
      END,
      sub_asset_type_1 = CASE 
        WHEN p_asset_data->'sub_asset_type_1' IS NULL THEN sub_asset_type_1
        WHEN p_asset_data->'sub_asset_type_1' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'sub_asset_type_1'), '')::TEXT
      END,
      sub_asset_size_1 = CASE 
        WHEN p_asset_data->'sub_asset_size_1' IS NULL THEN sub_asset_size_1
        ELSE COALESCE((p_asset_data->>'sub_asset_size_1')::NUMERIC, 0)
      END,
      sub_asset_type_2 = CASE 
        WHEN p_asset_data->'sub_asset_type_2' IS NULL THEN sub_asset_type_2
        WHEN p_asset_data->'sub_asset_type_2' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'sub_asset_type_2'), '')::TEXT
      END,
      sub_asset_size_2 = CASE 
        WHEN p_asset_data->'sub_asset_size_2' IS NULL THEN sub_asset_size_2
        ELSE COALESCE((p_asset_data->>'sub_asset_size_2')::NUMERIC, 0)
      END,
      sub_asset_type_3 = CASE 
        WHEN p_asset_data->'sub_asset_type_3' IS NULL THEN sub_asset_type_3
        WHEN p_asset_data->'sub_asset_type_3' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'sub_asset_type_3'), '')::TEXT
      END,
      sub_asset_size_3 = CASE 
        WHEN p_asset_data->'sub_asset_size_3' IS NULL THEN sub_asset_size_3
        ELSE COALESCE((p_asset_data->>'sub_asset_size_3')::NUMERIC, 0)
      END,
      sub_asset_type_4 = CASE 
        WHEN p_asset_data->'sub_asset_type_4' IS NULL THEN sub_asset_type_4
        WHEN p_asset_data->'sub_asset_type_4' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'sub_asset_type_4'), '')::TEXT
      END,
      sub_asset_size_4 = CASE 
        WHEN p_asset_data->'sub_asset_size_4' IS NULL THEN sub_asset_size_4
        ELSE COALESCE((p_asset_data->>'sub_asset_size_4')::NUMERIC, 0)
      END,
      sub_asset_type_5 = CASE 
        WHEN p_asset_data->'sub_asset_type_5' IS NULL THEN sub_asset_type_5
        WHEN p_asset_data->'sub_asset_type_5' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'sub_asset_type_5'), '')::TEXT
      END,
      sub_asset_size_5 = CASE 
        WHEN p_asset_data->'sub_asset_size_5' IS NULL THEN sub_asset_size_5
        ELSE COALESCE((p_asset_data->>'sub_asset_size_5')::NUMERIC, 0)
      END,
      sub_asset_type_6 = CASE 
        WHEN p_asset_data->'sub_asset_type_6' IS NULL THEN sub_asset_type_6
        WHEN p_asset_data->'sub_asset_type_6' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'sub_asset_type_6'), '')::TEXT
      END,
      sub_asset_size_6 = CASE 
        WHEN p_asset_data->'sub_asset_size_6' IS NULL THEN sub_asset_size_6
        ELSE COALESCE((p_asset_data->>'sub_asset_size_6')::NUMERIC, 0)
      END,
      elevator = CASE 
        WHEN p_asset_data->'elevator' IS NULL THEN elevator
        WHEN p_asset_data->'elevator' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'elevator'), '')::TEXT
      END,
      single_double_family = CASE 
        WHEN p_asset_data->'single_double_family' IS NULL THEN single_double_family
        WHEN p_asset_data->'single_double_family' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'single_double_family'), '')::TEXT
      END,
      condo = CASE 
        WHEN p_asset_data->'condo' IS NULL THEN condo
        WHEN p_asset_data->'condo' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'condo'), '')::TEXT
      END,
      townhouses = CASE 
        WHEN p_asset_data->'townhouses' IS NULL THEN townhouses
        WHEN p_asset_data->'townhouses' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'townhouses'), '')::TEXT
      END,
      penthouse = CASE 
        WHEN p_asset_data->'penthouse' IS NULL THEN penthouse
        WHEN p_asset_data->'penthouse' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'penthouse'), '')::TEXT
      END,
      structure_drawing_url = CASE 
        WHEN p_asset_data->'structure_drawing_url' IS NULL THEN structure_drawing_url
        WHEN p_asset_data->'structure_drawing_url' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'structure_drawing_url'), '')::TEXT
      END,
      floor = CASE 
        WHEN p_asset_data->'floor' IS NULL THEN floor
        ELSE (p_asset_data->>'floor')::BIGINT
      END,
      discount_type = CASE 
        WHEN p_asset_data->'discount_type' IS NULL THEN discount_type
        WHEN p_asset_data->'discount_type' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'discount_type'), '')::TEXT
      END,
      discount_date_from = CASE 
        WHEN p_asset_data->'discount_date_from' IS NULL THEN discount_date_from
        WHEN p_asset_data->'discount_date_from' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'discount_date_from'), '')::TEXT
      END,
      discount_date_to = CASE 
        WHEN p_asset_data->'discount_date_to' IS NULL THEN discount_date_to
        WHEN p_asset_data->'discount_date_to' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'discount_date_to'), '')::TEXT
      END,
      area_from_distribution = CASE 
        WHEN p_asset_data->'area_from_distribution' IS NULL THEN area_from_distribution
        ELSE COALESCE((p_asset_data->>'area_from_distribution')::NUMERIC, 0)
      END,
      exported_to_automation = CASE 
        WHEN p_asset_data->'exported_to_automation' IS NULL THEN exported_to_automation
        ELSE COALESCE((p_asset_data->>'exported_to_automation')::BOOLEAN, false)
      END,
      comment = CASE 
        WHEN p_asset_data->'comment' IS NULL THEN comment
        WHEN p_asset_data->'comment' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'comment'), '')::TEXT
      END,
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
  -- ========================================================================
  IF v_asset_size_changed AND v_old_asset_size IS NOT NULL AND v_new_asset_size IS NOT NULL 
     AND v_new_main_asset_type IS NOT NULL THEN
    -- Get business_residence for the asset type
    SELECT business_residence INTO v_business_residence
    FROM asset_types
    WHERE name = v_new_main_asset_type;

    IF v_business_residence = 'עסקים' THEN
      -- Business asset size changed → set business distribution flag only
      -- BUT only if building has business_shared_area > 0
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

COMMENT ON FUNCTION save_asset_transactional IS 'Save single asset with transactional post-save actions. Validation is handled in application layer. All operations (save, update totals, set flags, audit) happen in ONE transaction.';

-- ============================================================================
-- FUNCTION: save_assets_bulk_transactional (UPDATED - validation checks removed)
-- ============================================================================

CREATE OR REPLACE FUNCTION save_assets_bulk_transactional(
  p_assets_data JSONB[],
  p_validation_passed BOOLEAN,
  p_validation_errors TEXT DEFAULT NULL,
  p_action_type TEXT DEFAULT 'manual_update',
  p_user_id TEXT DEFAULT NULL,
  p_before_data JSONB DEFAULT NULL,
  p_after_data JSONB DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_is_business_context BOOLEAN DEFAULT NULL
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
  v_type_changed BOOLEAN := FALSE;
  v_size_changed BOOLEAN := FALSE;
  v_asset_found BOOLEAN := FALSE;
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
    -- Use get_or_create_user_from_auth if it exists, otherwise default
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
    -- For distribution operations, collect ALL assets in the building
    -- For other operations, only collect affected assets
    IF p_action_type = 'distribute_shared' THEN
      -- Get ALL assets in the building before update
      -- Use explicit column list to avoid action_id
      FOR v_asset_record IN 
        SELECT 
          asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region,
          sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
          sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
          sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
          elevator, single_double_family, condo, townhouses, penthouse,
          structure_drawing_url, floor, discount_type, discount_date_from, discount_date_to,
          area_from_distribution, exported_to_automation, comment, created_at, updated_at,
          is_new_measurement
        FROM assets 
        WHERE building_number = v_first_building_number
        ORDER BY asset_id
      LOOP
        v_asset_jsonb := to_jsonb(v_asset_record);
        v_before_assets := array_append(v_before_assets, v_asset_jsonb);
      END LOOP;
    ELSE
      -- For non-distribution operations, only get assets that will be updated
      FOREACH v_asset_data IN ARRAY p_assets_data
      LOOP
        v_asset_id := (v_asset_data->>'asset_id')::BIGINT;
        IF v_asset_id IS NOT NULL THEN
          -- Use explicit column list to avoid action_id - build JSONB manually
          SELECT jsonb_build_object(
            'asset_id', a.asset_id,
            'building_number', a.building_number,
            'payer_id', a.payer_id,
            'measurement_date', a.measurement_date,
            'main_asset_type', a.main_asset_type,
            'asset_size', a.asset_size,
            'tax_region', a.tax_region,
            'sub_asset_type_1', a.sub_asset_type_1,
            'sub_asset_size_1', a.sub_asset_size_1,
            'sub_asset_type_2', a.sub_asset_type_2,
            'sub_asset_size_2', a.sub_asset_size_2,
            'sub_asset_type_3', a.sub_asset_type_3,
            'sub_asset_size_3', a.sub_asset_size_3,
            'sub_asset_type_4', a.sub_asset_type_4,
            'sub_asset_size_4', a.sub_asset_size_4,
            'sub_asset_type_5', a.sub_asset_type_5,
            'sub_asset_size_5', a.sub_asset_size_5,
            'sub_asset_type_6', a.sub_asset_type_6,
            'sub_asset_size_6', a.sub_asset_size_6,
            'elevator', a.elevator,
            'single_double_family', a.single_double_family,
            'condo', a.condo,
            'townhouses', a.townhouses,
            'penthouse', a.penthouse,
            'structure_drawing_url', a.structure_drawing_url,
            'floor', a.floor,
            'discount_type', a.discount_type,
            'discount_date_from', a.discount_date_from,
            'discount_date_to', a.discount_date_to,
            'area_from_distribution', a.area_from_distribution,
            'exported_to_automation', a.exported_to_automation,
            'comment', a.comment,
            'created_at', a.created_at,
            'updated_at', a.updated_at,
            'is_new_measurement', a.is_new_measurement
          ) INTO v_asset_jsonb
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
  -- STEP 3: PROCESS EACH ASSET
  -- ========================================================================
  FOREACH v_asset_data IN ARRAY p_assets_data
  LOOP
    -- Remove any fields that don't exist in assets table to prevent errors
    -- This includes 'id' (AG Grid internal field) and other non-database fields
    -- Use jsonb subtraction operator to remove multiple keys at once
    -- Note: PostgreSQL jsonb subtraction operator can remove multiple keys
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
    -- Use explicit column list to avoid action_id if it exists
    SELECT 
      asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region,
      sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
      sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
      sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
      elevator, single_double_family, condo, townhouses, penthouse,
      structure_drawing_url, floor, discount_type, discount_date_from, discount_date_to,
      area_from_distribution, exported_to_automation, comment, created_at, updated_at,
      is_new_measurement
    INTO v_existing_asset
    FROM assets
    WHERE asset_id = v_asset_id;

    -- Store FOUND status
    v_asset_found := FOUND;

    IF v_asset_found THEN
      v_old_main_asset_type := v_existing_asset.main_asset_type;
      v_old_asset_size := v_existing_asset.asset_size;
    ELSE
      v_old_main_asset_type := NULL;
      v_old_asset_size := NULL;
    END IF;

    -- Save asset (INSERT or UPDATE)
    IF v_existing_asset IS NULL THEN
      -- INSERT new asset
      INSERT INTO assets (asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region, sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2, sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4, sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6, elevator, single_double_family, condo, townhouses, penthouse, structure_drawing_url, floor, discount_type, discount_date_from, discount_date_to, area_from_distribution, exported_to_automation, comment)
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
        COALESCE((v_asset_data->>'exported_to_automation')::BOOLEAN, false),
        (v_asset_data->>'comment')::TEXT
      );
    ELSE
      -- Check if is_new_measurement is true - if so, copy to history before update
      IF COALESCE((v_asset_data->>'is_new_measurement')::BOOLEAN, false) = true THEN
        -- Copy current asset to history before updating
        INSERT INTO assets_history (
          asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region,
          sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
          sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
          sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
          elevator, single_double_family, condo, townhouses, penthouse,
          structure_drawing_url, floor, discount_type, discount_date_from, discount_date_to,
          area_from_distribution, exported_to_automation, comment, created_at, updated_at
        )
        SELECT 
          asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region,
          sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
          sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
          sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
          elevator, single_double_family, condo, townhouses, penthouse,
          structure_drawing_url, floor, discount_type, discount_date_from, discount_date_to,
          area_from_distribution, exported_to_automation, comment, created_at, updated_at
        FROM assets
        WHERE asset_id = v_asset_id;
      END IF;
      
      -- UPDATE existing asset - allow NULL values if explicitly provided
      -- Use CASE to check if key exists: if key exists, use value (even if NULL), otherwise keep existing
      -- For text fields: if key exists and value is null or empty string, set to NULL
      -- For numeric fields: if key exists and value is null, set to 0 (as per business logic)
      UPDATE assets
      SET
        building_number = COALESCE(v_building_number, building_number),
        payer_id = CASE 
          WHEN v_asset_data->'payer_id' IS NULL THEN payer_id
          WHEN v_asset_data->'payer_id' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'payer_id'), '')::TEXT
        END,
        measurement_date = CASE 
          WHEN v_asset_data->'measurement_date' IS NULL THEN measurement_date
          WHEN v_asset_data->'measurement_date' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'measurement_date'), '')::TEXT
        END,
        main_asset_type = COALESCE(v_new_main_asset_type, main_asset_type),
        asset_size = CASE 
          WHEN v_asset_data->'asset_size' IS NULL THEN asset_size
          ELSE COALESCE((v_asset_data->>'asset_size')::NUMERIC, 0)
        END,
        tax_region = CASE 
          WHEN v_asset_data->'tax_region' IS NULL THEN tax_region
          ELSE (v_asset_data->>'tax_region')::BIGINT
        END,
        sub_asset_type_1 = CASE 
          WHEN v_asset_data->'sub_asset_type_1' IS NULL THEN sub_asset_type_1
          WHEN v_asset_data->'sub_asset_type_1' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'sub_asset_type_1'), '')::TEXT
        END,
        sub_asset_size_1 = CASE 
          WHEN v_asset_data->'sub_asset_size_1' IS NULL THEN sub_asset_size_1
          ELSE COALESCE((v_asset_data->>'sub_asset_size_1')::NUMERIC, 0)
        END,
        sub_asset_type_2 = CASE 
          WHEN v_asset_data->'sub_asset_type_2' IS NULL THEN sub_asset_type_2
          WHEN v_asset_data->'sub_asset_type_2' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'sub_asset_type_2'), '')::TEXT
        END,
        sub_asset_size_2 = CASE 
          WHEN v_asset_data->'sub_asset_size_2' IS NULL THEN sub_asset_size_2
          ELSE COALESCE((v_asset_data->>'sub_asset_size_2')::NUMERIC, 0)
        END,
        sub_asset_type_3 = CASE 
          WHEN v_asset_data->'sub_asset_type_3' IS NULL THEN sub_asset_type_3
          WHEN v_asset_data->'sub_asset_type_3' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'sub_asset_type_3'), '')::TEXT
        END,
        sub_asset_size_3 = CASE 
          WHEN v_asset_data->'sub_asset_size_3' IS NULL THEN sub_asset_size_3
          ELSE COALESCE((v_asset_data->>'sub_asset_size_3')::NUMERIC, 0)
        END,
        sub_asset_type_4 = CASE 
          WHEN v_asset_data->'sub_asset_type_4' IS NULL THEN sub_asset_type_4
          WHEN v_asset_data->'sub_asset_type_4' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'sub_asset_type_4'), '')::TEXT
        END,
        sub_asset_size_4 = CASE 
          WHEN v_asset_data->'sub_asset_size_4' IS NULL THEN sub_asset_size_4
          ELSE COALESCE((v_asset_data->>'sub_asset_size_4')::NUMERIC, 0)
        END,
        sub_asset_type_5 = CASE 
          WHEN v_asset_data->'sub_asset_type_5' IS NULL THEN sub_asset_type_5
          WHEN v_asset_data->'sub_asset_type_5' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'sub_asset_type_5'), '')::TEXT
        END,
        sub_asset_size_5 = CASE 
          WHEN v_asset_data->'sub_asset_size_5' IS NULL THEN sub_asset_size_5
          ELSE COALESCE((v_asset_data->>'sub_asset_size_5')::NUMERIC, 0)
        END,
        sub_asset_type_6 = CASE 
          WHEN v_asset_data->'sub_asset_type_6' IS NULL THEN sub_asset_type_6
          WHEN v_asset_data->'sub_asset_type_6' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'sub_asset_type_6'), '')::TEXT
        END,
        sub_asset_size_6 = CASE 
          WHEN v_asset_data->'sub_asset_size_6' IS NULL THEN sub_asset_size_6
          ELSE COALESCE((v_asset_data->>'sub_asset_size_6')::NUMERIC, 0)
        END,
        elevator = CASE 
          WHEN v_asset_data->'elevator' IS NULL THEN elevator
          WHEN v_asset_data->'elevator' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'elevator'), '')::TEXT
        END,
        single_double_family = CASE 
          WHEN v_asset_data->'single_double_family' IS NULL THEN single_double_family
          WHEN v_asset_data->'single_double_family' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'single_double_family'), '')::TEXT
        END,
        condo = CASE 
          WHEN v_asset_data->'condo' IS NULL THEN condo
          WHEN v_asset_data->'condo' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'condo'), '')::TEXT
        END,
        townhouses = CASE 
          WHEN v_asset_data->'townhouses' IS NULL THEN townhouses
          WHEN v_asset_data->'townhouses' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'townhouses'), '')::TEXT
        END,
        penthouse = CASE 
          WHEN v_asset_data->'penthouse' IS NULL THEN penthouse
          WHEN v_asset_data->'penthouse' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'penthouse'), '')::TEXT
        END,
        structure_drawing_url = CASE 
          WHEN v_asset_data->'structure_drawing_url' IS NULL THEN structure_drawing_url
          WHEN v_asset_data->'structure_drawing_url' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'structure_drawing_url'), '')::TEXT
        END,
        floor = CASE 
          WHEN v_asset_data->'floor' IS NULL THEN floor
          ELSE (v_asset_data->>'floor')::BIGINT
        END,
        discount_type = CASE 
          WHEN v_asset_data->'discount_type' IS NULL THEN discount_type
          WHEN v_asset_data->'discount_type' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'discount_type'), '')::TEXT
        END,
        discount_date_from = CASE 
          WHEN v_asset_data->'discount_date_from' IS NULL THEN discount_date_from
          WHEN v_asset_data->'discount_date_from' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'discount_date_from'), '')::TEXT
        END,
        discount_date_to = CASE 
          WHEN v_asset_data->'discount_date_to' IS NULL THEN discount_date_to
          WHEN v_asset_data->'discount_date_to' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'discount_date_to'), '')::TEXT
        END,
        area_from_distribution = CASE 
          WHEN v_asset_data->'area_from_distribution' IS NULL THEN area_from_distribution
          ELSE COALESCE((v_asset_data->>'area_from_distribution')::NUMERIC, 0)
        END,
        exported_to_automation = CASE 
          WHEN v_asset_data->'exported_to_automation' IS NULL THEN exported_to_automation
          ELSE COALESCE((v_asset_data->>'exported_to_automation')::BOOLEAN, false)
        END,
        comment = CASE 
          WHEN v_asset_data->'comment' IS NULL THEN comment
          WHEN v_asset_data->'comment' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'comment'), '')::TEXT
        END,
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

    -- Update distribution flags if type or size changed
    -- Use both p_is_business_context (priority) AND asset type's business_residence (fallback)
    IF v_asset_found THEN
      -- Determine if type changed
      v_type_changed := (v_old_main_asset_type IS DISTINCT FROM v_new_main_asset_type);
      
      -- Determine if size changed
      v_new_asset_size := COALESCE((v_asset_data->>'asset_size')::NUMERIC, v_old_asset_size);
      IF v_old_asset_size IS NOT NULL AND v_new_asset_size IS NOT NULL THEN
        v_size_changed := (ABS(v_old_asset_size - v_new_asset_size) > 0.0001);
      ELSE
        v_size_changed := FALSE;
      END IF;
      
      -- If either type or size changed, set distribution flag
      IF v_type_changed OR v_size_changed THEN
        -- Use p_is_business_context if provided (from tab context)
        -- Otherwise, fall back to asset type's business_residence
        DECLARE
          v_is_business_context BOOLEAN := FALSE;
          v_is_residence_context BOOLEAN := FALSE;
        BEGIN
          -- First check p_is_business_context parameter
          IF p_is_business_context IS NOT NULL THEN
            v_is_business_context := p_is_business_context;
            v_is_residence_context := NOT p_is_business_context;
          ELSE
            -- Fall back to asset type's business_residence
            IF v_new_main_asset_type IS NOT NULL THEN
              SELECT business_residence INTO v_business_residence
              FROM asset_types
              WHERE name = v_new_main_asset_type;
              
              IF v_business_residence = 'עסקים' THEN
                v_is_business_context := TRUE;
              ELSIF v_business_residence = 'מגורים' THEN
                v_is_residence_context := TRUE;
              END IF;
            END IF;
          END IF;
          
          -- Set appropriate flag based on context
          IF v_is_business_context THEN
            -- Business: set flag only if building has business_shared_area > 0
            UPDATE buildings
            SET need_business_distribution = true
            WHERE building_number = v_building_number
              AND COALESCE(business_shared_area, 0) > 0;
          END IF;
          
          IF v_is_residence_context THEN
            -- Residence: always set flag
            UPDATE buildings
            SET need_residence_distribution = true
            WHERE building_number = v_building_number;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          -- Ignore errors
          NULL;
        END;
      END IF;
    END IF;

    -- For distribution operations, we use the bulk audit entry created at STEP 2b
    -- For other operations, create individual audit log for each asset
    IF p_action_type != 'distribute_shared' THEN
      PERFORM log_audit_for_asset(
        v_asset_id,
        CASE WHEN v_existing_asset IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
        p_user_id,
        p_action_type::audit_action_type,
        false, -- p_copy_to_history
        p_description
      );
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
    -- For other operations, only collect affected assets
    IF p_action_type = 'distribute_shared' THEN
      -- Get ALL assets in the building after update
      -- Use explicit column list to avoid action_id
      FOR v_asset_record IN 
        SELECT 
          asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region,
          sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
          sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
          sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
          elevator, single_double_family, condo, townhouses, penthouse,
          structure_drawing_url, floor, discount_type, discount_date_from, discount_date_to,
          area_from_distribution, exported_to_automation, comment, created_at, updated_at,
          is_new_measurement
        FROM assets 
        WHERE building_number = v_first_building_number
        ORDER BY asset_id
      LOOP
        v_asset_jsonb := to_jsonb(v_asset_record);
        v_after_assets := array_append(v_after_assets, v_asset_jsonb);
      END LOOP;
    ELSE
      -- For non-distribution operations, only get assets that were updated
      FOR v_asset_id IN SELECT unnest(v_affected_asset_ids)
      LOOP
        -- Use explicit column list to avoid action_id - build JSONB manually
        SELECT jsonb_build_object(
          'asset_id', a.asset_id,
          'building_number', a.building_number,
          'payer_id', a.payer_id,
          'measurement_date', a.measurement_date,
          'main_asset_type', a.main_asset_type,
          'asset_size', a.asset_size,
          'tax_region', a.tax_region,
          'sub_asset_type_1', a.sub_asset_type_1,
          'sub_asset_size_1', a.sub_asset_size_1,
          'sub_asset_type_2', a.sub_asset_type_2,
          'sub_asset_size_2', a.sub_asset_size_2,
          'sub_asset_type_3', a.sub_asset_type_3,
          'sub_asset_size_3', a.sub_asset_size_3,
          'sub_asset_type_4', a.sub_asset_type_4,
          'sub_asset_size_4', a.sub_asset_size_4,
          'sub_asset_type_5', a.sub_asset_type_5,
          'sub_asset_size_5', a.sub_asset_size_5,
          'sub_asset_type_6', a.sub_asset_type_6,
          'sub_asset_size_6', a.sub_asset_size_6,
          'elevator', a.elevator,
          'single_double_family', a.single_double_family,
          'condo', a.condo,
          'townhouses', a.townhouses,
          'penthouse', a.penthouse,
          'structure_drawing_url', a.structure_drawing_url,
          'floor', a.floor,
          'discount_type', a.discount_type,
          'discount_date_from', a.discount_date_from,
          'discount_date_to', a.discount_date_to,
          'area_from_distribution', a.area_from_distribution,
          'exported_to_automation', a.exported_to_automation,
          'comment', a.comment,
          'created_at', a.created_at,
          'updated_at', a.updated_at,
          'is_new_measurement', a.is_new_measurement
        ) INTO v_asset_jsonb
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
    IF v_overload_ratio IS NULL THEN
      SELECT b.overload_ratio INTO v_overload_ratio
      FROM buildings b
      WHERE b.building_number = v_first_building_number;
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
  END IF;
  
  -- Note: Audit entries are created by log_audit_for_asset function for individual assets
  -- No need to update audit entries here since log_audit_for_asset handles it

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

COMMENT ON FUNCTION save_assets_bulk_transactional IS 'Bulk save assets with transactional post-save actions. Validation is handled in application layer. All operations (saves, update totals, set flags, remove flags for distribute_shared, audit) happen in ONE transaction. For distribute_shared actions, removes the relevant distribution flag (business OR residence) only after successful save.';

-- ============================================================================
-- FIELD CONFIGURATION: Add area_from_distribution to assets-list grid
-- ============================================================================

-- Add area_from_distribution to assets-list grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES ('assets-list', 'area_from_distribution', 18, 8, 'גודל שטח משותף', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET 
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  hebrew_name = EXCLUDED.hebrew_name,
  visible = EXCLUDED.visible,
  updated_at = now();

-- Add area_from_distribution to asset-details-main grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES ('asset-details-main', 'area_from_distribution', 18, 8, 'גודל שטח משותף', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET 
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  hebrew_name = EXCLUDED.hebrew_name,
  visible = EXCLUDED.visible,
  updated_at = now();

-- Add area_from_distribution to asset-details-history grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES ('asset-details-history', 'area_from_distribution', 18, 8, 'גודל שטח משותף', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET 
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  hebrew_name = EXCLUDED.hebrew_name,
  visible = EXCLUDED.visible,
  updated_at = now();

-- ============================================================================
-- TRIGGERS: Automatically handle post-save actions for direct table operations
-- ============================================================================
-- These triggers ensure that building total area and distribution flags are
-- updated even when assets are modified directly (not through transactional functions)
-- They will also fire when using transactional functions, but the operations are idempotent

-- Function to automatically update building total area after asset changes
CREATE OR REPLACE FUNCTION auto_update_building_total_area()
RETURNS TRIGGER AS $$
DECLARE
  v_building_number BIGINT;
BEGIN
  -- Determine building_number based on operation
  IF TG_OP = 'DELETE' THEN
    v_building_number := OLD.building_number;
  ELSE
    v_building_number := NEW.building_number;
  END IF;

  -- Skip if no building_number
  IF v_building_number IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- Update building total area
  -- This is idempotent - safe to call multiple times
  PERFORM update_building_total_area(v_building_number);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_auto_update_building_total_area ON assets;

-- Create trigger that fires after insert, update, or delete
CREATE TRIGGER trigger_auto_update_building_total_area
  AFTER INSERT OR UPDATE OR DELETE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_building_total_area();

COMMENT ON FUNCTION auto_update_building_total_area IS 'Automatically updates building total area after asset INSERT/UPDATE/DELETE operations. Works for both direct table operations and transactional function calls.';

-- Function to automatically set distribution flags when asset size or type changes
-- This ensures flags are set even when direct table operations bypass transactional functions
CREATE OR REPLACE FUNCTION auto_set_distribution_flags_on_change()
RETURNS TRIGGER AS $$
DECLARE
  v_business_residence TEXT;
  v_type_changed BOOLEAN := FALSE;
  v_size_changed BOOLEAN := FALSE;
  v_old_type TEXT;
  v_new_type TEXT;
BEGIN
  -- Only process INSERT or UPDATE
  IF TG_OP = 'DELETE' THEN
    -- For DELETE, distribution flags should be set via delete_asset_transactional
    -- But we can still update building total area (handled above)
    RETURN OLD;
  END IF;

  -- Skip if no building_number or main_asset_type
  IF NEW.building_number IS NULL OR NEW.main_asset_type IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if type or size changed (for UPDATE)
  IF TG_OP = 'UPDATE' THEN
    v_old_type := OLD.main_asset_type;
    v_new_type := NEW.main_asset_type;
    
    IF (v_old_type IS DISTINCT FROM v_new_type) THEN
      v_type_changed := TRUE;
    END IF;
    -- Check if asset_size changed (use IS DISTINCT FROM to handle NULLs correctly)
    IF (OLD.asset_size IS DISTINCT FROM NEW.asset_size) THEN
      v_size_changed := TRUE;
    END IF;
  ELSE
    -- For INSERT, check if asset_size is set
    IF NEW.asset_size IS NOT NULL AND NEW.asset_size > 0 THEN
      v_size_changed := TRUE;
    END IF;
    v_type_changed := TRUE; -- New asset always checks type
  END IF;

  -- Only proceed if something changed
  IF NOT v_type_changed AND NOT v_size_changed THEN
    RETURN NEW;
  END IF;

  -- Get business_residence for the asset type
  SELECT business_residence INTO v_business_residence
  FROM asset_types
  WHERE name = NEW.main_asset_type;

  -- Set appropriate distribution flag based on business_residence
  -- Handle size changes independently - if size changed, set flag based on current type
  IF v_size_changed THEN
    -- Size changed - set flag based on current type's business_residence
    IF v_business_residence = 'עסקים' THEN
      -- Business asset size changed → set business distribution flag only
      -- BUT only if building has business_shared_area > 0
      UPDATE buildings
      SET need_business_distribution = true
      WHERE building_number = NEW.building_number
        AND COALESCE(business_shared_area, 0) > 0;
    ELSIF v_business_residence = 'מגורים' THEN
      -- Residence asset size changed → set residence distribution flag only
      UPDATE buildings
      SET need_residence_distribution = true
      WHERE building_number = NEW.building_number;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_auto_set_distribution_flags_on_change ON assets;

-- Create trigger that fires after insert or update
-- Fire on any UPDATE (not just specific columns) to catch all changes
-- The function will check which fields actually changed
CREATE TRIGGER trigger_auto_set_distribution_flags_on_change
  AFTER INSERT OR UPDATE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_distribution_flags_on_change();

COMMENT ON FUNCTION auto_set_distribution_flags_on_change IS 'Automatically sets building distribution flags when asset main_asset_type or asset_size changes. Works for both direct table operations and transactional function calls.';

-- ============================================================================
-- REMOVE shared_area_usage COLUMN FROM asset_types TABLE
-- ============================================================================

-- Drop the shared_area_usage column from asset_types table
ALTER TABLE asset_types DROP COLUMN IF EXISTS shared_area_usage;

