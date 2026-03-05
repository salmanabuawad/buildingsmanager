-- ============================================================================
-- Apply critical save functions for database operation
-- ============================================================================

-- Function: log_audit_for_asset (helper function for audit logging)
CREATE OR REPLACE FUNCTION log_audit_for_asset(
  p_asset_id BIGINT,
  p_operation TEXT,
  p_user_id TEXT DEFAULT NULL,
  p_action_type audit_action_type DEFAULT 'manual_update',
  p_copy_to_history BOOLEAN DEFAULT false,
  p_description TEXT DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
  v_audit_id BIGINT;
  v_before_data JSONB := NULL;
  v_after_data JSONB := NULL;
  v_asset_record RECORD;
BEGIN
  -- For UPDATE, capture before_data from current asset state
  IF p_operation = 'UPDATE' THEN
    SELECT to_jsonb(a.*) INTO v_before_data
    FROM assets a
    WHERE a.asset_id = p_asset_id;
    
    -- Copy to history if requested
    IF p_copy_to_history AND v_before_data IS NOT NULL THEN
      PERFORM copy_asset_to_history_before_update(p_asset_id);
    END IF;
  END IF;
  
  -- For INSERT or UPDATE after changes, capture after_data
  IF p_operation IN ('INSERT', 'UPDATE') THEN
    SELECT to_jsonb(a.*) INTO v_after_data
    FROM assets a
    WHERE a.asset_id = p_asset_id;
  END IF;
  
  -- Log audit entry
  v_audit_id := log_audit_entry(
    p_action_type,
    'asset',
    p_asset_id::TEXT,
    p_user_id,
    v_before_data,
    v_after_data,
    p_description
  );
  
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: log_audit_entry
CREATE OR REPLACE FUNCTION log_audit_entry(
  p_action_type audit_action_type,
  p_entity_type text,
  p_entity_id text,
  p_user_id text DEFAULT NULL,
  p_before_data jsonb DEFAULT NULL,
  p_after_data jsonb DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_building_number BIGINT DEFAULT NULL,
  p_overload_ratio NUMERIC DEFAULT NULL,
  p_shared_area_size NUMERIC DEFAULT NULL
)
RETURNS bigint AS $$
DECLARE
  v_audit_id bigint;
  v_user_id_fk bigint;
BEGIN
  -- Get or create user
  v_user_id_fk := get_or_create_user_from_auth();
  
  -- Insert audit record
  INSERT INTO audit (
    user_id,
    action_type,
    entity_type,
    entity_id,
    before_data,
    after_data,
    description,
    building_number,
    overload_ratio,
    shared_area_size
  ) VALUES (
    v_user_id_fk,
    p_action_type,
    p_entity_type,
    p_entity_id,
    p_before_data,
    p_after_data,
    p_description,
    p_building_number,
    p_overload_ratio,
    p_shared_area_size
  )
  RETURNING id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT 'Audit functions created successfully' as status;