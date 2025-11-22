-- Quick script to create asset_type_fields table
-- Run this in your database if the migration hasn't been applied yet
-- After running this, restart PostgREST to refresh the schema cache

-- Drop table if it exists (optional - comment out if you want to preserve data)
-- DROP TABLE IF EXISTS asset_type_fields CASCADE;

-- Create asset_type_fields table
CREATE TABLE IF NOT EXISTS asset_type_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_name text NOT NULL UNIQUE,
  is_asset_level boolean NOT NULL DEFAULT false,
  is_building_level boolean NOT NULL DEFAULT false,
  is_asset_type_validation boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for faster lookups by field name
CREATE INDEX IF NOT EXISTS idx_asset_type_fields_field_name ON asset_type_fields(field_name);

-- Create index for filtering by flags
CREATE INDEX IF NOT EXISTS idx_asset_type_fields_asset_level ON asset_type_fields(is_asset_level) WHERE is_asset_level = true;
CREATE INDEX IF NOT EXISTS idx_asset_type_fields_building_level ON asset_type_fields(is_building_level) WHERE is_building_level = true;
CREATE INDEX IF NOT EXISTS idx_asset_type_fields_validation ON asset_type_fields(is_asset_type_validation) WHERE is_asset_type_validation = true;

-- Enable RLS
ALTER TABLE asset_type_fields ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists and create new one
DROP POLICY IF EXISTS "Allow all access to asset type fields" ON asset_type_fields;
CREATE POLICY "Allow all access to asset type fields" ON asset_type_fields
  FOR ALL USING (true);

-- Create function to update updated_at timestamp (if it doesn't exist)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_asset_type_fields_updated_at ON asset_type_fields;
CREATE TRIGGER update_asset_type_fields_updated_at BEFORE UPDATE ON asset_type_fields
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert initial field configurations based on Asset and Building interfaces
-- Asset-only level fields
INSERT INTO asset_type_fields (field_name, is_asset_level, is_building_level, is_asset_type_validation) VALUES
  ('asset_id', true, false, false),
  ('payer_id', true, false, false),
  ('measurement_date', true, false, false),
  ('main_asset_type', true, false, true),
  ('asset_size', true, false, true),
  ('sub_asset_type_1', true, false, true),
  ('sub_asset_size_1', true, false, true),
  ('sub_asset_type_2', true, false, true),
  ('sub_asset_size_2', true, false, true),
  ('sub_asset_type_3', true, false, true),
  ('sub_asset_size_3', true, false, true),
  ('sub_asset_type_4', true, false, true),
  ('sub_asset_size_4', true, false, true),
  ('sub_asset_type_5', true, false, true),
  ('sub_asset_size_5', true, false, true),
  ('sub_asset_type_6', true, false, true),
  ('sub_asset_size_6', true, false, true),
  ('structure_drawing_url', true, false, false),
  ('penthouse', true, false, false)
ON CONFLICT (field_name) DO NOTHING;

-- Building-only level fields
INSERT INTO asset_type_fields (field_name, is_asset_level, is_building_level, is_asset_type_validation) VALUES
  ('building_number', false, true, false),
  ('tax_region', false, true, false),
  ('shared_area', false, true, false),
  ('has_elevator', false, true, false),
  ('area_for_control', false, true, false),
  ('total_building_area', false, true, false)
ON CONFLICT (field_name) DO NOTHING;

-- Fields that are both asset and building level
INSERT INTO asset_type_fields (field_name, is_asset_level, is_building_level, is_asset_type_validation) VALUES
  ('elevator', true, true, false),
  ('single_double_family', true, true, false),
  ('condo', true, true, false),
  ('townhouses', true, true, false),
  ('basement', true, true, false)
ON CONFLICT (field_name) DO NOTHING;

-- Note: After creating this table, run the triggers migration to automatically update
-- this table when asset types are added, updated, or deleted

