/*
  # Create Trigger to Update Building Totals from Assets

  1. New Functions
    - `update_building_totals_from_assets()` - Function that recalculates building totals
      when assets are inserted, updated, or deleted
  
  2. New Triggers
    - Automatically updates building totals when:
      - An asset is inserted
      - An asset is updated (building_number or total_size changes)
      - An asset is deleted
  
  3. How it Works
    - Sums all asset total_size values for each building
    - Counts total assets per building
    - Updates the building table with aggregated values
    
  4. Important Notes
    - This replaces the old apartment-based trigger
    - Works with the current assets table structure
    - Updates both total_building_area and total_assets columns
*/

-- Drop old trigger if it exists
DROP TRIGGER IF EXISTS trigger_update_building_totals_from_assets ON assets;
DROP FUNCTION IF EXISTS update_building_totals_from_assets();
DROP FUNCTION IF EXISTS update_building_totals();

-- Create new function to update building totals from assets
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
        SELECT SUM(total_size)
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
      SELECT SUM(total_size)
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

-- Create trigger for INSERT, UPDATE, DELETE operations on assets
CREATE TRIGGER trigger_update_building_totals_from_assets
AFTER INSERT OR UPDATE OR DELETE ON assets
FOR EACH ROW
EXECUTE FUNCTION update_building_totals_from_assets();
