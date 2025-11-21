/*
  # Drop and Recreate Asset Types Table from New CSV Structure
  
  1. Changes
    - Drop existing asset_types table completely
    - Recreate with exact CSV column structure (12 fields)
    - Columns match CSV order exactly
  
  2. Table Structure (matching CSV columns 1-12)
    - `name` (text) - סוג נכס (asset type code)
    - `description` (text) - תיאור (description)
    - `tax_region` (integer) - אזור מיסים (tax region)
    - `elevator` (text) - מעלית כן/לא (elevator yes/no)
    - `asset_group` (text) - קבוצת נכס (asset group: א,ב,ג,ד)
    - `single_double_family` (text) - בית פרטי חד משפחתי דו משפחתי
    - `penthouse` (text) - דירת גג
    - `condo` (text) - בית משותף
    - `townhouses` (text) - בניינים צמודי קרקע טוריים מעל 2 יחידות
    - `min_size` (numeric) - שטח מ
    - `max_size` (numeric) - שטח עד
    - `shelter` (text) - מרתף
*/

-- Drop existing table
DROP TABLE IF EXISTS asset_types CASCADE;

-- Recreate with exact CSV structure
CREATE TABLE asset_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  tax_region INTEGER,
  elevator TEXT,
  asset_group TEXT,
  single_double_family TEXT,
  penthouse TEXT,
  condo TEXT,
  townhouses TEXT,
  min_size NUMERIC,
  max_size NUMERIC,
  shelter TEXT,
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
