/*
  # Recreate assets table based on CSV structure

  1. Changes
    - Drop existing assets table and recreate with proper CSV column mapping
    - Hebrew column headers mapped to English field names:
      - מספר בנין -> building_number
      - זיהוי משלם -> payer_id
      - זיהוי נכס -> asset_id
      - סוג נכס -> main_asset_type
      - גודל נכס -> main_asset_size
      - נכס משנה 1-6 -> sub_asset_type_1 through sub_asset_type_6
      - גודל נכס משנה 1-6 -> sub_asset_size_1 through sub_asset_size_6
    - All fields nullable except primary key and building_number
    - Add total_size computed column
  
  2. Security
    - Enable RLS
    - Allow public access for SELECT, INSERT, UPDATE, DELETE
*/

-- Drop existing table
DROP TABLE IF EXISTS assets CASCADE;

-- Create new assets table matching CSV structure
CREATE TABLE assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_number integer NOT NULL,
  payer_id text,
  asset_id text,
  main_asset_type text,
  main_asset_size numeric,
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
  total_size numeric GENERATED ALWAYS AS (
    COALESCE(main_asset_size, 0) +
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

-- Create policies for public access
CREATE POLICY "Public can view assets"
  ON assets FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public can insert assets"
  ON assets FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Public can update assets"
  ON assets FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can delete assets"
  ON assets FOR DELETE
  TO public
  USING (true);

-- Create index for better query performance
CREATE INDEX idx_assets_building_number ON assets(building_number);
CREATE INDEX idx_assets_asset_id ON assets(asset_id);
CREATE INDEX idx_assets_payer_id ON assets(payer_id);
