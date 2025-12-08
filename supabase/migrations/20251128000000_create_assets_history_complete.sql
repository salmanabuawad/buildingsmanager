/*
  # Create Assets History Table - Complete
  
  This migration consolidates all assets_history related operations:
  - Create assets_history table with all columns
  - Set up RLS policies
  - Create helper functions
  - Create views
  - Configure triggers (already in main assets migration)
  
  Note: The copy_asset_to_history trigger function is defined in the main assets migration
  (20251126000000_create_assets_table_complete.sql).
*/

-- Drop assets_history table if it exists (for clean migration)
DROP TABLE IF EXISTS assets_history CASCADE;

-- Create assets_history table with same structure as assets (but no id field, using asset_measurement_key or no primary key)
-- Note: Based on the final migration, assets_history doesn't have a strict primary key constraint
-- Multiple records can exist for the same asset_id and measurement_date
CREATE TABLE assets_history (
  building_number bigint,
  payer_id text,
  asset_id bigint NOT NULL,
  measurement_date text NOT NULL,
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
  floor smallint CHECK (floor >= -99 AND floor <= 99),
  discount_type text,
  discount_date_from text,
  discount_date_to text,
  history_created_at timestamptz DEFAULT now()
);

-- Create indexes for faster lookups
CREATE INDEX idx_assets_history_asset_id ON assets_history(asset_id);
CREATE INDEX idx_assets_history_measurement_date ON assets_history(measurement_date);
CREATE INDEX idx_assets_history_tax_region ON assets_history(tax_region);
CREATE INDEX idx_assets_history_building_number ON assets_history(building_number);

-- Enable RLS
ALTER TABLE assets_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Public can view assets_history" ON assets_history;
DROP POLICY IF EXISTS "Authenticated users can manage assets_history" ON assets_history;
DROP POLICY IF EXISTS "Public can insert assets_history" ON assets_history;
DROP POLICY IF EXISTS "Public can update assets_history" ON assets_history;
DROP POLICY IF EXISTS "Public can delete assets_history" ON assets_history;

-- Create RLS policies for public access (matching assets table policies)
CREATE POLICY "Public can view assets_history"
  ON assets_history FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public can insert assets_history"
  ON assets_history FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Public can update assets_history"
  ON assets_history FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can delete assets_history"
  ON assets_history FOR DELETE
  TO public
  USING (true);

-- Helper function to parse DD/MM/YYYY date for sorting
CREATE OR REPLACE FUNCTION parse_measurement_date(date_str text)
RETURNS date AS $$
BEGIN
  IF date_str ~ '^\d{2}/\d{2}/\d{4}$' THEN
    RETURN TO_DATE(date_str, 'DD/MM/YYYY');
  ELSE
    RETURN '1900-01-01'::date;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create function to get assets with history in one call
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

-- Create view that joins assets (latest) and assets_history (historical records)
CREATE OR REPLACE VIEW assets_with_history AS
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
  true as is_latest,
  NULL::timestamp with time zone as history_created_at
FROM assets a

UNION ALL

SELECT 
  h.building_number,
  h.payer_id,
  h.asset_id,
  h.measurement_date,
  h.main_asset_type,
  h.asset_size,
  h.sub_asset_type_1,
  h.sub_asset_size_1,
  h.sub_asset_type_2,
  h.sub_asset_size_2,
  h.sub_asset_type_3,
  h.sub_asset_size_3,
  h.sub_asset_type_4,
  h.sub_asset_size_4,
  h.sub_asset_type_5,
  h.sub_asset_size_5,
  h.sub_asset_type_6,
  h.sub_asset_size_6,
  h.structure_drawing_url,
  h.created_at,
  h.updated_at,
  h.elevator,
  h.single_double_family,
  h.condo,
  h.townhouses,
  h.penthouse,
  h.tax_region,
  h.floor,
  h.discount_type,
  h.discount_date_from,
  h.discount_date_to,
  false as is_latest,
  h.history_created_at
FROM assets_history h;

-- Grant SELECT permission on the view
GRANT SELECT ON assets_with_history TO public;

-- Add comments
COMMENT ON TABLE assets_history IS 'Historical asset measurements. Multiple records can exist for the same asset_id and measurement_date combination. No unique constraint on (asset_id, measurement_date).';
COMMENT ON FUNCTION get_assets_with_history(bigint) IS 'Returns master records from assets table and detail records from assets_history table for a given building number in a single call';
COMMENT ON VIEW assets_with_history IS 'Combined view of assets (latest measurements) and assets_history (historical measurements). The is_latest flag indicates if the record is from the assets table (true) or assets_history (false). Only records with is_latest=true should be editable.';

