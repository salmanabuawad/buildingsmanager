-- Temporary SQL to fix residence distribution flag when building residence_shared_area is changed to zero
-- This updates the update_buildings_bulk_with_distribution_flags function to set the flag
-- when residence_shared_area changes, even if the new value is 0

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
  FOREACH v_building_data IN ARRAY p_buildings_data
  LOOP
    v_building_number := (v_building_data->>'building_number')::BIGINT;
    v_updates := v_building_data->'updates';

    IF v_building_number IS NULL THEN
      RAISE EXCEPTION 'Building number is required for all building updates';
    END IF;

    IF v_updates IS NULL OR v_updates = '{}'::jsonb THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_old_building
    FROM buildings
    WHERE building_number = v_building_number;

    IF NOT FOUND THEN
      RAISE WARNING 'Building % not found, skipping', v_building_number;
      CONTINUE;
    END IF;

    v_old_residence_area := v_old_building.residence_shared_area;
    v_old_business_area := v_old_building.business_shared_area;

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

    v_final_updates := v_updates;

    -- Set residence distribution flag when residence_shared_area changes (including when changed to 0)
    -- Always set to true when value changes (regardless of new value)
    IF v_old_residence_area IS DISTINCT FROM v_new_residence_area THEN
      v_final_updates := v_final_updates || jsonb_build_object('need_residence_distribution', true);
      RAISE NOTICE 'Setting need_residence_distribution=true for building % (residence_shared_area changed from % to %)', 
        v_building_number, v_old_residence_area, v_new_residence_area;
    END IF;

    -- Set business distribution flag when business_shared_area changes (including when changed to 0)
    -- Always set to true when value changes (regardless of new value)
    IF v_old_business_area IS DISTINCT FROM v_new_business_area THEN
      v_final_updates := v_final_updates || jsonb_build_object('need_business_distribution', true);
      RAISE NOTICE 'Setting need_business_distribution=true for building % (business_shared_area changed from % to %)', 
        v_building_number, v_old_business_area, v_new_business_area;
    END IF;

    v_final_updates := v_final_updates - 'action_id' - 'created_at' - 'building_number';

    UPDATE buildings
    SET
      total_building_area = COALESCE((v_final_updates->>'total_building_area')::NUMERIC, total_building_area),
      tax_region = COALESCE((v_final_updates->>'tax_region')::TEXT, tax_region),
      elevator = CASE WHEN v_final_updates ? 'elevator' THEN extract_boolean_from_jsonb(v_final_updates->'elevator', false) ELSE elevator END,
      single_double_family = CASE WHEN v_final_updates ? 'single_double_family' THEN extract_boolean_from_jsonb(v_final_updates->'single_double_family', false) ELSE single_double_family END,
      condo = CASE WHEN v_final_updates ? 'condo' THEN extract_boolean_from_jsonb(v_final_updates->'condo', false) ELSE condo END,
      townhouses = CASE WHEN v_final_updates ? 'townhouses' THEN extract_boolean_from_jsonb(v_final_updates->'townhouses', false) ELSE townhouses END,
      residence_shared_area = COALESCE((v_final_updates->>'residence_shared_area')::NUMERIC, residence_shared_area),
      business_shared_area = COALESCE((v_final_updates->>'business_shared_area')::NUMERIC, business_shared_area),
      area_for_control = COALESCE((v_final_updates->>'area_for_control')::NUMERIC, area_for_control),
      gosh = COALESCE((v_final_updates->>'gosh')::BIGINT, gosh),
      helka = COALESCE((v_final_updates->>'helka')::BIGINT, helka),
      building_number_in_street = COALESCE((v_final_updates->>'building_number_in_street')::BIGINT, building_number_in_street),
      overload_ratio = COALESCE((v_final_updates->>'overload_ratio')::NUMERIC, overload_ratio),
      need_residence_distribution = COALESCE((v_final_updates->>'need_residence_distribution')::BOOLEAN, need_residence_distribution),
      need_business_distribution = COALESCE((v_final_updates->>'need_business_distribution')::BOOLEAN, need_business_distribution),
      building_address = CASE
        WHEN v_final_updates ? 'address' THEN (v_final_updates->>'address')::INTEGER
        WHEN v_final_updates ? 'building_address' THEN (v_final_updates->>'building_address')::INTEGER
        ELSE building_address
      END,
      note = CASE WHEN v_final_updates ? 'note' THEN NULLIF(TRIM(v_final_updates->>'note'), '')::TEXT ELSE note END
    WHERE building_number = v_building_number;

    IF NOT (v_building_number = ANY(v_affected_buildings)) THEN
      v_affected_buildings := array_append(v_affected_buildings, v_building_number);
    END IF;

    SELECT to_jsonb(b.*) INTO v_final_updates
    FROM buildings b
    WHERE b.building_number = v_building_number;

    v_updated_buildings := array_append(v_updated_buildings, v_final_updates);
    v_count := v_count + 1;
  END LOOP;

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
    RAISE EXCEPTION 'Bulk building update failed and rolled back: %', SQLERRM
      USING HINT = 'All changes have been rolled back. No partial data was saved.';
END;
$$;

COMMENT ON FUNCTION update_buildings_bulk_with_distribution_flags IS 'Bulk update buildings and automatically set distribution flags when shared areas change. Sets flags to true whenever shared area changes, even if new value is 0. Includes address (via building_address) and note.';
