/*
  # Restructure Assets Table with History
  
  1. Changes
    - Create assets_history table to store old measurements
    - Make asset_id unique in assets table (keep only latest measurement per asset_id)
    - Create trigger to copy old data to history before update
    - Migrate existing historical data to assets_history
    - Change primary key from composite (asset_id, measurement_date) to just id
    - Add unique constraint on asset_id
  
  2. Process
    - Step 1: Create assets_history table with same structure as assets
    - Step 2: Migrate all non-latest records to assets_history
    - Step 3: Keep only latest record per asset_id in assets
    - Step 4: Drop composite primary key, add unique constraint on asset_id
    - Step 5: Create trigger to handle history on updates
    - Step 6: Update RLS policies for assets_history
  
  3. Security
    - Enable RLS on assets_history
    - Copy RLS policies from assets to assets_history
*/

-- Step 1: Create assets_history table with same structure as assets
CREATE TABLE IF NOT EXISTS assets_history (
  id bigint,
  building_number bigint,
  payer_id text,
  asset_id bigint,
  measurement_date text NOT NULL,
  main_asset_type text,
  asset_size numeric,
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
  structure_drawing_url text,
  created_at timestamptz,
  updated_at timestamptz,
  elevator text,
  single_double_family text,
  condo text,
  townhouses text,
  basement text,
  penthouse text,
  history_created_at timestamptz DEFAULT now(),
  PRIMARY KEY (asset_id, measurement_date)
);

-- Create index on asset_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_assets_history_asset_id ON assets_history(asset_id);
CREATE INDEX IF NOT EXISTS idx_assets_history_measurement_date ON assets_history(measurement_date);

-- Enable RLS on assets_history
ALTER TABLE assets_history ENABLE ROW LEVEL SECURITY;

-- Copy RLS policies from assets to assets_history
CREATE POLICY "Public can view assets_history"
  ON assets_history FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can manage assets_history"
  ON assets_history FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Step 2: Helper function to parse DD/MM/YYYY date for sorting
CREATE OR REPLACE FUNCTION parse_measurement_date(date_str text)
RETURNS date AS $$
BEGIN
  IF date_str ~ '^\d{2}/\d{2}/\d{4}$' THEN
    RETURN TO_DATE(date_str, 'DD/MM/YYYY');
  ELSE
    RETURN '1900-01-01'::date;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 3: Migrate all non-latest records to assets_history
-- For each asset_id, keep only the latest measurement_date in assets
-- Move all others to assets_history
INSERT INTO assets_history (
  id, building_number, payer_id, asset_id, measurement_date,
  main_asset_type, asset_size,
  sub_asset_type_1, sub_asset_size_1,
  sub_asset_type_2, sub_asset_size_2,
  sub_asset_type_3, sub_asset_size_3,
  sub_asset_type_4, sub_asset_size_4,
  sub_asset_type_5, sub_asset_size_5,
  sub_asset_type_6, sub_asset_size_6,
  structure_drawing_url, created_at, updated_at,
  elevator, single_double_family, condo, townhouses, basement, penthouse
)
SELECT 
  a.id, a.building_number, a.payer_id, a.asset_id, a.measurement_date,
  a.main_asset_type, a.asset_size,
  a.sub_asset_type_1, a.sub_asset_size_1,
  a.sub_asset_type_2, a.sub_asset_size_2,
  a.sub_asset_type_3, a.sub_asset_size_3,
  a.sub_asset_type_4, a.sub_asset_size_4,
  a.sub_asset_type_5, a.sub_asset_size_5,
  a.sub_asset_type_6, a.sub_asset_size_6,
  a.structure_drawing_url, a.created_at, a.updated_at,
  a.elevator, a.single_double_family, a.condo, a.townhouses, a.basement, a.penthouse
