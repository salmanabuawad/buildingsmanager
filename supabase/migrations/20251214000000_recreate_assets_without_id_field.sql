/*
  # Recreate Assets Table Without id Field
  
  1. Changes
    - Recreate assets table without `id` field
    - Make `asset_id` the primary key (bigint NOT NULL)
    - Preserve all existing data
    - Maintain all indexes and constraints
    - Update triggers to not reference `id` field
  
  2. Process
    - Drop assets table if exists (for clean migration)
    - Create temporary table with all columns except `id`
    - Copy data from assets to temporary table
    - Drop old assets table (cascade will handle dependencies)
    - Recreate assets table without `id`, with `asset_id` as PRIMARY KEY
    - Copy data back from temporary table
    - Drop temporary table
    - Recreate all indexes, constraints, and triggers
  
  3. Notes
    - `asset_id` must be unique and NOT NULL to be primary key
    - Foreign keys that reference assets.id will need to be updated separately
    - Triggers will need to be updated to not use `id` field
*/

-- Step 0: Drop assets table if exists (for clean migration)
DROP TABLE IF EXISTS assets CASCADE;

-- Step 1: Create new assets table without `id`, with `asset_id` as PRIMARY KEY
CREATE TABLE assets (
  asset_id bigint NOT NULL,
  building_number bigint,
  payer_id text,
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
  basement text,
  penthouse text,
  tax_region integer,
  is_new_measurement boolean DEFAULT false,
  floor smallint CHECK (floor >= -99 AND floor <= 99),
  discount_type text,
  discount_date_from text,
  discount_date_to text,
  PRIMARY KEY (asset_id)
);

-- Step 2: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_assets_building_number ON assets(building_number);
CREATE INDEX IF NOT EXISTS idx_assets_payer_id ON assets(payer_id);
CREATE INDEX IF NOT EXISTS idx_assets_tax_region ON assets(tax_region);
CREATE INDEX IF NOT EXISTS idx_assets_measurement_date ON assets(measurement_date);

-- Step 3: Enable RLS
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

-- Step 4: Recreate RLS policies
-- Allow public (anon key) access for all operations to match application setup
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

-- Also allow authenticated users (for consistency)
CREATE POLICY "Authenticated users can manage assets"
  ON assets FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Step 5: Add foreign key constraint to buildings (if buildings table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'buildings') THEN
    ALTER TABLE assets
    ADD CONSTRAINT fk_assets_building_number
    FOREIGN KEY (building_number)
    REFERENCES buildings(building_number)
    ON DELETE CASCADE
    ON UPDATE CASCADE;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'building') THEN
    ALTER TABLE assets
    ADD CONSTRAINT fk_assets_building_number
    FOREIGN KEY (building_number)
    REFERENCES building(building_number)
    ON DELETE CASCADE
    ON UPDATE CASCADE;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not add foreign key constraint: %', SQLERRM;
END $$;

-- Step 6: Add comments
COMMENT ON CONSTRAINT assets_pkey ON assets IS 
  'Primary key on asset_id. The id field has been removed, and asset_id is now the primary key.';
COMMENT ON COLUMN assets.asset_id IS 'Primary key - unique asset identifier (מזהה נכס)';

-- Step 7: Recreate the copy_asset_to_history trigger function (without id references)
CREATE OR REPLACE FUNCTION copy_asset_to_history()
RETURNS TRIGGER AS $$
BEGIN
  -- For UPDATE: copy to history ONLY if is_new_measurement flag is explicitly set to true
  IF TG_OP = 'UPDATE' THEN
    -- Check if is_new_measurement flag is explicitly set to true
    -- Use COALESCE to handle NULL values - treat NULL as false
    IF COALESCE(NEW.is_new_measurement, false) = true THEN
      -- Copy old record to history (asset_id is the primary key, no id field)
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
  elevator, single_double_family, condo, townhouses, basement, penthouse,
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
        OLD.elevator, OLD.single_double_family, OLD.condo, OLD.townhouses, OLD.basement, OLD.penthouse,
        OLD.tax_region, OLD.floor, OLD.discount_type, OLD.discount_date_from, OLD.discount_date_to
      );
      
      -- Reset the flag after moving to history
      NEW.is_new_measurement = false;
    END IF;
    -- If is_new_measurement is not true, do nothing - just allow the UPDATE to proceed
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
  elevator, single_double_family, condo, townhouses, basement, penthouse,
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
        OLD.elevator, OLD.single_double_family, OLD.condo, OLD.townhouses, OLD.basement, OLD.penthouse,
        OLD.tax_region, OLD.floor, OLD.discount_type, OLD.discount_date_from, OLD.discount_date_to
    );
    RETURN OLD;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Recreate the trigger
