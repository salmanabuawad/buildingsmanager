/*
  # Create Assets Table
  
  1. Changes
    - Create assets table with asset_id as primary key
    - Include all related functions, triggers, and policies
    - RLS policies for public access
    - Functions: search_assets_by_range, get_building_stats, copy_asset_to_history
  
  2. Table Structure
    - Primary key: asset_id (bigint)
    - All asset fields including tax_region, floor, discount fields
*/

-- Drop existing assets table if it exists (for clean migration)
DROP TABLE IF EXISTS assets CASCADE;

-- Create assets table with asset_id as primary key (no id field)
-- Note: This table does NOT include deprecated columns:
--   - asset_group (removed)
--   - basement (removed)
CREATE TABLE assets (
  building_number bigint NOT NULL,
  payer_id text,
  asset_id bigint NOT NULL PRIMARY KEY,
  measurement_date text NOT NULL DEFAULT '01/01/1900',
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
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  elevator text,
  single_double_family text,
  condo text,
  townhouses text,
  penthouse text,
  tax_region integer,
  floor smallint CHECK (floor >= -99 AND floor <= 99),
  discount_type text,
  discount_date_from text,
  discount_date_to text,
  is_new_measurement boolean DEFAULT false
);

-- Create indexes
CREATE INDEX idx_assets_building_number ON assets(building_number);
CREATE INDEX idx_assets_payer_id ON assets(payer_id);
CREATE INDEX idx_assets_tax_region ON assets(tax_region);
CREATE INDEX idx_assets_measurement_date ON assets(measurement_date);

-- Enable RLS
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for public (anon key) access
DROP POLICY IF EXISTS "Public can view assets" ON assets;
DROP POLICY IF EXISTS "Public can insert assets" ON assets;
DROP POLICY IF EXISTS "Public can update assets" ON assets;
DROP POLICY IF EXISTS "Public can delete assets" ON assets;
DROP POLICY IF EXISTS "Authenticated users can manage assets" ON assets;

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

CREATE POLICY "Authenticated users can manage assets"
  ON assets FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Ensure assets_history table has matching columns (add missing ones if needed)
DO $$
BEGIN
  -- Add floor column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'assets_history' AND column_name = 'floor'
  ) THEN
    ALTER TABLE assets_history ADD COLUMN floor smallint CHECK (floor >= -99 AND floor <= 99);
  END IF;

  -- Add discount_type column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'assets_history' AND column_name = 'discount_type'
  ) THEN
    ALTER TABLE assets_history ADD COLUMN discount_type text;
  END IF;

  -- Add discount_date_from column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'assets_history' AND column_name = 'discount_date_from'
  ) THEN
    ALTER TABLE assets_history ADD COLUMN discount_date_from text;
  END IF;

  -- Add discount_date_to column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'assets_history' AND column_name = 'discount_date_to'
  ) THEN
    ALTER TABLE assets_history ADD COLUMN discount_date_to text;
  END IF;

  -- Note: assets_history table should not have an id column (created separately)
END $$;

