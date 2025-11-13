/*
  # Recreate Assets Table with Simple Schema

  1. Changes
    - Drop existing assets table and all dependencies
    - Create new simplified assets table with:
      - `id` (uuid, primary key) - Auto-generated unique identifier
      - `asset_id` (bigint, unique, not null) - The asset number (נכס)
      - `building_number` (bigint, not null) - The building number (מבנה)
      - `created_at` (timestamp) - Record creation timestamp
    
  2. Security
    - Enable RLS on assets table
    - Add policies for authenticated users to read all assets
    - Add policies for authenticated users to insert/update/delete assets
    
  3. Relationships
    - Foreign key to building table on building_number
    - Cascade delete when building is deleted
*/

-- Drop existing assets table and all dependencies
DROP TABLE IF EXISTS assets CASCADE;

-- Drop the asset_measurements table as it references assets
DROP TABLE IF EXISTS asset_measurements CASCADE;

-- Create new simplified assets table
CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id bigint UNIQUE NOT NULL,
  building_number bigint NOT NULL,
  created_at timestamptz DEFAULT now(),
  
  -- Foreign key constraint
  CONSTRAINT fk_building
    FOREIGN KEY (building_number)
    REFERENCES building(building_number)
    ON DELETE CASCADE
);

-- Create index on building_number for faster lookups
CREATE INDEX IF NOT EXISTS idx_assets_building_number ON assets(building_number);

-- Create index on asset_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_assets_asset_id ON assets(asset_id);

-- Enable RLS
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view assets"
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
      total_assets = (
        SELECT COUNT(*)
        FROM assets
        WHERE building_number = OLD.building_number
      )
    WHERE building_number = OLD.building_number;
    RETURN OLD;
  ELSE
    UPDATE building
    SET 
      total_assets = (
        SELECT COUNT(*)
        FROM assets
        WHERE building_number = NEW.building_number
      )
    WHERE building_number = NEW.building_number;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update building totals
DROP TRIGGER IF EXISTS trigger_update_building_totals ON assets;
CREATE TRIGGER trigger_update_building_totals
  AFTER INSERT OR UPDATE OR DELETE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION update_building_totals();
