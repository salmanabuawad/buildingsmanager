-- Fix log_audit_entry function signature to match bulk save calls
-- The bulk save function calls log_audit_entry with 10 parameters (including building_number, overload_ratio, shared_area_size)
-- Note: entity_id already holds the building number, so we don't need a separate building_number column
-- Note: overload_ratio and shared_area_size parameters are accepted for compatibility but not stored in audit table

-- Drop the 7-parameter version first
DROP FUNCTION IF EXISTS log_audit_entry(audit_action_type, text, text, text, jsonb, jsonb, text);

-- Create with 10 parameters to match bulk save calls
-- Note: p_building_number parameter is accepted for compatibility but entity_id is used instead
CREATE OR REPLACE FUNCTION log_audit_entry(
  p_action_type audit_action_type,
  p_entity_type text,
  p_entity_id text,
  p_user_id text DEFAULT NULL, -- auth_user_id (UUID as text or 'uid:user_id' for users-table auth)
  p_before_data jsonb DEFAULT NULL,
  p_after_data jsonb DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_building_number BIGINT DEFAULT NULL, -- Accepted for compatibility, but entity_id is used instead
  p_overload_ratio NUMERIC DEFAULT NULL,
  p_shared_area_size NUMERIC DEFAULT NULL
)
RETURNS bigint AS $$
DECLARE
  v_audit_id bigint;
  v_user_id_fk bigint;
  v_default_user_id bigint;
BEGIN
  -- Get or create user from p_user_id (supports both Supabase Auth UUIDs and users-table 'uid:user_id' format)
  IF p_user_id IS NOT NULL THEN
    -- Handle users-table auth format: 'uid:user_id'
    IF p_user_id LIKE 'uid:%' THEN
      SELECT user_id INTO v_user_id_fk
      FROM users
      WHERE auth_user_id = p_user_id;
    ELSE
      -- Handle Supabase Auth UUID format
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
    END IF;
  ELSE
    -- Try to get user from auth context if available
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
  
  -- Insert audit record using entity_id (which holds the building number)
  -- Note: p_building_number, p_overload_ratio, and p_shared_area_size are accepted for compatibility but not stored
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

COMMENT ON FUNCTION log_audit_entry(audit_action_type, text, text, text, jsonb, jsonb, text, bigint, numeric, numeric) IS 'Log audit entry. entity_id holds the building number. Supports both Supabase Auth UUIDs and users-table auth_user_id format (uid:user_id).';

-- Force PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
