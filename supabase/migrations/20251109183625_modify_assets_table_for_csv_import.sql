/*
  # Modify assets table structure for CSV import

  1. Changes
    - Drop existing assets table and recreate with new structure
    - Add payer_id (זיהוי משלם) - text field
    - Rename apartment_number to asset_id (זיהוי נכס) - text field
    - Add main_asset_type (סוג נכס) - references unit_types.name
    - Add main_asset_size (גודל נכס) - numeric
    - Add sub_asset columns (6 pairs of type and size)
    - Remove old area columns (apartment_area, storage_area, etc.)
  
  2. Security
    - Enable RLS on new assets table
    - Add policies for public read access
*/

-- Drop the trigger first
DROP TRIGGER IF EXISTS update_building_totals_trigger ON assets;

-- Drop the old table
DROP TABLE IF EXISTS assets CASCADE;

-- Create new assets table with CSV structure
CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_number integer NOT NULL REFERENCES buildings(building_number) ON DELETE CASCADE,
  payer_id text NOT NULL,
  asset_id text NOT NULL UNIQUE,
  main_asset_type text REFERENCES unit_types(name),
  main_asset_size numeric DEFAULT 0,
  sub_asset_type_1 text REFERENCES unit_types(name),
  sub_asset_size_1 numeric DEFAULT 0,
  sub_asset_type_2 text REFERENCES unit_types(name),
  sub_asset_size_2 numeric DEFAULT 0,
  sub_asset_type_3 text REFERENCES unit_types(name),
  sub_asset_size_3 numeric DEFAULT 0,
  sub_asset_type_4 text REFERENCES unit_types(name),
  sub_asset_size_4 numeric DEFAULT 0,
  sub_asset_type_5 text REFERENCES unit_types(name),
  sub_asset_size_5 numeric DEFAULT 0,
  sub_asset_type_6 text REFERENCES unit_types(name),
  sub_asset_size_6 numeric DEFAULT 0,
  total_size numeric GENERATED ALWAYS AS (
    main_asset_size + 
    COALESCE(sub_asset_size_1, 0) + 
    COALESCE(sub_asset_size_2, 0) + 
    COALESCE(sub_asset_size_3, 0) + 
    COALESCE(sub_asset_size_4, 0) + 
    COALESCE(sub_asset_size_5, 0) + 
    COALESCE(sub_asset_size_6, 0)
  ) STORED,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access
CREATE POLICY "Public can view assets"
  ON assets FOR SELECT
  TO public
  USING (true);

-- Create policy for authenticated users to manage assets
CREATE POLICY "Authenticated users can manage assets"
  ON assets FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create index on asset_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_assets_asset_id ON assets(asset_id);
CREATE INDEX IF NOT EXISTS idx_assets_building_number ON assets(building_number);
CREATE INDEX IF NOT EXISTS idx_assets_payer_id ON assets(payer_id);

-- Recreate the trigger function for building totals
CREATE OR REPLACE FUNCTION update_building_totals()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the building totals when an asset is inserted, updated, or deleted
  IF TG_OP = 'DELETE' THEN
    UPDATE buildings
    SET 
      total_units = (SELECT COUNT(*) FROM assets WHERE building_number = OLD.building_number),
      total_building_area = COALESCE((SELECT SUM(total_size) FROM assets WHERE building_number = OLD.building_number), 0)
    WHERE building_number = OLD.building_number;
    RETURN OLD;
  ELSE
    UPDATE buildings
    SET 
      total_units = (SELECT COUNT(*) FROM assets WHERE building_number = NEW.building_number),
      total_building_area = COALESCE((SELECT SUM(total_size) FROM assets WHERE building_number = NEW.building_number), 0)
    WHERE building_number = NEW.building_number;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER update_building_totals_trigger
  AFTER INSERT OR UPDATE OR DELETE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION update_building_totals();