-- Create copy_asset_to_history function (without basement, with all current columns)
CREATE OR REPLACE FUNCTION copy_asset_to_history()
RETURNS TRIGGER AS $$
BEGIN
  -- For UPDATE: copy to history ONLY if is_new_measurement flag is explicitly set to true
  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(NEW.is_new_measurement, false) = true THEN
      INSERT INTO assets_history (
        building_number, payer_id, asset_id, measurement_date,
        main_asset_type, asset_size,
        sub_asset_type_1, sub_asset_size_1,
        sub_asset_type_2, sub_asset_size_2,
        sub_asset_type_3, sub_asset_size_3,
        sub_asset_type_4, sub_asset_size_4,
        sub_asset_type_5, sub_asset_size_5,
        sub_asset_type_6, sub_asset_size_6,
        structure_drawing_url, created_at, updated_at,
        elevator, single_double_family, condo, townhouses, penthouse,
        tax_region, floor, discount_type, discount_date_from, discount_date_to
      ) VALUES (
        OLD.building_number, OLD.payer_id, OLD.asset_id, OLD.measurement_date,
        OLD.main_asset_type, OLD.asset_size,
        OLD.sub_asset_type_1, OLD.sub_asset_size_1,
        OLD.sub_asset_type_2, OLD.sub_asset_size_2,
        OLD.sub_asset_type_3, OLD.sub_asset_size_3,
        OLD.sub_asset_type_4, OLD.sub_asset_size_4,
        OLD.sub_asset_type_5, OLD.sub_asset_size_5,
        OLD.sub_asset_type_6, OLD.sub_asset_size_6,
        OLD.structure_drawing_url, OLD.created_at, OLD.updated_at,
        OLD.elevator, OLD.single_double_family, OLD.condo, OLD.townhouses, OLD.penthouse,
        OLD.tax_region, OLD.floor, OLD.discount_type, OLD.discount_date_from, OLD.discount_date_to
      );
      NEW.is_new_measurement = false;
    END IF;
    RETURN NEW;
  END IF;
  
  -- For DELETE: always copy record to history before deletion
  IF TG_OP = 'DELETE' THEN
    INSERT INTO assets_history (
      building_number, payer_id, asset_id, measurement_date,
      main_asset_type, asset_size,
      sub_asset_type_1, sub_asset_size_1,
      sub_asset_type_2, sub_asset_size_2,
      sub_asset_type_3, sub_asset_size_3,
      sub_asset_type_4, sub_asset_size_4,
      sub_asset_type_5, sub_asset_size_5,
      sub_asset_type_6, sub_asset_size_6,
      structure_drawing_url, created_at, updated_at,
      elevator, single_double_family, condo, townhouses, penthouse,
      tax_region, floor, discount_type, discount_date_from, discount_date_to
    ) VALUES (
      OLD.building_number, OLD.payer_id, OLD.asset_id, OLD.measurement_date,
      OLD.main_asset_type, OLD.asset_size,
      OLD.sub_asset_type_1, OLD.sub_asset_size_1,
      OLD.sub_asset_type_2, OLD.sub_asset_size_2,
      OLD.sub_asset_type_3, OLD.sub_asset_size_3,
      OLD.sub_asset_type_4, OLD.sub_asset_size_4,
      OLD.sub_asset_type_5, OLD.sub_asset_size_5,
      OLD.sub_asset_type_6, OLD.sub_asset_size_6,
      OLD.structure_drawing_url, OLD.created_at, OLD.updated_at,
      OLD.elevator, OLD.single_double_family, OLD.condo, OLD.townhouses, OLD.penthouse,
      OLD.tax_region, OLD.floor, OLD.discount_type, OLD.discount_date_from, OLD.discount_date_to
    );
    RETURN OLD;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_copy_asset_to_history ON assets;
CREATE TRIGGER trigger_copy_asset_to_history
  BEFORE UPDATE OR DELETE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION copy_asset_to_history();

-- Create update_building_totals function (dynamic table name detection)
CREATE OR REPLACE FUNCTION update_building_totals()
RETURNS TRIGGER AS $$
DECLARE
  target_building_number bigint;
  building_table_name text;
  has_total_building_area boolean;
  has_total_assets boolean;
  sql_query text;
BEGIN
  -- Determine which building to update
  IF TG_OP = 'DELETE' THEN
    target_building_number := OLD.building_number;
  ELSE
    target_building_number := NEW.building_number;
  END IF;

  -- Determine building table name (buildings or building)
  SELECT table_name INTO building_table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND (table_name = 'buildings' OR table_name = 'building')
  ORDER BY table_name
  LIMIT 1;

  -- Check if columns exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = COALESCE(building_table_name, 'buildings')
      AND column_name = 'total_building_area'
  ) INTO has_total_building_area;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = COALESCE(building_table_name, 'buildings')
      AND column_name = 'total_assets'
  ) INTO has_total_assets;

  -- Build dynamic SQL query
  sql_query := 'UPDATE ' || quote_ident(COALESCE(building_table_name, 'buildings')) || ' SET ';
  
  IF has_total_building_area THEN
    -- Building size is the sum of all accountable assets' main size (asset_size) only:
    -- 1. Only includes assets where not_accountable = false or NULL (accountable assets)
    -- 2. Excludes assets with not_accountable = true (non-accountable assets)
    -- 3. Subtype sizes (sub_asset_size_1 through sub_asset_size_6) are NOT included
    -- Only the main asset size (asset_size) of accountable assets is summed for the building total
    sql_query := sql_query || 'total_building_area = COALESCE((
      SELECT SUM(a.asset_size) 
      FROM assets a
      LEFT JOIN asset_types at ON at.name = a.main_asset_type AND at.active = ''כן''
      WHERE a.building_number = $1 
        AND (at.not_accountable IS NULL OR at.not_accountable = false)
    ), 0)';
  END IF;
  
  IF has_total_building_area AND has_total_assets THEN
    sql_query := sql_query || ', ';
  END IF;
  
  IF has_total_assets THEN
    sql_query := sql_query || 'total_assets = COALESCE((SELECT COUNT(*) FROM assets WHERE building_number = $1), 0)';
  END IF;
  
  sql_query := sql_query || ' WHERE building_number = $1';

  -- Only execute if at least one column exists
  IF has_total_building_area OR has_total_assets THEN
    EXECUTE sql_query USING target_building_number;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_building_totals ON assets;
