-- ============================================================================
-- Trigger to copy asset to history when saving as new measurement
-- ============================================================================
-- This trigger automatically copies the current asset data to assets_history
-- when is_new_measurement flag is set to true during an UPDATE operation

-- Function to copy asset to history
CREATE OR REPLACE FUNCTION copy_asset_to_history()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- When is_new_measurement is true, copy the OLD record (current asset data) to history
    IF COALESCE(NEW.is_new_measurement, false) = true THEN
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
        tax_region, floor, discount_type, discount_date_from, discount_date_to
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
        OLD.tax_region, OLD.floor, OLD.discount_type, OLD.discount_date_from, OLD.discount_date_to
      );
      -- Reset the flag after copying to history
      NEW.is_new_measurement = false;
    END IF;
    RETURN NEW;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    -- When an asset is deleted, copy it to history
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
      tax_region, floor, discount_type, discount_date_from, discount_date_to
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
      OLD.tax_region, OLD.floor, OLD.discount_type, OLD.discount_date_from, OLD.discount_date_to
    );
    RETURN OLD;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_copy_asset_to_history ON assets;
CREATE TRIGGER trigger_copy_asset_to_history
  BEFORE UPDATE OR DELETE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION copy_asset_to_history();

COMMENT ON FUNCTION copy_asset_to_history() IS 'Automatically copies asset data to assets_history when is_new_measurement is true (UPDATE) or when asset is deleted (DELETE)';
COMMENT ON TRIGGER trigger_copy_asset_to_history ON assets IS 'Triggers before UPDATE or DELETE to copy asset data to history table';

