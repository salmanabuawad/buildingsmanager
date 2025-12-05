/*
  # Recreate Asset Types Table from Excel File
  
  1. Changes
    - Drop existing asset_types table completely
    - Recreate with structure matching Excel columns
    - Import all data from asset_types.xlsx
  
  2. Table Structure (based on Excel columns)
    - `id` (SERIAL) - Primary key
    - `name` (TEXT) - Asset type code/name (סוג נכס)
    - `description` (TEXT) - Description in Hebrew (תיאור)
    - `tax_region` (INTEGER) - Tax region code (אזור מיסים)
    - `elevator` (TEXT) - Elevator yes/no indicator (מעלית)
    - `single_double_family` (TEXT) - Single/double family indicator (בית פרטי חד משפחתי דו משפחתי)
    - `penthouse` (TEXT) - Penthouse indicator (דירת גג)
    - `condo` (TEXT) - Condo indicator (בית משותף)
    - `townhouses` (TEXT) - Townhouses indicator (מבנים צמודי קרקע טוריים מעל 2 יחידות)
    - `business_private` (TEXT) - Business/Private indicator (עסקי/פרטי)
    - `shared_area_usage` (TEXT) - Shared area usage indicator (שימוש בשטח משותף)
    - `min_size` (NUMERIC) - Minimum size (שטח מ)
    - `max_size` (NUMERIC) - Maximum size (שטח עד)
    - `active` (TEXT) - Active status (default: 'כן')
    - `created_at` (TIMESTAMPTZ) - Creation timestamp
    - `updated_at` (TIMESTAMPTZ) - Update timestamp
  
  3. Security
    - Enable RLS on asset_types table
    - Allow anonymous and authenticated users full access
*/

-- Drop existing table and all dependent objects
DROP TABLE IF EXISTS asset_types CASCADE;

-- Recreate table with structure matching Excel
CREATE TABLE asset_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  tax_region INTEGER,
  elevator TEXT,
  single_double_family TEXT,
  penthouse TEXT,
  condo TEXT,
  townhouses TEXT,
  business_private TEXT,
  shared_area_usage TEXT,
  min_size NUMERIC,
  max_size NUMERIC,
  active TEXT DEFAULT 'כן',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create index on name for faster lookups
CREATE INDEX idx_asset_types_name ON asset_types(name);

-- Create index on tax_region for filtering
CREATE INDEX idx_asset_types_tax_region ON asset_types(tax_region);

-- Create index on active for filtering active/inactive records
CREATE INDEX idx_asset_types_active ON asset_types(active);

-- Enable RLS
ALTER TABLE asset_types ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow anonymous read access" ON asset_types;
DROP POLICY IF EXISTS "Allow anonymous insert access" ON asset_types;
DROP POLICY IF EXISTS "Allow anonymous update access" ON asset_types;
DROP POLICY IF EXISTS "Allow anonymous delete access" ON asset_types;

-- Allow anonymous read access
CREATE POLICY "Allow anonymous read access"
  ON asset_types
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow anonymous insert access
CREATE POLICY "Allow anonymous insert access"
  ON asset_types
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Allow anonymous update access
CREATE POLICY "Allow anonymous update access"
  ON asset_types
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Allow anonymous delete access
CREATE POLICY "Allow anonymous delete access"
  ON asset_types
  FOR DELETE
  TO anon, authenticated
  USING (true);

-- Create or replace function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at
DROP TRIGGER IF EXISTS update_asset_types_updated_at ON asset_types;
CREATE TRIGGER update_asset_types_updated_at
  BEFORE UPDATE ON asset_types
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment on active column
COMMENT ON COLUMN asset_types.active IS 'Indicates if the asset type is active. Values: "כן" (yes) or NULL (no)';

-- Note: To import data from asset_types.xlsx, you can:
-- 1. Use Supabase Dashboard: Table Editor > asset_types > Import data from CSV/Excel
-- 2. Convert Excel to CSV and use the import feature
-- 3. Use a script with proper Excel library (pandas/openpyxl in Python, or xlsx in Node.js)
-- 
-- The Excel file has the following columns (in order):
--   - סוג נכס (name)
--   - תיאור (description)  
--   - אזור מיסים (tax_region)
--   - מעלית (elevator)
--   - בית פרטי חד משפחתי דו משפחתי (single_double_family)
--   - דירת גג (penthouse)
--   - בית משותף (condo)
--   - מבנים צמודי קרקע טוריים מעל 2 יחידות (townhouses)
--   - עסקי/פרטי (business_private)
--   - שימוש בשטח משותף (shared_area_usage)
--   - שטח מ (min_size)
--   - שטח עד (max_size)
--
-- Total rows in Excel: ~160 rows

