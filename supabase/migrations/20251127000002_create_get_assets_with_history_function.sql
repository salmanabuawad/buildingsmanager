/*
  # Create function to get assets with history in one call
  
  1. Changes
    - Create a PostgreSQL function that returns both master records (from assets) 
      and detail records (from assets_history) in a single call
    - Returns JSON with master and details arrays
  
  2. Notes
    - This function can be called via Supabase RPC
    - Returns all assets for a building with their complete history
*/

CREATE OR REPLACE FUNCTION get_assets_with_history(p_building_number bigint)
RETURNS json AS $$
DECLARE
  master_data json;
  details_data json;
BEGIN
  -- Get master records from assets table
  SELECT COALESCE(json_agg(row_to_json(a) ORDER BY a.asset_id), '[]'::json)
  INTO master_data
  FROM (
    SELECT *
    FROM assets
    WHERE building_number = p_building_number
    ORDER BY asset_id
  ) a;
  
  -- Get detail records from assets_history table
  SELECT COALESCE(json_agg(row_to_json(h) ORDER BY h.asset_id, h.history_created_at DESC), '[]'::json)
  INTO details_data
  FROM (
    SELECT *
    FROM assets_history
    WHERE building_number = p_building_number
    ORDER BY asset_id, history_created_at DESC
  ) h;
  
  -- Return combined result
  RETURN json_build_object(
    'master', COALESCE(master_data, '[]'::json),
    'details', COALESCE(details_data, '[]'::json)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to public role
GRANT EXECUTE ON FUNCTION get_assets_with_history(bigint) TO public;

-- Add comment to document the function
COMMENT ON FUNCTION get_assets_with_history(bigint) IS 'Returns master records from assets table and detail records from assets_history table for a given building number in a single call';

