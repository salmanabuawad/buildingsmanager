/*
  # Rename apartments table to assets

  1. Changes
    - Rename `apartments` table to `assets`
    - Update foreign key constraint in apartment_measurements table
    - Update trigger function that references apartments
    - Maintain all existing columns, constraints, and RLS policies
  
  2. Security
    - All existing RLS policies are preserved
    - No changes to data access patterns
*/

-- Rename the table
ALTER TABLE apartments RENAME TO assets;

-- Update the foreign key constraint name in apartment_measurements if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'apartment_measurements_apartment_id_fkey'
  ) THEN
    ALTER TABLE apartment_measurements 
    RENAME CONSTRAINT apartment_measurements_apartment_id_fkey TO apartment_measurements_asset_id_fkey;
  END IF;
END $$;

-- Update the foreign key constraint in buildings table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'apartments_building_number_fkey'
  ) THEN
    ALTER TABLE assets 
    RENAME CONSTRAINT apartments_building_number_fkey TO assets_building_number_fkey;
  END IF;
END $$;

-- Recreate the trigger function to use the new table name
CREATE OR REPLACE FUNCTION update_building_totals()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the building totals when an asset is inserted, updated, or deleted
  IF TG_OP = 'DELETE' THEN
    UPDATE buildings
    SET 
      total_units = (SELECT COUNT(*) FROM assets WHERE building_number = OLD.building_number),
      apartment_area = COALESCE((SELECT SUM(apartment_area) FROM assets WHERE building_number = OLD.building_number), 0),
      storage_area = COALESCE((SELECT SUM(storage_area) FROM assets WHERE building_number = OLD.building_number), 0),
      pergola_area = COALESCE((SELECT SUM(pergola_area) FROM assets WHERE building_number = OLD.building_number), 0),
      balcony_area = COALESCE((SELECT SUM(balcony_area) FROM assets WHERE building_number = OLD.building_number), 0),
      total_building_area = COALESCE((SELECT SUM(total_apartment_area) FROM assets WHERE building_number = OLD.building_number), 0)
    WHERE building_number = OLD.building_number;
    RETURN OLD;
  ELSE
    UPDATE buildings
    SET 
      total_units = (SELECT COUNT(*) FROM assets WHERE building_number = NEW.building_number),
      apartment_area = COALESCE((SELECT SUM(apartment_area) FROM assets WHERE building_number = NEW.building_number), 0),
      storage_area = COALESCE((SELECT SUM(storage_area) FROM assets WHERE building_number = NEW.building_number), 0),
      pergola_area = COALESCE((SELECT SUM(pergola_area) FROM assets WHERE building_number = NEW.building_number), 0),
      balcony_area = COALESCE((SELECT SUM(balcony_area) FROM assets WHERE building_number = NEW.building_number), 0),
      total_building_area = COALESCE((SELECT SUM(total_apartment_area) FROM assets WHERE building_number = NEW.building_number), 0)
    WHERE building_number = NEW.building_number;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger on the renamed table
DROP TRIGGER IF EXISTS update_building_totals_trigger ON assets;
CREATE TRIGGER update_building_totals_trigger
  AFTER INSERT OR UPDATE OR DELETE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION update_building_totals();