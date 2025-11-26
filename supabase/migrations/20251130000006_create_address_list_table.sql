/*
  # Create address_list table
  
  1. Changes
    - Create new address_list table with street code and description
    - street_code: integer with max 4 digits (0-9999)
    - street_description: text field for street name/description
  
  2. Structure
    - street_code: integer PRIMARY KEY (max 4 digits: 0-9999)
    - street_description: text NOT NULL
    - created_at: timestamptz DEFAULT now()
    - updated_at: timestamptz DEFAULT now()
  
  3. Security
    - Enable RLS on address_list table
    - Allow public read access for all users
    - Allow authenticated users to manage address list
*/

-- Create address_list table
CREATE TABLE IF NOT EXISTS address_list (
  street_code integer PRIMARY KEY CHECK (street_code >= 0 AND street_code <= 9999),
  street_description text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index on street_code for faster lookups
CREATE INDEX IF NOT EXISTS idx_address_list_street_code ON address_list(street_code);

-- Create index on street_description for search functionality
CREATE INDEX IF NOT EXISTS idx_address_list_street_description ON address_list(street_description);

-- Enable RLS
ALTER TABLE address_list ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access to address_list"
  ON address_list
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow authenticated users to insert
CREATE POLICY "Allow authenticated users to insert address_list"
  ON address_list
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update
CREATE POLICY "Allow authenticated users to update address_list"
  ON address_list
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to delete
CREATE POLICY "Allow authenticated users to delete address_list"
  ON address_list
  FOR DELETE
  TO authenticated
  USING (true);

-- Add comment
COMMENT ON TABLE address_list IS 'List of street addresses with codes and descriptions';
COMMENT ON COLUMN address_list.street_code IS 'Street code (integer, 0-9999)';
COMMENT ON COLUMN address_list.street_description IS 'Street name/description';

