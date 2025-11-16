/*
  # Fix Building Totals to Use Only Latest Measurements
  
  1. Problem
    - Current trigger calculates building totals from ALL asset records, including historical measurements
    - This causes incorrect totals when multiple measurement dates exist for the same asset
  
  2. Solution
    - Update the trigger function to calculate totals only from the latest measurement_date for each asset_id
    - Use a subquery with DISTINCT ON to get the most recent record for each asset
  
  3. Changes
    - Modify `update_building_totals_from_assets()` function
    - Calculate `total_building_area` from latest measurements only
    - Calculate `total_assets` counting distinct asset_ids only (not all historical records)
  
  4. Notes
    - This ensures building totals reflect current state, not accumulated history
    - Historical data is preserved but doesn't affect building-level summaries
*/

-- Drop and recreate the function with corrected logic
CREATE OR REPLACE FUNCTION update_building_totals_from_assets()
RETURNS TRIGGER AS $$
DECLARE
  target_building_number integer;
  building_exists boolean;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    target_building_number := OLD.building_number;
  ELSIF (TG_OP = 'UPDATE' AND OLD.building_number != NEW.building_number) THEN
    -- Update the old building totals using only latest measurements
    UPDATE building
    SET
      total_building_area = COALESCE((
        SELECT SUM(asset_size)
        FROM (
          SELECT DISTINCT ON (asset_id) asset_id, asset_size
          FROM assets
          WHERE building_number = OLD.building_number
          ORDER BY asset_id, measurement_date DESC
        ) latest_assets
      ), 0),
      total_assets = COALESCE((
        SELECT COUNT(DISTINCT asset_id)
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

  -- Update building totals using only latest measurements
  UPDATE building
  SET
    total_building_area = COALESCE((
      SELECT SUM(asset_size)
      FROM (
        SELECT DISTINCT ON (asset_id) asset_id, asset_size
        FROM assets
        WHERE building_number = target_building_number
        ORDER BY asset_id, measurement_date DESC
      ) latest_assets
    ), 0),
    total_assets = COALESCE((
      SELECT COUNT(DISTINCT asset_id)
      FROM assets
      WHERE building_number = target_building_number
    ), 0)
  WHERE building_number = target_building_number;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;