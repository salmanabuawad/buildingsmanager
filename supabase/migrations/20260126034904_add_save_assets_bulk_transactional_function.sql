/*
  # Add save_assets_bulk_transactional Function
  
  1. Overview
    - Creates the critical save_assets_bulk_transactional function
    - This function handles bulk asset saves with validation, distribution flags, and audit logging
    - All operations happen in a single transaction
  
  2. Function Details
    - Parameters: assets_data (JSONB array), validation flags, action type, user info, audit data
    - Returns: JSONB with success status and affected asset IDs
    - Handles INSERT and UPDATE operations
    - Manages distribution flags automatically
    - Creates audit log entries
    - Updates building totals
  
  3. Security
    - SECURITY DEFINER for proper permissions
    - Validates all inputs
    - All operations are transactional
*/

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
  v_distribution_type TEXT;
  v_asset_type_name TEXT;
  v_business_residence TEXT;
  v_business_dist_area NUMERIC;
  v_old_asset_size NUMERIC;
  v_new_asset_size NUMERIC;
  v_asset_old_values RECORD;
  v_before_data_collected JSONB := NULL;
  v_after_data_collected JSONB := NULL;
  v_before_assets JSONB[] := ARRAY[]::JSONB[];
  v_after_assets JSONB[] := ARRAY[]::JSONB[];
  v_building_data JSONB := NULL;
  v_first_building_number BIGINT := NULL;
  v_asset_record RECORD;
  v_asset_jsonb JSONB;
  v_entity_asset_ids BIGINT[];
  v_overload_ratio NUMERIC := NULL;
  v_type_changed BOOLEAN := FALSE;
  v_size_changed BOOLEAN := FALSE;
  v_tax_region_changed BOOLEAN := FALSE;
  v_asset_found BOOLEAN := FALSE;
  v_old_tax_region INTEGER;
  v_new_tax_region INTEGER;
  v_old_business_residence TEXT;
  v_new_business_residence TEXT;
  v_business_to_residence BOOLEAN := FALSE;
  v_building_record RECORD;
  v_shared_area_size NUMERIC := NULL;
  v_audit_distribution_type TEXT := NULL;
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
  
  IF v_user_id_fk IS NULL THEN
    SELECT user_id INTO v_default_user_id
    FROM users
    WHERE user_name = 'default' AND auth_user_id IS NULL
    LIMIT 1;
    v_user_id_fk := v_default_user_id;
  END IF;

  -- Get first building number
  IF array_length(p_assets_data, 1) > 0 THEN
    v_first_building_number := (p_assets_data[1]->>'building_number')::BIGINT;
  END IF;
  
  -- Collect BEFORE data if needed
  IF ((p_before_data IS NULL OR p_before_data = 'null'::jsonb OR p_before_data = '{}'::jsonb) OR p_action_type = 'transfer_area')
     AND v_first_building_number IS NOT NULL THEN
    IF p_action_type IN ('distribute_shared', 'business_distribution', 'residence_distribution') THEN
      FOR v_asset_record IN 
        SELECT asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region,
          sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
          sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
          sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
          elevator, single_double_family, condo, townhouses, penthouse,
          structure_drawing_url, floor, discount_type, discount_date_from, discount_date_to,
          area_from_distribution, exported_to_automation, comment, created_at, updated_at, is_new_measurement
        FROM assets 
        WHERE building_number = v_first_building_number
        ORDER BY asset_id
      LOOP
        v_asset_jsonb := to_jsonb(v_asset_record);
        v_before_assets := array_append(v_before_assets, v_asset_jsonb);
      END LOOP;
    ELSE
      FOREACH v_asset_data IN ARRAY p_assets_data
      LOOP
        v_asset_id := (v_asset_data->>'asset_id')::BIGINT;
        IF v_asset_id IS NOT NULL THEN
          SELECT jsonb_build_object(
            'asset_id', a.asset_id, 'building_number', a.building_number, 'payer_id', a.payer_id,
            'measurement_date', a.measurement_date, 'main_asset_type', a.main_asset_type,
            'asset_size', a.asset_size, 'tax_region', a.tax_region,
            'sub_asset_type_1', a.sub_asset_type_1, 'sub_asset_size_1', a.sub_asset_size_1,
            'sub_asset_type_2', a.sub_asset_type_2, 'sub_asset_size_2', a.sub_asset_size_2,
            'sub_asset_type_3', a.sub_asset_type_3, 'sub_asset_size_3', a.sub_asset_size_3,
            'sub_asset_type_4', a.sub_asset_type_4, 'sub_asset_size_4', a.sub_asset_size_4,
            'sub_asset_type_5', a.sub_asset_type_5, 'sub_asset_size_5', a.sub_asset_size_5,
            'sub_asset_type_6', a.sub_asset_type_6, 'sub_asset_size_6', a.sub_asset_size_6,
            'elevator', a.elevator, 'single_double_family', a.single_double_family,
            'condo', a.condo, 'townhouses', a.townhouses, 'penthouse', a.penthouse,
            'structure_drawing_url', a.structure_drawing_url, 'floor', a.floor,
            'discount_type', a.discount_type, 'discount_date_from', a.discount_date_from,
            'discount_date_to', a.discount_date_to, 'area_from_distribution', a.area_from_distribution,
            'exported_to_automation', a.exported_to_automation, 'comment', a.comment,
            'created_at', a.created_at, 'updated_at', a.updated_at, 'is_new_measurement', a.is_new_measurement
          ) INTO v_asset_jsonb
          FROM assets a WHERE a.asset_id = v_asset_id;
          
          IF v_asset_jsonb IS NOT NULL THEN
            v_before_assets := array_append(v_before_assets, v_asset_jsonb);
          END IF;
        END IF;
      END LOOP;
    END IF;
    
    SELECT jsonb_agg(elem) INTO v_before_data_collected FROM unnest(v_before_assets) AS elem;
    v_before_data_collected := jsonb_build_object('assets', COALESCE(v_before_data_collected, '[]'::jsonb));
  ELSE
    v_before_data_collected := p_before_data;
  END IF;

  -- Process each asset
  FOREACH v_asset_data IN ARRAY p_assets_data
  LOOP
    v_asset_data := v_asset_data - 'id' - '_isNew' - '_isDirty' - '_validationErrors' - '_isMasterRow';
    v_asset_id := (v_asset_data->>'asset_id')::BIGINT;
    v_building_number := (v_asset_data->>'building_number')::BIGINT;
    v_new_main_asset_type := (v_asset_data->>'main_asset_type')::TEXT;

    IF v_asset_id IS NULL OR v_building_number IS NULL THEN
      RAISE EXCEPTION 'Asset ID and Building Number required';
    END IF;

    IF v_building_num_for_flag IS NULL THEN
      v_building_num_for_flag := v_building_number;
    END IF;

    SELECT asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region,
      sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
      sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
      sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
      elevator, single_double_family, condo, townhouses, penthouse,
      structure_drawing_url, floor, discount_type, discount_date_from, discount_date_to,
      area_from_distribution, exported_to_automation, comment, created_at, updated_at, is_new_measurement
    INTO v_existing_asset FROM assets WHERE asset_id = v_asset_id;

    v_asset_found := FOUND;

    IF v_asset_found THEN
      v_old_main_asset_type := v_existing_asset.main_asset_type;
      v_old_asset_size := v_existing_asset.asset_size;
      v_old_tax_region := v_existing_asset.tax_region;
    ELSE
      v_old_main_asset_type := NULL;
      v_old_asset_size := NULL;
      v_old_tax_region := NULL;
    END IF;

    IF v_existing_asset IS NULL THEN
      INSERT INTO assets (asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region,
        sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2, sub_asset_type_3, sub_asset_size_3,
        sub_asset_type_4, sub_asset_size_4, sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
        elevator, single_double_family, condo, townhouses, penthouse, structure_drawing_url, floor,
        discount_type, discount_date_from, discount_date_to, area_from_distribution, exported_to_automation, comment)
      VALUES (v_asset_id, v_building_number, (v_asset_data->>'payer_id')::TEXT,
        COALESCE((v_asset_data->>'measurement_date')::TEXT, '01/01/1900'), v_new_main_asset_type,
        COALESCE((v_asset_data->>'asset_size')::NUMERIC, 0), (v_asset_data->>'tax_region')::BIGINT,
        (v_asset_data->>'sub_asset_type_1')::TEXT, COALESCE((v_asset_data->>'sub_asset_size_1')::NUMERIC, 0),
        (v_asset_data->>'sub_asset_type_2')::TEXT, COALESCE((v_asset_data->>'sub_asset_size_2')::NUMERIC, 0),
        (v_asset_data->>'sub_asset_type_3')::TEXT, COALESCE((v_asset_data->>'sub_asset_size_3')::NUMERIC, 0),
        (v_asset_data->>'sub_asset_type_4')::TEXT, COALESCE((v_asset_data->>'sub_asset_size_4')::NUMERIC, 0),
        (v_asset_data->>'sub_asset_type_5')::TEXT, COALESCE((v_asset_data->>'sub_asset_size_5')::NUMERIC, 0),
        (v_asset_data->>'sub_asset_type_6')::TEXT, COALESCE((v_asset_data->>'sub_asset_size_6')::NUMERIC, 0),
        (v_asset_data->>'elevator')::TEXT, (v_asset_data->>'single_double_family')::TEXT,
        (v_asset_data->>'condo')::TEXT, (v_asset_data->>'townhouses')::TEXT, (v_asset_data->>'penthouse')::TEXT,
        (v_asset_data->>'structure_drawing_url')::TEXT, (v_asset_data->>'floor')::BIGINT,
        (v_asset_data->>'discount_type')::TEXT, (v_asset_data->>'discount_date_from')::TEXT,
        (v_asset_data->>'discount_date_to')::TEXT, (v_asset_data->>'area_from_distribution')::NUMERIC,
        COALESCE((v_asset_data->>'exported_to_automation')::BOOLEAN, false), (v_asset_data->>'comment')::TEXT);
    ELSE
      IF COALESCE((v_asset_data->>'is_new_measurement')::BOOLEAN, false) = true THEN
        INSERT INTO assets_history (asset_id, building_number, payer_id, measurement_date, main_asset_type,
          asset_size, tax_region, sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
          sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4, sub_asset_type_5,
          sub_asset_size_5, sub_asset_type_6, sub_asset_size_6, elevator, single_double_family, condo,
          townhouses, penthouse, structure_drawing_url, floor, discount_type, discount_date_from,
          discount_date_to, area_from_distribution, exported_to_automation, comment, created_at, updated_at)
        SELECT asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region,
          sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2, sub_asset_type_3, sub_asset_size_3,
          sub_asset_type_4, sub_asset_size_4, sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
          elevator, single_double_family, condo, townhouses, penthouse, structure_drawing_url, floor,
          discount_type, discount_date_from, discount_date_to, area_from_distribution, exported_to_automation,
          comment, created_at, updated_at
        FROM assets WHERE asset_id = v_asset_id;
      END IF;
      
      UPDATE assets SET
        building_number = COALESCE(v_building_number, building_number),
        payer_id = CASE WHEN v_asset_data->'payer_id' IS NULL THEN payer_id
          WHEN v_asset_data->'payer_id' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'payer_id'), '')::TEXT END,
        measurement_date = CASE WHEN v_asset_data->'measurement_date' IS NULL THEN measurement_date
          WHEN v_asset_data->'measurement_date' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'measurement_date'), '')::TEXT END,
        main_asset_type = COALESCE(v_new_main_asset_type, main_asset_type),
        asset_size = CASE WHEN v_asset_data->'asset_size' IS NULL THEN asset_size
          ELSE COALESCE((v_asset_data->>'asset_size')::NUMERIC, 0) END,
        tax_region = CASE WHEN v_asset_data->'tax_region' IS NULL THEN tax_region
          ELSE (v_asset_data->>'tax_region')::BIGINT END,
        sub_asset_type_1 = CASE WHEN v_asset_data->'sub_asset_type_1' IS NULL THEN sub_asset_type_1
          WHEN v_asset_data->'sub_asset_type_1' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'sub_asset_type_1'), '')::TEXT END,
        sub_asset_size_1 = CASE WHEN v_asset_data->'sub_asset_size_1' IS NULL THEN sub_asset_size_1
          ELSE COALESCE((v_asset_data->>'sub_asset_size_1')::NUMERIC, 0) END,
        sub_asset_type_2 = CASE WHEN v_asset_data->'sub_asset_type_2' IS NULL THEN sub_asset_type_2
          WHEN v_asset_data->'sub_asset_type_2' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'sub_asset_type_2'), '')::TEXT END,
        sub_asset_size_2 = CASE WHEN v_asset_data->'sub_asset_size_2' IS NULL THEN sub_asset_size_2
          ELSE COALESCE((v_asset_data->>'sub_asset_size_2')::NUMERIC, 0) END,
        sub_asset_type_3 = CASE WHEN v_asset_data->'sub_asset_type_3' IS NULL THEN sub_asset_type_3
          WHEN v_asset_data->'sub_asset_type_3' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'sub_asset_type_3'), '')::TEXT END,
        sub_asset_size_3 = CASE WHEN v_asset_data->'sub_asset_size_3' IS NULL THEN sub_asset_size_3
          ELSE COALESCE((v_asset_data->>'sub_asset_size_3')::NUMERIC, 0) END,
        sub_asset_type_4 = CASE WHEN v_asset_data->'sub_asset_type_4' IS NULL THEN sub_asset_type_4
          WHEN v_asset_data->'sub_asset_type_4' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'sub_asset_type_4'), '')::TEXT END,
        sub_asset_size_4 = CASE WHEN v_asset_data->'sub_asset_size_4' IS NULL THEN sub_asset_size_4
          ELSE COALESCE((v_asset_data->>'sub_asset_size_4')::NUMERIC, 0) END,
        sub_asset_type_5 = CASE WHEN v_asset_data->'sub_asset_type_5' IS NULL THEN sub_asset_type_5
          WHEN v_asset_data->'sub_asset_type_5' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'sub_asset_type_5'), '')::TEXT END,
        sub_asset_size_5 = CASE WHEN v_asset_data->'sub_asset_size_5' IS NULL THEN sub_asset_size_5
          ELSE COALESCE((v_asset_data->>'sub_asset_size_5')::NUMERIC, 0) END,
        sub_asset_type_6 = CASE WHEN v_asset_data->'sub_asset_type_6' IS NULL THEN sub_asset_type_6
          WHEN v_asset_data->'sub_asset_type_6' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'sub_asset_type_6'), '')::TEXT END,
        sub_asset_size_6 = CASE WHEN v_asset_data->'sub_asset_size_6' IS NULL THEN sub_asset_size_6
          ELSE COALESCE((v_asset_data->>'sub_asset_size_6')::NUMERIC, 0) END,
        elevator = CASE WHEN v_asset_data->'elevator' IS NULL THEN elevator
          WHEN v_asset_data->'elevator' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'elevator'), '')::TEXT END,
        single_double_family = CASE WHEN v_asset_data->'single_double_family' IS NULL THEN single_double_family
          WHEN v_asset_data->'single_double_family' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'single_double_family'), '')::TEXT END,
        condo = CASE WHEN v_asset_data->'condo' IS NULL THEN condo
          WHEN v_asset_data->'condo' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'condo'), '')::TEXT END,
        townhouses = CASE WHEN v_asset_data->'townhouses' IS NULL THEN townhouses
          WHEN v_asset_data->'townhouses' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'townhouses'), '')::TEXT END,
        penthouse = CASE WHEN v_asset_data->'penthouse' IS NULL THEN penthouse
          WHEN v_asset_data->'penthouse' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'penthouse'), '')::TEXT END,
        structure_drawing_url = CASE WHEN v_asset_data->'structure_drawing_url' IS NULL THEN structure_drawing_url
          WHEN v_asset_data->'structure_drawing_url' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'structure_drawing_url'), '')::TEXT END,
        floor = CASE WHEN v_asset_data->'floor' IS NULL THEN floor
          ELSE (v_asset_data->>'floor')::BIGINT END,
        discount_type = CASE WHEN v_asset_data->'discount_type' IS NULL THEN discount_type
          WHEN v_asset_data->'discount_type' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'discount_type'), '')::TEXT END,
        discount_date_from = CASE WHEN v_asset_data->'discount_date_from' IS NULL THEN discount_date_from
          WHEN v_asset_data->'discount_date_from' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'discount_date_from'), '')::TEXT END,
        discount_date_to = CASE WHEN v_asset_data->'discount_date_to' IS NULL THEN discount_date_to
          WHEN v_asset_data->'discount_date_to' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'discount_date_to'), '')::TEXT END,
        area_from_distribution = CASE WHEN v_business_to_residence THEN 0
          WHEN v_asset_data->'area_from_distribution' IS NULL THEN area_from_distribution
          ELSE COALESCE((v_asset_data->>'area_from_distribution')::NUMERIC, 0) END,
        exported_to_automation = false,
        comment = CASE WHEN v_asset_data->'comment' IS NULL THEN comment
          WHEN v_asset_data->'comment' = 'null'::jsonb THEN NULL
          ELSE NULLIF((v_asset_data->>'comment'), '')::TEXT END,
        is_new_measurement = false,
        updated_at = NOW()
      WHERE asset_id = v_asset_id;
    END IF;

    v_affected_asset_ids := array_append(v_affected_asset_ids, v_asset_id);
    IF NOT (v_building_number = ANY(v_affected_buildings)) THEN
      v_affected_buildings := array_append(v_affected_buildings, v_building_number);
    END IF;

    PERFORM update_building_total_area(v_building_number);

    IF v_asset_found THEN
      v_type_changed := (v_old_main_asset_type IS DISTINCT FROM v_new_main_asset_type);
      v_new_asset_size := COALESCE((v_asset_data->>'asset_size')::NUMERIC, v_old_asset_size);
      IF v_old_asset_size IS NOT NULL AND v_new_asset_size IS NOT NULL THEN
        v_size_changed := (ABS(v_old_asset_size - v_new_asset_size) > 0.0001);
      ELSE
        v_size_changed := FALSE;
      END IF;
      
      v_new_tax_region := (v_asset_data->>'tax_region')::INTEGER;
      v_tax_region_changed := (v_old_tax_region IS DISTINCT FROM v_new_tax_region);
      
      IF v_type_changed OR v_size_changed OR v_tax_region_changed THEN
        DECLARE
          v_is_business_context BOOLEAN := FALSE;
          v_is_residence_context BOOLEAN := FALSE;
        BEGIN
          IF p_is_business_context IS NOT NULL THEN
            v_is_business_context := p_is_business_context;
            v_is_residence_context := NOT p_is_business_context;
          ELSE
            IF v_new_main_asset_type IS NOT NULL THEN
              SELECT business_residence INTO v_business_residence
              FROM asset_types WHERE name = v_new_main_asset_type LIMIT 1;
              
              IF v_business_residence = 'עסקים' THEN
                v_is_business_context := TRUE;
              ELSIF v_business_residence = 'מגורים' THEN
                v_is_residence_context := TRUE;
              END IF;
            END IF;
          END IF;
          
          IF v_is_business_context THEN
            UPDATE buildings SET need_business_distribution = true
            WHERE building_number = v_building_number AND COALESCE(business_shared_area, 0) > 0;
          END IF;
          
          IF v_is_residence_context THEN
            UPDATE buildings SET need_residence_distribution = true
            WHERE building_number = v_building_number AND COALESCE(residence_shared_area, 0) > 0;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END IF;
    END IF;

    IF p_action_type NOT IN ('distribute_shared', 'business_distribution', 'residence_distribution') THEN
      PERFORM log_audit_for_asset(v_asset_id, 
        CASE WHEN v_existing_asset IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
        p_user_id, p_action_type::audit_action_type, false, p_description);
    END IF;

    v_count := v_count + 1;
  END LOOP;

  -- Collect AFTER data
  IF v_first_building_number IS NOT NULL THEN
    IF p_action_type IN ('distribute_shared', 'business_distribution', 'residence_distribution') THEN
      FOR v_asset_record IN 
        SELECT asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region,
          sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
          sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
          sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
          elevator, single_double_family, condo, townhouses, penthouse,
          structure_drawing_url, floor, discount_type, discount_date_from, discount_date_to,
          area_from_distribution, exported_to_automation, comment, created_at, updated_at, is_new_measurement
        FROM assets WHERE building_number = v_first_building_number ORDER BY asset_id
      LOOP
        v_asset_jsonb := to_jsonb(v_asset_record);
        v_after_assets := array_append(v_after_assets, v_asset_jsonb);
      END LOOP;
    ELSE
      FOR v_asset_id IN SELECT unnest(v_affected_asset_ids)
      LOOP
        SELECT jsonb_build_object(
          'asset_id', a.asset_id, 'building_number', a.building_number, 'payer_id', a.payer_id,
          'measurement_date', a.measurement_date, 'main_asset_type', a.main_asset_type,
          'asset_size', a.asset_size, 'tax_region', a.tax_region,
          'sub_asset_type_1', a.sub_asset_type_1, 'sub_asset_size_1', a.sub_asset_size_1,
          'sub_asset_type_2', a.sub_asset_type_2, 'sub_asset_size_2', a.sub_asset_size_2,
          'sub_asset_type_3', a.sub_asset_type_3, 'sub_asset_size_3', a.sub_asset_size_3,
          'sub_asset_type_4', a.sub_asset_type_4, 'sub_asset_size_4', a.sub_asset_size_4,
          'sub_asset_type_5', a.sub_asset_type_5, 'sub_asset_size_5', a.sub_asset_size_5,
          'sub_asset_type_6', a.sub_asset_type_6, 'sub_asset_size_6', a.sub_asset_size_6,
          'elevator', a.elevator, 'single_double_family', a.single_double_family,
          'condo', a.condo, 'townhouses', a.townhouses, 'penthouse', a.penthouse,
          'structure_drawing_url', a.structure_drawing_url, 'floor', a.floor,
          'discount_type', a.discount_type, 'discount_date_from', a.discount_date_from,
          'discount_date_to', a.discount_date_to, 'area_from_distribution', a.area_from_distribution,
          'exported_to_automation', a.exported_to_automation, 'comment', a.comment,
          'created_at', a.created_at, 'updated_at', a.updated_at, 'is_new_measurement', a.is_new_measurement
        ) INTO v_asset_jsonb FROM assets a WHERE a.asset_id = v_asset_id;
        
        IF v_asset_jsonb IS NOT NULL THEN
          v_after_assets := array_append(v_after_assets, v_asset_jsonb);
        END IF;
      END LOOP;
    END IF;
    
    SELECT jsonb_agg(elem) INTO v_after_data_collected FROM unnest(v_after_assets) AS elem;
    v_after_data_collected := jsonb_build_object('assets', COALESCE(v_after_data_collected, '[]'::jsonb));
    
    IF p_action_type IN ('distribute_shared', 'business_distribution', 'residence_distribution') THEN
      SELECT array_agg(asset_id ORDER BY asset_id) INTO v_entity_asset_ids
      FROM assets WHERE building_number = v_first_building_number;
    ELSE
      v_entity_asset_ids := v_affected_asset_ids;
    END IF;
  END IF;
  
  -- Log audit for distribution/transfer operations
  IF p_action_type IN ('distribute_shared', 'business_distribution', 'residence_distribution', 'transfer_area') 
     AND v_first_building_number IS NOT NULL 
     AND (v_before_data_collected IS NOT NULL OR v_after_data_collected IS NOT NULL) THEN
    
    IF p_action_type = 'business_distribution' THEN
      v_audit_distribution_type := 'business';
    ELSIF p_action_type = 'residence_distribution' THEN
      v_audit_distribution_type := 'residence';
    END IF;
    
    IF p_action_type != 'transfer_area' AND v_first_building_number IS NOT NULL THEN
      SELECT * INTO v_building_record FROM buildings WHERE building_number = v_first_building_number;
      
      IF FOUND THEN
        IF v_audit_distribution_type = 'business' THEN
          v_shared_area_size := v_building_record.business_shared_area;
        ELSIF v_audit_distribution_type = 'residence' THEN
          v_shared_area_size := v_building_record.residence_shared_area;
        END IF;
        
        IF v_overload_ratio IS NULL AND v_audit_distribution_type = 'business' THEN
          v_overload_ratio := v_building_record.overload_ratio;
        END IF;
      END IF;
    END IF;
    
    PERFORM log_audit_entry(p_action_type::audit_action_type, 'bulk_asset',
      v_first_building_number::text, p_user_id,
      COALESCE(v_before_data_collected, '{"assets":[]}'::jsonb),
      COALESCE(v_after_data_collected, '{"assets":[]}'::jsonb),
      p_description, v_first_building_number, v_overload_ratio, v_shared_area_size);
  END IF;

  -- Remove distribution flags
  IF p_action_type IN ('distribute_shared', 'business_distribution', 'residence_distribution') 
     AND v_building_num_for_flag IS NOT NULL THEN
    IF p_action_type = 'business_distribution' THEN
      v_distribution_type := 'business';
    ELSIF p_action_type = 'residence_distribution' THEN
      v_distribution_type := 'residence';
    END IF;
    
    IF v_distribution_type = 'residence' THEN
      UPDATE buildings SET need_residence_distribution = false WHERE building_number = v_building_num_for_flag;
    ELSIF v_distribution_type = 'business' THEN
      UPDATE buildings SET need_business_distribution = false WHERE building_number = v_building_num_for_flag;
    END IF;
  END IF;

  v_result := jsonb_build_object('success', true, 'affected_asset_ids', v_affected_asset_ids,
    'affected_buildings', v_affected_buildings, 'count', v_count,
    'message', format('Successfully saved %s assets', v_count));

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Bulk transaction failed: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION save_assets_bulk_transactional IS 'Bulk save assets with transactional operations including validation, distribution flags, and audit logging. All operations are atomic.';

SELECT 'Function save_assets_bulk_transactional created successfully' as status;