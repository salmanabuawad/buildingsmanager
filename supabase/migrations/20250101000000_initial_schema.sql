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
  non_accountable_for_total_area BOOLEAN DEFAULT false,
  non_accountable_for_distribution BOOLEAN DEFAULT false,
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
COMMENT ON COLUMN asset_types.non_accountable_for_total_area IS 'Indicates if the asset type should be excluded from total area calculations. Values: true (לא נספר) or false (נספר)';
COMMENT ON COLUMN asset_types.non_accountable_for_distribution IS 'Indicates if the asset type should be excluded from distribution calculations (business shared area distribution). Values: true (לא נספר בפיזור) or false (נספר בפיזור)';

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
  residence_shared_area_distributed boolean DEFAULT false,
  business_shared_area_distributed boolean DEFAULT false,
  action_id bigint,
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
COMMENT ON COLUMN buildings.residence_shared_area_distributed IS 'Flag indicating if residence shared area has been distributed to assets';
COMMENT ON COLUMN buildings.business_shared_area_distributed IS 'Flag indicating if business shared area has been distributed to assets';

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
  is_new_measurement boolean DEFAULT false,
  action_id bigint,
  business_distribution_area numeric,
  exported_to_automation boolean DEFAULT false
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
  history_created_at timestamptz DEFAULT now(),
  action_id bigint,
  business_distribution_area numeric,
  exported_to_automation boolean DEFAULT false
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

-- Function to update building total area from assets (parameterized version)
-- This version is called explicitly from code, not via triggers
CREATE OR REPLACE FUNCTION update_building_total_area(p_building_number bigint)
RETURNS void AS $$
BEGIN
  UPDATE buildings
  SET total_building_area = COALESCE((
    SELECT SUM(a.asset_size)
    FROM (
      SELECT DISTINCT ON (asset_id)
        asset_id,
        asset_size,
        main_asset_type
      FROM assets
      WHERE building_number = p_building_number
      ORDER BY asset_id, updated_at DESC
    ) a
    WHERE (
      a.main_asset_type IS NULL 
      OR EXISTS (
        SELECT 1 
        FROM asset_types at 
        WHERE at.name = a.main_asset_type 
          AND at.active = 'כן'
          AND (at.non_accountable_for_total_area IS NULL OR at.non_accountable_for_total_area = false)
      )
    )
  ), 0)
  WHERE building_number = p_building_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_building_total_area IS 'Update building total area based on sum of asset sizes (excluding non_accountable_for_total_area assets)';

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
          AND (at.non_accountable_for_total_area IS NULL OR at.non_accountable_for_total_area = false)
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
  grid_name text NOT NULL,
  field_name text NOT NULL,
  width_chars integer NOT NULL DEFAULT 10,
  padding integer NOT NULL DEFAULT 8,
  hebrew_name text,
  pinned boolean DEFAULT false,
  pin_side text,
  visible boolean DEFAULT true,
  column_order integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (grid_name, field_name)
);

CREATE INDEX IF NOT EXISTS idx_field_configurations_grid_name ON field_configurations(grid_name);
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
-- 8. USERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  user_id bigserial PRIMARY KEY,
  auth_user_id text UNIQUE, -- Reference to Supabase auth.users.id (UUID as text)
  user_name text NOT NULL,
  user_email text,
  active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_users_user_email ON users(user_email);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(active);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to users" ON users;
DROP POLICY IF EXISTS "Allow authenticated users to insert users" ON users;
DROP POLICY IF EXISTS "Allow authenticated users to update own user" ON users;

CREATE POLICY "Allow public read access to users"
  ON users FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow authenticated users to insert users"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update own user"
  ON users FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE users IS 'Application users table, can be synced with Supabase auth.users';
COMMENT ON COLUMN users.user_id IS 'Primary key - internal user ID';
COMMENT ON COLUMN users.auth_user_id IS 'Reference to Supabase auth.users.id (UUID)';
COMMENT ON COLUMN users.user_name IS 'Display name of the user';
COMMENT ON COLUMN users.user_email IS 'User email address';
COMMENT ON COLUMN users.active IS 'Whether the user account is active';

