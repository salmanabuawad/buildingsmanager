/*
  # Fix get_assets_by_ids function to match actual assets table schema

  1. Overview
    - Remove floor field (replaced with apartment_floor and storage_floor)
    - Use business_distribution_area instead of area_from_distribution
    - Remove business_total_area (doesn't exist in assets table)
    - Add apartment_number, apartment_floor, storage_number, storage_floor fields

  2. Changes
    - Update function to match actual column names in assets table
    - This fixes the 400 error when calling from exportToAutomation

  3. Security
    - Function uses SECURITY DEFINER for proper permissions
*/

-- Drop the existing function
DROP FUNCTION IF EXISTS get_assets_by_ids(bigint[]);

CREATE OR REPLACE FUNCTION get_assets_by_ids(p_asset_ids bigint[])
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
  elevator boolean,
  single_double_family boolean,
  condo boolean,
  townhouses boolean,
  penthouse boolean,
  tax_region integer,
  discount_type text,
  discount_date_from text,
  discount_date_to text,
  is_new_measurement boolean,
  business_distribution_area numeric,
  exported_to_automation boolean,
  data_from_automation boolean,
  export_to_automation_at text,
  comment text,
  apartment_number text,
  apartment_floor text,
  storage_number text,
  storage_floor text
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
    a.discount_type,
    a.discount_date_from,
    a.discount_date_to,
    a.is_new_measurement,
    a.business_distribution_area,
    a.exported_to_automation,
    a.data_from_automation,
    a.export_to_automation_at,
    a.comment,
    a.apartment_number,
    a.apartment_floor,
    a.storage_number,
    a.storage_floor
  FROM assets a
  WHERE a.asset_id = ANY(p_asset_ids)
  ORDER BY a.asset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_assets_by_ids IS 'Returns assets by their IDs. Used for exporting assets to automation system. Matches actual assets table schema.';
