-- Add use_for_parking_shared_area to asset_types (boolean: whether this asset type uses shared parking area).
ALTER TABLE asset_types
  ADD COLUMN IF NOT EXISTS use_for_parking_shared_area BOOLEAN DEFAULT false;

COMMENT ON COLUMN asset_types.use_for_parking_shared_area IS 'שימוש בשטח חניה משותף - Whether this asset type uses shared parking area';

-- Field configuration for asset-types grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES
  ('asset-types', 'use_for_parking_shared_area', 4, 2, 'שימוש בשטח חניה משותף', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE SET
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  hebrew_name = EXCLUDED.hebrew_name,
  visible = EXCLUDED.visible,
  updated_at = now();

-- Update update_asset_type_with_distribution_reset to persist use_for_parking_shared_area
CREATE OR REPLACE FUNCTION update_asset_type_with_distribution_reset(
  p_id bigint,
  p_updates jsonb
)
RETURNS jsonb AS $$
DECLARE
  v_before_data jsonb;
  v_after_data jsonb;
  v_asset_type_name text;
  v_old_non_accountable_for_distribution boolean;
  v_new_non_accountable_for_distribution boolean;
  v_affected_buildings bigint[];
  v_building_number bigint;
  v_business_residence text;
BEGIN
  SELECT row_to_json(at.*)::jsonb INTO v_before_data
  FROM asset_types at
  WHERE at.id = p_id;

  IF v_before_data IS NULL THEN
    RAISE EXCEPTION 'Asset type with id % not found', p_id;
  END IF;

  v_asset_type_name := v_before_data->>'name';
  v_old_non_accountable_for_distribution := COALESCE((v_before_data->>'non_accountable_for_distribution')::boolean, false);

  IF p_updates ? 'non_accountable_for_distribution' THEN
    v_new_non_accountable_for_distribution := extract_boolean_from_jsonb(p_updates->'non_accountable_for_distribution', false);

    UPDATE asset_types
    SET
      name = COALESCE((p_updates->>'name')::text, name),
      description = COALESCE((p_updates->>'description')::text, description),
      tax_region = CASE WHEN p_updates ? 'tax_region' THEN (p_updates->>'tax_region')::integer ELSE tax_region END,
      elevator = CASE WHEN p_updates ? 'elevator' THEN extract_boolean_from_jsonb(p_updates->'elevator', false) ELSE elevator END,
      single_double_family = CASE WHEN p_updates ? 'single_double_family' THEN extract_boolean_from_jsonb(p_updates->'single_double_family', false) ELSE single_double_family END,
      penthouse = CASE WHEN p_updates ? 'penthouse' THEN extract_boolean_from_jsonb(p_updates->'penthouse', false) ELSE penthouse END,
      condo = CASE WHEN p_updates ? 'condo' THEN extract_boolean_from_jsonb(p_updates->'condo', false) ELSE condo END,
      townhouses = CASE WHEN p_updates ? 'townhouses' THEN extract_boolean_from_jsonb(p_updates->'townhouses', false) ELSE townhouses END,
      business_residence = CASE WHEN p_updates ? 'business_residence' THEN (p_updates->>'business_residence')::text ELSE business_residence END,
      non_accountable_for_total_area = CASE WHEN p_updates ? 'non_accountable_for_total_area' THEN extract_boolean_from_jsonb(p_updates->'non_accountable_for_total_area', false) ELSE non_accountable_for_total_area END,
      non_accountable_for_distribution = v_new_non_accountable_for_distribution,
      not_accountable_for_statistics = CASE WHEN p_updates ? 'not_accountable_for_statistics' THEN extract_boolean_from_jsonb(p_updates->'not_accountable_for_statistics', false) ELSE not_accountable_for_statistics END,
      use_shared_area = CASE WHEN p_updates ? 'use_shared_area' THEN CASE WHEN jsonb_typeof(p_updates->'use_shared_area') = 'null' THEN NULL ELSE extract_boolean_from_jsonb(p_updates->'use_shared_area', false) END ELSE use_shared_area END,
      use_for_parking_shared_area = CASE WHEN p_updates ? 'use_for_parking_shared_area' THEN CASE WHEN jsonb_typeof(p_updates->'use_for_parking_shared_area') = 'null' THEN NULL ELSE extract_boolean_from_jsonb(p_updates->'use_for_parking_shared_area', false) END ELSE use_for_parking_shared_area END,
      min_size = CASE WHEN p_updates ? 'min_size' THEN (p_updates->>'min_size')::numeric ELSE min_size END,
      max_size = CASE WHEN p_updates ? 'max_size' THEN (p_updates->>'max_size')::numeric ELSE max_size END,
      active = CASE WHEN p_updates ? 'active' THEN extract_boolean_from_jsonb(p_updates->'active', true) ELSE active END,
      area_description_for_tab = CASE WHEN p_updates ? 'area_description_for_tab' THEN (p_updates->>'area_description_for_tab')::text ELSE area_description_for_tab END,
      updated_at = now()
    WHERE id = p_id;

    SELECT row_to_json(at.*)::jsonb INTO v_after_data FROM asset_types at WHERE at.id = p_id;

    IF v_old_non_accountable_for_distribution IS DISTINCT FROM v_new_non_accountable_for_distribution THEN
      SELECT business_residence INTO v_business_residence FROM asset_types WHERE id = p_id;
      SELECT ARRAY_AGG(DISTINCT building_number) INTO v_affected_buildings
      FROM assets
      WHERE main_asset_type = v_asset_type_name AND building_number IS NOT NULL;
      IF v_affected_buildings IS NOT NULL AND array_length(v_affected_buildings, 1) > 0 THEN
        IF v_business_residence = 'עסקים' THEN
          UPDATE buildings SET need_business_distribution = true WHERE building_number = ANY(v_affected_buildings);
        ELSIF v_business_residence = 'מגורים' THEN
          UPDATE buildings SET need_residence_distribution = true WHERE building_number = ANY(v_affected_buildings);
        ELSE
          UPDATE buildings SET need_business_distribution = true, need_residence_distribution = true WHERE building_number = ANY(v_affected_buildings);
        END IF;
      END IF;
    END IF;
  ELSE
    UPDATE asset_types
    SET
      name = COALESCE((p_updates->>'name')::text, name),
      description = COALESCE((p_updates->>'description')::text, description),
      tax_region = CASE WHEN p_updates ? 'tax_region' THEN (p_updates->>'tax_region')::integer ELSE tax_region END,
      elevator = CASE WHEN p_updates ? 'elevator' THEN extract_boolean_from_jsonb(p_updates->'elevator', false) ELSE elevator END,
      single_double_family = CASE WHEN p_updates ? 'single_double_family' THEN extract_boolean_from_jsonb(p_updates->'single_double_family', false) ELSE single_double_family END,
      penthouse = CASE WHEN p_updates ? 'penthouse' THEN extract_boolean_from_jsonb(p_updates->'penthouse', false) ELSE penthouse END,
      condo = CASE WHEN p_updates ? 'condo' THEN extract_boolean_from_jsonb(p_updates->'condo', false) ELSE condo END,
      townhouses = CASE WHEN p_updates ? 'townhouses' THEN extract_boolean_from_jsonb(p_updates->'townhouses', false) ELSE townhouses END,
      business_residence = CASE WHEN p_updates ? 'business_residence' THEN (p_updates->>'business_residence')::text ELSE business_residence END,
      non_accountable_for_total_area = CASE WHEN p_updates ? 'non_accountable_for_total_area' THEN extract_boolean_from_jsonb(p_updates->'non_accountable_for_total_area', false) ELSE non_accountable_for_total_area END,
      not_accountable_for_statistics = CASE WHEN p_updates ? 'not_accountable_for_statistics' THEN extract_boolean_from_jsonb(p_updates->'not_accountable_for_statistics', false) ELSE not_accountable_for_statistics END,
      use_shared_area = CASE WHEN p_updates ? 'use_shared_area' THEN CASE WHEN jsonb_typeof(p_updates->'use_shared_area') = 'null' THEN NULL ELSE extract_boolean_from_jsonb(p_updates->'use_shared_area', false) END ELSE use_shared_area END,
      use_for_parking_shared_area = CASE WHEN p_updates ? 'use_for_parking_shared_area' THEN CASE WHEN jsonb_typeof(p_updates->'use_for_parking_shared_area') = 'null' THEN NULL ELSE extract_boolean_from_jsonb(p_updates->'use_for_parking_shared_area', false) END ELSE use_for_parking_shared_area END,
      min_size = CASE WHEN p_updates ? 'min_size' THEN (p_updates->>'min_size')::numeric ELSE min_size END,
      max_size = CASE WHEN p_updates ? 'max_size' THEN (p_updates->>'max_size')::numeric ELSE max_size END,
      active = CASE WHEN p_updates ? 'active' THEN extract_boolean_from_jsonb(p_updates->'active', true) ELSE active END,
      area_description_for_tab = CASE WHEN p_updates ? 'area_description_for_tab' THEN (p_updates->>'area_description_for_tab')::text ELSE area_description_for_tab END,
      updated_at = now()
    WHERE id = p_id;

    SELECT row_to_json(at.*)::jsonb INTO v_after_data FROM asset_types at WHERE at.id = p_id;
  END IF;

  RETURN jsonb_build_object(
    'before_data', v_before_data,
    'after_data', v_after_data,
    'affected_buildings', COALESCE(v_affected_buildings, ARRAY[]::bigint[]),
    'distribution_flags_reset', CASE WHEN v_affected_buildings IS NOT NULL AND array_length(v_affected_buildings, 1) > 0 THEN true ELSE false END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_asset_type_with_distribution_reset IS 'Update asset type and reset distribution flags when needed. Supports use_shared_area and use_for_parking_shared_area.';
