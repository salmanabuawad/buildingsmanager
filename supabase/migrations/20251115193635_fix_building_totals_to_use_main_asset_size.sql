/*
  # Fix Building Totals to Use Main Asset Size Only

  1. Changes
    - Update trigger to sum main_asset_size instead of total_size
    - This ensures sub-assets are not double-counted in building totals

  2. Reasoning
    - Building total area should only include the primary asset sizes
    - Sub-assets are components of the main asset, not separate areas
*/

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS trigger_update_building_totals_from_assets ON assets;
DROP FUNCTION IF EXISTS update_building_totals_from_assets();

-- Create updated function that uses main_asset_size
CREATE OR REPLACE FUNCTION update_building_totals_from_assets()
RETURNS TRIGGER AS $$
DECLARE
  target_building_number integer;
BEGIN
  -- Determine which building to update based on the operation
  IF (TG_OP = 'DELETE') THEN
    target_building_number := OLD.building_number;
  ELSIF (TG_OP = 'UPDATE' AND OLD.building_number != NEW.building_number) THEN
    -- If building_number changed, update both old and new buildings
    -- Update old building
    UPDATE building
    SET
      total_building_area = COALESCE((
        SELECT SUM(main_asset_size)
        FROM assets
        WHERE building_number = OLD.building_number
      ), 0),
      total_assets = COALESCE((
        SELECT COUNT(*)
        FROM assets
        WHERE building_number = OLD.building_number
      ), 0)
    WHERE building_number = OLD.building_number;

    -- Set target to new building for the main update below
    target_building_number := NEW.building_number;
  ELSE
    target_building_number := NEW.building_number;
  END IF;

  -- Update the building totals for the target building
  UPDATE building
  SET
    total_building_area = COALESCE((
      SELECT SUM(main_asset_size)
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

-- Recreate trigger
CREATE TRIGGER trigger_update_building_totals_from_assets
AFTER INSERT OR UPDATE OR DELETE ON assets
FOR EACH ROW
EXECUTE FUNCTION update_building_totals_from_assets();