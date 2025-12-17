/*
  # Add Function to Update Buildings with Automatic Distribution Flag Setting (Bulk)
  
  1. Overview
    - Creates a database function to update multiple buildings in bulk
    - Automatically sets distribution flags when shared areas change
    - All updates happen in a single transaction
  
  2. Logic
    - Takes array of building updates (each with building_number and updates JSONB)
    - For each building, checks if residence_shared_area or business_shared_area changed
    - Sets need_residence_distribution or need_business_distribution flags to true
    - Only sets flags if the new shared area value is > 0
  
  3. Benefits
    - Centralized logic for building updates
    - Automatic flag management
    - Bulk operations in single transaction
    - Can be used by application code or other database functions
*/

-- Function to update multiple buildings in bulk and automatically set distribution flags when shared areas change
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
    
    -- Get new values from updates
    -- If the field is provided in updates, use it; otherwise keep the old value
    IF v_updates ? 'residence_shared_area' THEN
      v_new_residence_area := (v_updates->>'residence_shared_area')::NUMERIC;
    ELSE
      v_new_residence_area := v_old_residence_area;
    END IF;
    
    IF v_updates ? 'business_shared_area' THEN
      v_new_business_area := (v_updates->>'business_shared_area')::NUMERIC;
    ELSE
      v_new_business_area := v_old_business_area;
    END IF;
    
    -- Start with the provided updates
    v_final_updates := v_updates;
    
    -- Check if residence_shared_area changed (even if new value is zero or NULL)
    -- Set flag whenever old value is different from new value
    IF v_old_residence_area IS DISTINCT FROM v_new_residence_area THEN
      -- Set need_residence_distribution flag to true when shared area changes
      v_final_updates := v_final_updates || jsonb_build_object('need_residence_distribution', true);
      
      RAISE NOTICE 'Setting need_residence_distribution=true for building % (residence_shared_area changed from % to %)', 
        v_building_number, v_old_residence_area, v_new_residence_area;
    END IF;
    
    -- Check if business_shared_area changed (even if new value is zero or NULL)
    -- Set flag whenever old value is different from new value
    IF v_old_business_area IS DISTINCT FROM v_new_business_area THEN
      -- Set need_business_distribution flag to true when shared area changes
      v_final_updates := v_final_updates || jsonb_build_object('need_business_distribution', true);
      
      RAISE NOTICE 'Setting need_business_distribution=true for building % (business_shared_area changed from % to %)', 
        v_building_number, v_old_business_area, v_new_business_area;
    END IF;
    
    -- Remove read-only fields that shouldn't be updated
    v_final_updates := v_final_updates - 'action_id' - 'created_at' - 'building_number';
    
    -- Update the building
    UPDATE buildings
    SET
      total_building_area = COALESCE((v_final_updates->>'total_building_area')::NUMERIC, total_building_area),
      tax_region = COALESCE((v_final_updates->>'tax_region')::TEXT, tax_region),
      elevator = COALESCE((v_final_updates->>'elevator')::TEXT, elevator),
      single_double_family = COALESCE((v_final_updates->>'single_double_family')::TEXT, single_double_family),
      condo = COALESCE((v_final_updates->>'condo')::TEXT, condo),
      townhouses = COALESCE((v_final_updates->>'townhouses')::TEXT, townhouses),
      residence_shared_area = COALESCE((v_final_updates->>'residence_shared_area')::NUMERIC, residence_shared_area),
      business_shared_area = COALESCE((v_final_updates->>'business_shared_area')::NUMERIC, business_shared_area),
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

COMMENT ON FUNCTION update_buildings_bulk_with_distribution_flags IS 'Bulk update buildings and automatically set distribution flags when shared areas (residence_shared_area or business_shared_area) change. Sets flags to true whenever shared area changes, even if new value is 0. All updates happen in a single transaction. Use this function for all building updates, even single ones.';

