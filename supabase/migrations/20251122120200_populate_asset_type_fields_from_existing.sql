/*
  # Populate asset_type_fields from Existing Asset Types
  
  1. Changes
    - Query all existing asset types
    - Extract fields used by each asset type
    - Insert/update asset_type_fields table with appropriate flags
    - This ensures the table is populated with all fields currently used by asset types
  
  2. Logic
    - For each asset type, check which fields have values
    - Fields: elevator, single_double_family, penthouse, condo, townhouses, shelter/basement
    - Also check min_size/max_size (relates to asset_size) and tax_region
    - Mark these fields as is_asset_type_validation = true
*/

-- Function to populate asset_type_fields from existing asset types
DO $$
DECLARE
  asset_type_record RECORD;
  field_names text[];
  field_name text;
BEGIN
  -- Loop through all existing asset types
  FOR asset_type_record IN 
    SELECT * FROM asset_types
  LOOP
    field_names := ARRAY[]::text[];
    
    -- Check each field and add to array if it has a value
    IF asset_type_record.elevator IS NOT NULL AND asset_type_record.elevator != '' THEN
      field_names := array_append(field_names, 'elevator');
    END IF;
    
    IF asset_type_record.single_double_family IS NOT NULL AND asset_type_record.single_double_family != '' THEN
      field_names := array_append(field_names, 'single_double_family');
    END IF;
    
    IF asset_type_record.penthouse IS NOT NULL AND asset_type_record.penthouse != '' THEN
      field_names := array_append(field_names, 'penthouse');
    END IF;
    
    IF asset_type_record.condo IS NOT NULL AND asset_type_record.condo != '' THEN
      field_names := array_append(field_names, 'condo');
    END IF;
    
    IF asset_type_record.townhouses IS NOT NULL AND asset_type_record.townhouses != '' THEN
      field_names := array_append(field_names, 'townhouses');
    END IF;
    
    -- Check for shelter or basement (they might be the same field)
    IF asset_type_record.shelter IS NOT NULL AND asset_type_record.shelter != '' THEN
      field_names := array_append(field_names, 'basement');
    END IF;
    
    -- Also check min_size and max_size - these relate to asset_size validation
    IF asset_type_record.min_size IS NOT NULL OR asset_type_record.max_size IS NOT NULL THEN
      field_names := array_append(field_names, 'asset_size');
    END IF;
    
    -- tax_region is used for validation
    IF asset_type_record.tax_region IS NOT NULL THEN
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
  END LOOP;
  
  RAISE NOTICE 'Finished populating asset_type_fields from existing asset types';
END $$;

