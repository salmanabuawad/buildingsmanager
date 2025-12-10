/*
  # Create Field Configurations Table
  
  1. Changes
    - Create field_configurations table to store field width and padding settings
    - Fields are identified by field_name (e.g., 'building_number', 'asset_id', etc.)
    - Each field can have width_chars (number of characters), padding (number), and hebrew_name (Hebrew translation)
  
  2. Table Structure
    - field_name (text, PRIMARY KEY) - Field identifier
    - width_chars (integer) - Width in number of characters
    - padding (integer) - Padding in pixels
    - hebrew_name (text) - Hebrew translation/display name for the field
    - created_at (timestamptz)
    - updated_at (timestamptz)
*/

-- Create field_configurations table
CREATE TABLE IF NOT EXISTS field_configurations (
  field_name text PRIMARY KEY,
  width_chars integer NOT NULL DEFAULT 10,
  padding integer NOT NULL DEFAULT 8,
  hebrew_name text,
  pinned text, -- 'left', 'right', or NULL for no pinning
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add hebrew_name column if it doesn't exist (for existing tables)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'field_configurations' 
    AND column_name = 'hebrew_name'
  ) THEN
    ALTER TABLE field_configurations
    ADD COLUMN hebrew_name text;
    
    RAISE NOTICE 'Column hebrew_name added to field_configurations';
  END IF;
END $$;

-- Add pinned column if it doesn't exist (for existing tables)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'field_configurations' 
    AND column_name = 'pinned'
  ) THEN
    ALTER TABLE field_configurations
    ADD COLUMN pinned text;
    
    RAISE NOTICE 'Column pinned added to field_configurations';
  END IF;
END $$;

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
COMMENT ON COLUMN field_configurations.hebrew_name IS 'Hebrew translation/display name for the field';
COMMENT ON COLUMN field_configurations.pinned IS 'Pin position: left, right, or NULL for no pinning';

-- Insert default configurations for common fields
INSERT INTO field_configurations (field_name, width_chars, padding, hebrew_name, pinned) VALUES
  ('building_number', 12, 8, 'מספר מבנה'),
  ('asset_id', 12, 8, 'זיהוי נכס'),
  ('payer_id', 12, 8, 'זיהוי משלם'),
  ('tax_region', 10, 8, 'אזור מס'),
  ('main_asset_type', 10, 8, 'סוג נכס'),
  ('asset_size', 12, 8, 'גודל נכס'),
  ('measurement_date', 12, 8, 'תאריך מדידה'),
  ('sub_asset_type_1', 10, 8, 'סוג 1'),
  ('sub_asset_size_1', 12, 8, 'גודל 1'),
  ('sub_asset_type_2', 10, 8, 'סוג 2'),
  ('sub_asset_size_2', 12, 8, 'גודל 2'),
  ('sub_asset_type_3', 10, 8, 'סוג 3'),
  ('sub_asset_size_3', 12, 8, 'גודל 3'),
  ('sub_asset_type_4', 10, 8, 'סוג 4'),
  ('sub_asset_size_4', 12, 8, 'גודל 4'),
  ('sub_asset_type_5', 10, 8, 'סוג 5'),
  ('sub_asset_size_5', 12, 8, 'גודל 5'),
  ('sub_asset_type_6', 10, 8, 'סוג 6'),
  ('sub_asset_size_6', 12, 8, 'גודל 6'),
  ('private_shared_area', 15, 8, 'שטח משותף מגורים'),
  ('business_shared_area', 15, 8, 'שטח משותף עסקים'),
  ('total_building_area', 15, 8, 'ס"כ גודל'),
  ('area_for_control', 15, 8, 'שטח לבקרה'),
  ('overload_ratio', 12, 8, 'אחוז העמסה'),
  ('elevator', 10, 8, 'מעלית'),
  ('penthouse', 8, 8, 'דירת גג'),
  ('floor', 8, 8, 'קומה'),
  ('discount_type', 10, 8, 'סוג הנחה'),
  ('discount_date_from', 12, 8, 'תאריך הנחה מ'),
  ('discount_date_to', 12, 8, 'תאריך הנחה עד'),
  ('structure_drawing_url', 15, 8, 'שרטוט מבנה'),
  ('name', 15, 8, 'שם'),
  ('description', 20, 8, 'תיאור'),
  ('street_code', 10, 8, 'קוד רחוב'),
  ('street_description', 25, 8, 'כתובת'),
  ('single_double_family', 20, 8, 'בית פרטי חד משפחתי דו משפחתי'),
  ('condo', 10, 8, 'בית משותף'),
  ('townhouses', 20, 8, 'מבנים צמודי קרקע טוריים מעל 2 יחידות'),
  ('gosh', 8, 8, 'גוש'),
  ('helka', 8, 8, 'חלקה'),
  ('building_number_in_street', 12, 8, 'מספר בניין'),
  ('building_address', 10, 8, 'כתובת', NULL),
  ('actions', 10, 8, 'פעולות', 'right')
ON CONFLICT (field_name) DO UPDATE SET 
  hebrew_name = EXCLUDED.hebrew_name,
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  pinned = EXCLUDED.pinned;

