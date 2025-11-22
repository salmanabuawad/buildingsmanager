-- Quick script to add triggers for asset_type_fields table
-- Run this after creating the asset_type_fields table
-- After running this, restart PostgREST to refresh the schema cache

-- Function to sync asset_type_fields when asset type is inserted or updated
CREATE OR REPLACE FUNCTION sync_asset_type_fields_on_change()
RETURNS TRIGGER AS $$
DECLARE
  field_names text[];
  field_name text;
BEGIN
  -- Collect all non-null field names from the asset type
  -- These are the fields that are actually used by this asset type
  field_names := ARRAY[]::text[];
  
  -- Check each field and add to array if it has a value
  IF NEW.elevator IS NOT NULL AND NEW.elevator != '' THEN
    field_names := array_append(field_names, 'elevator');
  END IF;
  
  IF NEW.single_double_family IS NOT NULL AND NEW.single_double_family != '' THEN
    field_names := array_append(field_names, 'single_double_family');
  END IF;
  
  IF NEW.penthouse IS NOT NULL AND NEW.penthouse != '' THEN
    field_names := array_append(field_names, 'penthouse');
  END IF;
  
  IF NEW.condo IS NOT NULL AND NEW.condo != '' THEN
    field_names := array_append(field_names, 'condo');
  END IF;
  
  IF NEW.townhouses IS NOT NULL AND NEW.townhouses != '' THEN
    field_names := array_append(field_names, 'townhouses');
  END IF;
  
  -- Check for shelter or basement (they might be the same field)
  IF NEW.shelter IS NOT NULL AND NEW.shelter != '' THEN
    field_names := array_append(field_names, 'basement');
  END IF;
  
  -- Also check min_size and max_size - these relate to asset_size validation
  IF NEW.min_size IS NOT NULL OR NEW.max_size IS NOT NULL THEN
    field_names := array_append(field_names, 'asset_size');
  END IF;
  
  -- tax_region is used for validation
  IF NEW.tax_region IS NOT NULL THEN
    field_names := array_append(field_names, 'tax_region');
  END IF;
  
  -- Ensure all these fields exist in asset_type_fields with is_asset_type_validation = true
  FOREACH field_name IN ARRAY field_names
  LOOP
    INSERT INTO asset_type_fields (field_name, is_asset_level, is_building_level, is_asset_type_validation)
    VALUES (
      field_name,
      CASE 
        WHEN field_name IN ('asset_id', 'payer_id', 'measurement_date', 'main_asset_type', 'asset_size', 
                           'sub_asset_type_1', 'sub_asset_size_1', 'sub_asset_type_2', 'sub_asset_size_2',
                           'sub_asset_type_3', 'sub_asset_size_3', 'sub_asset_type_4', 'sub_asset_size_4',
                           'sub_asset_type_5', 'sub_asset_size_5', 'sub_asset_type_6', 'sub_asset_size_6',
                           'structure_drawing_url', 'elevator', 'single_double_family', 'condo', 
                           'townhouses', 'basement', 'penthouse') THEN true
        ELSE false
      END,
      CASE 
        WHEN field_name IN ('building_number', 'tax_region', 'shared_area', 'has_elevator', 
                           'elevator', 'area_for_control', 'total_building_area', 
                           'single_double_family', 'condo', 'basement', 'townhouses') THEN true
        ELSE false
      END,
      true  -- Mark as part of asset type validation
    )
    ON CONFLICT (field_name) DO UPDATE SET
      is_asset_type_validation = true,
      -- Update asset/building level flags if needed
      is_asset_level = CASE 
        WHEN asset_type_fields.is_asset_level = true OR 
             field_name IN ('asset_id', 'payer_id', 'measurement_date', 'main_asset_type', 'asset_size', 
                           'sub_asset_type_1', 'sub_asset_size_1', 'sub_asset_type_2', 'sub_asset_size_2',
                           'sub_asset_type_3', 'sub_asset_size_3', 'sub_asset_type_4', 'sub_asset_size_4',
                           'sub_asset_type_5', 'sub_asset_size_5', 'sub_asset_type_6', 'sub_asset_size_6',
                           'structure_drawing_url', 'elevator', 'single_double_family', 'condo', 
                           'townhouses', 'basement', 'penthouse') THEN true
        ELSE asset_type_fields.is_asset_level
      END,
      is_building_level = CASE 
        WHEN asset_type_fields.is_building_level = true OR 
             field_name IN ('building_number', 'tax_region', 'shared_area', 'has_elevator', 
                           'elevator', 'area_for_control', 'total_building_area', 
                           'single_double_family', 'condo', 'basement', 'townhouses') THEN true
        ELSE asset_type_fields.is_building_level
      END,
      updated_at = now();
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle asset type deletion
-- Note: We don't automatically remove fields from asset_type_fields when an asset type is deleted
-- because those fields might still be used by other asset types or by assets/buildings directly
CREATE OR REPLACE FUNCTION handle_asset_type_deletion()
RETURNS TRIGGER AS $$
BEGIN
  -- For now, we don't remove fields when an asset type is deleted
  -- because:
  -- 1. Fields might be used by other asset types
  -- 2. Fields might be used directly by assets/buildings
  -- 3. The field configuration should be manually managed
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS trigger_sync_asset_type_fields_insert ON asset_types;
CREATE TRIGGER trigger_sync_asset_type_fields_insert
  AFTER INSERT ON asset_types
  FOR EACH ROW
  EXECUTE FUNCTION sync_asset_type_fields_on_change();

DROP TRIGGER IF EXISTS trigger_sync_asset_type_fields_update ON asset_types;
CREATE TRIGGER trigger_sync_asset_type_fields_update
  AFTER UPDATE ON asset_types
  FOR EACH ROW
  EXECUTE FUNCTION sync_asset_type_fields_on_change();

DROP TRIGGER IF EXISTS trigger_handle_asset_type_deletion ON asset_types;
CREATE TRIGGER trigger_handle_asset_type_deletion
  AFTER DELETE ON asset_types
  FOR EACH ROW
  EXECUTE FUNCTION handle_asset_type_deletion();