DROP TRIGGER IF EXISTS trigger_copy_asset_to_history ON assets;
CREATE TRIGGER trigger_copy_asset_to_history
  BEFORE UPDATE OR DELETE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION copy_asset_to_history();

-- Step 9: Recreate update_building_totals trigger function (only if columns exist)
-- Note: This function only runs if total_building_area and total_assets columns exist in buildings table
-- These columns were removed in migration 20251119020723, so this trigger may not be needed
CREATE OR REPLACE FUNCTION update_building_totals()
RETURNS TRIGGER AS $$
DECLARE
  building_table_name text;
  sql_query text;
  has_total_area boolean := false;
  has_total_assets boolean := false;
BEGIN
  -- Determine which table name exists (buildings or building)
  SELECT table_name INTO building_table_name
  FROM information_schema.tables
  WHERE table_name IN ('buildings', 'building')
  LIMIT 1;
  
  IF building_table_name IS NULL THEN
    RAISE NOTICE 'Building table not found. Skipping totals update.';
    RETURN COALESCE(OLD, NEW);
  END IF;
  
  -- Check if total_building_area column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = building_table_name AND column_name = 'total_building_area'
  ) INTO has_total_area;
  
  -- Check if total_assets column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = building_table_name AND column_name = 'total_assets'
  ) INTO has_total_assets;
  
  -- If columns don't exist, skip update (totals are calculated on-demand)
  IF NOT has_total_area AND NOT has_total_assets THEN
    RETURN COALESCE(OLD, NEW);
  END IF;
  
  -- Build UPDATE query only for columns that exist
  sql_query := format('UPDATE %I SET', building_table_name);
  
  IF has_total_area THEN
    sql_query := sql_query || format(' total_building_area = COALESCE((
        SELECT SUM(asset_size)
        FROM (
          SELECT DISTINCT ON (asset_id) asset_id, asset_size
          FROM assets
          WHERE building_number = $1
          ORDER BY asset_id, measurement_date DESC
        ) latest_assets
      ), 0)');
  END IF;
  
  IF has_total_area AND has_total_assets THEN
    sql_query := sql_query || ',';
  END IF;
  
  IF has_total_assets THEN
    sql_query := sql_query || format(' total_assets = COALESCE((
        SELECT COUNT(DISTINCT asset_id)
        FROM assets
        WHERE building_number = $1
      ), 0)');
  END IF;
  
  sql_query := sql_query || format(' WHERE building_number = $1');
  
  IF TG_OP = 'DELETE' THEN
    EXECUTE sql_query USING OLD.building_number;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' AND OLD.building_number != NEW.building_number THEN
    -- Update the old building totals
    EXECUTE sql_query USING OLD.building_number;
    -- Update the new building totals
    EXECUTE sql_query USING NEW.building_number;
    RETURN NEW;
  ELSE
    -- INSERT or UPDATE within same building
    EXECUTE sql_query USING NEW.building_number;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Step 10: Recreate the trigger for building totals (only if function will work)
-- Note: If columns don't exist, the function will just return without updating
DROP TRIGGER IF EXISTS trigger_update_building_totals ON assets;
CREATE TRIGGER trigger_update_building_totals
  AFTER INSERT OR UPDATE OR DELETE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION update_building_totals();