-- Create default user if it doesn't exist
INSERT INTO users (user_name, auth_user_id, user_email, active)
VALUES ('default', NULL, NULL, true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 9. AUDIT TABLE
-- ============================================================================

-- Create enum for action types
DO $$ BEGIN
  CREATE TYPE audit_action_type AS ENUM (
    'manual_update',
    'import_file',
    'transfer_area',
    'distribute_shared'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS audit (
  action_id bigserial PRIMARY KEY,
  user_id bigint NOT NULL,
  action_type audit_action_type NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('building', 'asset', 'bulk_building', 'bulk_asset')),
  entity_id text, -- Can be building_number, asset_id, or comma-separated IDs for bulk operations
  before_data jsonb, -- JSON containing all related building/asset data before the action
  after_data jsonb, -- JSON containing all related building/asset data after the action
  description text, -- Optional description of the action
  created_at timestamptz DEFAULT now()
);

-- Add foreign key constraint to users table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_audit_user_id'
  ) THEN
    ALTER TABLE audit
    ADD CONSTRAINT fk_audit_user_id
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action_type ON audit(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_entity_type ON audit(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_entity_id ON audit(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity_type_id ON audit(entity_type, entity_id);

ALTER TABLE audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to audit" ON audit;
DROP POLICY IF EXISTS "Allow authenticated users to insert audit" ON audit;

CREATE POLICY "Allow public read access to audit"
  ON audit FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow authenticated users to insert audit"
  ON audit FOR INSERT
  TO authenticated
  WITH CHECK (true);

COMMENT ON TABLE audit IS 'Audit table tracking all changes to buildings and assets';
COMMENT ON COLUMN audit.action_id IS 'Primary key - sequential action ID';
COMMENT ON COLUMN audit.user_id IS 'Foreign key to users table';
COMMENT ON COLUMN audit.action_type IS 'Type of action: manual_update, import_file, transfer_area, distribute_shared';
COMMENT ON COLUMN audit.entity_type IS 'Type of entity: building, asset, bulk_building, bulk_asset';
COMMENT ON COLUMN audit.entity_id IS 'ID of the entity (building_number, asset_id, or comma-separated IDs for bulk)';
COMMENT ON COLUMN audit.before_data IS 'JSON containing all related building/asset data before the action';
COMMENT ON COLUMN audit.after_data IS 'JSON containing all related building/asset data after the action';

-- Add action_id foreign keys to existing tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assets_action_id_fkey'
  ) THEN
    ALTER TABLE assets
    ADD CONSTRAINT assets_action_id_fkey 
    FOREIGN KEY (action_id) REFERENCES audit(action_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_assets_action_id ON assets(action_id);

COMMENT ON COLUMN assets.action_id IS 'References the audit entry that caused this asset record to be created or updated';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'buildings_action_id_fkey'
  ) THEN
    ALTER TABLE buildings
    ADD CONSTRAINT buildings_action_id_fkey 
    FOREIGN KEY (action_id) REFERENCES audit(action_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_buildings_action_id ON buildings(action_id);

COMMENT ON COLUMN buildings.action_id IS 'References the audit entry that caused this building record to be created or updated';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assets_history_action_id_fkey'
  ) THEN
    ALTER TABLE assets_history
    ADD CONSTRAINT assets_history_action_id_fkey 
    FOREIGN KEY (action_id) REFERENCES audit(action_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_assets_history_action_id ON assets_history(action_id);

COMMENT ON COLUMN assets_history.action_id IS 'References the audit entry that caused this history record to be created';
COMMENT ON COLUMN assets.business_distribution_area IS 'Area distributed to this asset from business shared area distribution';
COMMENT ON COLUMN assets.exported_to_automation IS 'Flag indicating if this asset has been exported to automation system (default: false)';
COMMENT ON COLUMN assets_history.business_distribution_area IS 'Area distributed to this asset from business shared area distribution (historical record)';
COMMENT ON COLUMN assets_history.exported_to_automation IS 'Flag indicating if this asset has been exported to automation system (historical record)';

-- ============================================================================
-- 10. CHANGE LOG TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS change_log (
  log_id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  record_id text, -- Primary key value of the affected record (as text for flexibility)
  user_id bigint NOT NULL,
  before_data jsonb, -- Record data before the change (for UPDATE/DELETE)
  after_data jsonb, -- Record data after the change (for INSERT/UPDATE)
  changed_fields text[], -- Array of field names that changed (for UPDATE)
  ip_address inet, -- Client IP address if available
  user_agent text, -- User agent string if available
  session_id text, -- Session identifier
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Add foreign key constraint to users table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_change_log_user_id'
  ) THEN
    ALTER TABLE change_log
    ADD CONSTRAINT fk_change_log_user_id
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_change_log_user_id ON change_log(user_id);
CREATE INDEX IF NOT EXISTS idx_change_log_table_name ON change_log(table_name);
CREATE INDEX IF NOT EXISTS idx_change_log_operation ON change_log(operation);
CREATE INDEX IF NOT EXISTS idx_change_log_table_operation ON change_log(table_name, operation);
CREATE INDEX IF NOT EXISTS idx_change_log_record_id ON change_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_change_log_created_at ON change_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_change_log_table_record ON change_log(table_name, record_id, created_at DESC);

-- GIN index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_change_log_before_data_gin ON change_log USING GIN (before_data);
CREATE INDEX IF NOT EXISTS idx_change_log_after_data_gin ON change_log USING GIN (after_data);

ALTER TABLE change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to change_log" ON change_log;
DROP POLICY IF EXISTS "Allow authenticated users to insert change_log" ON change_log;

CREATE POLICY "Allow public read access to change_log"
  ON change_log FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow authenticated users to insert change_log"
  ON change_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

COMMENT ON TABLE change_log IS 'Comprehensive change log tracking all database operations with user information';
COMMENT ON COLUMN change_log.log_id IS 'Primary key - sequential log ID';
COMMENT ON COLUMN change_log.table_name IS 'Name of the table that was modified';
COMMENT ON COLUMN change_log.operation IS 'Type of operation: INSERT, UPDATE, or DELETE';
COMMENT ON COLUMN change_log.record_id IS 'Primary key value of the affected record (as text)';
COMMENT ON COLUMN change_log.user_id IS 'Foreign key to users table';
COMMENT ON COLUMN change_log.before_data IS 'Record data before the change (JSONB)';
COMMENT ON COLUMN change_log.after_data IS 'Record data after the change (JSONB)';
COMMENT ON COLUMN change_log.changed_fields IS 'Array of field names that changed (for UPDATE operations)';
COMMENT ON COLUMN change_log.ip_address IS 'Client IP address if available';
COMMENT ON COLUMN change_log.user_agent IS 'User agent string if available';
COMMENT ON COLUMN change_log.session_id IS 'Session identifier';
COMMENT ON COLUMN change_log.created_at IS 'Timestamp when the change occurred';

-- ============================================================================
-- AUDIT AND CHANGE LOG HELPER FUNCTIONS
-- ============================================================================

-- Function to get or create user from auth context
CREATE OR REPLACE FUNCTION get_or_create_user_from_auth()
RETURNS bigint AS $$
DECLARE
  v_user_id bigint;
  v_auth_user_id text;
BEGIN
  -- Try to get current user from auth context (Supabase)
  v_auth_user_id := current_setting('request.jwt.claim.sub', true);
  
  IF v_auth_user_id IS NOT NULL THEN
    SELECT user_id INTO v_user_id
    FROM users
    WHERE auth_user_id = v_auth_user_id;
    
    IF v_user_id IS NULL THEN
      INSERT INTO users (auth_user_id, user_name, user_email)
      VALUES (v_auth_user_id, v_auth_user_id, NULL)
      ON CONFLICT (auth_user_id) DO UPDATE
      SET updated_at = now()
      RETURNING user_id INTO v_user_id;
    END IF;
  END IF;
  
  -- If still no user, use default
  IF v_user_id IS NULL THEN
    SELECT user_id INTO v_user_id
    FROM users
    WHERE user_name = 'default' AND auth_user_id IS NULL
    LIMIT 1;
  END IF;
  
  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_or_create_user_from_auth IS 'Get or create user from Supabase auth context, fallback to default user';

-- Function to get building audit data
CREATE OR REPLACE FUNCTION get_building_audit_data(p_building_number bigint)
RETURNS jsonb AS $$
DECLARE
  v_building jsonb;
  v_assets jsonb;
  v_result jsonb;
BEGIN
  -- Get building data
  SELECT to_jsonb(b.*) INTO v_building
  FROM buildings b
  WHERE b.building_number = p_building_number;
  
  -- Get all assets for this building
  SELECT COALESCE(jsonb_agg(to_jsonb(a.*)), '[]'::jsonb) INTO v_assets
  FROM assets a
  WHERE a.building_number = p_building_number;
  
  -- Combine into result
  v_result := jsonb_build_object(
    'building', v_building,
    'assets', v_assets
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_building_audit_data IS 'Get building data with all related assets for audit logging';

-- Function to get asset audit data
CREATE OR REPLACE FUNCTION get_asset_audit_data(p_asset_id bigint)
RETURNS jsonb AS $$
DECLARE
  v_asset jsonb;
  v_building jsonb;
  v_result jsonb;
BEGIN
  -- Get asset data
  SELECT to_jsonb(a.*) INTO v_asset
  FROM assets a
  WHERE a.asset_id = p_asset_id;
  
  -- Get building data if asset exists
  IF v_asset IS NOT NULL THEN
    SELECT to_jsonb(b.*) INTO v_building
    FROM buildings b
    WHERE b.building_number = (v_asset->>'building_number')::bigint;
  END IF;
  
  -- Combine into result
  v_result := jsonb_build_object(
    'asset', v_asset,
    'building', v_building
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_asset_audit_data IS 'Get asset data with building data for audit logging';

-- Function to log audit entry
CREATE OR REPLACE FUNCTION log_audit_entry(
  p_action_type audit_action_type,
  p_entity_type text,
  p_entity_id text,
  p_user_id text DEFAULT NULL, -- auth_user_id (UUID as text)
  p_before_data jsonb DEFAULT NULL,
  p_after_data jsonb DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS bigint AS $$
DECLARE
  v_audit_id bigint;
  v_user_id_fk bigint;
  v_default_user_id bigint;
BEGIN
  -- Get or create user
  IF p_user_id IS NOT NULL THEN
    SELECT user_id INTO v_user_id_fk
    FROM users
    WHERE auth_user_id = p_user_id;
    
    IF v_user_id_fk IS NULL THEN
      INSERT INTO users (auth_user_id, user_name, user_email)
      VALUES (p_user_id, p_user_id, NULL)
      ON CONFLICT (auth_user_id) DO UPDATE
      SET updated_at = now()
      RETURNING user_id INTO v_user_id_fk;
    END IF;
  ELSE
    v_user_id_fk := get_or_create_user_from_auth();
  END IF;
  
  -- If still no user, use default
  IF v_user_id_fk IS NULL THEN
    SELECT user_id INTO v_default_user_id
    FROM users
    WHERE user_name = 'default' AND auth_user_id IS NULL
    LIMIT 1;
    v_user_id_fk := v_default_user_id;
  END IF;
  
  INSERT INTO audit (
    user_id,
    action_type,
    entity_type,
    entity_id,
    before_data,
    after_data,
    description
  ) VALUES (
    v_user_id_fk,
    p_action_type,
    p_entity_type,
    p_entity_id,
    p_before_data,
    p_after_data,
    p_description
  )
  RETURNING action_id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_audit_entry IS 'Function to manually log an audit entry';

-- Function to log change entry
CREATE OR REPLACE FUNCTION log_change_entry(
  p_table_name text,
  p_operation text,
  p_record_id text,
  p_user_id text DEFAULT NULL, -- auth_user_id (UUID as text)
  p_before_data jsonb DEFAULT NULL,
  p_after_data jsonb DEFAULT NULL,
  p_changed_fields text[] DEFAULT NULL
)
RETURNS bigint AS $$
DECLARE
  v_log_id bigint;
  v_user_id_fk bigint;
  v_default_user_id bigint;
BEGIN
  -- Get or create user
  IF p_user_id IS NOT NULL THEN
    SELECT user_id INTO v_user_id_fk
    FROM users
    WHERE auth_user_id = p_user_id;
    
    IF v_user_id_fk IS NULL THEN
      INSERT INTO users (auth_user_id, user_name, user_email)
      VALUES (p_user_id, p_user_id, NULL)
      ON CONFLICT (auth_user_id) DO UPDATE
      SET updated_at = now()
      RETURNING user_id INTO v_user_id_fk;
    END IF;
  ELSE
    v_user_id_fk := get_or_create_user_from_auth();
  END IF;
  
  -- If still no user, use default
  IF v_user_id_fk IS NULL THEN
    SELECT user_id INTO v_default_user_id
    FROM users
    WHERE user_name = 'default' AND auth_user_id IS NULL
    LIMIT 1;
    v_user_id_fk := v_default_user_id;
  END IF;
  
  INSERT INTO change_log (
    table_name,
    operation,
    record_id,
    user_id,
    before_data,
    after_data,
    changed_fields
  ) VALUES (
    p_table_name,
    p_operation,
    p_record_id,
    v_user_id_fk,
    p_before_data,
    p_after_data,
    p_changed_fields
  )
  RETURNING log_id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_change_entry IS 'Function to log a change entry';

-- Function to log audit for building
CREATE OR REPLACE FUNCTION log_audit_for_building(
  p_building_number bigint,
  p_operation text, -- 'INSERT', 'UPDATE', 'DELETE'
  p_user_id text DEFAULT NULL, -- auth_user_id (UUID as text)
  p_action_type audit_action_type DEFAULT 'manual_update',
  p_description text DEFAULT NULL
)
RETURNS bigint AS $$
DECLARE
  v_before_data jsonb;
  v_after_data jsonb;
  v_audit_id bigint;
BEGIN
  IF p_operation = 'INSERT' THEN
    v_after_data := get_building_audit_data(p_building_number);
    v_before_data := NULL;
  ELSIF p_operation = 'UPDATE' THEN
    -- Note: This should be called AFTER the update, so v_before_data won't be accurate
    -- The calling code should pass before_data if needed
    v_after_data := get_building_audit_data(p_building_number);
    v_before_data := NULL; -- Will need to be passed in separately if needed
  ELSIF p_operation = 'DELETE' THEN
    v_before_data := NULL; -- Should be passed in before deletion
    v_after_data := NULL;
  END IF;
  
  SELECT log_audit_entry(
    p_action_type,
    'building',
    p_building_number::text,
    p_user_id,
    v_before_data,
    v_after_data,
    p_description
  ) INTO v_audit_id;
  
  -- Update building's action_id if not DELETE
  IF p_operation != 'DELETE' THEN
    UPDATE buildings
    SET action_id = v_audit_id
    WHERE building_number = p_building_number;
  END IF;
  
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_audit_for_building IS 'Log audit entry for building operation';

-- Function to log audit for asset
CREATE OR REPLACE FUNCTION log_audit_for_asset(
  p_asset_id bigint,
  p_operation text, -- 'INSERT', 'UPDATE', 'DELETE'
  p_user_id text DEFAULT NULL, -- auth_user_id (UUID as text)
  p_action_type audit_action_type DEFAULT 'manual_update',
  p_copy_to_history boolean DEFAULT false,
  p_description text DEFAULT NULL
)
RETURNS bigint AS $$
DECLARE
  v_before_data jsonb;
  v_after_data jsonb;
  v_audit_id bigint;
  v_old_asset jsonb;
  v_building_number bigint;
BEGIN
  IF p_operation = 'DELETE' THEN
    -- Get old asset before deletion (should have been copied to history already)
    SELECT to_jsonb(ah.*) INTO v_old_asset
    FROM assets_history ah
    WHERE ah.asset_id = p_asset_id
    ORDER BY ah.history_created_at DESC NULLS LAST, ah.created_at DESC
    LIMIT 1;
    
    IF v_old_asset IS NOT NULL THEN
      v_before_data := jsonb_build_object(
        'asset', v_old_asset,
        'building', NULL
      );
    END IF;
    v_after_data := NULL;
  ELSIF p_operation = 'UPDATE' THEN
    -- Get before data (if copy_to_history, it's already in history)
    IF p_copy_to_history THEN
      SELECT to_jsonb(ah.*) INTO v_old_asset
      FROM assets_history ah
      WHERE ah.asset_id = p_asset_id
        AND ah.action_id IS NULL
      ORDER BY ah.history_created_at DESC NULLS LAST
      LIMIT 1;
      
      IF v_old_asset IS NOT NULL THEN
        v_before_data := get_asset_audit_data(p_asset_id);
        -- Replace asset in before_data with history version
        v_before_data := jsonb_set(v_before_data, '{asset}', v_old_asset);
      ELSE
        v_before_data := get_asset_audit_data(p_asset_id);
      END IF;
    ELSE
      v_before_data := get_asset_audit_data(p_asset_id);
    END IF;
    
    -- Get after data
    v_after_data := get_asset_audit_data(p_asset_id);
  ELSIF p_operation = 'INSERT' THEN
    -- Get after data
    v_after_data := get_asset_audit_data(p_asset_id);
    
    -- Get building state for before_data (asset didn't exist before)
    SELECT building_number INTO v_building_number
    FROM assets
    WHERE asset_id = p_asset_id;
    
    IF v_building_number IS NOT NULL THEN
      v_before_data := jsonb_build_object(
        'asset', NULL,
        'building', get_building_audit_data(v_building_number)
      );
    END IF;
  END IF;
  
  -- Log audit entry
  SELECT log_audit_entry(
    p_action_type,
    'asset',
    p_asset_id::text,
    p_user_id,
    v_before_data,
    v_after_data,
    p_description
  ) INTO v_audit_id;
  
  -- Update asset's action_id if not DELETE
  IF p_operation != 'DELETE' THEN
    UPDATE assets
    SET action_id = v_audit_id
    WHERE asset_id = p_asset_id;
  END IF;
  
  -- Update history entry's action_id if one exists (for DELETE or UPDATE with copy_to_history)
  IF p_operation = 'DELETE' OR (p_operation = 'UPDATE' AND p_copy_to_history) THEN
    -- Update the most recent history entry without action_id
    UPDATE assets_history
    SET action_id = v_audit_id
    WHERE asset_id = p_asset_id
      AND action_id IS NULL
      AND (building_number, measurement_date, COALESCE(history_created_at, created_at)) = (
        SELECT building_number, measurement_date, COALESCE(history_created_at, created_at)
        FROM assets_history
        WHERE asset_id = p_asset_id
          AND action_id IS NULL
        ORDER BY COALESCE(history_created_at, created_at) DESC NULLS LAST
        LIMIT 1
      );
  END IF;
  
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_audit_for_asset IS 'Log audit entry for asset operation';

-- Function to copy asset to history before update
CREATE OR REPLACE FUNCTION copy_asset_to_history_before_update(
  p_asset_id bigint
)
RETURNS void AS $$
DECLARE
  v_old_asset jsonb;
BEGIN
  -- Get old asset data
  SELECT to_jsonb(a.*) INTO v_old_asset
  FROM assets a
  WHERE a.asset_id = p_asset_id;
  
  IF v_old_asset IS NOT NULL THEN
    -- Copy to history
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
      tax_region, floor, discount_type, discount_date_from, discount_date_to,
      history_created_at, action_id, business_distribution_area, exported_to_automation
    ) VALUES (
      (v_old_asset->>'building_number')::bigint,
      v_old_asset->>'payer_id',
      (v_old_asset->>'asset_id')::bigint,
      v_old_asset->>'measurement_date',
      v_old_asset->>'main_asset_type',
      (v_old_asset->>'asset_size')::numeric,
      v_old_asset->>'sub_asset_type_1',
      (v_old_asset->>'sub_asset_size_1')::numeric,
      v_old_asset->>'sub_asset_type_2',
      (v_old_asset->>'sub_asset_size_2')::numeric,
      v_old_asset->>'sub_asset_type_3',
      (v_old_asset->>'sub_asset_size_3')::numeric,
      v_old_asset->>'sub_asset_type_4',
      (v_old_asset->>'sub_asset_size_4')::numeric,
      v_old_asset->>'sub_asset_type_5',
      (v_old_asset->>'sub_asset_size_5')::numeric,
      v_old_asset->>'sub_asset_type_6',
      (v_old_asset->>'sub_asset_size_6')::numeric,
      v_old_asset->>'structure_drawing_url',
      COALESCE((v_old_asset->>'created_at')::timestamptz, now()),
      COALESCE((v_old_asset->>'updated_at')::timestamptz, now()),
      v_old_asset->>'elevator',
      v_old_asset->>'single_double_family',
      v_old_asset->>'condo',
      v_old_asset->>'townhouses',
      v_old_asset->>'penthouse',
      (v_old_asset->>'tax_region')::integer,
      (v_old_asset->>'floor')::smallint,
      v_old_asset->>'discount_type',
      v_old_asset->>'discount_date_from',
      v_old_asset->>'discount_date_to',
      now(), -- history_created_at: timestamp when this record was moved to history
      NULL, -- action_id will be set after audit entry is created
      (v_old_asset->>'business_distribution_area')::numeric,
      COALESCE((v_old_asset->>'exported_to_automation')::boolean, false)
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION copy_asset_to_history_before_update IS 'Copy asset to history before update (for new measurements)';

-- ============================================================================
-- BULK OPERATIONS FUNCTIONS
-- ============================================================================

-- Function to bulk update assets with audit logging (includes business_distribution_area)
CREATE OR REPLACE FUNCTION bulk_update_assets_with_audit(
  p_assets jsonb, -- Array of asset objects to update/create
  p_action_type audit_action_type, -- Action type for audit
  p_user_id text DEFAULT NULL, -- auth_user_id (UUID as text)
  p_before_data jsonb DEFAULT NULL, -- Optional: if provided, will be used; otherwise collected from DB
  p_after_data jsonb DEFAULT NULL, -- Optional: if provided, will be used; otherwise collected from DB
  p_description text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_audit_id bigint;
  v_asset jsonb;
  v_asset_id bigint;
  v_building_number bigint;
  v_affected_asset_ids bigint[] := ARRAY[]::bigint[];
  v_result jsonb;
  v_before_assets jsonb[] := ARRAY[]::jsonb[];
  v_after_assets jsonb[] := ARRAY[]::jsonb[];
  v_before_data_collected jsonb;
  v_after_data_collected jsonb;
  v_asset_data jsonb;
  v_building_data jsonb;
  v_first_building_number bigint;
BEGIN
  -- Get first building number from assets (all assets in distribution belong to same building)
  SELECT (elem->>'building_number')::bigint INTO v_first_building_number
  FROM jsonb_array_elements(p_assets) AS elem
  LIMIT 1;
  
  -- Collect BEFORE data from database (if not provided)
  IF p_before_data IS NULL OR p_before_data = 'null'::jsonb OR p_before_data = '{}'::jsonb THEN
    -- Collect building data before update
    IF v_first_building_number IS NOT NULL THEN
      SELECT to_jsonb(b.*) INTO v_building_data
      FROM buildings b
      WHERE b.building_number = v_first_building_number;
    END IF;
    
    FOR v_asset IN SELECT * FROM jsonb_array_elements(p_assets)
    LOOP
      v_asset_id := (v_asset->>'asset_id')::bigint;
      
      -- Get current asset state from database before update
      SELECT to_jsonb(a.*) INTO v_asset_data
      FROM assets a
      WHERE a.asset_id = v_asset_id;
      
      IF v_asset_data IS NOT NULL THEN
        v_before_assets := array_append(v_before_assets, v_asset_data);
      END IF;
    END LOOP;
    
    -- Convert jsonb array to jsonb array for assets
    SELECT jsonb_agg(elem) INTO v_before_data_collected
    FROM unnest(v_before_assets) AS elem;
    
    -- Build before_data with both assets and building
    v_before_data_collected := jsonb_build_object(
      'assets', COALESCE(v_before_data_collected, '[]'::jsonb),
      'building', COALESCE(v_building_data, 'null'::jsonb)
    );
  ELSE
    v_before_data_collected := p_before_data;
  END IF;
  
  -- Create audit entry with collected before data (after data will be updated later)
  SELECT log_audit_entry(
    p_action_type,
    'bulk_asset',
    NULL::text,
    p_user_id,
    v_before_data_collected,
    NULL::jsonb,
    p_description
  ) INTO v_audit_id;
  
  -- Process each asset in the array
  FOR v_asset IN SELECT * FROM jsonb_array_elements(p_assets)
  LOOP
    v_asset_id := (v_asset->>'asset_id')::bigint;
    v_building_number := (v_asset->>'building_number')::bigint;
    
    -- Check if asset exists (for update vs insert)
    IF EXISTS (SELECT 1 FROM assets WHERE asset_id = v_asset_id) THEN
      -- UPDATE existing asset
      UPDATE assets
      SET
        building_number = COALESCE((v_asset->>'building_number')::bigint, building_number),
        payer_id = COALESCE(v_asset->>'payer_id', payer_id),
        measurement_date = COALESCE(v_asset->>'measurement_date', measurement_date),
        main_asset_type = COALESCE(v_asset->>'main_asset_type', main_asset_type),
        asset_size = COALESCE((v_asset->>'asset_size')::numeric, asset_size),
        sub_asset_type_1 = COALESCE(v_asset->>'sub_asset_type_1', sub_asset_type_1),
        sub_asset_size_1 = COALESCE((v_asset->>'sub_asset_size_1')::numeric, sub_asset_size_1),
        sub_asset_type_2 = COALESCE(v_asset->>'sub_asset_type_2', sub_asset_type_2),
        sub_asset_size_2 = COALESCE((v_asset->>'sub_asset_size_2')::numeric, sub_asset_size_2),
        sub_asset_type_3 = COALESCE(v_asset->>'sub_asset_type_3', sub_asset_type_3),
        sub_asset_size_3 = COALESCE((v_asset->>'sub_asset_size_3')::numeric, sub_asset_size_3),
        sub_asset_type_4 = COALESCE(v_asset->>'sub_asset_type_4', sub_asset_type_4),
        sub_asset_size_4 = COALESCE((v_asset->>'sub_asset_size_4')::numeric, sub_asset_size_4),
        sub_asset_type_5 = COALESCE(v_asset->>'sub_asset_type_5', sub_asset_type_5),
        sub_asset_size_5 = COALESCE((v_asset->>'sub_asset_size_5')::numeric, sub_asset_size_5),
        sub_asset_type_6 = COALESCE(v_asset->>'sub_asset_type_6', sub_asset_type_6),
        sub_asset_size_6 = COALESCE((v_asset->>'sub_asset_size_6')::numeric, sub_asset_size_6),
        structure_drawing_url = COALESCE(v_asset->>'structure_drawing_url', structure_drawing_url),
        elevator = COALESCE(v_asset->>'elevator', elevator),
        single_double_family = COALESCE(v_asset->>'single_double_family', single_double_family),
        condo = COALESCE(v_asset->>'condo', condo),
        townhouses = COALESCE(v_asset->>'townhouses', townhouses),
        penthouse = COALESCE(v_asset->>'penthouse', penthouse),
        tax_region = COALESCE((v_asset->>'tax_region')::integer, tax_region),
        floor = COALESCE((v_asset->>'floor')::smallint, floor),
        discount_type = COALESCE(v_asset->>'discount_type', discount_type),
        discount_date_from = COALESCE(v_asset->>'discount_date_from', discount_date_from),
        discount_date_to = COALESCE(v_asset->>'discount_date_to', discount_date_to),
        business_distribution_area = COALESCE((v_asset->>'business_distribution_area')::numeric, business_distribution_area),
        action_id = v_audit_id,
        updated_at = now()
      WHERE asset_id = v_asset_id;
    ELSE
      -- INSERT new asset
      INSERT INTO assets (
        building_number, payer_id, asset_id, measurement_date,
        main_asset_type, asset_size,
        sub_asset_type_1, sub_asset_size_1,
        sub_asset_type_2, sub_asset_size_2,
        sub_asset_type_3, sub_asset_size_3,
        sub_asset_type_4, sub_asset_size_4,
        sub_asset_type_5, sub_asset_size_5,
        sub_asset_type_6, sub_asset_size_6,
        structure_drawing_url,
        elevator, single_double_family, condo, townhouses, penthouse,
        tax_region, floor,
        discount_type, discount_date_from, discount_date_to,
        business_distribution_area,
        action_id, created_at, updated_at
      ) VALUES (
        (v_asset->>'building_number')::bigint,
        NULLIF(v_asset->>'payer_id', ''),
        v_asset_id,
        COALESCE(v_asset->>'measurement_date', '01/01/1900'),
        NULLIF(v_asset->>'main_asset_type', ''),
        COALESCE((v_asset->>'asset_size')::numeric, 0),
        NULLIF(v_asset->>'sub_asset_type_1', ''),
        COALESCE((v_asset->>'sub_asset_size_1')::numeric, 0),
        NULLIF(v_asset->>'sub_asset_type_2', ''),
        COALESCE((v_asset->>'sub_asset_size_2')::numeric, 0),
        NULLIF(v_asset->>'sub_asset_type_3', ''),
        COALESCE((v_asset->>'sub_asset_size_3')::numeric, 0),
        NULLIF(v_asset->>'sub_asset_type_4', ''),
        COALESCE((v_asset->>'sub_asset_size_4')::numeric, 0),
        NULLIF(v_asset->>'sub_asset_type_5', ''),
        COALESCE((v_asset->>'sub_asset_size_5')::numeric, 0),
        NULLIF(v_asset->>'sub_asset_type_6', ''),
        COALESCE((v_asset->>'sub_asset_size_6')::numeric, 0),
        NULLIF(v_asset->>'structure_drawing_url', ''),
        NULLIF(v_asset->>'elevator', ''),
        NULLIF(v_asset->>'single_double_family', ''),
        NULLIF(v_asset->>'condo', ''),
        NULLIF(v_asset->>'townhouses', ''),
        NULLIF(v_asset->>'penthouse', ''),
        (v_asset->>'tax_region')::integer,
        (v_asset->>'floor')::smallint,
        NULLIF(v_asset->>'discount_type', ''),
        NULLIF(v_asset->>'discount_date_from', ''),
        NULLIF(v_asset->>'discount_date_to', ''),
        (v_asset->>'business_distribution_area')::numeric,
        v_audit_id,
        now(),
        now()
      );
    END IF;
    
    -- Add to affected asset IDs array
    v_affected_asset_ids := array_append(v_affected_asset_ids, v_asset_id);
    
    -- Update building total area for this building
    IF v_building_number IS NOT NULL THEN
      PERFORM update_building_total_area(v_building_number);
    END IF;
  END LOOP;
  
  -- Collect AFTER data from database (if not provided)
  IF p_after_data IS NULL OR p_after_data = 'null'::jsonb OR p_after_data = '{}'::jsonb THEN
    -- Collect building data after update
    IF v_first_building_number IS NOT NULL THEN
      SELECT to_jsonb(b.*) INTO v_building_data
      FROM buildings b
      WHERE b.building_number = v_first_building_number;
    END IF;
    
    FOR v_asset_id IN SELECT unnest(v_affected_asset_ids)
    LOOP
      -- Get updated asset state from database after update
      SELECT to_jsonb(a.*) INTO v_asset_data
      FROM assets a
      WHERE a.asset_id = v_asset_id;
      
      IF v_asset_data IS NOT NULL THEN
        v_after_assets := array_append(v_after_assets, v_asset_data);
      END IF;
    END LOOP;
    
    -- Convert jsonb array to jsonb array for assets
    SELECT jsonb_agg(elem) INTO v_after_data_collected
    FROM unnest(v_after_assets) AS elem;
    
    -- Build after_data with both assets and building
    v_after_data_collected := jsonb_build_object(
      'assets', COALESCE(v_after_data_collected, '[]'::jsonb),
      'building', COALESCE(v_building_data, 'null'::jsonb)
    );
  ELSE
    v_after_data_collected := p_after_data;
  END IF;
  
  -- Update audit entry with collected after data and entity_id
  UPDATE audit
  SET 
    after_data = v_after_data_collected,
    entity_id = array_to_string(v_affected_asset_ids, ',')
  WHERE action_id = v_audit_id;
  
  -- Return result with audit_id and affected asset IDs
  v_result := jsonb_build_object(
    'action_id', v_audit_id,
    'affected_asset_ids', v_affected_asset_ids,
    'count', array_length(v_affected_asset_ids, 1)
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION bulk_update_assets_with_audit IS 'Bulk update/create assets with automatic before/after data collection in transaction. Includes business_distribution_area field.';

-- Function to bulk transfer areas
CREATE OR REPLACE FUNCTION bulk_transfer_areas_with_audit(
  p_old_assets jsonb, -- Array of old asset objects (to move to history)
  p_new_assets jsonb, -- Array of new asset objects (to create)
  p_action_type audit_action_type DEFAULT 'transfer_area',
  p_user_id text DEFAULT NULL, -- auth_user_id (UUID as text)
  p_before_data jsonb DEFAULT NULL,
  p_after_data jsonb DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_audit_id bigint;
  v_asset jsonb;
  v_asset_id bigint;
  v_building_number bigint;
  v_affected_asset_ids bigint[] := ARRAY[]::bigint[];
  v_result jsonb;
BEGIN
  -- Create audit entry first
  SELECT log_audit_entry(
    p_action_type,
    'bulk_asset',
    NULL::text,
    p_user_id,
    p_before_data,
    p_after_data,
    p_description
  ) INTO v_audit_id;
  
  -- First, move old assets to history and mark with action_id
  FOR v_asset IN SELECT * FROM jsonb_array_elements(p_old_assets)
  LOOP
    v_asset_id := (v_asset->>'asset_id')::bigint;
    v_building_number := (v_asset->>'building_number')::bigint;
    
    -- Copy to history
    INSERT INTO assets_history (
      building_number, payer_id, asset_id, measurement_date,
      main_asset_type, asset_size,
      sub_asset_type_1, sub_asset_size_1,
      sub_asset_type_2, sub_asset_size_2,
      sub_asset_type_3, sub_asset_size_3,
      sub_asset_type_4, sub_asset_size_4,
      sub_asset_type_5, sub_asset_size_5,
      sub_asset_type_6, sub_asset_size_6,
      structure_drawing_url, elevator, single_double_family,
      condo, townhouses, penthouse, tax_region,
      floor, discount_type, discount_date_from, discount_date_to,
      created_at, history_created_at, action_id, business_distribution_area, exported_to_automation
    )
    SELECT
      building_number, payer_id, asset_id, measurement_date,
      main_asset_type, asset_size,
      sub_asset_type_1, sub_asset_size_1,
      sub_asset_type_2, sub_asset_size_2,
      sub_asset_type_3, sub_asset_size_3,
      sub_asset_type_4, sub_asset_size_4,
      sub_asset_type_5, sub_asset_size_5,
      sub_asset_type_6, sub_asset_size_6,
      structure_drawing_url, elevator, single_double_family,
      condo, townhouses, penthouse, tax_region,
      floor, discount_type, discount_date_from, discount_date_to,
      created_at, now(), v_audit_id, business_distribution_area, exported_to_automation
    FROM assets
    WHERE asset_id = v_asset_id;
    
    -- Delete from assets table
    DELETE FROM assets WHERE asset_id = v_asset_id;
    
    -- Add to affected asset IDs
    v_affected_asset_ids := array_append(v_affected_asset_ids, v_asset_id);
    
    -- Update building total area
    IF v_building_number IS NOT NULL THEN
      PERFORM update_building_total_area(v_building_number);
    END IF;
  END LOOP;
  
  -- Then, create new assets
  FOR v_asset IN SELECT * FROM jsonb_array_elements(p_new_assets)
  LOOP
    v_asset_id := (v_asset->>'asset_id')::bigint;
    v_building_number := (v_asset->>'building_number')::bigint;
    
    INSERT INTO assets (
      building_number, payer_id, asset_id, measurement_date,
      main_asset_type, asset_size,
      sub_asset_type_1, sub_asset_size_1,
      sub_asset_type_2, sub_asset_size_2,
      sub_asset_type_3, sub_asset_size_3,
      sub_asset_type_4, sub_asset_size_4,
      sub_asset_type_5, sub_asset_size_5,
      sub_asset_type_6, sub_asset_size_6,
      structure_drawing_url, elevator, single_double_family,
      condo, townhouses, penthouse, tax_region,
      floor, discount_type, discount_date_from, discount_date_to,
      action_id, created_at, updated_at
    ) VALUES (
      (v_asset->>'building_number')::bigint,
      NULLIF(v_asset->>'payer_id', ''),
      v_asset_id,
      COALESCE(v_asset->>'measurement_date', '01/01/1900'),
      NULLIF(v_asset->>'main_asset_type', ''),
      COALESCE((v_asset->>'asset_size')::numeric, 0),
      NULLIF(v_asset->>'sub_asset_type_1', ''),
      COALESCE((v_asset->>'sub_asset_size_1')::numeric, 0),
      NULLIF(v_asset->>'sub_asset_type_2', ''),
      COALESCE((v_asset->>'sub_asset_size_2')::numeric, 0),
      NULLIF(v_asset->>'sub_asset_type_3', ''),
      COALESCE((v_asset->>'sub_asset_size_3')::numeric, 0),
      NULLIF(v_asset->>'sub_asset_type_4', ''),
      COALESCE((v_asset->>'sub_asset_size_4')::numeric, 0),
      NULLIF(v_asset->>'sub_asset_type_5', ''),
      COALESCE((v_asset->>'sub_asset_size_5')::numeric, 0),
      NULLIF(v_asset->>'sub_asset_type_6', ''),
      COALESCE((v_asset->>'sub_asset_size_6')::numeric, 0),
      NULLIF(v_asset->>'structure_drawing_url', ''),
      NULLIF(v_asset->>'elevator', ''),
      NULLIF(v_asset->>'single_double_family', ''),
      NULLIF(v_asset->>'condo', ''),
      NULLIF(v_asset->>'townhouses', ''),
      NULLIF(v_asset->>'penthouse', ''),
      (v_asset->>'tax_region')::integer,
      (v_asset->>'floor')::smallint,
      NULLIF(v_asset->>'discount_type', ''),
      NULLIF(v_asset->>'discount_date_from', ''),
      NULLIF(v_asset->>'discount_date_to', ''),
      v_audit_id,
      now(),
      now()
    );
    
    -- Add to affected asset IDs if not already added
    IF NOT (v_asset_id = ANY(v_affected_asset_ids)) THEN
      v_affected_asset_ids := array_append(v_affected_asset_ids, v_asset_id);
    END IF;
    
    -- Update building total area
    IF v_building_number IS NOT NULL THEN
      PERFORM update_building_total_area(v_building_number);
    END IF;
  END LOOP;
  
  -- Update audit entry with entity_id
  UPDATE audit
  SET entity_id = array_to_string(v_affected_asset_ids, ',')
  WHERE action_id = v_audit_id;
  
  -- Return result
  v_result := jsonb_build_object(
    'action_id', v_audit_id,
    'affected_asset_ids', v_affected_asset_ids,
    'count', array_length(v_affected_asset_ids, 1)
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION bulk_transfer_areas_with_audit IS 'Bulk transfer areas: move old assets to history and create new ones with a single audit entry and action_id';

-- ============================================================================
-- SCHEMA EXPORT FUNCTION
-- ============================================================================

-- Function to get tables, fields, types, functions, and triggers from public schema
CREATE OR REPLACE FUNCTION get_tables_fields_types()
RETURNS TABLE (
    table_name text,
    field_name text,
    field_type text
) AS $$
BEGIN
    -- Return tables/columns
    RETURN QUERY
    SELECT 
        c.table_name::text,
        c.column_name::text as field_name,
        CASE 
            WHEN c.character_maximum_length IS NOT NULL 
            THEN c.data_type || '(' || c.character_maximum_length || ')'
            WHEN c.numeric_precision IS NOT NULL AND c.numeric_scale IS NOT NULL
            THEN c.data_type || '(' || c.numeric_precision || ',' || c.numeric_scale || ')'
            WHEN c.numeric_precision IS NOT NULL
            THEN c.data_type || '(' || c.numeric_precision || ')'
            ELSE c.data_type
        END::text as field_type
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
    ORDER BY c.table_name, c.ordinal_position;
    
    -- Return functions (as rows with table_name='FUNCTION')
    RETURN QUERY
    SELECT 
        'FUNCTION'::text as table_name,
        (n.nspname || '.' || p.proname || '(' || 
         COALESCE(pg_get_function_arguments(p.oid), '') || ')')::text as field_name,
        pg_get_functiondef(p.oid)::text as field_type
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')
    ORDER BY p.proname;
    
    -- Return triggers (as rows with table_name='TRIGGER')
    RETURN QUERY
    SELECT 
        'TRIGGER'::text as table_name,
        (n.nspname || '.' || t.tgname || ' ON ' || c.relname)::text as field_name,
        pg_get_triggerdef(t.oid)::text as field_type
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND NOT t.tgisinternal
    ORDER BY c.relname, t.tgname;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_tables_fields_types IS 'Returns all tables/columns, functions, and triggers from the public schema for schema export';

-- Function to update asset type and reset distribution flags if needed (in transaction)
CREATE OR REPLACE FUNCTION update_asset_type_with_distribution_reset(
  p_id bigint,
  p_updates jsonb
)
RETURNS jsonb AS $$
DECLARE
  v_before_data jsonb;
  v_after_data jsonb;
  v_asset_type_name text;
  v_old_non_accountable_for_distribution boolean;
  v_new_non_accountable_for_distribution boolean;
  v_affected_buildings bigint[];
  v_building_number bigint;
BEGIN
  -- Get before data
  SELECT row_to_json(at.*)::jsonb INTO v_before_data
  FROM asset_types at
  WHERE at.id = p_id;
  
  IF v_before_data IS NULL THEN
    RAISE EXCEPTION 'Asset type with id % not found', p_id;
  END IF;
  
  v_asset_type_name := v_before_data->>'name';
  v_old_non_accountable_for_distribution := COALESCE((v_before_data->>'non_accountable_for_distribution')::boolean, false);
  
  -- Check if non_accountable_for_distribution is being changed
  IF p_updates ? 'non_accountable_for_distribution' THEN
    v_new_non_accountable_for_distribution := COALESCE((p_updates->>'non_accountable_for_distribution')::boolean, false);
    
    -- Update the asset type
    UPDATE asset_types
    SET 
      name = COALESCE((p_updates->>'name')::text, name),
      description = COALESCE((p_updates->>'description')::text, description),
      tax_region = CASE WHEN p_updates ? 'tax_region' THEN (p_updates->>'tax_region')::integer ELSE tax_region END,
      elevator = CASE WHEN p_updates ? 'elevator' THEN (p_updates->>'elevator')::text ELSE elevator END,
      single_double_family = CASE WHEN p_updates ? 'single_double_family' THEN (p_updates->>'single_double_family')::text ELSE single_double_family END,
      penthouse = CASE WHEN p_updates ? 'penthouse' THEN (p_updates->>'penthouse')::text ELSE penthouse END,
      condo = CASE WHEN p_updates ? 'condo' THEN (p_updates->>'condo')::text ELSE condo END,
      townhouses = CASE WHEN p_updates ? 'townhouses' THEN (p_updates->>'townhouses')::text ELSE townhouses END,
      business_residence = CASE WHEN p_updates ? 'business_residence' THEN (p_updates->>'business_residence')::text ELSE business_residence END,
      shared_area_usage = CASE WHEN p_updates ? 'shared_area_usage' THEN (p_updates->>'shared_area_usage')::text ELSE shared_area_usage END,
      non_accountable_for_total_area = COALESCE((p_updates->>'non_accountable_for_total_area')::boolean, non_accountable_for_total_area),
      non_accountable_for_distribution = v_new_non_accountable_for_distribution,
      min_size = CASE WHEN p_updates ? 'min_size' THEN (p_updates->>'min_size')::numeric ELSE min_size END,
      max_size = CASE WHEN p_updates ? 'max_size' THEN (p_updates->>'max_size')::numeric ELSE max_size END,
      active = COALESCE((p_updates->>'active')::text, active),
      area_description_for_tab = CASE WHEN p_updates ? 'area_description_for_tab' THEN (p_updates->>'area_description_for_tab')::text ELSE area_description_for_tab END,
      updated_at = now()
    WHERE id = p_id;
    
    -- Get after data
    SELECT row_to_json(at.*)::jsonb INTO v_after_data
    FROM asset_types at
    WHERE at.id = p_id;
    
    -- If non_accountable_for_distribution changed, reset flags for affected buildings
    IF v_old_non_accountable_for_distribution IS DISTINCT FROM v_new_non_accountable_for_distribution THEN
      -- Find all buildings with assets of this type
      SELECT ARRAY_AGG(DISTINCT building_number) INTO v_affected_buildings
      FROM assets
      WHERE main_asset_type = v_asset_type_name
        AND building_number IS NOT NULL;
      
      -- Reset business_shared_area_distributed flag for all affected buildings
      IF v_affected_buildings IS NOT NULL AND array_length(v_affected_buildings, 1) > 0 THEN
        UPDATE buildings
        SET business_shared_area_distributed = false
        WHERE building_number = ANY(v_affected_buildings);
      END IF;
    END IF;
  ELSE
    -- Update without checking distribution flag (field not changed)
    UPDATE asset_types
    SET 
      name = COALESCE((p_updates->>'name')::text, name),
      description = COALESCE((p_updates->>'description')::text, description),
      tax_region = CASE WHEN p_updates ? 'tax_region' THEN (p_updates->>'tax_region')::integer ELSE tax_region END,
      elevator = CASE WHEN p_updates ? 'elevator' THEN (p_updates->>'elevator')::text ELSE elevator END,
      single_double_family = CASE WHEN p_updates ? 'single_double_family' THEN (p_updates->>'single_double_family')::text ELSE single_double_family END,
      penthouse = CASE WHEN p_updates ? 'penthouse' THEN (p_updates->>'penthouse')::text ELSE penthouse END,
      condo = CASE WHEN p_updates ? 'condo' THEN (p_updates->>'condo')::text ELSE condo END,
      townhouses = CASE WHEN p_updates ? 'townhouses' THEN (p_updates->>'townhouses')::text ELSE townhouses END,
      business_residence = CASE WHEN p_updates ? 'business_residence' THEN (p_updates->>'business_residence')::text ELSE business_residence END,
      shared_area_usage = CASE WHEN p_updates ? 'shared_area_usage' THEN (p_updates->>'shared_area_usage')::text ELSE shared_area_usage END,
      non_accountable_for_total_area = CASE WHEN p_updates ? 'non_accountable_for_total_area' THEN (p_updates->>'non_accountable_for_total_area')::boolean ELSE non_accountable_for_total_area END,
      min_size = CASE WHEN p_updates ? 'min_size' THEN (p_updates->>'min_size')::numeric ELSE min_size END,
      max_size = CASE WHEN p_updates ? 'max_size' THEN (p_updates->>'max_size')::numeric ELSE max_size END,
      active = COALESCE((p_updates->>'active')::text, active),
      area_description_for_tab = CASE WHEN p_updates ? 'area_description_for_tab' THEN (p_updates->>'area_description_for_tab')::text ELSE area_description_for_tab END,
      updated_at = now()
    WHERE id = p_id;
    
    -- Get after data
    SELECT row_to_json(at.*)::jsonb INTO v_after_data
    FROM asset_types at
    WHERE at.id = p_id;
  END IF;
  
  -- Return result with before/after data and affected buildings
  RETURN jsonb_build_object(
    'before_data', v_before_data,
    'after_data', v_after_data,
    'affected_buildings', COALESCE(v_affected_buildings, ARRAY[]::bigint[]),
    'distribution_flags_reset', CASE WHEN v_affected_buildings IS NOT NULL AND array_length(v_affected_buildings, 1) > 0 THEN true ELSE false END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_asset_type_with_distribution_reset IS 'Update asset type and reset business distribution flags for affected buildings if non_accountable_for_distribution changed. All in a single transaction.';

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

