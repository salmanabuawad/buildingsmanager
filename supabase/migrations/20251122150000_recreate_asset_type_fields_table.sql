/*
  # Recreate Asset Type Fields Table According to Asset Types Table
  
  1. Changes
    - Drop existing asset_type_fields table
    - Recreate table with same structure
    - Populate with fields from asset_types table structure
  
  2. Table Structure
    - `id` (uuid) - Primary key
    - `field_name` (text) - Name of the field (matching asset_types columns)
    - `is_asset_level` (boolean) - True if field is asset level
    - `is_building_level` (boolean) - True if field is building level
    - `is_asset_type_validation` (boolean) - True if field is part of asset type validation
    - `created_at` (timestamptz) - Creation timestamp
    - `updated_at` (timestamptz) - Update timestamp
  
  3. Fields from asset_types table
    - name
    - description
    - tax_region
    - elevator
    - single_double_family
    - penthouse
    - condo
    - townhouses
    - min_size
    - max_size
*/

-- Drop existing table and all dependent objects
DROP TABLE IF EXISTS asset_type_fields CASCADE;

-- Recreate asset_type_fields table
CREATE TABLE asset_type_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_name text NOT NULL UNIQUE,
  is_asset_level boolean NOT NULL DEFAULT false,
  is_building_level boolean NOT NULL DEFAULT false,
  is_asset_type_validation boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for faster lookups by field name
CREATE INDEX idx_asset_type_fields_field_name ON asset_type_fields(field_name);

-- Create index for filtering by flags
CREATE INDEX idx_asset_type_fields_asset_level ON asset_type_fields(is_asset_level) WHERE is_asset_level = true;
CREATE INDEX idx_asset_type_fields_building_level ON asset_type_fields(is_building_level) WHERE is_building_level = true;
CREATE INDEX idx_asset_type_fields_validation ON asset_type_fields(is_asset_type_validation) WHERE is_asset_type_validation = true;

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

-- Insert field configurations based on asset_types table structure
-- All fields from asset_types are part of asset type validation
INSERT INTO asset_type_fields (field_name, is_asset_level, is_building_level, is_asset_type_validation) VALUES
  ('name', false, false, true),
  ('description', false, false, true),
  ('tax_region', false, false, true),
  ('elevator', false, false, true),
  ('single_double_family', false, false, true),
  ('penthouse', false, false, true),
  ('condo', false, false, true),
  ('townhouses', false, false, true),
  ('min_size', false, false, true),
  ('max_size', false, false, true)
ON CONFLICT (field_name) DO UPDATE SET
  is_asset_level = EXCLUDED.is_asset_level,
  is_building_level = EXCLUDED.is_building_level,
  is_asset_type_validation = EXCLUDED.is_asset_type_validation,
  updated_at = now();

