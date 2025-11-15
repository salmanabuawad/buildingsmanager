/*
  # Rename main_asset_size to asset_size

  1. Changes
    - Rename column main_asset_size to asset_size in assets table
    - Update trigger function to use new column name
    - Update check constraint to use new column name

  2. Reasoning
    - Simpler, clearer naming convention
    - "asset_size" is more intuitive than "main_asset_size"
*/

-- Rename the column
ALTER TABLE assets 
RENAME COLUMN main_asset_size TO asset_size;

-- Drop and recreate the trigger function with new column name
DROP TRIGGER IF EXISTS trigger_update_building_totals_from_assets ON assets;
DROP FUNCTION IF EXISTS update_building_totals_from_assets();

CREATE OR REPLACE FUNCTION update_building_totals_from_assets()
RETURNS TRIGGER AS $$
DECLARE
  target_building_number integer;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    target_building_number := OLD.building_number;
  ELSIF (TG_OP = 'UPDATE' AND OLD.building_number != NEW.building_number) THEN
    UPDATE building
    SET
      total_building_area = COALESCE((
        SELECT SUM(asset_size)
        FROM assets
        WHERE building_number = OLD.building_number
      ), 0),
      total_assets = COALESCE((
        SELECT COUNT(*)
        FROM assets
        WHERE building_number = OLD.building_number
      ), 0)
    WHERE building_number = OLD.building_number;

    target_building_number := NEW.building_number;
  ELSE
    target_building_number := NEW.building_number;
  END IF;

  UPDATE building
  SET
    total_building_area = COALESCE((
      SELECT SUM(asset_size)
      FROM assets
      WHERE building_number = target_building_number
    ), 0),
    total_assets = COALESCE((
      SELECT COUNT(*)
      FROM assets
      WHERE building_number = target_building_number
    ), 0)
  WHERE building_number = target_building_number;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_building_totals_from_assets
AFTER INSERT OR UPDATE OR DELETE ON assets
FOR EACH ROW
EXECUTE FUNCTION update_building_totals_from_assets();

-- Drop and recreate the total_size calculation trigger with new column name
DROP TRIGGER IF EXISTS trigger_calculate_total_size ON assets;
DROP FUNCTION IF EXISTS calculate_total_size();

CREATE OR REPLACE FUNCTION calculate_total_size()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_size := COALESCE(NEW.asset_size, 0) +
                    COALESCE(NEW.sub_asset_size_1, 0) +
                    COALESCE(NEW.sub_asset_size_2, 0) +
                    COALESCE(NEW.sub_asset_size_3, 0) +
                    COALESCE(NEW.sub_asset_size_4, 0) +
                    COALESCE(NEW.sub_asset_size_5, 0) +
                    COALESCE(NEW.sub_asset_size_6, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_total_size
BEFORE INSERT OR UPDATE ON assets
FOR EACH ROW
EXECUTE FUNCTION calculate_total_size();