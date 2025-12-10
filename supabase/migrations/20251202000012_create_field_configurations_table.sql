/*
  # Create Field Configurations Table
  
  1. Changes
    - Create field_configurations table to store field width and padding settings
    - Fields are identified by field_name (e.g., 'building_number', 'asset_id', etc.)
    - Each field can have width_chars (number of characters) and padding (number)
  
  2. Table Structure
    - field_name (text, PRIMARY KEY) - Field identifier
    - width_chars (integer) - Width in number of characters
    - padding (integer) - Padding in pixels
    - created_at (timestamptz)
    - updated_at (timestamptz)
*/

-- Create field_configurations table
CREATE TABLE IF NOT EXISTS field_configurations (
  field_name text PRIMARY KEY,
  width_chars integer NOT NULL DEFAULT 10,
  padding integer NOT NULL DEFAULT 8,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_field_configurations_field_name ON field_configurations(field_name);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_field_configurations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS trigger_update_field_configurations_updated_at ON field_configurations;
CREATE TRIGGER trigger_update_field_configurations_updated_at
  BEFORE UPDATE ON field_configurations
  FOR EACH ROW
  EXECUTE FUNCTION update_field_configurations_updated_at();

-- Enable RLS
ALTER TABLE field_configurations ENABLE ROW LEVEL SECURITY;

-- Policies for field_configurations
CREATE POLICY "Field configurations are viewable by everyone"
  ON field_configurations FOR SELECT
  USING (true);

CREATE POLICY "Field configurations can be inserted by anyone"
  ON field_configurations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Field configurations can be updated by anyone"
  ON field_configurations FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Field configurations can be deleted by anyone"
  ON field_configurations FOR DELETE
  USING (true);

-- Add comment
COMMENT ON TABLE field_configurations IS 'Stores field width and padding configurations for all grids in the application';
COMMENT ON COLUMN field_configurations.field_name IS 'Field identifier (e.g., building_number, asset_id, etc.)';
COMMENT ON COLUMN field_configurations.width_chars IS 'Width in number of characters';
COMMENT ON COLUMN field_configurations.padding IS 'Padding in pixels';

-- Insert default configurations for common fields
INSERT INTO field_configurations (field_name, width_chars, padding) VALUES
  ('building_number', 12, 8),
  ('asset_id', 12, 8),
  ('payer_id', 12, 8),
  ('tax_region', 10, 8),
  ('main_asset_type', 10, 8),
  ('asset_size', 12, 8),
  ('measurement_date', 12, 8),
  ('sub_asset_type_1', 10, 8),
  ('sub_asset_size_1', 12, 8),
  ('sub_asset_type_2', 10, 8),
  ('sub_asset_size_2', 12, 8),
  ('sub_asset_type_3', 10, 8),
  ('sub_asset_size_3', 12, 8),
  ('sub_asset_type_4', 10, 8),
  ('sub_asset_size_4', 12, 8),
  ('sub_asset_type_5', 10, 8),
  ('sub_asset_size_5', 12, 8),
  ('sub_asset_type_6', 10, 8),
  ('sub_asset_size_6', 12, 8),
  ('private_shared_area', 15, 8),
  ('business_shared_area', 15, 8),
  ('total_building_area', 15, 8),
  ('area_for_control', 15, 8),
  ('overload_ratio', 12, 8),
  ('elevator', 10, 8),
  ('penthouse', 8, 8),
  ('floor', 8, 8),
  ('discount_type', 10, 8),
  ('discount_date_from', 12, 8),
  ('discount_date_to', 12, 8),
  ('structure_drawing_url', 15, 8),
  ('name', 15, 8),
  ('description', 20, 8),
  ('street_code', 10, 8),
  ('street_description', 25, 8)
ON CONFLICT (field_name) DO NOTHING;

