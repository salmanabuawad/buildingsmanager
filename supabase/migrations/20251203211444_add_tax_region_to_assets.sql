/*
  # Add tax_region field to assets table

  1. Changes
    - Add `tax_region` integer field to assets table
    - Add `tax_region` integer field to assets_history table
    - Field is optional (nullable) - can be populated from asset_types later if needed
    
  2. Tables Modified
    - `assets`: Add tax_region column
    - `assets_history`: Add tax_region column
    
  3. Notes
    - tax_region type is INTEGER to match asset_types.tax_region
    - Column is nullable to allow gradual migration
    - Can be populated from asset_types.main_asset_type -> asset_types.tax_region relationship
*/

-- Add tax_region column to assets table
ALTER TABLE assets ADD COLUMN IF NOT EXISTS tax_region INTEGER;

-- Add tax_region column to assets_history table
ALTER TABLE assets_history ADD COLUMN IF NOT EXISTS tax_region INTEGER;

-- Add index on tax_region for faster filtering queries
CREATE INDEX IF NOT EXISTS idx_assets_tax_region ON assets(tax_region);
CREATE INDEX IF NOT EXISTS idx_assets_history_tax_region ON assets_history(tax_region);

-- Add comments to document the columns
COMMENT ON COLUMN assets.tax_region IS 'Tax region code (אזור מס). Matches asset_types.tax_region. Can be populated from main_asset_type relationship.';
COMMENT ON COLUMN assets_history.tax_region IS 'Tax region code (אזור מס) from historical record. Matches asset_types.tax_region.';

-- Update the copy_asset_to_history trigger function to include tax_region
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
        elevator, single_double_family, condo, townhouses, basement, penthouse,
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
        OLD.elevator, OLD.single_double_family, OLD.condo, OLD.townhouses, OLD.basement, OLD.penthouse,
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
      elevator, single_double_family, condo, townhouses, basement, penthouse,
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
      OLD.elevator, OLD.single_double_family, OLD.condo, OLD.townhouses, OLD.basement, OLD.penthouse,
      OLD.tax_region
    );
    RETURN OLD;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

