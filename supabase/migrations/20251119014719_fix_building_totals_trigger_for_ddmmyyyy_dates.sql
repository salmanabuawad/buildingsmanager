/*
  # Fix Building Totals Trigger for DD/MM/YYYY Date Format
  
  1. Problem
    - measurement_date is stored as text in DD/MM/YYYY format
    - Sorting by text doesn't work correctly (e.g., "01/11/2025" < "19/11/2025" as text is wrong)
    - This causes the trigger to pick the wrong "latest" measurement
  
  2. Solution
    - Convert DD/MM/YYYY text to proper DATE type for sorting
    - Use TO_DATE() function with 'DD/MM/YYYY' format
    - Handle invalid dates gracefully with a default fallback
  
  3. Changes
    - Update `update_building_totals_from_assets()` function to properly sort dates
    - Use CASE statement to convert text dates to proper DATE type
*/

-- Drop and recreate the function with proper date handling
CREATE OR REPLACE FUNCTION update_building_totals_from_assets()
RETURNS TRIGGER AS $$
DECLARE
  target_building_number bigint;
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
          ORDER BY asset_id, 
                   CASE 
                     WHEN measurement_date ~ '^\d{2}/\d{2}/\d{4}$' THEN
                       TO_DATE(measurement_date, 'DD/MM/YYYY')
                     ELSE
                       TO_DATE('01/01/1900', 'DD/MM/YYYY')
                   END DESC
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

  -- Update building totals using only latest measurements with proper date sorting
  UPDATE building
  SET
    total_building_area = COALESCE((
      SELECT SUM(asset_size)
      FROM (
        SELECT DISTINCT ON (asset_id) asset_id, asset_size
        FROM assets
        WHERE building_number = target_building_number
        ORDER BY asset_id, 
                 CASE 
                   WHEN measurement_date ~ '^\d{2}/\d{2}/\d{4}$' THEN
                     TO_DATE(measurement_date, 'DD/MM/YYYY')
                   ELSE
                     TO_DATE('01/01/1900', 'DD/MM/YYYY')
                 END DESC
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

-- Manually trigger recalculation for all buildings
DO $$
DECLARE
  bldg RECORD;
BEGIN
  FOR bldg IN SELECT DISTINCT building_number FROM building
  LOOP
    UPDATE building
    SET
      total_building_area = COALESCE((
        SELECT SUM(asset_size)
        FROM (
          SELECT DISTINCT ON (asset_id) asset_id, asset_size
          FROM assets
          WHERE building_number = bldg.building_number
          ORDER BY asset_id, 
                   CASE 
                     WHEN measurement_date ~ '^\d{2}/\d{2}/\d{4}$' THEN
                       TO_DATE(measurement_date, 'DD/MM/YYYY')
                     ELSE
                       TO_DATE('01/01/1900', 'DD/MM/YYYY')
                   END DESC
        ) latest_assets
      ), 0),
      total_assets = COALESCE((
        SELECT COUNT(DISTINCT asset_id)
        FROM assets
        WHERE building_number = bldg.building_number
      ), 0)
    WHERE building_number = bldg.building_number;
  END LOOP;
END $$;
