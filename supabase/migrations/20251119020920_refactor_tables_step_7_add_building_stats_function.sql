/*
  # Refactor Step 7: Add Building Stats Function

  1. New Functions
    - `get_building_stats(p_building_number)` - Returns calculated statistics for a building
      - Returns total_assets count
      - Returns total_building_area sum
      - Calculated from latest measurements only

  2. Purpose
    - Replaces the removed calculated fields in buildings table
    - Provides on-demand calculation of building statistics
    - Ensures data is always accurate and up-to-date

  3. Usage
    - Frontend can call this function to get building statistics
    - No need for triggers to maintain calculated fields
    - Statistics are calculated from current data each time

  4. Notes
    - Only counts the latest measurement for each asset
    - Groups by asset_id and gets the max measurement_date
    - Sums the asset_size for those latest measurements
*/

-- Create function to get building stats
CREATE OR REPLACE FUNCTION get_building_stats(p_building_number bigint)
RETURNS TABLE (
  total_assets integer,
  total_building_area numeric
) AS $$
BEGIN
  RETURN QUERY
  WITH latest_measurements AS (
    SELECT DISTINCT ON (asset_id)
      asset_id,
      building_number,
      asset_size,
      measurement_date
    FROM assets
    WHERE building_number = p_building_number
    ORDER BY 
      asset_id,
      CASE 
        WHEN measurement_date ~ '^\d{2}/\d{2}/\d{4}$' THEN
          TO_DATE(measurement_date, 'DD/MM/YYYY')
        ELSE
          TO_DATE('01/01/1900', 'DD/MM/YYYY')
      END DESC
  )
  SELECT 
    COUNT(*)::integer as total_assets,
    COALESCE(SUM(asset_size), 0) as total_building_area
  FROM latest_measurements;
END;
$$ LANGUAGE plpgsql STABLE;