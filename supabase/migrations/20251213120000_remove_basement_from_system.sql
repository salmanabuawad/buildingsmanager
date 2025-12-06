/*
  # Remove basement from system

  1. Changes
    - Drop `basement` column from buildings table
    - Drop `basement` column from asset_types table
    - Drop `basement` column from assets table
    - Drop `basement` column from assets_history table
    - Remove `basement` from asset_type_fields table
    - Update triggers to remove basement references
*/

-- Drop basement column from buildings table
ALTER TABLE buildings DROP COLUMN IF EXISTS basement;

-- Drop basement column from asset_types table
ALTER TABLE asset_types DROP COLUMN IF EXISTS basement;

-- Drop basement column from assets table
ALTER TABLE assets DROP COLUMN IF EXISTS basement;

-- Drop basement column from assets_history table
ALTER TABLE assets_history DROP COLUMN IF EXISTS basement;

-- Remove basement from asset_type_fields table
DELETE FROM asset_type_fields WHERE field_name = 'basement';

-- Update copy_asset_to_history trigger function to remove basement
CREATE OR REPLACE FUNCTION copy_asset_to_history()
RETURNS TRIGGER AS $$
BEGIN
  -- For UPDATE: copy to history ONLY if is_new_measurement flag is explicitly set to true
  IF TG_OP = 'UPDATE' THEN
    -- Check if is_new_measurement flag is explicitly set to true
    -- Use COALESCE to handle NULL values - treat NULL as false
    IF COALESCE(NEW.is_new_measurement, false) = true THEN
      -- Copy old record to history (without id so database generates new unique id)
      INSERT INTO assets_history (
        building_number, payer_id, asset_id, measurement_date,
        main_asset_type, asset_size,
        sub_asset_type_1, sub_asset_size_1,
        sub_asset_type_2, sub_asset_size_2,
        sub_asset_type_3, sub_asset_size_3,
        sub_asset_type_4, sub_asset_size_4,
        sub_asset_type_5, sub_asset_size_5,
        sub_asset_type_6, sub_asset_size_6,
        structure_drawing_url, created_at, updated_at,
        elevator, single_double_family, condo, townhouses, penthouse,
        tax_region
      ) VALUES (
        OLD.building_number, OLD.payer_id, OLD.asset_id, OLD.measurement_date,
        OLD.main_asset_type, OLD.asset_size,
        OLD.sub_asset_type_1, OLD.sub_asset_size_1,
        OLD.sub_asset_type_2, OLD.sub_asset_size_2,
        OLD.sub_asset_type_3, OLD.sub_asset_size_3,
        OLD.sub_asset_type_4, OLD.sub_asset_size_4,
        OLD.sub_asset_type_5, OLD.sub_asset_size_5,
        OLD.sub_asset_type_6, OLD.sub_asset_size_6,
        OLD.structure_drawing_url, OLD.created_at, OLD.updated_at,
        OLD.elevator, OLD.single_double_family, OLD.condo, OLD.townhouses, OLD.penthouse,
        OLD.tax_region
      );
      
      -- Reset the flag after moving to history
      NEW.is_new_measurement = false;
    END IF;
    -- If is_new_measurement is not true, do nothing - just allow the UPDATE to proceed
    RETURN NEW;
  END IF;
  
  -- For DELETE: always copy record to history before deletion
  IF TG_OP = 'DELETE' THEN
    INSERT INTO assets_history (
      building_number, payer_id, asset_id, measurement_date,
      main_asset_type, asset_size,
      sub_asset_type_1, sub_asset_size_1,
      sub_asset_type_2, sub_asset_size_2,
      sub_asset_type_3, sub_asset_size_3,
      sub_asset_type_4, sub_asset_size_4,
      sub_asset_type_5, sub_asset_size_5,
      sub_asset_type_6, sub_asset_size_6,
      structure_drawing_url, created_at, updated_at,
      elevator, single_double_family, condo, townhouses, penthouse,
      tax_region
    ) VALUES (
      OLD.building_number, OLD.payer_id, OLD.asset_id, OLD.measurement_date,
      OLD.main_asset_type, OLD.asset_size,
      OLD.sub_asset_type_1, OLD.sub_asset_size_1,
      OLD.sub_asset_type_2, OLD.sub_asset_size_2,
      OLD.sub_asset_type_3, OLD.sub_asset_size_3,
      OLD.sub_asset_type_4, OLD.sub_asset_size_4,
      OLD.sub_asset_type_5, OLD.sub_asset_size_5,
      OLD.sub_asset_type_6, OLD.sub_asset_size_6,
      OLD.structure_drawing_url, OLD.created_at, OLD.updated_at,
      OLD.elevator, OLD.single_double_family, OLD.condo, OLD.townhouses, OLD.penthouse,
      OLD.tax_region
    );
    RETURN OLD;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION copy_asset_to_history() IS 'Copies asset records to assets_history ONLY when is_new_measurement flag is explicitly set to true (UPDATE) or when record is deleted (DELETE). Regular field updates without the flag do NOT move to history.';

