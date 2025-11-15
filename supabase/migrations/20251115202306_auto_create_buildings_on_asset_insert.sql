/*
  # Auto-Create Buildings and Update Totals on Asset Changes

  1. Changes
    - Update trigger function to automatically create building if it doesn't exist
    - When inserting an asset, create the building entry automatically
    - Continue updating totals for existing buildings
    - Handle all asset operations: INSERT, UPDATE, DELETE

  2. Notes
    - Building is created with default values when first asset is added
    - Building totals (total_assets, total_building_area) are calculated from assets
    - Handles building number changes in asset updates
*/

-- Drop existing trigger to recreate with new logic
DROP TRIGGER IF EXISTS trigger_update_building_totals_from_assets ON assets;

-- Recreate the function with auto-create logic
CREATE OR REPLACE FUNCTION update_building_totals_from_assets()
RETURNS TRIGGER AS $$
DECLARE
  target_building_number integer;
  building_exists boolean;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    target_building_number := OLD.building_number;
  ELSIF (TG_OP = 'UPDATE' AND OLD.building_number != NEW.building_number) THEN
    -- Update the old building totals
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

  -- Check if building exists, if not create it
  IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.building_number != NEW.building_number)) THEN
    SELECT EXISTS(
      SELECT 1 FROM building WHERE building_number = target_building_number
    ) INTO building_exists;
    
    IF NOT building_exists THEN
      -- Create the building automatically
      INSERT INTO building (building_number, total_assets, total_building_area)
      VALUES (target_building_number, 0, 0);
    END IF;
  END IF;

  -- Update building totals
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

-- Recreate the trigger
CREATE TRIGGER trigger_update_building_totals_from_assets
AFTER INSERT OR UPDATE OR DELETE ON assets
FOR EACH ROW
EXECUTE FUNCTION update_building_totals_from_assets();
