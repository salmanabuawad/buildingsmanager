/*
  # Fix get_building_stats function for asset_id primary key
  
  1. Changes
    - Update function to ensure compatibility with asset_id as primary key
    - No changes needed to the function itself as it already uses asset_id correctly
  
  2. Purpose
    - Ensure get_building_stats works correctly after removing id field
    - Function already uses asset_id which is correct
  
  3. Notes
    - The function already uses DISTINCT ON (asset_id) which is correct
    - No changes needed, but recreating for consistency
*/

-- Recreate function to ensure it's up to date (already uses asset_id correctly)
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

