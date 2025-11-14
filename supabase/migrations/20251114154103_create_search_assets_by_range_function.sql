/*
  # Create search_assets_by_range function

  1. New Functions
    - `search_assets_by_range(from_id, to_id)` - Searches assets where asset_id (text) is numerically between from_id and to_id
  
  2. Details
    - Converts text asset_id to bigint for numeric comparison
    - Returns all matching assets ordered by numeric asset_id
    - Handles cases where asset_id cannot be converted to number
*/

CREATE OR REPLACE FUNCTION search_assets_by_range(from_id bigint, to_id bigint)
RETURNS TABLE (
  id uuid,
  building_number integer,
  asset_id text,
  payer_id text,
  main_asset_type text,
  main_asset_size numeric,
  secondary_asset_type_1 text,
  secondary_asset_size_1 numeric,
  secondary_asset_type_2 text,
  secondary_asset_size_2 numeric,
  secondary_asset_type_3 text,
  secondary_asset_size_3 numeric,
  secondary_asset_type_4 text,
  secondary_asset_size_4 numeric,
  secondary_asset_type_5 text,
  secondary_asset_size_5 numeric,
  secondary_asset_type_6 text,
  secondary_asset_size_6 numeric,
  total_size numeric,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.building_number,
    a.asset_id,
    a.payer_id,
    a.main_asset_type,
    a.main_asset_size,
    a.secondary_asset_type_1,
    a.secondary_asset_size_1,
    a.secondary_asset_type_2,
    a.secondary_asset_size_2,
    a.secondary_asset_type_3,
    a.secondary_asset_size_3,
    a.secondary_asset_type_4,
    a.secondary_asset_size_4,
    a.secondary_asset_type_5,
    a.secondary_asset_size_5,
    a.secondary_asset_type_6,
    a.secondary_asset_size_6,
    a.total_size,
    a.created_at,
    a.updated_at
  FROM assets a
  WHERE 
    a.asset_id ~ '^[0-9]+$' AND
    (a.asset_id::bigint >= from_id) AND
    (a.asset_id::bigint <= to_id)
  ORDER BY a.asset_id::bigint;
END;
$$;