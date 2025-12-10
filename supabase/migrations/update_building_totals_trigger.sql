-- Create update_building_totals function (dynamic table name detection)
-- This trigger automatically updates building.total_building_area when assets are inserted, updated, or deleted
-- Building size is the sum of all assets' main size (asset_size) only, excluding:
-- 1. Assets with not_accountable = true
-- 2. Subtype sizes (sub_asset_size_1 through sub_asset_size_6) are NOT included
-- Only the main asset size (asset_size) is summed for the building total
CREATE OR REPLACE FUNCTION update_building_totals()
RETURNS TRIGGER AS $$
DECLARE
  target_building_number bigint;
  building_table_name text;
  has_total_building_area boolean;
  has_total_assets boolean;
  sql_query text;
BEGIN
  -- Determine which building to update
  IF TG_OP = 'DELETE' THEN
    target_building_number := OLD.building_number;
  ELSE
    target_building_number := NEW.building_number;
  END IF;

  -- Determine building table name (buildings or building)
  SELECT table_name INTO building_table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND (table_name = 'buildings' OR table_name = 'building')
  ORDER BY table_name
  LIMIT 1;

  -- Check if columns exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = COALESCE(building_table_name, 'buildings')
      AND column_name = 'total_building_area'
  ) INTO has_total_building_area;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = COALESCE(building_table_name, 'buildings')
      AND column_name = 'total_assets'
  ) INTO has_total_assets;

  -- Build dynamic SQL query
  sql_query := 'UPDATE ' || quote_ident(COALESCE(building_table_name, 'buildings')) || ' SET ';
  
  IF has_total_building_area THEN
    -- Building size is the sum of all accountable assets' main size (asset_size) only:
    -- 1. Only includes assets where not_accountable = false or NULL (accountable assets)
    -- 2. Excludes assets with not_accountable = true (non-accountable assets)
    -- 3. Subtype sizes (sub_asset_size_1 through sub_asset_size_6) are NOT included
    -- Only the main asset size (asset_size) of accountable assets is summed for the building total
    sql_query := sql_query || 'total_building_area = COALESCE((
      SELECT SUM(a.asset_size) 
      FROM assets a
      LEFT JOIN asset_types at ON at.name = a.main_asset_type AND at.active = ''כן''
      WHERE a.building_number = $1 
        AND (at.not_accountable IS NULL OR at.not_accountable = false)
    ), 0)';
  END IF;
  
  IF has_total_building_area AND has_total_assets THEN
    sql_query := sql_query || ', ';
  END IF;
  
  IF has_total_assets THEN
    sql_query := sql_query || 'total_assets = COALESCE((SELECT COUNT(*) FROM assets WHERE building_number = $1), 0)';
  END IF;
  
  sql_query := sql_query || ' WHERE building_number = $1';

  -- Only execute if at least one column exists
  IF has_total_building_area OR has_total_assets THEN
    EXECUTE sql_query USING target_building_number;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_building_totals ON assets;
CREATE TRIGGER trigger_update_building_totals
  AFTER INSERT OR UPDATE OR DELETE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION update_building_totals();
