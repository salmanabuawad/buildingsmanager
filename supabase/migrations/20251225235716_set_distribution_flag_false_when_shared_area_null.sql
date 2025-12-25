/*
  # Set Distribution Flag to False When Shared Area is Null
  
  This migration updates the `update_buildings_bulk_with_distribution_flags` function
  to set distribution flags to false when shared areas are set to NULL.
  
  Logic:
  - When residence_shared_area is set to NULL → need_residence_distribution = false
  - When business_shared_area is set to NULL → need_business_distribution = false
  - When shared area is changed to a non-null value → flag = true (existing behavior)
*/

CREATE OR REPLACE FUNCTION update_buildings_bulk_with_distribution_flags(
  p_buildings_data JSONB[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_building_data JSONB;
  v_building_number BIGINT;
  v_updates JSONB;
  v_old_building RECORD;
  v_old_residence_area NUMERIC;
  v_old_business_area NUMERIC;
  v_new_residence_area NUMERIC;
  v_new_business_area NUMERIC;
  v_final_updates JSONB;
  v_affected_buildings BIGINT[] := ARRAY[]::BIGINT[];
  v_count INTEGER := 0;
  v_result JSONB;
  v_updated_buildings JSONB[] := ARRAY[]::JSONB[];
  v_residence_area_provided BOOLEAN;
  v_business_area_provided BOOLEAN;
BEGIN
  -- Process each building update
  FOREACH v_building_data IN ARRAY p_buildings_data
  LOOP
    -- Extract building_number and updates
    v_building_number := (v_building_data->>'building_number')::BIGINT;
    v_updates := v_building_data->'updates';
    
    IF v_building_number IS NULL THEN
      RAISE EXCEPTION 'Building number is required for all building updates';
    END IF;
    
    IF v_updates IS NULL OR v_updates = '{}'::jsonb THEN
      -- Skip if no updates provided
      CONTINUE;
    END IF;
    
    -- Get current building data
    SELECT * INTO v_old_building
    FROM buildings
    WHERE building_number = v_building_number;
    
    IF NOT FOUND THEN
      RAISE WARNING 'Building % not found, skipping', v_building_number;
      CONTINUE;
    END IF;
    
    -- Get old values (keep NULL as NULL, don't convert to 0)
    v_old_residence_area := v_old_building.residence_shared_area;
    v_old_business_area := v_old_building.business_shared_area;
    
    -- Check if fields are provided in updates
    v_residence_area_provided := (v_updates ? 'residence_shared_area');
    v_business_area_provided := (v_updates ? 'business_shared_area');
    
    -- Get new values from updates
    -- If the field is provided in updates, use it; otherwise keep the old value
    IF v_residence_area_provided THEN
      -- Check if the value is explicitly null in JSONB
      -- When key exists and value is JSONB null, the JSONB value equals 'null'::jsonb
      IF v_updates->'residence_shared_area' = 'null'::jsonb THEN
        v_new_residence_area := NULL;
      ELSE
        v_new_residence_area := (v_updates->>'residence_shared_area')::NUMERIC;
      END IF;
    ELSE
      v_new_residence_area := v_old_residence_area;
    END IF;
    
    IF v_business_area_provided THEN
      -- Check if the value is explicitly null in JSONB
      -- When key exists and value is JSONB null, the JSONB value equals 'null'::jsonb
      IF v_updates->'business_shared_area' = 'null'::jsonb THEN
        v_new_business_area := NULL;
      ELSE
        v_new_business_area := (v_updates->>'business_shared_area')::NUMERIC;
      END IF;
    ELSE
      v_new_business_area := v_old_business_area;
    END IF;
    
    -- Start with the provided updates
    v_final_updates := v_updates;
    
    -- Handle residence_shared_area changes
    IF v_residence_area_provided THEN
      IF v_new_residence_area IS NULL THEN
        -- When set to NULL, set flag to false
        v_final_updates := v_final_updates || jsonb_build_object('need_residence_distribution', false);
        RAISE NOTICE 'Setting need_residence_distribution=false for building % (residence_shared_area set to NULL)', 
          v_building_number;
      ELSIF v_old_residence_area IS DISTINCT FROM v_new_residence_area THEN
        -- When changed to non-null value, set flag to true
        v_final_updates := v_final_updates || jsonb_build_object('need_residence_distribution', true);
        RAISE NOTICE 'Setting need_residence_distribution=true for building % (residence_shared_area changed from % to %)', 
          v_building_number, v_old_residence_area, v_new_residence_area;
      END IF;
    END IF;
    
    -- Handle business_shared_area changes
    IF v_business_area_provided THEN
      IF v_new_business_area IS NULL THEN
        -- When set to NULL, set flag to false
        v_final_updates := v_final_updates || jsonb_build_object('need_business_distribution', false);
        RAISE NOTICE 'Setting need_business_distribution=false for building % (business_shared_area set to NULL)', 
          v_building_number;
      ELSIF v_old_business_area IS DISTINCT FROM v_new_business_area THEN
        -- When changed to non-null value, set flag to true
        v_final_updates := v_final_updates || jsonb_build_object('need_business_distribution', true);
        RAISE NOTICE 'Setting need_business_distribution=true for building % (business_shared_area changed from % to %)', 
          v_building_number, v_old_business_area, v_new_business_area;
      END IF;
    END IF;
    
    -- Remove read-only fields that shouldn't be updated
    v_final_updates := v_final_updates - 'action_id' - 'created_at' - 'building_number';
    
    -- Update the building
    -- Handle NULL values explicitly for shared areas
    UPDATE buildings
    SET
      total_building_area = COALESCE((v_final_updates->>'total_building_area')::NUMERIC, total_building_area),
      tax_region = COALESCE((v_final_updates->>'tax_region')::TEXT, tax_region),
      elevator = COALESCE((v_final_updates->>'elevator')::TEXT, elevator),
      single_double_family = COALESCE((v_final_updates->>'single_double_family')::TEXT, single_double_family),
      condo = COALESCE((v_final_updates->>'condo')::TEXT, condo),
      townhouses = COALESCE((v_final_updates->>'townhouses')::TEXT, townhouses),
      residence_shared_area = CASE 
        WHEN v_final_updates ? 'residence_shared_area' THEN 
          CASE 
            WHEN v_final_updates->'residence_shared_area' = 'null'::jsonb THEN NULL
            ELSE (v_final_updates->>'residence_shared_area')::NUMERIC
          END
        ELSE residence_shared_area
      END,
      business_shared_area = CASE 
        WHEN v_final_updates ? 'business_shared_area' THEN 
          CASE 
            WHEN v_final_updates->'business_shared_area' = 'null'::jsonb THEN NULL
            ELSE (v_final_updates->>'business_shared_area')::NUMERIC
          END
        ELSE business_shared_area
      END,
      area_for_control = COALESCE((v_final_updates->>'area_for_control')::NUMERIC, area_for_control),
      building_address = COALESCE((v_final_updates->>'building_address')::INTEGER, building_address),
      gosh = COALESCE((v_final_updates->>'gosh')::BIGINT, gosh),
      helka = COALESCE((v_final_updates->>'helka')::BIGINT, helka),
      building_number_in_street = COALESCE((v_final_updates->>'building_number_in_street')::BIGINT, building_number_in_street),
      overload_ratio = COALESCE((v_final_updates->>'overload_ratio')::NUMERIC, overload_ratio),
      need_residence_distribution = COALESCE((v_final_updates->>'need_residence_distribution')::BOOLEAN, need_residence_distribution),
      need_business_distribution = COALESCE((v_final_updates->>'need_business_distribution')::BOOLEAN, need_business_distribution)
    WHERE building_number = v_building_number;
    
    -- Track affected buildings
    IF NOT (v_building_number = ANY(v_affected_buildings)) THEN
      v_affected_buildings := array_append(v_affected_buildings, v_building_number);
    END IF;
    
    -- Get updated building data
    SELECT to_jsonb(b.*) INTO v_final_updates
    FROM buildings b
    WHERE b.building_number = v_building_number;
    
    v_updated_buildings := array_append(v_updated_buildings, v_final_updates);
    v_count := v_count + 1;
  END LOOP;
  
  -- Return result
  v_result := jsonb_build_object(
    'success', true,
    'count', v_count,
    'affected_buildings', v_affected_buildings,
    'buildings', v_updated_buildings,
    'message', format('Successfully updated %s buildings', v_count)
  );
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Any error will cause automatic rollback of the entire transaction
    RAISE EXCEPTION 'Bulk building update failed and rolled back: %', SQLERRM
      USING HINT = 'All changes have been rolled back. No partial data was saved.';
END;
$$;

COMMENT ON FUNCTION update_buildings_bulk_with_distribution_flags IS 'Bulk update buildings and automatically set distribution flags when shared areas (residence_shared_area or business_shared_area) change. Sets flags to false when shared area is set to NULL. Sets flags to true when shared area is changed to a non-null value. All updates happen in a single transaction. Use this function for all building updates, even single ones.';