CREATE TRIGGER trigger_update_building_totals
  AFTER INSERT OR UPDATE OR DELETE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION update_building_totals();

-- Create search_assets_by_range function (uses asset_id)
DROP FUNCTION IF EXISTS search_assets_by_range(bigint, bigint);

CREATE OR REPLACE FUNCTION search_assets_by_range(from_id bigint, to_id bigint)
RETURNS TABLE (
  building_number bigint,
  asset_id bigint,
  payer_id text,
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
  measurement_date text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.building_number,
    a.asset_id,
    a.payer_id,
    a.main_asset_type,
    a.asset_size,
    a.sub_asset_type_1,
    a.sub_asset_size_1,
    a.sub_asset_type_2,
    a.sub_asset_size_2,
    a.sub_asset_type_3,
    a.sub_asset_size_3,
    a.sub_asset_type_4,
    a.sub_asset_size_4,
    a.sub_asset_type_5,
    a.sub_asset_size_5,
    a.sub_asset_type_6,
    a.sub_asset_size_6,
    a.measurement_date,
    a.created_at,
    a.updated_at
  FROM assets a
  WHERE 
    a.asset_id >= from_id AND
    a.asset_id <= to_id
  ORDER BY a.asset_id;
END;
$$;

-- Create get_building_stats function (uses asset_id)
CREATE OR REPLACE FUNCTION get_building_stats(p_building_number bigint)
RETURNS TABLE (
  total_assets integer,
  total_building_area numeric
) AS $$
BEGIN
  RETURN QUERY
  WITH latest_measurements AS (
    SELECT DISTINCT ON (a.asset_id)
      a.asset_id,
      a.building_number,
      a.asset_size,
      a.measurement_date,
      a.main_asset_type
    FROM assets a
    WHERE a.building_number = p_building_number
    ORDER BY 
      a.asset_id,
      CASE 
        WHEN a.measurement_date ~ '^\d{2}/\d{2}/\d{4}$' THEN
          TO_DATE(a.measurement_date, 'DD/MM/YYYY')
        ELSE
          TO_DATE('01/01/1900', 'DD/MM/YYYY')
      END DESC
  ),
  filtered_measurements AS (
    SELECT 
      lm.asset_id,
      lm.building_number,
      lm.asset_size,
      lm.measurement_date
    FROM latest_measurements lm
    LEFT JOIN asset_types at ON at.name = lm.main_asset_type AND at.active = 'כן'
    WHERE at.not_accountable IS NULL OR at.not_accountable = false
  )
  -- Building size is the sum of main asset sizes (asset_size) only, NOT including subtype sizes
  SELECT 
    COUNT(*)::integer as total_assets,
    COALESCE(SUM(asset_size), 0) as total_building_area
  FROM filtered_measurements;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add comments
COMMENT ON TABLE assets IS 'Assets table with asset_id as primary key. Each asset_id appears only once in this table (latest measurement). Historical measurements are in assets_history.';
COMMENT ON COLUMN assets.asset_id IS 'Primary key - unique asset identifier';
COMMENT ON FUNCTION copy_asset_to_history() IS 'Copies asset records to assets_history ONLY when is_new_measurement flag is explicitly set to true (UPDATE) or when record is deleted (DELETE). Does not include basement column (removed from system).';

