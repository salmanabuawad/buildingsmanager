/*
  # Create Address List Table
  
  1. Changes
    - Create address_list table with street code and description
    - Enable RLS and configure policies for anonymous access
    - Consolidates creation and policy updates into single migration
  
  2. Structure
    - street_code: integer PRIMARY KEY (0-9999)
    - street_description: text NOT NULL
    - created_at, updated_at: timestamptz
*/

-- Create address_list table
CREATE TABLE IF NOT EXISTS address_list (
  street_code integer PRIMARY KEY CHECK (street_code >= 0 AND street_code <= 9999),
  street_description text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_address_list_street_code ON address_list(street_code);
CREATE INDEX IF NOT EXISTS idx_address_list_street_description ON address_list(street_description);

-- Enable RLS
ALTER TABLE address_list ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public read access to address_list" ON address_list;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to insert address_list" ON address_list;
DROP POLICY IF EXISTS "Allow authenticated users to insert address_list" ON address_list;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to update address_list" ON address_list;
DROP POLICY IF EXISTS "Allow authenticated users to update address_list" ON address_list;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to delete address_list" ON address_list;
DROP POLICY IF EXISTS "Allow authenticated users to delete address_list" ON address_list;

-- Create policies that allow both anon and authenticated users for all operations
CREATE POLICY "Allow public read access to address_list"
  ON address_list
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow anonymous and authenticated users to insert address_list"
  ON address_list
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow anonymous and authenticated users to update address_list"
  ON address_list
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anonymous and authenticated users to delete address_list"
  ON address_list
  FOR DELETE
  TO anon, authenticated
  USING (true);

-- Add comments
COMMENT ON TABLE address_list IS 'List of street addresses with codes and descriptions';
COMMENT ON COLUMN address_list.street_code IS 'Street code (integer, 0-9999)';
COMMENT ON COLUMN address_list.street_description IS 'Street name/description';

