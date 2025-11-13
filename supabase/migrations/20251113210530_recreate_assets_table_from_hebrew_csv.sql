/*
  # Recreate Assets Table from Hebrew CSV Structure

  1. Changes
    - Drop existing assets table and recreate with Hebrew CSV structure
    - Columns match the CSV file exactly:
      - מספר בנין (building_number): integer
      - זיהוי משלם (payer_id): text
      - זיהוי נכס (asset_id): text, unique identifier
      - סוג נכס (asset_type): text
      - גודל נכס (asset_size): numeric
      - נכס משנה 1-5 (sub_asset_1 through sub_asset_5): text
      - גודל נכס משנה 1-5 (sub_asset_size_1 through sub_asset_size_5): numeric
      - סוג נכס משני 6 (sub_asset_type_6): text
      - גודל נכסי משני 6 (sub_asset_size_6): numeric

  2. Security
    - Enable RLS on assets table
    - Allow anonymous read access
    - Allow anonymous insert/update/delete for development
*/

-- Drop existing assets table
DROP TABLE IF EXISTS assets CASCADE;

-- Create assets table matching CSV structure
CREATE TABLE assets (
  id bigserial PRIMARY KEY,
  building_number integer,
  payer_id text,
  asset_id text UNIQUE NOT NULL,
  asset_type text,
  asset_size numeric,
  sub_asset_1 text,
  sub_asset_size_1 numeric,
  sub_asset_2 text,
  sub_asset_size_2 numeric,
  sub_asset_3 text,
  sub_asset_size_3 numeric,
  sub_asset_4 text,
  sub_asset_size_4 numeric,
  sub_asset_5 text,
  sub_asset_size_5 numeric,
  sub_asset_type_6 text,
  sub_asset_size_6 numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

-- Allow anonymous read access
CREATE POLICY "Anyone can view assets"
  ON assets
  FOR SELECT
  TO anon
  USING (true);

-- Allow anonymous insert
CREATE POLICY "Anyone can insert assets"
  ON assets
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow anonymous update
CREATE POLICY "Anyone can update assets"
  ON assets
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Allow anonymous delete
CREATE POLICY "Anyone can delete assets"
  ON assets
  FOR DELETE
  TO anon
  USING (true);