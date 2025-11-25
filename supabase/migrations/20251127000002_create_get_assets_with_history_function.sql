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
  result json;
BEGIN
  SELECT json_build_object(
    'master', COALESCE((
      SELECT json_agg(row_to_json(a))
      FROM assets a
      WHERE a.building_number = p_building_number
      ORDER BY a.asset_id
    ), '[]'::json),
    'details', COALESCE((
      SELECT json_agg(row_to_json(h))
      FROM assets_history h
      WHERE h.building_number = p_building_number
      ORDER BY h.asset_id, h.history_created_at DESC
    ), '[]'::json)
  ) INTO result;
  
  RETURN COALESCE(result, json_build_object('master', '[]'::json, 'details', '[]'::json));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to public role
GRANT EXECUTE ON FUNCTION get_assets_with_history(bigint) TO public;

-- Add comment to document the function
COMMENT ON FUNCTION get_assets_with_history(bigint) IS 'Returns master records from assets table and detail records from assets_history table for a given building number in a single call';

