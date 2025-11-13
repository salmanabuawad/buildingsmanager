/*
  # Rollback assets table to complex structure

  1. Changes
    - Drop current simple assets table
    - Recreate assets table with full CSV structure:
      - `id` (uuid, primary key)
      - `building_number` (integer, foreign key to building)
      - `payer_id` (text) - Payer identifier
      - `asset_id` (text, unique) - Asset identifier
      - `main_asset_type` (text) - Main asset type
      - `main_asset_size` (numeric) - Main asset size
      - `sub_asset_type_1` through `sub_asset_type_6` (text) - Sub asset types
      - `sub_asset_size_1` through `sub_asset_size_6` (numeric) - Sub asset sizes
      - `total_size` (numeric, computed) - Total size of all assets
      - `created_at` (timestamp)
  
  2. Security
    - Enable RLS on assets table
    - Add policies for public read and authenticated users to manage
  
  3. Triggers
    - Update building totals when assets change
*/

-- Drop existing assets table
DROP TABLE IF EXISTS assets CASCADE;

-- Create assets table with complex structure
CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_number integer NOT NULL REFERENCES building(building_number) ON DELETE CASCADE,
  payer_id text NOT NULL DEFAULT '',
  asset_id text NOT NULL UNIQUE,
  main_asset_type text,
  main_asset_size numeric DEFAULT 0,
  sub_asset_type_1 text,
  sub_asset_size_1 numeric DEFAULT 0,
  sub_asset_type_2 text,
  sub_asset_size_2 numeric DEFAULT 0,
  sub_asset_type_3 text,
  sub_asset_size_3 numeric DEFAULT 0,
  sub_asset_type_4 text,
  sub_asset_size_4 numeric DEFAULT 0,
  sub_asset_type_5 text,
  sub_asset_size_5 numeric DEFAULT 0,
  sub_asset_type_6 text,
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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_assets_asset_id ON assets(asset_id);
CREATE INDEX IF NOT EXISTS idx_assets_building_number ON assets(building_number);
CREATE INDEX IF NOT EXISTS idx_assets_payer_id ON assets(payer_id);

-- Enable RLS
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Public can view assets"
  ON assets FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can insert assets"
  ON assets FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update assets"
  ON assets FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete assets"
  ON assets FOR DELETE
  TO authenticated
  USING (true);

-- Update building totals trigger function
CREATE OR REPLACE FUNCTION update_building_totals()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE building
    SET 
      total_assets = (SELECT COUNT(*) FROM assets WHERE building_number = OLD.building_number),
      total_building_area = COALESCE((SELECT SUM(total_size) FROM assets WHERE building_number = OLD.building_number), 0)
    WHERE building_number = OLD.building_number;
    RETURN OLD;
  ELSE
    UPDATE building
    SET 
      total_assets = (SELECT COUNT(*) FROM assets WHERE building_number = NEW.building_number),
      total_building_area = COALESCE((SELECT SUM(total_size) FROM assets WHERE building_number = NEW.building_number), 0)
    WHERE building_number = NEW.building_number;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_building_totals ON assets;
CREATE TRIGGER trigger_update_building_totals
  AFTER INSERT OR UPDATE OR DELETE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION update_building_totals();