FROM assets a
WHERE NOT EXISTS (
  -- Keep only the latest measurement_date for each asset_id
  SELECT 1
  FROM assets a2
  WHERE a2.asset_id = a.asset_id
    AND (
      parse_measurement_date(a2.measurement_date) > parse_measurement_date(a.measurement_date)
      OR (
        parse_measurement_date(a2.measurement_date) = parse_measurement_date(a.measurement_date)
        AND a2.id > a.id
      )
    )
);

-- Step 4: Delete all non-latest records from assets
DELETE FROM assets
WHERE NOT EXISTS (
  SELECT 1
  FROM assets a2
  WHERE a2.asset_id = assets.asset_id
    AND (
      parse_measurement_date(a2.measurement_date) > parse_measurement_date(assets.measurement_date)
      OR (
        parse_measurement_date(a2.measurement_date) = parse_measurement_date(assets.measurement_date)
        AND a2.id > assets.id
      )
    )
);

-- Step 5: Drop composite primary key and recreate with id as primary key
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_pkey;

-- Add unique constraint on asset_id
ALTER TABLE assets ADD CONSTRAINT assets_asset_id_unique UNIQUE (asset_id);

-- Make id the primary key (assuming id is bigserial)
ALTER TABLE assets ADD CONSTRAINT assets_pkey PRIMARY KEY (id);

-- Step 6: Create trigger function to copy old data to history before update
CREATE OR REPLACE FUNCTION copy_asset_to_history()
RETURNS TRIGGER AS $$
BEGIN
  -- Only copy to history if this is an update (not insert)
  -- and if the measurement_date or other key fields have changed
  IF TG_OP = 'UPDATE' AND (
    OLD.measurement_date IS DISTINCT FROM NEW.measurement_date
    OR OLD.main_asset_type IS DISTINCT FROM NEW.main_asset_type
    OR OLD.asset_size IS DISTINCT FROM NEW.asset_size
    OR OLD.building_number IS DISTINCT FROM NEW.building_number
    OR OLD.payer_id IS DISTINCT FROM NEW.payer_id
  ) THEN
    -- Copy old record to history
    INSERT INTO assets_history (
      id, building_number, payer_id, asset_id, measurement_date,
      main_asset_type, asset_size,
      sub_asset_type_1, sub_asset_size_1,
      sub_asset_type_2, sub_asset_size_2,
      sub_asset_type_3, sub_asset_size_3,
      sub_asset_type_4, sub_asset_size_4,
      sub_asset_type_5, sub_asset_size_5,
      sub_asset_type_6, sub_asset_size_6,
      structure_drawing_url, created_at, updated_at,
      elevator, single_double_family, condo, townhouses, basement, penthouse
    ) VALUES (
      OLD.id, OLD.building_number, OLD.payer_id, OLD.asset_id, OLD.measurement_date,
      OLD.main_asset_type, OLD.asset_size,
      OLD.sub_asset_type_1, OLD.sub_asset_size_1,
      OLD.sub_asset_type_2, OLD.sub_asset_size_2,
      OLD.sub_asset_type_3, OLD.sub_asset_size_3,
      OLD.sub_asset_type_4, OLD.sub_asset_size_4,
      OLD.sub_asset_type_5, OLD.sub_asset_size_5,
      OLD.sub_asset_type_6, OLD.sub_asset_size_6,
      OLD.structure_drawing_url, OLD.created_at, OLD.updated_at,
      OLD.elevator, OLD.single_double_family, OLD.condo, OLD.townhouses, OLD.basement, OLD.penthouse
    )
    ON CONFLICT (asset_id, measurement_date) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS copy_asset_to_history_trigger ON assets;
CREATE TRIGGER copy_asset_to_history_trigger
  BEFORE UPDATE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION copy_asset_to_history();

-- Step 7: Clean up helper function (optional, can keep for future use)
-- DROP FUNCTION IF EXISTS parse_measurement_date(text);

-- Add comment to document the change
COMMENT ON TABLE assets IS 'Current/latest asset measurements. Each asset_id appears only once. Historical measurements are in assets_history.';
COMMENT ON TABLE assets_history IS 'Historical asset measurements. Contains all previous measurements for assets that have been updated.';

