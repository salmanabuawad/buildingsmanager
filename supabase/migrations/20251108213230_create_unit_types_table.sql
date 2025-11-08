/*
  # Create Unit Types Table

  1. New Tables
    - `unit_types`
      - `id` (uuid, primary key) - Unique identifier
      - `name` (text, unique, not null) - Type name (e.g., "Studio", "1BR", "2BR")
      - `description` (text) - Optional description
      - `created_at` (timestamp) - Creation timestamp
      - `updated_at` (timestamp) - Last update timestamp

  2. Security
    - Enable RLS on `unit_types` table
    - Add public access policy for all operations
*/

-- Create unit_types table
CREATE TABLE IF NOT EXISTS unit_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE unit_types ENABLE ROW LEVEL SECURITY;

-- Create policy for public access
CREATE POLICY "Enable all access for everyone" ON unit_types FOR ALL USING (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_unit_types_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER unit_types_updated_at
  BEFORE UPDATE ON unit_types
  FOR EACH ROW
  EXECUTE FUNCTION update_unit_types_updated_at();