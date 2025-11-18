/*
  # Fix search_assets_by_range function

  1. Changes
    - Update function to return all asset columns including measurement_date
    - Fix column references to match current asset table schema
  
  2. Notes
    - Function searches assets by asset_id range
    - Returns assets ordered by asset_id
*/

-- Drop existing function
DROP FUNCTION IF EXISTS search_assets_by_range(bigint, bigint);

-- Create updated function with correct return columns
CREATE OR REPLACE FUNCTION search_assets_by_range(from_id bigint, to_id bigint)
RETURNS TABLE (
  id uuid,
  building_number bigint,
  asset_id text,
  payer_id text,
  main_asset_type text,
  asset_size numeric,
  sub_asset_type_1 text,
  sub_asset_size_1 numeric,
  sub_asset_type_2 text,
  sub_asset_size_2 numeric,
  sub_asset_type_3 text,
  sub_asset_size_3 numeric,
  sub_asset_type_4 text,
  sub_asset_size_4 numeric,
  sub_asset_type_5 text,
  sub_asset_size_5 numeric,
  sub_asset_type_6 text,
  sub_asset_size_6 numeric,
  measurement_date text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.building_number,
    a.asset_id,
    a.payer_id,
    a.main_asset_type,
    a.asset_size,
    a.sub_asset_type_1,
    a.sub_asset_size_1,
    a.sub_asset_type_2,
    a.sub_asset_size_2,
    a.sub_asset_type_3,
    a.sub_asset_size_3,
    a.sub_asset_type_4,
    a.sub_asset_size_4,
    a.sub_asset_type_5,
    a.sub_asset_size_5,
    a.sub_asset_type_6,
    a.sub_asset_size_6,
    a.measurement_date,
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