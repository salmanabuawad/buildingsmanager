/*
  # Fix search_assets_by_range function

  1. Changes
    - Update column names to match actual schema (sub_asset instead of secondary_asset)
    - Change id type from uuid to bigint
    - Remove columns that don't exist in the table
*/

DROP FUNCTION IF EXISTS search_assets_by_range(bigint, bigint);

CREATE OR REPLACE FUNCTION search_assets_by_range(from_id bigint, to_id bigint)
RETURNS TABLE (
  id bigint,
  building_number integer,
  asset_id text,
  payer_id text,
  main_asset_type text,
  main_asset_size numeric,
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