/*
  # Drop and Recreate Asset Types Table

  1. Changes
    - Drop existing asset_types table
    - Recreate asset_types table with all columns from CSV
    - Remove unique constraint on name field to allow duplicate codes
    - Add RLS policies for anonymous access
  
  2. Table Structure
    - `name` (text) - Asset type code (not unique)
    - `description` (text) - Description
    - `tax_region` (integer) - Tax region code
    - `shared_area_yn` (text) - Shared area yes/no indicator
    - `has_elevator` (text) - Has elevator indicator
    - `condition_elevator` (text) - Elevator condition
    - `condition_shared_area` (text) - Shared area condition  
    - `condition_size` (text) - Size condition
    - `min_size` (numeric) - Minimum size
    - `max_size` (numeric) - Maximum size
    - `notes` (text) - Additional notes
*/

-- Drop existing table
DROP TABLE IF EXISTS asset_types CASCADE;

-- Recreate table without unique constraint
CREATE TABLE asset_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  tax_region INTEGER,
  shared_area_yn TEXT,
  has_elevator TEXT,
  condition_elevator TEXT,
  condition_shared_area TEXT,
  condition_size TEXT,
  min_size NUMERIC,
  max_size NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE asset_types ENABLE ROW LEVEL SECURITY;

-- Allow anonymous read access
CREATE POLICY "Allow anonymous read access"
  ON asset_types
  FOR SELECT
  TO anon
  USING (true);

-- Allow anonymous insert access
CREATE POLICY "Allow anonymous insert access"
  ON asset_types
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow anonymous update access
CREATE POLICY "Allow anonymous update access"
  ON asset_types
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Allow anonymous delete access
CREATE POLICY "Allow anonymous delete access"
  ON asset_types
  FOR DELETE
  TO anon
  USING (true);