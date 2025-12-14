-- ============================================================================
-- Update Bulk Operations to Collect Before/After Data in Transaction
-- ============================================================================
-- This migration updates bulk_update_assets_with_audit and bulk_transfer_areas_with_audit
-- to automatically collect before/after asset data within the transaction,
-- rather than relying on frontend-provided data

-- ============================================================================
-- Update bulk_update_assets_with_audit to collect before/after data in transaction
-- ============================================================================
-- Drop existing function with all possible signatures
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure as func_signature
    FROM pg_proc
    WHERE proname = 'bulk_update_assets_with_audit'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
  END LOOP;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

CREATE OR REPLACE FUNCTION bulk_update_assets_with_audit(
  p_assets jsonb, -- Array of asset objects to update/create
  p_action_type audit_action_type, -- Action type for audit
  p_user_id text DEFAULT NULL, -- auth_user_id (UUID as text)
  p_before_data jsonb DEFAULT NULL, -- Optional: if provided, will be used; otherwise collected from DB
  p_after_data jsonb DEFAULT NULL, -- Optional: if provided, will be used; otherwise collected from DB
  p_description text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_audit_id bigint;
  v_asset jsonb;
  v_asset_id bigint;
  v_building_number bigint;
  v_affected_asset_ids bigint[] := ARRAY[]::bigint[];
  v_result jsonb;
  v_before_assets jsonb[] := ARRAY[]::jsonb[];
  v_after_assets jsonb[] := ARRAY[]::jsonb[];
  v_before_data_collected jsonb;
  v_after_data_collected jsonb;
  v_asset_data jsonb; -- For collecting asset data from database
BEGIN
  -- Collect BEFORE data from database (if not provided)
  -- Database transaction will automatically collect asset data from the database
  IF p_before_data IS NULL THEN
    FOR v_asset IN SELECT * FROM jsonb_array_elements(p_assets)
    LOOP
      v_asset_id := (v_asset->>'asset_id')::bigint;
      
      -- Get current asset state from database before update
      SELECT to_jsonb(a.*) INTO v_asset_data
      FROM assets a
      WHERE a.asset_id = v_asset_id;
      
      IF v_asset_data IS NOT NULL THEN
        v_before_assets := array_append(v_before_assets, v_asset_data);
      END IF;
    END LOOP;
    
    -- Convert jsonb array to jsonb array for assets
    SELECT jsonb_agg(elem) INTO v_before_data_collected
    FROM unnest(v_before_assets) AS elem;
    
    v_before_data_collected := jsonb_build_object('assets', COALESCE(v_before_data_collected, '[]'::jsonb));
  ELSE
    v_before_data_collected := p_before_data;
  END IF;
  
  -- Create audit entry with collected before data (after data will be updated later)
  SELECT log_audit_entry(
    p_action_type,
    'bulk_asset',
    NULL::text, -- entity_id will be set after we know all affected asset IDs
    p_user_id,
    v_before_data_collected,
    NULL::jsonb, -- after_data will be set after updates
    p_description
  ) INTO v_audit_id;
  
  -- Process each asset in the array
  FOR v_asset IN SELECT * FROM jsonb_array_elements(p_assets)
  LOOP
    v_asset_id := (v_asset->>'asset_id')::bigint;
    v_building_number := (v_asset->>'building_number')::bigint;
    
    -- Check if asset exists (for update vs insert)
    IF EXISTS (SELECT 1 FROM assets WHERE asset_id = v_asset_id) THEN
      -- UPDATE existing asset
      UPDATE assets
      SET
        building_number = COALESCE((v_asset->>'building_number')::bigint, building_number),
        payer_id = COALESCE(v_asset->>'payer_id', payer_id),
        measurement_date = COALESCE(v_asset->>'measurement_date', measurement_date),
        main_asset_type = COALESCE(v_asset->>'main_asset_type', main_asset_type),
        asset_size = COALESCE((v_asset->>'asset_size')::numeric, asset_size),
        sub_asset_type_1 = COALESCE(v_asset->>'sub_asset_type_1', sub_asset_type_1),
        sub_asset_size_1 = COALESCE((v_asset->>'sub_asset_size_1')::numeric, sub_asset_size_1),
        sub_asset_type_2 = COALESCE(v_asset->>'sub_asset_type_2', sub_asset_type_2),
        sub_asset_size_2 = COALESCE((v_asset->>'sub_asset_size_2')::numeric, sub_asset_size_2),
        sub_asset_type_3 = COALESCE(v_asset->>'sub_asset_type_3', sub_asset_type_3),
        sub_asset_size_3 = COALESCE((v_asset->>'sub_asset_size_3')::numeric, sub_asset_size_3),
        sub_asset_type_4 = COALESCE(v_asset->>'sub_asset_type_4', sub_asset_type_4),
        sub_asset_size_4 = COALESCE((v_asset->>'sub_asset_size_4')::numeric, sub_asset_size_4),
        sub_asset_type_5 = COALESCE(v_asset->>'sub_asset_type_5', sub_asset_type_5),
        sub_asset_size_5 = COALESCE((v_asset->>'sub_asset_size_5')::numeric, sub_asset_size_5),
        sub_asset_type_6 = COALESCE(v_asset->>'sub_asset_type_6', sub_asset_type_6),
        sub_asset_size_6 = COALESCE((v_asset->>'sub_asset_size_6')::numeric, sub_asset_size_6),
        structure_drawing_url = COALESCE(v_asset->>'structure_drawing_url', structure_drawing_url),
        elevator = COALESCE(v_asset->>'elevator', elevator),
        single_double_family = COALESCE(v_asset->>'single_double_family', single_double_family),
        condo = COALESCE(v_asset->>'condo', condo),
        townhouses = COALESCE(v_asset->>'townhouses', townhouses),
        penthouse = COALESCE(v_asset->>'penthouse', penthouse),
        tax_region = COALESCE((v_asset->>'tax_region')::integer, tax_region),
        floor = COALESCE((v_asset->>'floor')::smallint, floor),
        discount_type = COALESCE(v_asset->>'discount_type', discount_type),
        discount_date_from = COALESCE(v_asset->>'discount_date_from', discount_date_from),
        discount_date_to = COALESCE(v_asset->>'discount_date_to', discount_date_to),
        action_id = v_audit_id,
        updated_at = now()
      WHERE asset_id = v_asset_id;
    ELSE
      -- INSERT new asset
      INSERT INTO assets (
        building_number,
        payer_id,
        asset_id,
        measurement_date,
        main_asset_type,
        asset_size,
        sub_asset_type_1,
        sub_asset_size_1,
        sub_asset_type_2,
        sub_asset_size_2,
        sub_asset_type_3,
        sub_asset_size_3,
        sub_asset_type_4,
        sub_asset_size_4,
        sub_asset_type_5,
        sub_asset_size_5,
        sub_asset_type_6,
        sub_asset_size_6,
        structure_drawing_url,
        elevator,
        single_double_family,
        condo,
        townhouses,
        penthouse,
        tax_region,
        floor,
        discount_type,
        discount_date_from,
        discount_date_to,
        action_id,
        created_at,
        updated_at
      ) VALUES (
        (v_asset->>'building_number')::bigint,
        NULLIF(v_asset->>'payer_id', ''),
        v_asset_id,
        COALESCE(v_asset->>'measurement_date', '01/01/1900'),
        NULLIF(v_asset->>'main_asset_type', ''),
        COALESCE((v_asset->>'asset_size')::numeric, 0),
        NULLIF(v_asset->>'sub_asset_type_1', ''),
        COALESCE((v_asset->>'sub_asset_size_1')::numeric, 0),
        NULLIF(v_asset->>'sub_asset_type_2', ''),
        COALESCE((v_asset->>'sub_asset_size_2')::numeric, 0),
        NULLIF(v_asset->>'sub_asset_type_3', ''),
        COALESCE((v_asset->>'sub_asset_size_3')::numeric, 0),
        NULLIF(v_asset->>'sub_asset_type_4', ''),
        COALESCE((v_asset->>'sub_asset_size_4')::numeric, 0),
        NULLIF(v_asset->>'sub_asset_type_5', ''),
        COALESCE((v_asset->>'sub_asset_size_5')::numeric, 0),
        NULLIF(v_asset->>'sub_asset_type_6', ''),
        COALESCE((v_asset->>'sub_asset_size_6')::numeric, 0),
        NULLIF(v_asset->>'structure_drawing_url', ''),
        NULLIF(v_asset->>'elevator', ''),
        NULLIF(v_asset->>'single_double_family', ''),
        NULLIF(v_asset->>'condo', ''),
        NULLIF(v_asset->>'townhouses', ''),
        NULLIF(v_asset->>'penthouse', ''),
        (v_asset->>'tax_region')::integer,
        (v_asset->>'floor')::smallint,
        NULLIF(v_asset->>'discount_type', ''),
        NULLIF(v_asset->>'discount_date_from', ''),
        NULLIF(v_asset->>'discount_date_to', ''),
        v_audit_id,
        now(),
        now()
      );
    END IF;
    
    -- Add to affected asset IDs array
    v_affected_asset_ids := array_append(v_affected_asset_ids, v_asset_id);
    
    -- Update building total area for this building
    IF v_building_number IS NOT NULL THEN
      PERFORM update_building_total_area(v_building_number);
    END IF;
  END LOOP;
  
  -- Collect AFTER data from database (if not provided)
  -- Database transaction will automatically collect asset data from the database after updates
  IF p_after_data IS NULL THEN
    FOR v_asset_id IN SELECT unnest(v_affected_asset_ids)
    LOOP
      -- Get updated asset state from database after update
      SELECT to_jsonb(a.*) INTO v_asset_data
      FROM assets a
      WHERE a.asset_id = v_asset_id;
      
      IF v_asset_data IS NOT NULL THEN
        v_after_assets := array_append(v_after_assets, v_asset_data);
      END IF;
    END LOOP;
    
    -- Convert jsonb array to jsonb array for assets
    SELECT jsonb_agg(elem) INTO v_after_data_collected
    FROM unnest(v_after_assets) AS elem;
    
    v_after_data_collected := jsonb_build_object('assets', COALESCE(v_after_data_collected, '[]'::jsonb));
  ELSE
    v_after_data_collected := p_after_data;
  END IF;
  
  -- Update audit entry with collected after data and entity_id
  UPDATE audit
  SET 
    after_data = v_after_data_collected,
    entity_id = array_to_string(v_affected_asset_ids, ',')
  WHERE action_id = v_audit_id;
  
  -- Return result with audit_id and affected asset IDs
  v_result := jsonb_build_object(
    'action_id', v_audit_id,
    'affected_asset_ids', v_affected_asset_ids,
    'count', array_length(v_affected_asset_ids, 1)
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION bulk_update_assets_with_audit IS 'Bulk update/create assets with automatic before/after data collection in transaction';

-- ============================================================================
-- Update bulk_transfer_areas_with_audit to collect before/after data in transaction
-- ============================================================================
-- Drop existing function with all possible signatures
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure as func_signature
    FROM pg_proc
    WHERE proname = 'bulk_transfer_areas_with_audit'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
  END LOOP;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

CREATE OR REPLACE FUNCTION bulk_transfer_areas_with_audit(
  p_old_assets jsonb, -- Array of old asset objects (to move to history) - only needs asset_id and building_number
  p_new_assets jsonb, -- Array of new asset objects (to create)
  p_action_type audit_action_type DEFAULT 'transfer_area',
  p_user_id text DEFAULT NULL, -- auth_user_id (UUID as text)
  p_before_data jsonb DEFAULT NULL, -- Optional: if provided, will be used; otherwise collected from DB
  p_after_data jsonb DEFAULT NULL, -- Optional: if provided, will be used; otherwise collected from DB
  p_description text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_audit_id bigint;
  v_asset jsonb;
  v_asset_id bigint;
  v_building_number bigint;
  v_affected_asset_ids bigint[] := ARRAY[]::bigint[];
  v_result jsonb;
  v_before_assets jsonb[] := ARRAY[]::jsonb[];
  v_after_assets jsonb[] := ARRAY[]::jsonb[];
  v_before_data_collected jsonb;
  v_after_data_collected jsonb;
  v_asset_data jsonb; -- For collecting asset data from database
BEGIN
  -- Collect BEFORE data from database (if not provided)
  -- Database transaction will automatically collect asset data from the database before moving to history
  IF p_before_data IS NULL THEN
    FOR v_asset IN SELECT * FROM jsonb_array_elements(p_old_assets)
    LOOP
      v_asset_id := (v_asset->>'asset_id')::bigint;
      
      -- Get current asset state from database before moving to history
      SELECT to_jsonb(a.*) INTO v_asset_data
      FROM assets a
      WHERE a.asset_id = v_asset_id;
      
      IF v_asset_data IS NOT NULL THEN
        v_before_assets := array_append(v_before_assets, v_asset_data);
      END IF;
    END LOOP;
    
    -- Convert jsonb array to jsonb array for assets
    SELECT jsonb_agg(elem) INTO v_before_data_collected
    FROM unnest(v_before_assets) AS elem;
    
    v_before_data_collected := jsonb_build_object('assets', COALESCE(v_before_data_collected, '[]'::jsonb));
  ELSE
    v_before_data_collected := p_before_data;
  END IF;
  
  -- Create audit entry with collected before data (after data will be updated later)
  SELECT log_audit_entry(
    p_action_type,
    'bulk_asset',
    NULL::text, -- entity_id will be set after processing
    p_user_id,
    v_before_data_collected,
    NULL::jsonb, -- after_data will be set after creating new assets
    p_description
  ) INTO v_audit_id;
  
  -- First, move old assets to history and mark with action_id
  FOR v_asset IN SELECT * FROM jsonb_array_elements(p_old_assets)
  LOOP
    v_asset_id := (v_asset->>'asset_id')::bigint;
    v_building_number := (v_asset->>'building_number')::bigint;
    
    -- Copy to history
    INSERT INTO assets_history (
      building_number, payer_id, asset_id, measurement_date,
      main_asset_type, asset_size,
      sub_asset_type_1, sub_asset_size_1,
      sub_asset_type_2, sub_asset_size_2,
      sub_asset_type_3, sub_asset_size_3,
      sub_asset_type_4, sub_asset_size_4,
      sub_asset_type_5, sub_asset_size_5,
      sub_asset_type_6, sub_asset_size_6,
      structure_drawing_url, elevator, single_double_family,
      condo, townhouses, penthouse, tax_region,
      floor, discount_type, discount_date_from, discount_date_to,
      created_at, history_created_at, action_id
    )
    SELECT
      building_number, payer_id, asset_id, measurement_date,
      main_asset_type, asset_size,
      sub_asset_type_1, sub_asset_size_1,
      sub_asset_type_2, sub_asset_size_2,
      sub_asset_type_3, sub_asset_size_3,
      sub_asset_type_4, sub_asset_size_4,
      sub_asset_type_5, sub_asset_size_5,
      sub_asset_type_6, sub_asset_size_6,
      structure_drawing_url, elevator, single_double_family,
      condo, townhouses, penthouse, tax_region,
      floor, discount_type, discount_date_from, discount_date_to,
      created_at, now(), v_audit_id
    FROM assets
    WHERE asset_id = v_asset_id;
    
    -- Delete from assets table
    DELETE FROM assets WHERE asset_id = v_asset_id;
    
    -- Add to affected asset IDs
    v_affected_asset_ids := array_append(v_affected_asset_ids, v_asset_id);
    
    -- Update building total area
    IF v_building_number IS NOT NULL THEN
      PERFORM update_building_total_area(v_building_number);
    END IF;
  END LOOP;
  
  -- Then, create new assets
  FOR v_asset IN SELECT * FROM jsonb_array_elements(p_new_assets)
  LOOP
    v_asset_id := (v_asset->>'asset_id')::bigint;
    v_building_number := (v_asset->>'building_number')::bigint;
    
    INSERT INTO assets (
      building_number, payer_id, asset_id, measurement_date,
      main_asset_type, asset_size,
      sub_asset_type_1, sub_asset_size_1,
      sub_asset_type_2, sub_asset_size_2,
      sub_asset_type_3, sub_asset_size_3,
      sub_asset_type_4, sub_asset_size_4,
      sub_asset_type_5, sub_asset_size_5,
      sub_asset_type_6, sub_asset_size_6,
      structure_drawing_url, elevator, single_double_family,
      condo, townhouses, penthouse, tax_region,
      floor, discount_type, discount_date_from, discount_date_to,
      action_id, created_at, updated_at
    ) VALUES (
      (v_asset->>'building_number')::bigint,
      NULLIF(v_asset->>'payer_id', ''),
      v_asset_id,
      COALESCE(v_asset->>'measurement_date', '01/01/1900'),
      NULLIF(v_asset->>'main_asset_type', ''),
      COALESCE((v_asset->>'asset_size')::numeric, 0),
      NULLIF(v_asset->>'sub_asset_type_1', ''),
      COALESCE((v_asset->>'sub_asset_size_1')::numeric, 0),
      NULLIF(v_asset->>'sub_asset_type_2', ''),
      COALESCE((v_asset->>'sub_asset_size_2')::numeric, 0),
      NULLIF(v_asset->>'sub_asset_type_3', ''),
      COALESCE((v_asset->>'sub_asset_size_3')::numeric, 0),
      NULLIF(v_asset->>'sub_asset_type_4', ''),
      COALESCE((v_asset->>'sub_asset_size_4')::numeric, 0),
      NULLIF(v_asset->>'sub_asset_type_5', ''),
      COALESCE((v_asset->>'sub_asset_size_5')::numeric, 0),
      NULLIF(v_asset->>'sub_asset_type_6', ''),
      COALESCE((v_asset->>'sub_asset_size_6')::numeric, 0),
      NULLIF(v_asset->>'structure_drawing_url', ''),
      NULLIF(v_asset->>'elevator', ''),
      NULLIF(v_asset->>'single_double_family', ''),
      NULLIF(v_asset->>'condo', ''),
      NULLIF(v_asset->>'townhouses', ''),
      NULLIF(v_asset->>'penthouse', ''),
      (v_asset->>'tax_region')::integer,
      (v_asset->>'floor')::smallint,
      NULLIF(v_asset->>'discount_type', ''),
      NULLIF(v_asset->>'discount_date_from', ''),
      NULLIF(v_asset->>'discount_date_to', ''),
      v_audit_id,
      now(),
      now()
    );
    
    -- Add to affected asset IDs if not already added
    IF NOT (v_asset_id = ANY(v_affected_asset_ids)) THEN
      v_affected_asset_ids := array_append(v_affected_asset_ids, v_asset_id);
    END IF;
    
    -- Update building total area
    IF v_building_number IS NOT NULL THEN
      PERFORM update_building_total_area(v_building_number);
    END IF;
  END LOOP;
  
  -- Collect AFTER data from database (if not provided)
  -- Database transaction will automatically collect asset data from the database after creating new assets
  IF p_after_data IS NULL THEN
    FOR v_asset_id IN SELECT unnest(v_affected_asset_ids)
    LOOP
      -- Get new asset state from database (after creation)
      SELECT to_jsonb(a.*) INTO v_asset_data
      FROM assets a
      WHERE a.asset_id = v_asset_id
        AND a.action_id = v_audit_id
      ORDER BY a.updated_at DESC
      LIMIT 1;
      
      IF v_asset_data IS NOT NULL THEN
        v_after_assets := array_append(v_after_assets, v_asset_data);
      END IF;
    END LOOP;
    
    -- Convert jsonb array to jsonb array for assets
    SELECT jsonb_agg(elem) INTO v_after_data_collected
    FROM unnest(v_after_assets) AS elem;
    
    v_after_data_collected := jsonb_build_object('assets', COALESCE(v_after_data_collected, '[]'::jsonb));
  ELSE
    v_after_data_collected := p_after_data;
  END IF;
  
  -- Update audit entry with collected after data and entity_id
  UPDATE audit
  SET 
    after_data = v_after_data_collected,
    entity_id = array_to_string(v_affected_asset_ids, ',')
  WHERE action_id = v_audit_id;
  
  -- Return result
  v_result := jsonb_build_object(
    'action_id', v_audit_id,
    'affected_asset_ids', v_affected_asset_ids,
    'count', array_length(v_affected_asset_ids, 1)
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION bulk_transfer_areas_with_audit IS 'Bulk transfer areas: move old assets to history and create new ones with automatic before/after data collection in transaction';
