/*
  # Update Building Total Area Function to Include Business Shared Area
  
  Updates the update_building_total_area function to:
  1. Sum assets where non_accountable_for_total_area is false
  2. Add business_shared_area to the total
  
  Formula: total_building_area = sum(asset_size where non_accountable_for_total_area = false) + business_shared_area
*/

-- Function to update building total area from assets
CREATE OR REPLACE FUNCTION update_building_total_area(p_building_number BIGINT)
RETURNS void AS $$
DECLARE
  v_asset_sum NUMERIC := 0;
  v_business_shared_area NUMERIC := 0;
BEGIN
  -- Calculate sum of assets where non_accountable_for_total_area is false
  SELECT COALESCE(SUM(a.asset_size), 0) INTO v_asset_sum
  FROM (
    SELECT DISTINCT ON (asset_id)
      asset_id,
      asset_size,
      main_asset_type
    FROM assets
    WHERE building_number = p_building_number
    ORDER BY asset_id, updated_at DESC
  ) a
  WHERE (
    a.main_asset_type IS NULL 
    OR EXISTS (
      SELECT 1 
      FROM asset_types at 
      WHERE at.name = a.main_asset_type 
        AND at.active = 'כן'
        AND (at.non_accountable_for_total_area IS NULL OR at.non_accountable_for_total_area = false)
    )
  );
  
  -- Get business_shared_area from building
  SELECT COALESCE(business_shared_area, 0) INTO v_business_shared_area
  FROM buildings
  WHERE building_number = p_building_number;
  
  -- Update building total area = asset sum + business shared area
  UPDATE buildings
  SET total_building_area = v_asset_sum + v_business_shared_area
  WHERE building_number = p_building_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_building_total_area IS 'Update building total area based on sum of asset sizes (excluding non_accountable_for_total_area assets) plus business_shared_area';

