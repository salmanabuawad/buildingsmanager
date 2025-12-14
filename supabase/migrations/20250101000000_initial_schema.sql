/*
  # Initial Database Schema
  
  This migration creates all core database tables for the Buildings Manager application.
  It should be run first to establish the base schema.
  
  Tables created:
  1. address_list - Street addresses
  2. asset_types - Asset type definitions
  3. validation_rules - Dynamic validation rules
  4. buildings - Building information
  5. assets - Asset records (main table)
  6. assets_history - Historical asset measurements
  7. field_configurations - Field width/padding configurations
  9. asset_type_fields - Field level configurations
  
  Includes:
  - Proper foreign key relationships
  - Indexes for performance
  - Triggers for automatic updates
  - RLS policies for security
  - Helper functions
*/

-- ============================================================================
-- 1. ADDRESS LIST TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS address_list (
  street_code integer PRIMARY KEY CHECK (street_code >= 0 AND street_code <= 9999),
  street_description text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_address_list_street_code ON address_list(street_code);
CREATE INDEX IF NOT EXISTS idx_address_list_street_description ON address_list(street_description);

ALTER TABLE address_list ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to address_list" ON address_list;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to insert address_list" ON address_list;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to update address_list" ON address_list;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to delete address_list" ON address_list;

CREATE POLICY "Allow public read access to address_list"
  ON address_list FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow anonymous and authenticated users to insert address_list"
  ON address_list FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow anonymous and authenticated users to update address_list"
  ON address_list FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anonymous and authenticated users to delete address_list"
  ON address_list FOR DELETE
  TO anon, authenticated
  USING (true);

COMMENT ON TABLE address_list IS 'List of street addresses with codes and descriptions';

-- ============================================================================
-- 2. ASSET TYPES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS asset_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  tax_region INTEGER,
  elevator TEXT,
  single_double_family TEXT,
  penthouse TEXT,
  condo TEXT,
  townhouses TEXT,
  business_residence TEXT,
  shared_area_usage TEXT,
  min_size NUMERIC,
  max_size NUMERIC,
  active TEXT DEFAULT 'כן',
  not_accountable BOOLEAN DEFAULT false,
  area_description_for_tab TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_types_name ON asset_types(name);
CREATE INDEX IF NOT EXISTS idx_asset_types_tax_region ON asset_types(tax_region);
CREATE INDEX IF NOT EXISTS idx_asset_types_active ON asset_types(active);

ALTER TABLE asset_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anonymous read access" ON asset_types;
DROP POLICY IF EXISTS "Allow anonymous insert access" ON asset_types;
DROP POLICY IF EXISTS "Allow anonymous update access" ON asset_types;
DROP POLICY IF EXISTS "Allow anonymous delete access" ON asset_types;

CREATE POLICY "Allow anonymous read access"
  ON asset_types FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow anonymous insert access"
  ON asset_types FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow anonymous update access"
  ON asset_types FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anonymous delete access"
  ON asset_types FOR DELETE
  TO anon, authenticated
  USING (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_asset_types_updated_at ON asset_types;
CREATE TRIGGER update_asset_types_updated_at
  BEFORE UPDATE ON asset_types
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON COLUMN asset_types.active IS 'Indicates if the asset type is active. Values: "כן" (yes) or NULL (no)';
COMMENT ON COLUMN asset_types.not_accountable IS 'Indicates if the asset type is NOT accountable (should NOT be counted). Values: true (לא נספר) or false (נספר)';

-- ============================================================================
-- 3. VALIDATION RULES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS validation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text UNIQUE NOT NULL,
  rule_type text NOT NULL,
  field_name text NOT NULL,
  entity_type text NOT NULL,
  value_numeric integer,
  value_text text,
  enabled boolean DEFAULT true,
  error_message text,
  error_message_he text,
  description text,
  compare_table text,
  compare_field text,
  join_field text,
  comparison_operator text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_validation_rules_entity_type ON validation_rules(entity_type);
CREATE INDEX IF NOT EXISTS idx_validation_rules_field_name ON validation_rules(field_name);
CREATE INDEX IF NOT EXISTS idx_validation_rules_enabled ON validation_rules(enabled);

ALTER TABLE validation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anonymous read access to validation rules" ON validation_rules;
DROP POLICY IF EXISTS "Allow anonymous insert validation rules" ON validation_rules;
DROP POLICY IF EXISTS "Allow anonymous update validation rules" ON validation_rules;
DROP POLICY IF EXISTS "Allow anonymous delete validation rules" ON validation_rules;

CREATE POLICY "Allow anonymous read access to validation rules"
  ON validation_rules FOR SELECT
  USING (true);

CREATE POLICY "Allow anonymous insert validation rules"
  ON validation_rules FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow anonymous update validation rules"
  ON validation_rules FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anonymous delete validation rules"
  ON validation_rules FOR DELETE
  USING (true);

CREATE OR REPLACE FUNCTION update_validation_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validation_rules_updated_at ON validation_rules;
CREATE TRIGGER validation_rules_updated_at
  BEFORE UPDATE ON validation_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_validation_rules_updated_at();

-- ============================================================================
-- 4. BUILDINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS buildings (
  building_number bigint PRIMARY KEY,
  storage_area numeric(10,2) DEFAULT 0,
  pergola_area numeric(10,2) DEFAULT 0,
  balcony_area numeric(10,2) DEFAULT 0,
  total_building_area numeric(10,2) DEFAULT 0,
  tax_region text,
  elevator text,
  single_double_family text,
  condo text,
  townhouses text,
  residence_shared_area numeric(10,2) DEFAULT 0,
  business_shared_area numeric(10,2),
  area_for_control numeric,
  building_address integer,
  gosh bigint,
  helka bigint,
  building_number_in_street bigint,
  overload_ratio numeric(5,2),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_buildings_tax_region ON buildings(tax_region);
CREATE INDEX IF NOT EXISTS idx_buildings_building_address ON buildings(building_address);

ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Buildings are viewable by everyone" ON buildings;
DROP POLICY IF EXISTS "Buildings can be inserted by anyone" ON buildings;
DROP POLICY IF EXISTS "Buildings can be updated by anyone" ON buildings;
DROP POLICY IF EXISTS "Buildings can be deleted by anyone" ON buildings;

CREATE POLICY "Buildings are viewable by everyone"
  ON buildings FOR SELECT
  USING (true);

CREATE POLICY "Buildings can be inserted by anyone"
  ON buildings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Buildings can be updated by anyone"
  ON buildings FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Buildings can be deleted by anyone"
  ON buildings FOR DELETE
  USING (true);

-- Add foreign key constraint for building_address if address_list table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'address_list'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'fk_buildings_building_address'
      AND table_name = 'buildings'
    ) THEN
      ALTER TABLE buildings
      ADD CONSTRAINT fk_buildings_building_address
      FOREIGN KEY (building_address)
      REFERENCES address_list(street_code)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;

COMMENT ON COLUMN buildings.gosh IS 'גוש - Block number';
COMMENT ON COLUMN buildings.helka IS 'חלקה - Parcel number';
COMMENT ON COLUMN buildings.building_number_in_street IS 'מספר בניין - Building number in street';
COMMENT ON COLUMN buildings.building_address IS 'Street code from address_list table (foreign key to address_list.street_code)';
COMMENT ON COLUMN buildings.overload_ratio IS 'אחוז העמסה - Overload ratio percentage';
COMMENT ON COLUMN buildings.residence_shared_area IS 'Residence shared/common area in the building (שטח משותף מגורים)';
COMMENT ON COLUMN buildings.business_shared_area IS 'Shared business/commercial area in the building (שטח משותף עסקים)';

-- ============================================================================
-- 5. ASSETS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS assets (
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

CREATE INDEX IF NOT EXISTS idx_assets_building_number ON assets(building_number);
CREATE INDEX IF NOT EXISTS idx_assets_payer_id ON assets(payer_id);
CREATE INDEX IF NOT EXISTS idx_assets_tax_region ON assets(tax_region);
CREATE INDEX IF NOT EXISTS idx_assets_measurement_date ON assets(measurement_date);

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

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

DROP TRIGGER IF EXISTS update_assets_updated_at ON assets;
CREATE TRIGGER update_assets_updated_at
  BEFORE UPDATE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE assets IS 'Assets table with asset_id as primary key. Each asset_id appears only once in this table (latest measurement). Historical measurements are in assets_history.';
COMMENT ON COLUMN assets.asset_id IS 'Primary key - unique asset identifier';

-- ============================================================================
-- 6. ASSETS HISTORY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS assets_history (
  building_number bigint,
  payer_id text,
  asset_id bigint NOT NULL,
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
  penthouse text,
  tax_region integer,
  floor smallint CHECK (floor >= -99 AND floor <= 99),
  discount_type text,
  discount_date_from text,
  discount_date_to text,
  history_created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assets_history_asset_id ON assets_history(asset_id);
CREATE INDEX IF NOT EXISTS idx_assets_history_measurement_date ON assets_history(measurement_date);
CREATE INDEX IF NOT EXISTS idx_assets_history_tax_region ON assets_history(tax_region);
CREATE INDEX IF NOT EXISTS idx_assets_history_building_number ON assets_history(building_number);

ALTER TABLE assets_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view assets_history" ON assets_history;
DROP POLICY IF EXISTS "Public can insert assets_history" ON assets_history;
DROP POLICY IF EXISTS "Public can update assets_history" ON assets_history;
DROP POLICY IF EXISTS "Public can delete assets_history" ON assets_history;

CREATE POLICY "Public can view assets_history"
  ON assets_history FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public can insert assets_history"
  ON assets_history FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Public can update assets_history"
  ON assets_history FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can delete assets_history"
  ON assets_history FOR DELETE
  TO public
  USING (true);

COMMENT ON TABLE assets_history IS 'Historical asset measurements. Multiple records can exist for the same asset_id and measurement_date combination.';

-- Function to copy asset to history
CREATE OR REPLACE FUNCTION copy_asset_to_history()
RETURNS TRIGGER AS $$
BEGIN
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

DROP TRIGGER IF EXISTS trigger_copy_asset_to_history ON assets;
CREATE TRIGGER trigger_copy_asset_to_history
  BEFORE UPDATE OR DELETE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION copy_asset_to_history();

-- Function to update building total area from assets
-- Fixed to prevent duplicates and be independent of asset_types table size
CREATE OR REPLACE FUNCTION update_building_total_area()
RETURNS TRIGGER AS $$
DECLARE
  target_building_number bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_building_number := OLD.building_number;
  ELSE
    target_building_number := NEW.building_number;
  END IF;

  UPDATE buildings
  SET total_building_area = COALESCE((
    SELECT SUM(a.asset_size)
    FROM (
      SELECT DISTINCT ON (asset_id)
        asset_id,
        asset_size,
        main_asset_type
      FROM assets
      WHERE building_number = target_building_number
      ORDER BY asset_id, updated_at DESC
    ) a
    WHERE (
      a.main_asset_type IS NULL 
      OR EXISTS (
        SELECT 1 
        FROM asset_types at 
        WHERE at.name = a.main_asset_type 
          AND at.active = 'כן'
          AND (at.not_accountable IS NULL OR at.not_accountable = false)
      )
    )
  ), 0)
  WHERE building_number = target_building_number;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_building_total_area ON assets;
CREATE TRIGGER trigger_update_building_total_area
  AFTER INSERT OR UPDATE OR DELETE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION update_building_total_area();

-- Function to search assets by range
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

-- Function to get building stats
-- Fixed to prevent duplicates and be independent of asset_types table size
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
      END DESC,
      a.updated_at DESC
  ),
  filtered_measurements AS (
    SELECT 
      lm.asset_id,
      lm.building_number,
      lm.asset_size,
      lm.measurement_date
    FROM latest_measurements lm
    WHERE (
      lm.main_asset_type IS NULL 
      OR EXISTS (
        SELECT 1 
        FROM asset_types at 
        WHERE at.name = lm.main_asset_type 
          AND at.active = 'כן'
          AND (at.not_accountable IS NULL OR at.not_accountable = false)
      )
    )
  )
  SELECT 
    COUNT(*)::integer as total_assets,
    COALESCE(SUM(asset_size), 0) as total_building_area
  FROM filtered_measurements;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 7. FIELD CONFIGURATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS field_configurations (
  field_name text PRIMARY KEY,
  width_chars integer NOT NULL DEFAULT 10,
  padding integer NOT NULL DEFAULT 8,
  hebrew_name text,
  pinned text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_field_configurations_field_name ON field_configurations(field_name);

CREATE OR REPLACE FUNCTION update_field_configurations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_field_configurations_updated_at ON field_configurations;
CREATE TRIGGER trigger_update_field_configurations_updated_at
  BEFORE UPDATE ON field_configurations
  FOR EACH ROW
  EXECUTE FUNCTION update_field_configurations_updated_at();

ALTER TABLE field_configurations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Field configurations are viewable by everyone" ON field_configurations;
DROP POLICY IF EXISTS "Field configurations can be inserted by anyone" ON field_configurations;
DROP POLICY IF EXISTS "Field configurations can be updated by anyone" ON field_configurations;
DROP POLICY IF EXISTS "Field configurations can be deleted by anyone" ON field_configurations;

CREATE POLICY "Field configurations are viewable by everyone"
  ON field_configurations FOR SELECT
  USING (true);

CREATE POLICY "Field configurations can be inserted by anyone"
  ON field_configurations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Field configurations can be updated by anyone"
  ON field_configurations FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Field configurations can be deleted by anyone"
  ON field_configurations FOR DELETE
  USING (true);

COMMENT ON TABLE field_configurations IS 'Stores field width and padding configurations for all grids in the application';

-- ============================================================================
-- 9. ASSET TYPE FIELDS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS asset_type_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_name text NOT NULL UNIQUE,
  is_asset_level boolean NOT NULL DEFAULT false,
  is_building_level boolean NOT NULL DEFAULT false,
  is_asset_type_validation boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_type_fields_field_name ON asset_type_fields(field_name);
CREATE INDEX IF NOT EXISTS idx_asset_type_fields_asset_level ON asset_type_fields(is_asset_level) WHERE is_asset_level = true;
CREATE INDEX IF NOT EXISTS idx_asset_type_fields_building_level ON asset_type_fields(is_building_level) WHERE is_building_level = true;
CREATE INDEX IF NOT EXISTS idx_asset_type_fields_validation ON asset_type_fields(is_asset_type_validation) WHERE is_asset_type_validation = true;

ALTER TABLE asset_type_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to asset type fields" ON asset_type_fields;
CREATE POLICY "Allow all access to asset type fields" ON asset_type_fields
  FOR ALL USING (true);

DROP TRIGGER IF EXISTS update_asset_type_fields_updated_at ON asset_type_fields;
CREATE TRIGGER update_asset_type_fields_updated_at BEFORE UPDATE ON asset_type_fields
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ENABLE REALTIME (if using Supabase)
-- ============================================================================

-- Enable realtime for main tables
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE buildings;
    ALTER PUBLICATION supabase_realtime ADD TABLE assets;
    ALTER PUBLICATION supabase_realtime ADD TABLE asset_types;
  END IF;
END $$;

-- Set replica identity for realtime
ALTER TABLE buildings REPLICA IDENTITY FULL;
ALTER TABLE assets REPLICA IDENTITY FULL;
ALTER TABLE asset_types REPLICA IDENTITY FULL;

