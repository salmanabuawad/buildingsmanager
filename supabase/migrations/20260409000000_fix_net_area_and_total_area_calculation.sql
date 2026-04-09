/*
  # Fix net_area and total_building_area calculation

  Both fields are now derived purely from assets:

  total_building_area = SUM(asset_size)
    WHERE non_accountable_for_total_area IS NOT true

  net_area = SUM(asset_size)
    WHERE non_accountable_for_total_area IS NOT true
      AND use_shared_area IS NOT true
      AND use_for_parking_shared_area IS NOT true
*/

CREATE OR REPLACE FUNCTION update_building_total_area(p_building_number BIGINT)
RETURNS void AS $$
DECLARE
  v_total_area NUMERIC := 0;
  v_net_area   NUMERIC := 0;
BEGIN
  -- total_building_area: all assets except those excluded from building area
  SELECT COALESCE(SUM(a.asset_size), 0) INTO v_total_area
  FROM assets a
  LEFT JOIN asset_types at ON at.name = a.main_asset_type
  WHERE a.building_number = p_building_number
    AND (at.non_accountable_for_total_area IS NULL OR at.non_accountable_for_total_area = false);

  -- net_area: same but also exclude shared-area-type assets
  SELECT COALESCE(SUM(a.asset_size), 0) INTO v_net_area
  FROM assets a
  LEFT JOIN asset_types at ON at.name = a.main_asset_type
  WHERE a.building_number = p_building_number
    AND (at.non_accountable_for_total_area    IS NULL OR at.non_accountable_for_total_area    = false)
    AND (at.use_shared_area                   IS NULL OR at.use_shared_area                   = false)
    AND (at.use_for_parking_shared_area       IS NULL OR at.use_for_parking_shared_area       = false);

  UPDATE buildings
  SET
    total_building_area = v_total_area,
    net_area            = v_net_area
  WHERE building_number = p_building_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_building_total_area IS
  'Recalculates total_building_area (all accountable assets) and net_area (accountable, non-shared assets) for a building.';

-- Fix existing data: recalculate all buildings
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT building_number FROM buildings LOOP
    PERFORM update_building_total_area(r.building_number);
  END LOOP;
END $$;
