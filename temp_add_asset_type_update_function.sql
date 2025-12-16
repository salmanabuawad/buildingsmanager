-- Temporary SQL script to add update_asset_type_with_distribution_reset function
-- This function updates asset types and resets distribution flags in a single transaction

-- Function to update asset type and reset distribution flags if needed (in transaction)
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
BEGIN
  -- Get before data
  SELECT row_to_json(at.*)::jsonb INTO v_before_data
  FROM asset_types at
  WHERE at.id = p_id;
  
  IF v_before_data IS NULL THEN
    RAISE EXCEPTION 'Asset type with id % not found', p_id;
  END IF;
  
  v_asset_type_name := v_before_data->>'name';
  v_old_non_accountable_for_distribution := COALESCE((v_before_data->>'non_accountable_for_distribution')::boolean, false);
  
  -- Check if non_accountable_for_distribution is being changed
  IF p_updates ? 'non_accountable_for_distribution' THEN
    v_new_non_accountable_for_distribution := COALESCE((p_updates->>'non_accountable_for_distribution')::boolean, false);
    
    -- Update the asset type
    UPDATE asset_types
    SET 
      name = COALESCE((p_updates->>'name')::text, name),
      description = COALESCE((p_updates->>'description')::text, description),
      tax_region = CASE WHEN p_updates ? 'tax_region' THEN (p_updates->>'tax_region')::integer ELSE tax_region END,
      elevator = CASE WHEN p_updates ? 'elevator' THEN (p_updates->>'elevator')::text ELSE elevator END,
      single_double_family = CASE WHEN p_updates ? 'single_double_family' THEN (p_updates->>'single_double_family')::text ELSE single_double_family END,
      penthouse = CASE WHEN p_updates ? 'penthouse' THEN (p_updates->>'penthouse')::text ELSE penthouse END,
      condo = CASE WHEN p_updates ? 'condo' THEN (p_updates->>'condo')::text ELSE condo END,
      townhouses = CASE WHEN p_updates ? 'townhouses' THEN (p_updates->>'townhouses')::text ELSE townhouses END,
      business_residence = CASE WHEN p_updates ? 'business_residence' THEN (p_updates->>'business_residence')::text ELSE business_residence END,
      shared_area_usage = CASE WHEN p_updates ? 'shared_area_usage' THEN (p_updates->>'shared_area_usage')::text ELSE shared_area_usage END,
      non_accountable_for_total_area = COALESCE((p_updates->>'non_accountable_for_total_area')::boolean, non_accountable_for_total_area),
      non_accountable_for_distribution = v_new_non_accountable_for_distribution,
      min_size = CASE WHEN p_updates ? 'min_size' THEN (p_updates->>'min_size')::numeric ELSE min_size END,
      max_size = CASE WHEN p_updates ? 'max_size' THEN (p_updates->>'max_size')::numeric ELSE max_size END,
      active = COALESCE((p_updates->>'active')::text, active),
      area_description_for_tab = CASE WHEN p_updates ? 'area_description_for_tab' THEN (p_updates->>'area_description_for_tab')::text ELSE area_description_for_tab END,
      updated_at = now()
    WHERE id = p_id;
    
    -- Get after data
    SELECT row_to_json(at.*)::jsonb INTO v_after_data
    FROM asset_types at
    WHERE at.id = p_id;
    
    -- If non_accountable_for_distribution changed, reset flags for affected buildings
    IF v_old_non_accountable_for_distribution IS DISTINCT FROM v_new_non_accountable_for_distribution THEN
      -- Find all buildings with assets of this type
      SELECT ARRAY_AGG(DISTINCT building_number) INTO v_affected_buildings
      FROM assets
      WHERE main_asset_type = v_asset_type_name
        AND building_number IS NOT NULL;
      
      -- Reset business_shared_area_distributed flag for all affected buildings
      IF v_affected_buildings IS NOT NULL AND array_length(v_affected_buildings, 1) > 0 THEN
        UPDATE buildings
        SET business_shared_area_distributed = false
        WHERE building_number = ANY(v_affected_buildings);
      END IF;
    END IF;
  ELSE
    -- Update without checking distribution flag (field not changed)
    UPDATE asset_types
    SET 
      name = COALESCE((p_updates->>'name')::text, name),
      description = COALESCE((p_updates->>'description')::text, description),
      tax_region = CASE WHEN p_updates ? 'tax_region' THEN (p_updates->>'tax_region')::integer ELSE tax_region END,
      elevator = CASE WHEN p_updates ? 'elevator' THEN (p_updates->>'elevator')::text ELSE elevator END,
      single_double_family = CASE WHEN p_updates ? 'single_double_family' THEN (p_updates->>'single_double_family')::text ELSE single_double_family END,
      penthouse = CASE WHEN p_updates ? 'penthouse' THEN (p_updates->>'penthouse')::text ELSE penthouse END,
      condo = CASE WHEN p_updates ? 'condo' THEN (p_updates->>'condo')::text ELSE condo END,
      townhouses = CASE WHEN p_updates ? 'townhouses' THEN (p_updates->>'townhouses')::text ELSE townhouses END,
      business_residence = CASE WHEN p_updates ? 'business_residence' THEN (p_updates->>'business_residence')::text ELSE business_residence END,
      shared_area_usage = CASE WHEN p_updates ? 'shared_area_usage' THEN (p_updates->>'shared_area_usage')::text ELSE shared_area_usage END,
      non_accountable_for_total_area = CASE WHEN p_updates ? 'non_accountable_for_total_area' THEN (p_updates->>'non_accountable_for_total_area')::boolean ELSE non_accountable_for_total_area END,
      min_size = CASE WHEN p_updates ? 'min_size' THEN (p_updates->>'min_size')::numeric ELSE min_size END,
      max_size = CASE WHEN p_updates ? 'max_size' THEN (p_updates->>'max_size')::numeric ELSE max_size END,
      active = COALESCE((p_updates->>'active')::text, active),
      area_description_for_tab = CASE WHEN p_updates ? 'area_description_for_tab' THEN (p_updates->>'area_description_for_tab')::text ELSE area_description_for_tab END,
      updated_at = now()
    WHERE id = p_id;
    
    -- Get after data
    SELECT row_to_json(at.*)::jsonb INTO v_after_data
    FROM asset_types at
    WHERE at.id = p_id;
  END IF;
  
  -- Return result with before/after data and affected buildings
  RETURN jsonb_build_object(
    'before_data', v_before_data,
    'after_data', v_after_data,
    'affected_buildings', COALESCE(v_affected_buildings, ARRAY[]::bigint[]),
    'distribution_flags_reset', CASE WHEN v_affected_buildings IS NOT NULL AND array_length(v_affected_buildings, 1) > 0 THEN true ELSE false END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_asset_type_with_distribution_reset IS 'Update asset type and reset business distribution flags for affected buildings if non_accountable_for_distribution changed. All in a single transaction.';

-- Verify the function was created
SELECT 
  proname as function_name,
  pg_get_function_arguments(oid) as arguments,
  pg_get_function_result(oid) as return_type
FROM pg_proc
WHERE proname = 'update_asset_type_with_distribution_reset';

