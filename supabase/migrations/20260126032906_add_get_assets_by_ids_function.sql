/*
  # Add get_assets_by_ids function

  1. Changes
    - Creates get_assets_by_ids function that returns assets by their IDs
    - Used for exporting assets to automation system
    - Returns all asset fields needed for Excel export

  2. Parameters
    - p_asset_ids: Array of asset IDs to fetch

  3. Returns
    - Table with all asset fields
*/

-- Create function to get assets by IDs
CREATE OR REPLACE FUNCTION get_assets_by_ids(p_asset_ids integer[])
RETURNS TABLE (
  building_number bigint,
  payer_id text,
  asset_id bigint,
  measurement_date text,
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
  structure_drawing_url text,
  created_at timestamptz,
  updated_at timestamptz,
  elevator text,
  single_double_family text,
  condo text,
  townhouses text,
  penthouse text,
  tax_region integer,
  floor smallint,
  discount_type text,
  discount_date_from text,
  discount_date_to text,
  is_new_measurement boolean,
  area_from_distribution numeric,
  exported_to_automation boolean,
  data_from_automation boolean,
  export_to_automation_at text,
  comment text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.building_number,
    a.payer_id,
    a.asset_id,
    a.measurement_date,
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
    a.structure_drawing_url,
    a.created_at,
    a.updated_at,
    a.elevator,
    a.single_double_family,
    a.condo,
    a.townhouses,
    a.penthouse,
    a.tax_region,
    a.floor,
    a.discount_type,
    a.discount_date_from,
    a.discount_date_to,
    a.is_new_measurement,
    a.area_from_distribution,
    a.exported_to_automation,
    a.data_from_automation,
    a.export_to_automation_at,
    a.comment
  FROM assets a
  WHERE a.asset_id = ANY(p_asset_ids)
  ORDER BY a.asset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated and anon users
GRANT EXECUTE ON FUNCTION get_assets_by_ids(integer[]) TO authenticated, anon;

-- Add comment
COMMENT ON FUNCTION get_assets_by_ids IS 'Returns assets by their IDs. Used for exporting assets to automation system.';