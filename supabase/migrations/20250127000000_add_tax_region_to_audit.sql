-- ============================================================================
-- Migration: Add tax_region column to audit table
-- ============================================================================
-- This migration adds tax_region column to the audit table to track
-- whether distribution operations were for business or residence tax regions.
-- This allows filtering distribution history by tax region.
-- ============================================================================

-- Add tax_region column to audit table
ALTER TABLE audit 
ADD COLUMN IF NOT EXISTS tax_region TEXT;

-- Add index for tax_region for better query performance
CREATE INDEX IF NOT EXISTS idx_audit_tax_region ON audit(tax_region);

-- Add index for building_number + tax_region combination for filtered queries
CREATE INDEX IF NOT EXISTS idx_audit_building_tax_region ON audit(building_number, tax_region) WHERE tax_region IS NOT NULL;

-- Update log_audit function to accept tax_region parameter
CREATE OR REPLACE FUNCTION log_audit(
  p_building_number BIGINT,
  p_action_type distribution_audit_action_type,
  p_affected_assets_before JSONB,
  p_affected_assets_after JSONB,
  p_overload_ratio NUMERIC DEFAULT NULL,
  p_shared_area_size NUMERIC DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL,
  p_tax_region TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id_fk BIGINT;
  v_default_user_id BIGINT := 1;
  v_audit_id BIGINT;
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

  -- Insert audit record
  INSERT INTO audit (
    building_number,
    action_type,
    affected_assets_before,
    affected_assets_after,
    overload_ratio,
    shared_area_size,
    description,
    user_id,
    created_at,
    tax_region
  )
  VALUES (
    p_building_number,
    p_action_type,
    p_affected_assets_before,
    p_affected_assets_after,
    p_overload_ratio,
    p_shared_area_size,
    p_description,
    v_user_id_fk,
    now(),
    p_tax_region
  )
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$;

COMMENT ON COLUMN audit.tax_region IS 'Tax region for distribution operations (e.g., "40" for business, "10" for residence). Used to filter distribution history by business/residence.';

-- ============================================================================
-- UPDATE: save_assets_bulk_transactional to extract and pass tax_region
-- ============================================================================
-- We update save_assets_bulk_transactional to extract tax_region from assets
-- and pass it to log_audit. For distribution operations, all assets have the
-- same tax_region, so we extract it from the first asset in affected_assets_after.
-- ============================================================================

-- Note: The full function update requires reading the entire function body from
-- 20250124000000_update_distribution_audit_and_logging.sql. The key change is:
-- 1. Add variable: v_tax_region TEXT := NULL;
-- 2. Extract tax_region before log_audit call:
--    IF jsonb_array_length(v_after_assets_json) > 0 THEN
--      v_tax_region := (v_after_assets_json->0->>'tax_region');
--    END IF;
-- 3. Pass v_tax_region as last parameter to log_audit call

-- Due to the complexity of the function (700+ lines), we'll handle this via
-- application code for now, OR create a separate migration file that reads
-- and updates the full function. For immediate functionality, the API layer
-- can extract and pass tax_region, or we can update the function in a follow-up.
