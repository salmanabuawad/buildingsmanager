-- Remove building parking and asset shared_parking_area from DB and config.
-- Building: parking_area, shared_parking_area, number_of_parking_units.
-- Asset: shared_parking_area (per-asset parking from building; no longer used).

-- 1) Drop building parking columns
ALTER TABLE buildings DROP COLUMN IF EXISTS parking_area;
ALTER TABLE buildings DROP COLUMN IF EXISTS shared_parking_area;
ALTER TABLE buildings DROP COLUMN IF EXISTS number_of_parking_units;

-- 2) Drop asset shared_parking_area
ALTER TABLE assets DROP COLUMN IF EXISTS shared_parking_area;
ALTER TABLE assets_history DROP COLUMN IF EXISTS shared_parking_area;

-- 3) Remove from field_configurations (buildings-list + any grid with shared_parking_area)
DELETE FROM field_configurations
WHERE (grid_name = 'buildings-list' AND field_name IN ('parking_area', 'shared_parking_area', 'number_of_parking_units'))
   OR field_name = 'shared_parking_area';

-- 4) update_buildings_bulk_with_distribution_flags: remove parking vars and SET clauses
CREATE OR REPLACE FUNCTION update_buildings_bulk_with_distribution_flags(p_buildings_data JSONB[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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

    IF v_old_residence_area IS DISTINCT FROM v_new_residence_area THEN
      v_final_updates := v_final_updates || jsonb_build_object('need_residence_distribution', true);
    END IF;

    IF v_old_business_area IS DISTINCT FROM v_new_business_area THEN
      v_final_updates := v_final_updates || jsonb_build_object('need_business_distribution', true);
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
$function$;

COMMENT ON FUNCTION update_buildings_bulk_with_distribution_flags IS 'Bulk update buildings with distribution flags. Parking fields removed.';

-- 5) get_assets_by_ids: remove shared_parking_area from return
DROP FUNCTION IF EXISTS get_assets_by_ids(bigint[]);

CREATE OR REPLACE FUNCTION get_assets_by_ids(p_asset_ids bigint[])
RETURNS TABLE (
  building_number bigint,
  payer_id text,
  asset_id bigint,
  measurement_date text,
  main_asset_type text,
  asset_size numeric,
  sub_asset_type_1 text,
  sub_asset_size_1 numeric,
  sub_asset_type_2 text,
  sub_asset_size_2 numeric,
  sub_asset_type_3 text,
  sub_asset_size_3 numeric,
  sub_asset_type_4 text,
  sub_asset_size_4 numeric,
  sub_asset_type_5 text,
  sub_asset_size_5 numeric,
  sub_asset_type_6 text,
  sub_asset_size_6 numeric,
  structure_drawing_url text,
  created_at timestamptz,
  updated_at timestamptz,
  elevator boolean,
  single_double_family boolean,
  condo boolean,
  townhouses boolean,
  penthouse boolean,
  tax_region integer,
  discount_type text,
  discount_date_from text,
  discount_date_to text,
  is_new_measurement boolean,
  business_distribution_area numeric,
  business_total_area numeric,
  exported_to_automation boolean,
  data_from_automation boolean,
  export_to_automation_at text,
  comment text,
  apartment_number text,
  apartment_floor text,
  storage_number text,
  storage_floor text,
  operator_id bigint
) AS $func$
BEGIN
  RETURN QUERY
  SELECT
    a.building_number, a.payer_id, a.asset_id, a.measurement_date, a.main_asset_type, a.asset_size,
    a.sub_asset_type_1, a.sub_asset_size_1, a.sub_asset_type_2, a.sub_asset_size_2,
    a.sub_asset_type_3, a.sub_asset_size_3, a.sub_asset_type_4, a.sub_asset_size_4,
    a.sub_asset_type_5, a.sub_asset_size_5, a.sub_asset_type_6, a.sub_asset_size_6,
    a.structure_drawing_url, a.created_at, a.updated_at,
    a.elevator, a.single_double_family, a.condo, a.townhouses, a.penthouse,
    a.tax_region, a.discount_type, a.discount_date_from, a.discount_date_to,
    a.is_new_measurement, a.business_distribution_area, a.business_total_area,
    a.exported_to_automation, a.data_from_automation, a.export_to_automation_at,
    a.comment, a.apartment_number, a.apartment_floor, a.storage_number, a.storage_floor,
    a.operator_id
  FROM assets a
  WHERE a.asset_id = ANY(p_asset_ids)
  ORDER BY a.asset_id;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_assets_by_ids(bigint[]) IS 'Returns assets by IDs. Parking removed.';

-- 6) reset_export_flags_on_change: remove shared_parking_area from trigger condition
CREATE OR REPLACE FUNCTION reset_export_flags_on_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    NEW.building_number IS DISTINCT FROM OLD.building_number OR
    NEW.asset_id IS DISTINCT FROM OLD.asset_id OR
    NEW.payer_id IS DISTINCT FROM OLD.payer_id OR
    NEW.main_asset_type IS DISTINCT FROM OLD.main_asset_type OR
    NEW.asset_size IS DISTINCT FROM OLD.asset_size OR
    NEW.measurement_date IS DISTINCT FROM OLD.measurement_date OR
    NEW.tax_region IS DISTINCT FROM OLD.tax_region OR
    NEW.operator_id IS DISTINCT FROM OLD.operator_id OR
    NEW.sub_asset_type_1 IS DISTINCT FROM OLD.sub_asset_type_1 OR
    NEW.sub_asset_size_1 IS DISTINCT FROM OLD.sub_asset_size_1 OR
    NEW.sub_asset_type_2 IS DISTINCT FROM OLD.sub_asset_type_2 OR
    NEW.sub_asset_size_2 IS DISTINCT FROM OLD.sub_asset_size_2 OR
    NEW.sub_asset_type_3 IS DISTINCT FROM OLD.sub_asset_type_3 OR
    NEW.sub_asset_size_3 IS DISTINCT FROM OLD.sub_asset_size_3 OR
    NEW.sub_asset_type_4 IS DISTINCT FROM OLD.sub_asset_type_4 OR
    NEW.sub_asset_size_4 IS DISTINCT FROM OLD.sub_asset_size_4 OR
    NEW.sub_asset_type_5 IS DISTINCT FROM OLD.sub_asset_type_5 OR
    NEW.sub_asset_size_5 IS DISTINCT FROM OLD.sub_asset_size_5 OR
    NEW.sub_asset_type_6 IS DISTINCT FROM OLD.sub_asset_type_6 OR
    NEW.sub_asset_size_6 IS DISTINCT FROM OLD.sub_asset_size_6 OR
    NEW.business_distribution_area IS DISTINCT FROM OLD.business_distribution_area OR
    NEW.elevator IS DISTINCT FROM OLD.elevator OR
    NEW.single_double_family IS DISTINCT FROM OLD.single_double_family OR
    NEW.condo IS DISTINCT FROM OLD.condo OR
    NEW.townhouses IS DISTINCT FROM OLD.townhouses OR
    NEW.penthouse IS DISTINCT FROM OLD.penthouse OR
    NEW.structure_drawing_url IS DISTINCT FROM OLD.structure_drawing_url OR
    NEW.apartment_number IS DISTINCT FROM OLD.apartment_number OR
    NEW.apartment_floor IS DISTINCT FROM OLD.apartment_floor OR
    NEW.storage_number IS DISTINCT FROM OLD.storage_number OR
    NEW.storage_floor IS DISTINCT FROM OLD.storage_floor OR
    NEW.discount_type IS DISTINCT FROM OLD.discount_type OR
    NEW.discount_date_from IS DISTINCT FROM OLD.discount_date_from OR
    NEW.discount_date_to IS DISTINCT FROM OLD.discount_date_to OR
    NEW.comment IS DISTINCT FROM OLD.comment
  ) THEN
    NEW.exported_to_automation := false;
    NEW.export_to_automation_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION reset_export_flags_on_change() IS 'Resets exported_to_automation when asset data that affects export changes (parking removed).';
