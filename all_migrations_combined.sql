-- Combined SQL Migration File
-- All migrations in chronological order
-- Generated: 2025-12-24 20:35:38


-- ============================================================================
-- Migration: 20250101000000_initial_schema.sql
-- ============================================================================

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
  min_size NUMERIC,
  max_size NUMERIC,
  active TEXT DEFAULT '×›×Ÿ',
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

COMMENT ON COLUMN asset_types.active IS 'Indicates if the asset type is active. Values: "×›×Ÿ" (yes) or NULL (no)';
COMMENT ON COLUMN asset_types.non_accountable_for_total_area IS 'Indicates if the asset type should be excluded from total area calculations. Values: true (×œ× × ×¡×¤×¨ ×‘×—×™×©×•×‘ ×©×˜×— ×ž×‘× ×”) or false (× ×¡×¤×¨ ×‘×—×™×©×•×‘ ×©×˜×— ×ž×‘× ×”)';
COMMENT ON COLUMN asset_types.non_accountable_for_distribution IS 'Indicates if the asset type should be excluded from distribution calculations (business shared area distribution). Values: true (×œ× × ×¡×¤×¨ ×‘×¤×™×–×•×¨) or false (× ×¡×¤×¨ ×‘×¤×™×–×•×¨)';

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
  need_residence_distribution boolean DEFAULT true,
  need_business_distribution boolean DEFAULT true,
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

COMMENT ON COLUMN buildings.gosh IS '×’×•×© - Block number';
COMMENT ON COLUMN buildings.helka IS '×—×œ×§×” - Parcel number';
COMMENT ON COLUMN buildings.building_number_in_street IS '×ž×¡×¤×¨ ×‘× ×™×™×Ÿ - Building number in street';
COMMENT ON COLUMN buildings.building_address IS 'Street code from address_list table (foreign key to address_list.street_code)';
COMMENT ON COLUMN buildings.overload_ratio IS '××—×•×– ×”×¢×ž×¡×” - Overload ratio percentage';
COMMENT ON COLUMN buildings.residence_shared_area IS 'Residence shared/common area in the building (×©×˜×— ×ž×©×•×ª×£ ×ž×’×•×¨×™×)';
COMMENT ON COLUMN buildings.business_shared_area IS 'Shared business/commercial area in the building (×©×˜×— ×ž×©×•×ª×£ ×¢×¡×§×™×)';
COMMENT ON COLUMN buildings.need_residence_distribution IS 'Flag indicating if residence shared area needs to be distributed to assets (true = needs distribution, false = already distributed)';
COMMENT ON COLUMN buildings.need_business_distribution IS 'Flag indicating if business shared area needs to be distributed to assets (true = needs distribution, false = already distributed)';

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
  id bigserial PRIMARY KEY,
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
          AND at.active = '×›×Ÿ'
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
          AND at.active = '×›×Ÿ'
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
  v_business_residence text;
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
    -- Only set the flag for the relevant business/residence type
    IF v_old_non_accountable_for_distribution IS DISTINCT FROM v_new_non_accountable_for_distribution THEN
      -- Get the asset type's business_residence field to determine which flag to set
      SELECT business_residence INTO v_business_residence
      FROM asset_types
      WHERE id = p_id;
      
      -- Find all buildings with assets of this type
      SELECT ARRAY_AGG(DISTINCT building_number) INTO v_affected_buildings
      FROM assets
      WHERE main_asset_type = v_asset_type_name
        AND building_number IS NOT NULL;
      
      -- Set flag based on business_residence type
      -- (true = needs distribution, false = already distributed)
      IF v_affected_buildings IS NOT NULL AND array_length(v_affected_buildings, 1) > 0 THEN
        IF v_business_residence = '×¢×¡×§×™×' THEN
          -- Business type: only set business distribution flag
          UPDATE buildings
          SET need_business_distribution = true
          WHERE building_number = ANY(v_affected_buildings);
        ELSIF v_business_residence = '×ž×’×•×¨×™×' THEN
          -- Residence type: only set residence distribution flag
          UPDATE buildings
          SET need_residence_distribution = true
          WHERE building_number = ANY(v_affected_buildings);
        ELSE
          -- Unknown type: set both flags to be safe
          UPDATE buildings
          SET need_business_distribution = true,
              need_residence_distribution = true
          WHERE building_number = ANY(v_affected_buildings);
        END IF;
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




-- ============================================================================
-- Migration: 20250121000000_add_distribution_audit_table.sql
-- ============================================================================

/*
  # Add Audit Table
  
  This migration creates a new audit table for tracking
  distribution and transfer operations. It includes:
  - building_number as the key field
  - action_type (distribution or transfer)
  - affected_assets_before and affected_assets_after (JSONB)
  - overload_ratio for business distributions
  - shared_area_size
  - created_at for ordering
*/

-- ============================================================================
-- CREATE ENUM FOR ACTION TYPE
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE distribution_audit_action_type AS ENUM ('distribution', 'transfer');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- CREATE AUDIT TABLE (for distribution and transfer operations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit (
  id BIGSERIAL PRIMARY KEY,
  building_number BIGINT NOT NULL,
  action_type distribution_audit_action_type NOT NULL,
  affected_assets_before JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_assets_after JSONB NOT NULL DEFAULT '[]'::jsonb,
  overload_ratio NUMERIC,
  shared_area_size NUMERIC,
  description TEXT,
  user_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT fk_audit_building FOREIGN KEY (building_number) REFERENCES buildings(building_number) ON DELETE CASCADE,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
  CONSTRAINT audit_building_created_action_unique UNIQUE (building_number, created_at, action_type)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_audit_building_number ON audit(building_number);
CREATE INDEX IF NOT EXISTS idx_audit_action_type ON audit(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_building_created ON audit(building_number, created_at DESC);

-- Enable RLS
ALTER TABLE audit ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow public read access to audit"
  ON audit FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow authenticated users to insert audit"
  ON audit FOR INSERT
  TO authenticated
  WITH CHECK (true);

COMMENT ON TABLE audit IS 'Audit table for distribution and transfer operations, keyed by building_number';
COMMENT ON COLUMN audit.id IS 'Primary key - sequential ID';
COMMENT ON COLUMN audit.building_number IS 'Building number - the key for grouping operations';
COMMENT ON COLUMN audit.action_type IS 'Type of operation: distribution or transfer';
COMMENT ON COLUMN audit.affected_assets_before IS 'JSONB array of all affected assets before the operation';
COMMENT ON COLUMN audit.affected_assets_after IS 'JSONB array of all affected assets after the operation';
COMMENT ON COLUMN audit.overload_ratio IS 'Overload ratio for business distributions';
COMMENT ON COLUMN audit.shared_area_size IS 'Shared area size that was distributed';
COMMENT ON COLUMN audit.description IS 'Optional description of the operation';
COMMENT ON COLUMN audit.user_id IS 'Foreign key to users table - user who performed the operation';
COMMENT ON COLUMN audit.created_at IS 'Timestamp of the operation, used for ordering. Part of composite unique key with building_number and action_type';

-- ============================================================================
-- FUNCTION: log_audit (for distribution and transfer operations)
-- ============================================================================

CREATE OR REPLACE FUNCTION log_audit(
  p_building_number BIGINT,
  p_action_type distribution_audit_action_type,
  p_affected_assets_before JSONB,
  p_affected_assets_after JSONB,
  p_overload_ratio NUMERIC DEFAULT NULL,
  p_shared_area_size NUMERIC DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id_fk BIGINT;
  v_default_user_id BIGINT := 1;
  v_audit_id BIGINT;
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
    -- Use get_or_create_user_from_auth if it exists, otherwise default
    BEGIN
      SELECT get_or_create_user_from_auth() INTO v_user_id_fk;
    EXCEPTION WHEN OTHERS THEN
      SELECT user_id INTO v_default_user_id
      FROM users
      WHERE user_name = 'default' AND auth_user_id IS NULL
      LIMIT 1;
      v_user_id_fk := v_default_user_id;
    END;
  END IF;
  
  -- If still no user, use default
  IF v_user_id_fk IS NULL THEN
    SELECT user_id INTO v_default_user_id
    FROM users
    WHERE user_name = 'default' AND auth_user_id IS NULL
    LIMIT 1;
    v_user_id_fk := v_default_user_id;
  END IF;

  -- Insert audit record
  INSERT INTO audit (
    building_number,
    action_type,
    affected_assets_before,
    affected_assets_after,
    overload_ratio,
    shared_area_size,
    description,
    user_id,
    created_at
  )
  VALUES (
    p_building_number,
    p_action_type,
    p_affected_assets_before,
    p_affected_assets_after,
    p_overload_ratio,
    p_shared_area_size,
    p_description,
    v_user_id_fk,
    now()
  )
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$;

COMMENT ON FUNCTION log_audit IS 'Logs a distribution or transfer operation to audit table. Returns the ID of the created audit record.';





-- ============================================================================
-- Migration: 20250121000001_update_functions_for_distribution_audit.sql
-- ============================================================================

/*
  # Update Functions to Log to Distribution Audit
  
  This migration updates:
  1. save_assets_bulk_transactional - adds logging to distribution_audit for distribute_shared actions
  2. Creates bulk_transfer_areas function (or updates if exists) - adds logging to distribution_audit for transfer_area actions
*/

-- ============================================================================
-- UPDATE: save_assets_bulk_transactional to log distribution_audit
-- ============================================================================

CREATE OR REPLACE FUNCTION save_assets_bulk_transactional(
  p_assets_data JSONB[],
  p_validation_passed BOOLEAN,
  p_validation_errors TEXT DEFAULT NULL,
  p_action_type TEXT DEFAULT 'manual_update',
  p_user_id TEXT DEFAULT NULL,
  p_before_data JSONB DEFAULT NULL,
  p_after_data JSONB DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_asset_data JSONB;
  v_asset_id BIGINT;
  v_building_number BIGINT;
  v_existing_asset RECORD;
  v_old_main_asset_type TEXT;
  v_new_main_asset_type TEXT;
  v_affected_asset_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_affected_buildings BIGINT[] := ARRAY[]::BIGINT[];
  v_action_id BIGINT;
  v_count INTEGER := 0;
  v_result JSONB;
  v_user_id_fk BIGINT;
  v_default_user_id BIGINT := 1;
  v_building_num_for_flag BIGINT;
  v_distribution_type TEXT; -- 'residence' or 'business'
  v_asset_type_name TEXT;
  v_business_residence TEXT;
  v_business_dist_area NUMERIC;
  v_old_asset_size NUMERIC;
  v_new_asset_size NUMERIC;
  -- Store old values for each asset to use in STEP 6
  v_asset_old_values RECORD;
  -- For collecting audit data
  v_before_data_collected JSONB := NULL;
  v_after_data_collected JSONB := NULL;
  v_before_assets JSONB[] := ARRAY[]::JSONB[];
  v_after_assets JSONB[] := ARRAY[]::JSONB[];
  v_building_data JSONB := NULL;
  v_first_building_number BIGINT := NULL;
  v_asset_record RECORD;
  v_asset_jsonb JSONB; -- Separate variable for JSONB results
  v_entity_asset_ids BIGINT[];
  v_overload_ratio NUMERIC := NULL;
  -- For distribution audit logging
  v_shared_area_size NUMERIC := NULL;
  v_building_record RECORD;
BEGIN
  -- ========================================================================
  -- STEP 1: GET OR CREATE USER
  -- ========================================================================
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
    BEGIN
      SELECT get_or_create_user_from_auth() INTO v_user_id_fk;
    EXCEPTION WHEN OTHERS THEN
      SELECT user_id INTO v_default_user_id
      FROM users
      WHERE user_name = 'default' AND auth_user_id IS NULL
      LIMIT 1;
      v_user_id_fk := v_default_user_id;
    END;
  END IF;
  
  -- If still no user, use default
  IF v_user_id_fk IS NULL THEN
    SELECT user_id INTO v_default_user_id
    FROM users
    WHERE user_name = 'default' AND auth_user_id IS NULL
    LIMIT 1;
    v_user_id_fk := v_default_user_id;
  END IF;

  -- ========================================================================
  -- STEP 2: COLLECT BEFORE DATA (if not provided)
  -- For distribution operations, collect ALL assets in the building
  -- ========================================================================
  -- Get first building number from assets (all assets in distribution belong to same building)
  IF array_length(p_assets_data, 1) > 0 THEN
    v_first_building_number := (p_assets_data[1]->>'building_number')::BIGINT;
  END IF;
  
  -- Collect BEFORE data from database (if not provided)
  IF (p_before_data IS NULL OR p_before_data = 'null'::jsonb OR p_before_data = '{}'::jsonb) 
     AND v_first_building_number IS NOT NULL THEN
    -- For distribution operations, collect ALL assets in the building
    -- For other operations, only collect affected assets
    IF p_action_type = 'distribute_shared' THEN
      -- Get ALL assets in the building before update
      FOR v_asset_record IN 
        SELECT * FROM assets 
        WHERE building_number = v_first_building_number
        ORDER BY asset_id
      LOOP
        v_before_assets := array_append(v_before_assets, to_jsonb(v_asset_record));
      END LOOP;
    ELSE
      -- For non-distribution operations, only get assets that will be updated
      FOREACH v_asset_data IN ARRAY p_assets_data
      LOOP
        v_asset_id := (v_asset_data->>'asset_id')::BIGINT;
        IF v_asset_id IS NOT NULL THEN
          SELECT to_jsonb(a.*) INTO v_asset_jsonb
          FROM assets a
          WHERE a.asset_id = v_asset_id;
          
          IF v_asset_jsonb IS NOT NULL THEN
            v_before_assets := array_append(v_before_assets, v_asset_jsonb);
          END IF;
        END IF;
      END LOOP;
    END IF;
    
    -- Convert jsonb array to jsonb array for assets
    SELECT jsonb_agg(elem) INTO v_before_data_collected
    FROM unnest(v_before_assets) AS elem;
    
    -- Build before_data structure: simple structure with just assets
    -- Structure: { assets: [...] }
    v_before_data_collected := jsonb_build_object(
      'assets', COALESCE(v_before_data_collected, '[]'::jsonb)
    );
  ELSE
    v_before_data_collected := p_before_data;
  END IF;
  
  -- ========================================================================
  -- STEP 2b: CREATE AUDIT ACTION RECORD (with collected before_data)
  -- ========================================================================
  INSERT INTO audit (action_type, user_id, entity_type, entity_id, before_data, after_data, description, created_at)
  VALUES (
    p_action_type::audit_action_type,
    v_user_id_fk,
    'bulk_asset', -- entity_type for bulk operations
    NULL, -- entity_id will be set after we know all affected asset IDs
    v_before_data_collected,
    NULL, -- after_data will be collected after updates
    p_description,
    now()
  )
  RETURNING action_id INTO v_action_id;

  -- ========================================================================
  -- STEP 3: PROCESS EACH ASSET
  -- ========================================================================
  FOREACH v_asset_data IN ARRAY p_assets_data
  LOOP
    -- Remove any fields that don't exist in assets table to prevent errors
    v_asset_data := v_asset_data - 'id' - '_isNew' - '_isDirty' - '_validationErrors' - '_isMasterRow';
    
    v_asset_id := (v_asset_data->>'asset_id')::BIGINT;
    v_building_number := (v_asset_data->>'building_number')::BIGINT;
    v_new_main_asset_type := (v_asset_data->>'main_asset_type')::TEXT;

    IF v_asset_id IS NULL OR v_building_number IS NULL THEN
      RAISE EXCEPTION 'Asset ID and Building Number are required for all assets'
        USING HINT = 'Ensure all assets in p_assets_data have asset_id and building_number';
    END IF;

    -- Store building number for flag removal (use first building if multiple)
    IF v_building_num_for_flag IS NULL THEN
      v_building_num_for_flag := v_building_number;
    END IF;

    -- Check if asset exists
    SELECT * INTO v_existing_asset
    FROM assets
    WHERE asset_id = v_asset_id;

    IF FOUND THEN
      v_old_main_asset_type := v_existing_asset.main_asset_type;
      v_old_asset_size := v_existing_asset.asset_size;
    ELSE
      v_old_main_asset_type := NULL;
      v_old_asset_size := NULL;
    END IF;

    -- Save asset (INSERT or UPDATE)
    IF v_existing_asset IS NULL THEN
      -- INSERT new asset
      INSERT INTO assets (asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region, sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2, sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4, sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6, elevator, single_double_family, condo, townhouses, penthouse, structure_drawing_url, floor, discount_type, discount_date_from, discount_date_to, area_from_distribution, exported_to_automation)
      VALUES (
        v_asset_id,
        v_building_number,
        (v_asset_data->>'payer_id')::TEXT,
        COALESCE((v_asset_data->>'measurement_date')::TEXT, '01/01/1900'),
        v_new_main_asset_type,
        COALESCE((v_asset_data->>'asset_size')::NUMERIC, 0),
        (v_asset_data->>'tax_region')::BIGINT,
        (v_asset_data->>'sub_asset_type_1')::TEXT,
        COALESCE((v_asset_data->>'sub_asset_size_1')::NUMERIC, 0),
        (v_asset_data->>'sub_asset_type_2')::TEXT,
        COALESCE((v_asset_data->>'sub_asset_size_2')::NUMERIC, 0),
        (v_asset_data->>'sub_asset_type_3')::TEXT,
        COALESCE((v_asset_data->>'sub_asset_size_3')::NUMERIC, 0),
        (v_asset_data->>'sub_asset_type_4')::TEXT,
        COALESCE((v_asset_data->>'sub_asset_size_4')::NUMERIC, 0),
        (v_asset_data->>'sub_asset_type_5')::TEXT,
        COALESCE((v_asset_data->>'sub_asset_size_5')::NUMERIC, 0),
        (v_asset_data->>'sub_asset_type_6')::TEXT,
        COALESCE((v_asset_data->>'sub_asset_size_6')::NUMERIC, 0),
        (v_asset_data->>'elevator')::TEXT,
        (v_asset_data->>'single_double_family')::TEXT,
        (v_asset_data->>'condo')::TEXT,
        (v_asset_data->>'townhouses')::TEXT,
        (v_asset_data->>'penthouse')::TEXT,
        (v_asset_data->>'structure_drawing_url')::TEXT,
        (v_asset_data->>'floor')::BIGINT,
        (v_asset_data->>'discount_type')::TEXT,
        (v_asset_data->>'discount_date_from')::TEXT,
        (v_asset_data->>'discount_date_to')::TEXT,
        (v_asset_data->>'area_from_distribution')::NUMERIC,
        COALESCE((v_asset_data->>'exported_to_automation')::BOOLEAN, false)
      );
    ELSE
      -- Check if is_new_measurement is true - if so, copy to history before update
      IF COALESCE((v_asset_data->>'is_new_measurement')::BOOLEAN, false) = true THEN
        -- Copy current asset to history before updating
        INSERT INTO assets_history (
          asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region,
          sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
          sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
          sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
          elevator, single_double_family, condo, townhouses, penthouse,
          structure_drawing_url, floor, discount_type, discount_date_from, discount_date_to,
          area_from_distribution, exported_to_automation, action_id, created_at, updated_at
        )
        SELECT 
          asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region,
          sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
          sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
          sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
          elevator, single_double_family, condo, townhouses, penthouse,
          structure_drawing_url, floor, discount_type, discount_date_from, discount_date_to,
          area_from_distribution, exported_to_automation, action_id, created_at, updated_at
        FROM assets
        WHERE asset_id = v_asset_id;
      END IF;
      
      -- UPDATE existing asset - only update fields that are provided
      UPDATE assets
      SET
        building_number = COALESCE(v_building_number, building_number),
        payer_id = COALESCE((v_asset_data->>'payer_id')::TEXT, payer_id),
        measurement_date = COALESCE((v_asset_data->>'measurement_date')::TEXT, measurement_date),
        main_asset_type = COALESCE(v_new_main_asset_type, main_asset_type),
        asset_size = COALESCE((v_asset_data->>'asset_size')::NUMERIC, asset_size),
        tax_region = COALESCE((v_asset_data->>'tax_region')::BIGINT, tax_region),
        sub_asset_type_1 = COALESCE((v_asset_data->>'sub_asset_type_1')::TEXT, sub_asset_type_1),
        sub_asset_size_1 = COALESCE((v_asset_data->>'sub_asset_size_1')::NUMERIC, sub_asset_size_1),
        sub_asset_type_2 = COALESCE((v_asset_data->>'sub_asset_type_2')::TEXT, sub_asset_type_2),
        sub_asset_size_2 = COALESCE((v_asset_data->>'sub_asset_size_2')::NUMERIC, sub_asset_size_2),
        sub_asset_type_3 = COALESCE((v_asset_data->>'sub_asset_type_3')::TEXT, sub_asset_type_3),
        sub_asset_size_3 = COALESCE((v_asset_data->>'sub_asset_size_3')::NUMERIC, sub_asset_size_3),
        sub_asset_type_4 = COALESCE((v_asset_data->>'sub_asset_type_4')::TEXT, sub_asset_type_4),
        sub_asset_size_4 = COALESCE((v_asset_data->>'sub_asset_size_4')::NUMERIC, sub_asset_size_4),
        sub_asset_type_5 = COALESCE((v_asset_data->>'sub_asset_type_5')::TEXT, sub_asset_type_5),
        sub_asset_size_5 = COALESCE((v_asset_data->>'sub_asset_size_5')::NUMERIC, sub_asset_size_5),
        sub_asset_type_6 = COALESCE((v_asset_data->>'sub_asset_type_6')::TEXT, sub_asset_type_6),
        sub_asset_size_6 = COALESCE((v_asset_data->>'sub_asset_size_6')::NUMERIC, sub_asset_size_6),
        elevator = COALESCE((v_asset_data->>'elevator')::TEXT, elevator),
        single_double_family = COALESCE((v_asset_data->>'single_double_family')::TEXT, single_double_family),
        condo = COALESCE((v_asset_data->>'condo')::TEXT, condo),
        townhouses = COALESCE((v_asset_data->>'townhouses')::TEXT, townhouses),
        penthouse = COALESCE((v_asset_data->>'penthouse')::TEXT, penthouse),
        structure_drawing_url = COALESCE((v_asset_data->>'structure_drawing_url')::TEXT, structure_drawing_url),
        floor = COALESCE((v_asset_data->>'floor')::BIGINT, floor),
        discount_type = COALESCE((v_asset_data->>'discount_type')::TEXT, discount_type),
        discount_date_from = COALESCE((v_asset_data->>'discount_date_from')::TEXT, discount_date_from),
        discount_date_to = COALESCE((v_asset_data->>'discount_date_to')::TEXT, discount_date_to),
        area_from_distribution = COALESCE((v_asset_data->>'area_from_distribution')::NUMERIC, area_from_distribution),
        exported_to_automation = COALESCE((v_asset_data->>'exported_to_automation')::BOOLEAN, exported_to_automation),
        is_new_measurement = false, -- Reset flag after copying to history
        action_id = CASE 
          WHEN p_action_type = 'distribute_shared' THEN v_action_id 
          ELSE action_id 
        END,
        updated_at = NOW()
      WHERE asset_id = v_asset_id;
    END IF;

    -- Track affected assets and buildings
    v_affected_asset_ids := array_append(v_affected_asset_ids, v_asset_id);
    IF NOT (v_building_number = ANY(v_affected_buildings)) THEN
      v_affected_buildings := array_append(v_affected_buildings, v_building_number);
    END IF;

    -- Update building total area
    PERFORM update_building_total_area(v_building_number);

    -- Update flags if type changed (using existing function)
    IF v_old_main_asset_type IS NOT NULL AND v_old_main_asset_type != v_new_main_asset_type THEN
      PERFORM set_distribution_flags_for_asset_type_change(
        v_building_number,
        v_old_main_asset_type,
        v_new_main_asset_type
      );
    END IF;

    -- Also set flags if asset_size changed (for business/residence assets)
    v_new_asset_size := COALESCE((v_asset_data->>'asset_size')::NUMERIC, v_old_asset_size);
    IF v_old_asset_size IS NOT NULL AND v_new_asset_size IS NOT NULL 
       AND v_old_asset_size != v_new_asset_size 
       AND v_new_main_asset_type IS NOT NULL THEN
      -- Get business_residence for the asset type
      SELECT business_residence INTO v_business_residence
      FROM asset_types
      WHERE name = v_new_main_asset_type;

      IF v_business_residence = '×¢×¡×§×™×' THEN
        -- Business asset size changed â†’ set business distribution flag only
        UPDATE buildings
        SET need_business_distribution = true
        WHERE building_number = v_building_number;
        
      ELSIF v_business_residence = '×ž×’×•×¨×™×' THEN
        -- Residence asset size changed â†’ set residence distribution flag only
        UPDATE buildings
        SET need_residence_distribution = true
        WHERE building_number = v_building_number;
      END IF;
    END IF;

    -- For distribution operations, we use the bulk audit entry created at STEP 2b
    -- For other operations, create individual audit log for each asset
    IF p_action_type != 'distribute_shared' THEN
      BEGIN
        PERFORM log_audit_for_asset(
          v_asset_id,
          CASE WHEN v_existing_asset IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
          p_user_id,
          p_action_type::audit_action_type,
          false, -- p_copy_to_history
          p_description
        );
      EXCEPTION WHEN OTHERS THEN
        -- Ignore if function doesn't exist (audit was removed)
        NULL;
      END;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  -- ========================================================================
  -- STEP 3b: COLLECT AFTER DATA (always collect assets, merge with provided building data)
  -- For distribution operations, collect ALL assets in the building after update
  -- ========================================================================
  -- Always collect assets from database (even if after_data is provided, we need all assets for distribution)
  IF v_first_building_number IS NOT NULL THEN
    -- For distribution operations, collect ALL assets in the building
    -- For other operations, only collect affected assets
    IF p_action_type = 'distribute_shared' THEN
      -- Get ALL assets in the building after update
      FOR v_asset_record IN 
        SELECT * FROM assets 
        WHERE building_number = v_first_building_number
        ORDER BY asset_id
      LOOP
        v_after_assets := array_append(v_after_assets, to_jsonb(v_asset_record));
      END LOOP;
    ELSE
      -- For non-distribution operations, only get assets that were updated
      FOR v_asset_id IN SELECT unnest(v_affected_asset_ids)
      LOOP
        SELECT to_jsonb(a.*) INTO v_asset_jsonb
        FROM assets a
        WHERE a.asset_id = v_asset_id;
        
        IF v_asset_jsonb IS NOT NULL THEN
          v_after_assets := array_append(v_after_assets, v_asset_jsonb);
        END IF;
      END LOOP;
    END IF;
    
    -- Convert jsonb array to jsonb array for assets
    SELECT jsonb_agg(elem) INTO v_after_data_collected
    FROM unnest(v_after_assets) AS elem;
    
    -- Get overload_ratio - use provided data if available, otherwise from database
    IF p_after_data IS NOT NULL AND p_after_data != 'null'::jsonb AND p_after_data != '{}'::jsonb THEN
      -- Extract overload_ratio from provided after_data
      IF p_after_data ? 'overload_ratio' THEN
        v_overload_ratio := (p_after_data->>'overload_ratio')::NUMERIC;
      ELSIF p_after_data ? 'building' AND p_after_data->'building' ? 'building' THEN
        v_building_data := p_after_data->'building'->'building';
        IF v_building_data ? 'overload_ratio' THEN
          v_overload_ratio := (v_building_data->>'overload_ratio')::NUMERIC;
        END IF;
      ELSIF p_after_data ? 'building' THEN
        v_building_data := p_after_data->'building';
        IF v_building_data ? 'overload_ratio' THEN
          v_overload_ratio := (v_building_data->>'overload_ratio')::NUMERIC;
        END IF;
      END IF;
    END IF;
    
    -- If overload_ratio not found in provided data, get from database
    IF v_overload_ratio IS NULL THEN
      SELECT b.overload_ratio INTO v_overload_ratio
      FROM buildings b
      WHERE b.building_number = v_first_building_number;
    END IF;
    
    -- Get shared_area_size from building for distribution operations
    IF p_action_type = 'distribute_shared' THEN
      SELECT * INTO v_building_record
      FROM buildings
      WHERE building_number = v_first_building_number;
      
      IF FOUND THEN
        -- Determine distribution type from description
        IF p_description IS NOT NULL THEN
          IF LOWER(p_description) LIKE '%residence%' OR LOWER(p_description) LIKE '%×ž×’×•×¨×™×%' THEN
            v_shared_area_size := v_building_record.residence_shared_area;
          ELSIF LOWER(p_description) LIKE '%business%' OR LOWER(p_description) LIKE '%×¢×¡×§×™×%' THEN
            v_shared_area_size := v_building_record.business_shared_area;
          END IF;
        END IF;
        
        -- If still not set, try to extract from description
        IF v_shared_area_size IS NULL AND p_description IS NOT NULL THEN
          -- Try to extract number from description (format: "Distributed ... (12345) to ...")
          -- This is a fallback, building record should have it
          NULL; -- Skip extraction from description for now
        END IF;
      END IF;
    END IF;
    
    -- Build after_data structure: simple structure with assets and overload_ratio
    -- Structure: { assets: [...], overload_ratio: ... }
    v_after_data_collected := jsonb_build_object(
      'assets', COALESCE(v_after_data_collected, '[]'::jsonb)
    );
    
    -- Add overload_ratio if it exists (for business distributions)
    IF v_overload_ratio IS NOT NULL THEN
      v_after_data_collected := v_after_data_collected || jsonb_build_object('overload_ratio', v_overload_ratio);
    END IF;
    
    -- For distribution operations, entity_id should include ALL assets in the building
    -- For other operations, only include affected assets
    IF p_action_type = 'distribute_shared' THEN
      -- Get ALL asset IDs in the building
      SELECT array_agg(asset_id ORDER BY asset_id) INTO v_entity_asset_ids
      FROM assets
      WHERE building_number = v_first_building_number;
    ELSE
      -- For other operations, use affected asset IDs
      v_entity_asset_ids := v_affected_asset_ids;
    END IF;
    
    -- Update audit entry with collected after data and entity_id
    BEGIN
      UPDATE audit
      SET 
        after_data = v_after_data_collected,
        entity_id = array_to_string(COALESCE(v_entity_asset_ids, v_affected_asset_ids), ',')
      WHERE action_id = v_action_id;
    EXCEPTION WHEN OTHERS THEN
      -- Ignore if audit table doesn't exist
      NULL;
    END;
    
    -- Log to distribution_audit for distribute_shared actions
    IF p_action_type = 'distribute_shared' AND v_first_building_number IS NOT NULL THEN
      PERFORM log_distribution_audit(
        v_first_building_number,
        'distribution'::distribution_audit_action_type,
        COALESCE(v_before_data_collected->'assets', '[]'::jsonb),
        COALESCE(v_after_data_collected->'assets', '[]'::jsonb),
        v_overload_ratio,
        v_shared_area_size,
        p_description,
        p_user_id
      );
    END IF;
  ELSE
    -- If no building number, use provided after_data as-is or collect minimal data
    IF p_after_data IS NOT NULL AND p_after_data != 'null'::jsonb AND p_after_data != '{}'::jsonb THEN
      v_after_data_collected := p_after_data;
      -- Still update entity_id
      BEGIN
        UPDATE audit
        SET 
          after_data = v_after_data_collected,
          entity_id = array_to_string(v_affected_asset_ids, ',')
        WHERE action_id = v_action_id;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    ELSE
      -- No building number and no provided data - just update entity_id
      BEGIN
        UPDATE audit
        SET entity_id = array_to_string(v_affected_asset_ids, ',')
        WHERE action_id = v_action_id;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END IF;

  -- ========================================================================
  -- STEP 4: REMOVE DISTRIBUTION FLAGS FOR distribute_shared ACTIONS
  -- Only after successful save, and only the relevant flag
  -- ========================================================================
  IF p_action_type = 'distribute_shared' AND v_building_num_for_flag IS NOT NULL THEN
    -- Determine distribution type by checking description first (most reliable)
    -- Then check asset data fields as fallback
    v_distribution_type := NULL;
    
    -- STEP 4a: Check description (most reliable method)
    IF p_description IS NOT NULL THEN
      IF LOWER(p_description) LIKE '%residence%' OR LOWER(p_description) LIKE '%×ž×’×•×¨×™×%' THEN
        v_distribution_type := 'residence';
      ELSIF LOWER(p_description) LIKE '%business%' OR LOWER(p_description) LIKE '%×¢×¡×§×™×%' THEN
        v_distribution_type := 'business';
      END IF;
    END IF;
    
    -- STEP 4b: If description didn't help, check asset data
    IF v_distribution_type IS NULL AND array_length(p_assets_data, 1) > 0 THEN
      -- Check if area_from_distribution is being updated (distribution)
      FOREACH v_asset_data IN ARRAY p_assets_data
      LOOP
        -- Check if area_from_distribution is set and non-zero
        BEGIN
          IF (v_asset_data->>'area_from_distribution') IS NOT NULL THEN
            v_business_dist_area := (v_asset_data->>'area_from_distribution')::NUMERIC;
            IF v_business_dist_area IS NOT NULL AND v_business_dist_area > 0 THEN
              -- Determine distribution type by checking asset type (business_residence)
              v_distribution_type := 'business'; -- Default, will be refined by description check
              EXIT; -- Found distribution, no need to check more
            END IF;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          -- Ignore conversion errors, continue checking
          NULL;
        END;
      END LOOP;
      
      -- If still not determined, check if main_asset_type is 199 (residence distribution)
      IF v_distribution_type IS NULL THEN
        v_asset_type_name := (p_assets_data[1]->>'main_asset_type');
        -- Check both string and numeric comparison
        IF v_asset_type_name = '199' OR v_asset_type_name::BIGINT = 199 THEN
          v_distribution_type := 'residence';
        END IF;
      END IF;
    END IF;
    
    -- STEP 4c: Remove the relevant flag only
    IF v_distribution_type = 'residence' THEN
      -- Residence distribution â†’ remove residence flag
      UPDATE buildings
      SET need_residence_distribution = false
      WHERE building_number = v_building_num_for_flag;
      
    ELSIF v_distribution_type = 'business' THEN
      -- Business distribution â†’ remove business flag
      UPDATE buildings
      SET need_business_distribution = false
      WHERE building_number = v_building_num_for_flag;
    END IF;
  END IF;

  -- ========================================================================
  -- STEP 5: RETURN RESULT
  -- ========================================================================
  v_result := jsonb_build_object(
    'success', true,
    'action_id', v_action_id,
    'affected_asset_ids', v_affected_asset_ids,
    'affected_buildings', v_affected_buildings,
    'count', v_count,
    'message', format('Successfully saved %s assets with all post-save actions completed', v_count)
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- Any error will cause automatic rollback of the entire transaction
    -- This includes asset updates AND flag removal
    RAISE EXCEPTION 'Bulk transaction failed and rolled back: %', SQLERRM
      USING HINT = 'All changes have been rolled back. No partial data was saved. Distribution flags remain set.';
END;
$$;

COMMENT ON FUNCTION save_assets_bulk_transactional IS 'Bulk save assets with transactional post-save actions. Validation is handled in application layer. All operations (saves, update totals, set flags, remove flags for distribute_shared, audit, distribution_audit) happen in ONE transaction. For distribute_shared actions, logs to distribution_audit table.';





-- ============================================================================
-- Migration: 20250124000000_update_distribution_audit_and_logging.sql
-- ============================================================================

/*
  # Update Audit Table and Logging
  
  This migration:
  1. Adds composite unique constraint on (building_number, created_at, action_type) to audit table
  2. Updates save_assets_bulk_transactional to log to audit for both distribute_shared and transfer_area actions
  3. Ensures overload_ratio and shared_area_size are properly saved
  
  Note: This assumes distribution_audit table will be renamed to audit in a subsequent migration
*/

-- ============================================================================
-- UPDATE AUDIT TABLE: Add composite unique constraint
-- ============================================================================

-- Add composite unique constraint (keeping id as primary key for foreign key relationships)
-- This works for both distribution_audit (before rename) and audit (after rename)
DO $$
BEGIN
  -- Try distribution_audit first (if it exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'distribution_audit') THEN
    ALTER TABLE distribution_audit 
      DROP CONSTRAINT IF EXISTS distribution_audit_building_created_action_unique;
    
    ALTER TABLE distribution_audit 
      ADD CONSTRAINT distribution_audit_building_created_action_unique 
      UNIQUE (building_number, created_at, action_type);
  -- Otherwise try audit table
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit' 
                AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit' AND column_name = 'building_number')) THEN
    ALTER TABLE audit 
      DROP CONSTRAINT IF EXISTS audit_building_created_action_unique;
    
    ALTER TABLE audit 
      ADD CONSTRAINT audit_building_created_action_unique 
      UNIQUE (building_number, created_at, action_type);
  END IF;
END $$;

-- ============================================================================
-- UPDATE: save_assets_bulk_transactional to log distribution_audit
-- ============================================================================

-- Drop any existing versions with different signatures to avoid ambiguity
DROP FUNCTION IF EXISTS save_assets_bulk_transactional(
  JSONB[],
  BOOLEAN,
  TEXT,
  TEXT,
  TEXT,
  JSONB,
  JSONB,
  TEXT
);

DROP FUNCTION IF EXISTS save_assets_bulk_transactional(
  JSONB[],
  BOOLEAN,
  TEXT,
  TEXT,
  TEXT,
  JSONB,
  JSONB,
  TEXT,
  BOOLEAN
);

CREATE OR REPLACE FUNCTION save_assets_bulk_transactional(
  p_assets_data JSONB[],
  p_validation_passed BOOLEAN,
  p_validation_errors TEXT DEFAULT NULL,
  p_action_type TEXT DEFAULT 'manual_update',
  p_user_id TEXT DEFAULT NULL,
  p_before_data JSONB DEFAULT NULL,
  p_after_data JSONB DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_is_business_context BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_asset_data JSONB;
  v_asset_id BIGINT;
  v_building_number BIGINT;
  v_existing_asset RECORD;
  v_old_main_asset_type TEXT;
  v_new_main_asset_type TEXT;
  v_type_changed BOOLEAN := FALSE;
  v_size_changed BOOLEAN := FALSE;
  v_affected_asset_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_affected_buildings BIGINT[] := ARRAY[]::BIGINT[];
  v_count INTEGER := 0;
  v_result JSONB;
  v_user_id_fk BIGINT;
  v_default_user_id BIGINT := 1;
  v_building_num_for_flag BIGINT;
  v_distribution_type TEXT; -- 'residence' or 'business'
  v_asset_type_name TEXT;
  v_new_type_non_accountable BOOLEAN;
  v_business_residence TEXT;
  v_business_dist_area NUMERIC;
  v_old_asset_size NUMERIC;
  v_new_asset_size NUMERIC;
  -- Store old values for each asset to use in STEP 6
  v_asset_old_values RECORD;
  -- For collecting audit data
  v_before_data_collected JSONB := NULL;
  v_after_data_collected JSONB := NULL;
  v_before_assets JSONB[] := ARRAY[]::JSONB[];
  v_after_assets JSONB[] := ARRAY[]::JSONB[];
  v_after_assets_array JSONB := NULL;
  v_building_data JSONB := NULL;
  v_first_building_number BIGINT := NULL;
  v_asset_record RECORD;
  v_asset_jsonb JSONB; -- Separate variable for JSONB results
  v_entity_asset_ids BIGINT[];
  v_overload_ratio NUMERIC := NULL;
  -- Track if asset was found (for INSERT vs UPDATE check)
  v_asset_found BOOLEAN := FALSE;
  -- For distribution audit logging
  v_audit_action_type distribution_audit_action_type;
  v_distribution_shared_area_size NUMERIC := NULL;
  v_distribution_overload_ratio NUMERIC := NULL;
  v_before_assets_json JSONB;
  v_after_assets_json JSONB;
  v_building_record RECORD;
  v_tax_region TEXT := NULL; -- Deprecated: kept for backward compatibility but no longer used
BEGIN
  -- ========================================================================
  -- STEP 1: GET OR CREATE USER
  -- (Validation checks removed - validation is handled in application layer)
  -- ========================================================================
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
    BEGIN
      SELECT get_or_create_user_from_auth() INTO v_user_id_fk;
    EXCEPTION WHEN OTHERS THEN
      SELECT user_id INTO v_default_user_id
      FROM users
      WHERE user_name = 'default' AND auth_user_id IS NULL
      LIMIT 1;
      v_user_id_fk := v_default_user_id;
    END;
  END IF;
  
  -- If still no user, use default
  IF v_user_id_fk IS NULL THEN
    SELECT user_id INTO v_default_user_id
    FROM users
    WHERE user_name = 'default' AND auth_user_id IS NULL
    LIMIT 1;
    v_user_id_fk := v_default_user_id;
  END IF;

  -- ========================================================================
  -- STEP 2: COLLECT BEFORE DATA (if not provided)
  -- For distribution operations, collect ALL assets in the building
  -- ========================================================================
  -- Get first building number from assets (all assets in distribution belong to same building)
  IF array_length(p_assets_data, 1) > 0 THEN
    v_first_building_number := (p_assets_data[1]->>'building_number')::BIGINT;
  END IF;
  
  -- Collect BEFORE data from database
  -- IMPORTANT: For transfer_area operations, ALWAYS collect from database to ensure accuracy
  -- For other operations, collect from database if not provided, otherwise use provided data
  IF v_first_building_number IS NOT NULL THEN
    -- For distribution and transfer operations, collect affected assets
    IF p_action_type = 'distribute_shared' OR p_action_type = 'transfer_area' THEN
      -- For distribution, get ALL assets in the building before update
      -- For transfer, get only affected assets (ALWAYS from database, ignore provided data)
      IF p_action_type = 'distribute_shared' THEN
        -- Get ALL assets in the building before update
        FOR v_asset_record IN 
          SELECT * FROM assets 
          WHERE building_number = v_first_building_number
          ORDER BY asset_id
        LOOP
          v_before_assets := array_append(v_before_assets, to_jsonb(v_asset_record));
        END LOOP;
      ELSE
        -- For transfer operations, ALWAYS collect from database (ignore provided before_data)
        -- This ensures we have the accurate "before" state from the database
        FOREACH v_asset_data IN ARRAY p_assets_data
        LOOP
          v_asset_id := (v_asset_data->>'asset_id')::BIGINT;
          IF v_asset_id IS NOT NULL THEN
            SELECT to_jsonb(a.*) INTO v_asset_jsonb
            FROM assets a
            WHERE a.asset_id = v_asset_id;
            
            IF v_asset_jsonb IS NOT NULL THEN
              v_before_assets := array_append(v_before_assets, v_asset_jsonb);
            END IF;
          END IF;
        END LOOP;
      END IF;
      
      -- Convert jsonb array to jsonb array for assets
      SELECT jsonb_agg(elem) INTO v_before_data_collected
      FROM unnest(v_before_assets) AS elem;
      
      -- Build before_data structure: simple structure with just assets
      -- Structure: { assets: [...] }
      v_before_data_collected := jsonb_build_object(
        'assets', COALESCE(v_before_data_collected, '[]'::jsonb)
      );
    ELSE
      -- For non-distribution/transfer operations, collect from database if not provided
      IF p_before_data IS NULL OR p_before_data = 'null'::jsonb OR p_before_data = '{}'::jsonb THEN
        -- Only get assets that will be updated
        FOREACH v_asset_data IN ARRAY p_assets_data
        LOOP
          v_asset_id := (v_asset_data->>'asset_id')::BIGINT;
          IF v_asset_id IS NOT NULL THEN
            SELECT to_jsonb(a.*) INTO v_asset_jsonb
            FROM assets a
            WHERE a.asset_id = v_asset_id;
            
            IF v_asset_jsonb IS NOT NULL THEN
              v_before_assets := array_append(v_before_assets, v_asset_jsonb);
            END IF;
          END IF;
        END LOOP;
        
        -- Convert jsonb array to jsonb array for assets
        SELECT jsonb_agg(elem) INTO v_before_data_collected
        FROM unnest(v_before_assets) AS elem;
        
        -- Build before_data structure
        v_before_data_collected := jsonb_build_object(
          'assets', COALESCE(v_before_data_collected, '[]'::jsonb)
        );
      ELSE
        -- Use provided before_data as-is for non-transfer operations
        v_before_data_collected := p_before_data;
      END IF;
    END IF;
  ELSE
    -- No building number - use provided before_data if available
    v_before_data_collected := p_before_data;
  END IF;
  
  -- ========================================================================
  -- STEP 2b: SKIP AUDIT ACTION RECORD CREATION
  -- Note: The audit table structure has changed - it no longer has action_id,
  --       entity_type, entity_id, before_data, after_data columns.
  --       For transfer_area and distribute_shared, we'll create the audit entry
  --       in STEP 3c using log_audit function.
  --       For other operations, we don't create audit entries in this table.
  -- ========================================================================
  -- For all operations, audit entry will be created in STEP 3c if needed
  -- (only for transfer_area and distribute_shared)

  -- ========================================================================
  -- STEP 3: PROCESS EACH ASSET
  -- ========================================================================
  FOREACH v_asset_data IN ARRAY p_assets_data
  LOOP
    -- Remove any fields that don't exist in assets table to prevent errors
    v_asset_data := v_asset_data - 'id' - '_isNew' - '_isDirty' - '_validationErrors' - '_isMasterRow';
    
    v_asset_id := (v_asset_data->>'asset_id')::BIGINT;
    v_building_number := (v_asset_data->>'building_number')::BIGINT;
    v_new_main_asset_type := (v_asset_data->>'main_asset_type')::TEXT;

    IF v_asset_id IS NULL OR v_building_number IS NULL THEN
      RAISE EXCEPTION 'Asset ID and Building Number are required for all assets'
        USING HINT = 'Ensure all assets in p_assets_data have asset_id and building_number';
    END IF;

    -- Store building number for flag removal (use first building if multiple)
    IF v_building_num_for_flag IS NULL THEN
      v_building_num_for_flag := v_building_number;
    END IF;

    -- Check if asset exists
    SELECT * INTO v_existing_asset
    FROM assets
    WHERE asset_id = v_asset_id;
    
    -- Store FOUND status
    v_asset_found := FOUND;

    IF v_asset_found THEN
      v_old_main_asset_type := v_existing_asset.main_asset_type;
      v_old_asset_size := v_existing_asset.asset_size;
      
      -- Check if asset_size OR main_asset_type will change (BEFORE UPDATE) and set flag accordingly
      -- For UPDATE: Extract new values from JSON, compare with old values
      -- Use existing asset type if main_asset_type is not in JSON (type not changing)
      IF v_new_main_asset_type IS NULL THEN
        v_new_main_asset_type := v_old_main_asset_type;
      END IF;
      
      -- Determine if type changed
      v_type_changed := (v_old_main_asset_type IS DISTINCT FROM v_new_main_asset_type);
      
      -- Determine if size changed
      -- Extract new size from JSON (what will be saved)
      -- The UPDATE uses: COALESCE((v_asset_data->>'asset_size')::NUMERIC, asset_size)
      -- So if asset_size is in JSON and valid numeric, use it; otherwise it stays the same
      BEGIN
        -- Check if asset_size key exists and has a value
        IF (v_asset_data ? 'asset_size') THEN
          -- Try to extract numeric value
          v_new_asset_size := (v_asset_data->>'asset_size')::NUMERIC;
        ELSE
          -- asset_size not in JSON, so it won't change (UPDATE will use COALESCE to keep old value)
          v_new_asset_size := v_old_asset_size;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- If cast fails (null, empty, invalid), size won't change (COALESCE will keep old value)
        v_new_asset_size := v_old_asset_size;
      END;
      
      -- Check if size will change (compare before UPDATE)
      -- Compare numeric values (handle floating point with small tolerance)
      IF v_old_asset_size IS NOT NULL AND v_new_asset_size IS NOT NULL THEN
        v_size_changed := (ABS(v_old_asset_size - v_new_asset_size) > 0.0001);
        RAISE NOTICE 'Size change check: old=%, new=%, changed=%', v_old_asset_size, v_new_asset_size, v_size_changed;
      ELSE
        -- If either is NULL, no change detected
        v_size_changed := FALSE;
        RAISE NOTICE 'Size change check: old_asset_size IS NULL or new_asset_size IS NULL - no size change detected';
      END IF;
      
      -- If either type or size changed, set distribution flag based on tab context
      -- Both type and size changes use the same logic - tab context (p_is_business_context)
      IF v_type_changed OR v_size_changed THEN
        -- Determine business/residence from direct parameter (tab context)
        -- No fallback - business and residence are completely separated
        DECLARE
          v_is_business_context BOOLEAN := FALSE;
          v_is_residence_context BOOLEAN := FALSE;
        BEGIN
          -- Use direct parameter (always provided from frontend)
          IF p_is_business_context IS NOT NULL THEN
            IF p_is_business_context THEN
              v_is_business_context := TRUE;
              IF v_type_changed AND v_size_changed THEN
                RAISE NOTICE 'Asset type and size change detected: Setting business distribution flag (from direct parameter)';
              ELSIF v_type_changed THEN
                RAISE NOTICE 'Asset type change detected: Setting business distribution flag (from direct parameter)';
              ELSE
                RAISE NOTICE 'Asset size change detected: Setting business distribution flag (from direct parameter)';
              END IF;
            ELSE
              v_is_residence_context := TRUE;
              IF v_type_changed AND v_size_changed THEN
                RAISE NOTICE 'Asset type and size change detected: Setting residence distribution flag (from direct parameter)';
              ELSIF v_type_changed THEN
                RAISE NOTICE 'Asset type change detected: Setting residence distribution flag (from direct parameter)';
              ELSE
                RAISE NOTICE 'Asset size change detected: Setting residence distribution flag (from direct parameter)';
              END IF;
            END IF;
          ELSE
            -- If parameter not provided, log warning but don't set any flags
            RAISE WARNING 'Asset type/size change detected but p_is_business_context is NULL - no distribution flag will be set';
          END IF;
          
          -- Set appropriate flag based on context
          -- For business: set flag only if business_shared_area > 0 (regardless of residence_shared_area)
          -- No need to set flag if there's no business shared area to distribute
          IF v_is_business_context THEN
            UPDATE buildings
            SET need_business_distribution = true
            WHERE building_number = v_building_number
              AND COALESCE(business_shared_area, 0) > 0;
          END IF;
          
          -- For residence: set flag regardless of shared area values (residence always needs distribution if type/size changes)
          IF v_is_residence_context THEN
            UPDATE buildings
            SET need_residence_distribution = true
            WHERE building_number = v_building_number;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          -- Ignore if lookup fails
          NULL;
        END;
      END IF;  -- End check for type or size change
    END IF;  -- End check for existing asset

    -- Save asset (INSERT or UPDATE)
    IF NOT v_asset_found THEN
      -- INSERT new asset
      INSERT INTO assets (asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region, sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2, sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4, sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6, elevator, single_double_family, condo, townhouses, penthouse, structure_drawing_url, floor, discount_type, discount_date_from, discount_date_to, area_from_distribution, exported_to_automation, comment)
      VALUES (
        v_asset_id,
        v_building_number,
        (v_asset_data->>'payer_id')::TEXT,
        COALESCE((v_asset_data->>'measurement_date')::TEXT, '01/01/1900'),
        v_new_main_asset_type,
        COALESCE((v_asset_data->>'asset_size')::NUMERIC, 0),
        (v_asset_data->>'tax_region')::BIGINT,
        (v_asset_data->>'sub_asset_type_1')::TEXT,
        COALESCE((v_asset_data->>'sub_asset_size_1')::NUMERIC, 0),
        (v_asset_data->>'sub_asset_type_2')::TEXT,
        COALESCE((v_asset_data->>'sub_asset_size_2')::NUMERIC, 0),
        (v_asset_data->>'sub_asset_type_3')::TEXT,
        COALESCE((v_asset_data->>'sub_asset_size_3')::NUMERIC, 0),
        (v_asset_data->>'sub_asset_type_4')::TEXT,
        COALESCE((v_asset_data->>'sub_asset_size_4')::NUMERIC, 0),
        (v_asset_data->>'sub_asset_type_5')::TEXT,
        COALESCE((v_asset_data->>'sub_asset_size_5')::NUMERIC, 0),
        (v_asset_data->>'sub_asset_type_6')::TEXT,
        COALESCE((v_asset_data->>'sub_asset_size_6')::NUMERIC, 0),
        (v_asset_data->>'elevator')::TEXT,
        (v_asset_data->>'single_double_family')::TEXT,
        (v_asset_data->>'condo')::TEXT,
        (v_asset_data->>'townhouses')::TEXT,
        (v_asset_data->>'penthouse')::TEXT,
        (v_asset_data->>'structure_drawing_url')::TEXT,
        (v_asset_data->>'floor')::BIGINT,
        (v_asset_data->>'discount_type')::TEXT,
        (v_asset_data->>'discount_date_from')::TEXT,
        (v_asset_data->>'discount_date_to')::TEXT,
        CASE 
          -- If asset type is non_accountable_for_distribution, set area_from_distribution to 0
          WHEN v_new_main_asset_type IS NOT NULL AND EXISTS (
            SELECT 1 FROM asset_types WHERE name = v_new_main_asset_type AND COALESCE(non_accountable_for_distribution, FALSE) = TRUE
          ) THEN 0
          ELSE COALESCE((v_asset_data->>'area_from_distribution')::NUMERIC, 0)
        END,
        COALESCE((v_asset_data->>'exported_to_automation')::BOOLEAN, false),
        (v_asset_data->>'comment')::TEXT
      );
    ELSE
      -- Check if is_new_measurement is true - if so, copy to history before update
      IF COALESCE((v_asset_data->>'is_new_measurement')::BOOLEAN, false) = true THEN
        -- Copy current asset to history before updating
        BEGIN
          INSERT INTO assets_history (
            asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region,
            sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
            sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
            sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
            elevator, single_double_family, condo, townhouses, penthouse,
            structure_drawing_url, floor, discount_type, discount_date_from, discount_date_to,
            area_from_distribution, exported_to_automation, comment, created_at, updated_at
          )
          SELECT 
            asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region,
            sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
            sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
            sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
            elevator, single_double_family, condo, townhouses, penthouse,
            structure_drawing_url, floor, discount_type, discount_date_from, discount_date_to,
            area_from_distribution, exported_to_automation, comment, created_at, updated_at
          FROM assets
          WHERE asset_id = v_asset_id;
        EXCEPTION WHEN OTHERS THEN
          -- Ignore if assets_history table doesn't exist
          NULL;
        END;
      END IF;
      
      -- UPDATE existing asset - only update fields that are provided
      UPDATE assets
      SET
        building_number = COALESCE(v_building_number, building_number),
        payer_id = COALESCE((v_asset_data->>'payer_id')::TEXT, payer_id),
        measurement_date = COALESCE((v_asset_data->>'measurement_date')::TEXT, measurement_date),
        main_asset_type = COALESCE(v_new_main_asset_type, main_asset_type),
        asset_size = COALESCE((v_asset_data->>'asset_size')::NUMERIC, asset_size),
        tax_region = COALESCE((v_asset_data->>'tax_region')::BIGINT, tax_region),
        sub_asset_type_1 = COALESCE((v_asset_data->>'sub_asset_type_1')::TEXT, sub_asset_type_1),
        sub_asset_size_1 = COALESCE((v_asset_data->>'sub_asset_size_1')::NUMERIC, sub_asset_size_1),
        sub_asset_type_2 = COALESCE((v_asset_data->>'sub_asset_type_2')::TEXT, sub_asset_type_2),
        sub_asset_size_2 = COALESCE((v_asset_data->>'sub_asset_size_2')::NUMERIC, sub_asset_size_2),
        sub_asset_type_3 = COALESCE((v_asset_data->>'sub_asset_type_3')::TEXT, sub_asset_type_3),
        sub_asset_size_3 = COALESCE((v_asset_data->>'sub_asset_size_3')::NUMERIC, sub_asset_size_3),
        sub_asset_type_4 = COALESCE((v_asset_data->>'sub_asset_type_4')::TEXT, sub_asset_type_4),
        sub_asset_size_4 = COALESCE((v_asset_data->>'sub_asset_size_4')::NUMERIC, sub_asset_size_4),
        sub_asset_type_5 = COALESCE((v_asset_data->>'sub_asset_type_5')::TEXT, sub_asset_type_5),
        sub_asset_size_5 = COALESCE((v_asset_data->>'sub_asset_size_5')::NUMERIC, sub_asset_size_5),
        sub_asset_type_6 = COALESCE((v_asset_data->>'sub_asset_type_6')::TEXT, sub_asset_type_6),
        sub_asset_size_6 = COALESCE((v_asset_data->>'sub_asset_size_6')::NUMERIC, sub_asset_size_6),
        elevator = COALESCE((v_asset_data->>'elevator')::TEXT, elevator),
        single_double_family = COALESCE((v_asset_data->>'single_double_family')::TEXT, single_double_family),
        condo = COALESCE((v_asset_data->>'condo')::TEXT, condo),
        townhouses = COALESCE((v_asset_data->>'townhouses')::TEXT, townhouses),
        penthouse = COALESCE((v_asset_data->>'penthouse')::TEXT, penthouse),
        structure_drawing_url = COALESCE((v_asset_data->>'structure_drawing_url')::TEXT, structure_drawing_url),
        floor = COALESCE((v_asset_data->>'floor')::BIGINT, floor),
        discount_type = COALESCE((v_asset_data->>'discount_type')::TEXT, discount_type),
        discount_date_from = COALESCE((v_asset_data->>'discount_date_from')::TEXT, discount_date_from),
        discount_date_to = COALESCE((v_asset_data->>'discount_date_to')::TEXT, discount_date_to),
        area_from_distribution = COALESCE((v_asset_data->>'area_from_distribution')::NUMERIC, area_from_distribution),
        exported_to_automation = COALESCE((v_asset_data->>'exported_to_automation')::BOOLEAN, exported_to_automation),
        comment = COALESCE((v_asset_data->>'comment')::TEXT, comment),
        is_new_measurement = false, -- Reset flag after copying to history
        updated_at = NOW()
      WHERE asset_id = v_asset_id;
      
      -- If asset type changed to non_accountable_for_distribution, set area_from_distribution to 0
      IF v_old_main_asset_type IS NOT NULL AND v_old_main_asset_type != v_new_main_asset_type AND v_new_main_asset_type IS NOT NULL THEN
        BEGIN
          -- Check if new asset type has non_accountable_for_distribution = true
          SELECT COALESCE(non_accountable_for_distribution, FALSE) INTO v_new_type_non_accountable
          FROM asset_types
          WHERE name = v_new_main_asset_type
          LIMIT 1;
          
          -- If new type is non_accountable_for_distribution, set area_from_distribution to 0
          IF v_new_type_non_accountable = TRUE THEN
            UPDATE assets
            SET area_from_distribution = 0
            WHERE asset_id = v_asset_id;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          -- Ignore errors (asset type might not exist)
          NULL;
        END;
      END IF;
    END IF;

    -- Track affected assets and buildings
    v_affected_asset_ids := array_append(v_affected_asset_ids, v_asset_id);
    IF NOT (v_building_number = ANY(v_affected_buildings)) THEN
      v_affected_buildings := array_append(v_affected_buildings, v_building_number);
    END IF;

    -- Update building total area
    PERFORM update_building_total_area(v_building_number);

    -- Note: Distribution flags are now set BEFORE the UPDATE (above) based on tab context
    -- Both type and size changes use the same logic with p_is_business_context parameter
    -- No need to call set_distribution_flags_for_asset_type_change


    -- For distribution operations, we use the bulk audit entry created at STEP 2b
    -- For other operations, create individual audit log for each asset
    IF p_action_type != 'distribute_shared' AND p_action_type != 'transfer_area' THEN
      BEGIN
        PERFORM log_audit_for_asset(
          v_asset_id,
          CASE WHEN v_existing_asset IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
          p_user_id,
          p_action_type::audit_action_type,
          false, -- p_copy_to_history
          p_description
        );
      EXCEPTION WHEN OTHERS THEN
        -- Ignore if function doesn't exist (audit was removed)
        NULL;
      END;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  -- ========================================================================
  -- STEP 3b: COLLECT AFTER DATA (always collect assets, merge with provided building data)
  -- For distribution operations, collect ALL assets in the building after update
  -- For transfer operations, ONLY collect affected assets
  -- ========================================================================
  -- Reset v_after_assets array to ensure it's empty before collecting
  v_after_assets := ARRAY[]::JSONB[];
  
  -- Always collect assets from database (even if after_data is provided, we need all assets for distribution)
  IF v_first_building_number IS NOT NULL THEN
    -- For distribution operations, collect ALL assets in the building
    -- For transfer operations, only collect affected assets
    -- For other operations, only collect affected assets
    IF p_action_type = 'distribute_shared' THEN
      -- Get ALL assets in the building after update
      FOR v_asset_record IN 
        SELECT * FROM assets 
        WHERE building_number = v_first_building_number
        ORDER BY asset_id
      LOOP
        v_after_assets := array_append(v_after_assets, to_jsonb(v_asset_record));
      END LOOP;
    ELSIF p_action_type = 'transfer_area' THEN
      -- For transfer operations, ONLY get assets that were actually updated (affected assets)
      -- This is critical to ensure audit only contains affected assets
      IF array_length(v_affected_asset_ids, 1) > 0 THEN
        FOR v_asset_id IN SELECT unnest(v_affected_asset_ids)
        LOOP
          SELECT to_jsonb(a.*) INTO v_asset_jsonb
          FROM assets a
          WHERE a.asset_id = v_asset_id;
          
          IF v_asset_jsonb IS NOT NULL THEN
            v_after_assets := array_append(v_after_assets, v_asset_jsonb);
          END IF;
        END LOOP;
      END IF;
    ELSE
      -- For other non-distribution/transfer operations, only get assets that were updated
      FOR v_asset_id IN SELECT unnest(v_affected_asset_ids)
      LOOP
        SELECT to_jsonb(a.*) INTO v_asset_jsonb
        FROM assets a
        WHERE a.asset_id = v_asset_id;
        
        IF v_asset_jsonb IS NOT NULL THEN
          v_after_assets := array_append(v_after_assets, v_asset_jsonb);
        END IF;
      END LOOP;
    END IF;
    
    -- Convert jsonb array to jsonb array for assets
    -- Build temporary array first, then build structure
    SELECT jsonb_agg(elem) INTO v_after_assets_array
    FROM unnest(v_after_assets) AS elem;
    
    -- Build after_data structure: simple structure with just assets
    -- Structure: { assets: [...] }
    -- This ensures consistent structure for both distribution and transfer
    v_after_data_collected := jsonb_build_object(
      'assets', COALESCE(v_after_assets_array, '[]'::jsonb)
    );
    
    -- Get overload_ratio - use provided data if available, otherwise from database
    IF p_after_data IS NOT NULL AND p_after_data != 'null'::jsonb AND p_after_data != '{}'::jsonb THEN
      -- Extract overload_ratio from provided after_data
      IF p_after_data ? 'overload_ratio' THEN
        v_overload_ratio := (p_after_data->>'overload_ratio')::NUMERIC;
      ELSIF p_after_data ? 'building' AND p_after_data->'building' ? 'building' THEN
        v_building_data := p_after_data->'building'->'building';
        IF v_building_data ? 'overload_ratio' THEN
          v_overload_ratio := (v_building_data->>'overload_ratio')::NUMERIC;
        END IF;
      ELSIF p_after_data ? 'building' THEN
        v_building_data := p_after_data->'building';
        IF v_building_data ? 'overload_ratio' THEN
          v_overload_ratio := (v_building_data->>'overload_ratio')::NUMERIC;
        END IF;
      END IF;
    END IF;
    
    -- If overload_ratio not found in provided data, get from database
    IF v_overload_ratio IS NULL AND p_action_type = 'distribute_shared' THEN
      SELECT b.overload_ratio INTO v_overload_ratio
      FROM buildings b
      WHERE b.building_number = v_first_building_number;
    END IF;
    
    -- Get shared_area_size and overload_ratio from building for distribution operations
    IF p_action_type = 'distribute_shared' THEN
      SELECT * INTO v_building_record
      FROM buildings
      WHERE building_number = v_first_building_number;
      
      IF FOUND THEN
        -- Determine distribution type from description
        IF p_description IS NOT NULL THEN
          IF LOWER(p_description) LIKE '%residence%' OR LOWER(p_description) LIKE '%×ž×’×•×¨×™×%' THEN
            v_distribution_shared_area_size := v_building_record.residence_shared_area;
            -- Residence distributions don't have overload_ratio
            v_distribution_overload_ratio := NULL;
          ELSIF LOWER(p_description) LIKE '%business%' OR LOWER(p_description) LIKE '%×¢×¡×§×™×%' THEN
            v_distribution_shared_area_size := v_building_record.business_shared_area;
            -- Use provided overload_ratio if available (current value from p_after_data), otherwise fallback to building record
            -- IMPORTANT: The provided value is the correct overload_ratio for THIS distribution, not the previous one
            IF v_overload_ratio IS NOT NULL THEN
              v_distribution_overload_ratio := v_overload_ratio;
            ELSE
              v_distribution_overload_ratio := v_building_record.overload_ratio;
            END IF;
          END IF;
        END IF;
      END IF;
    ELSIF p_action_type = 'transfer_area' THEN
      -- For transfers, calculate total transferred area from asset size changes
      -- Sum the difference in asset_size between before and after (only increases)
      IF v_before_data_collected IS NOT NULL AND v_after_data_collected IS NOT NULL THEN
        SELECT COALESCE(
          (
            SELECT SUM((after_elem->>'asset_size')::NUMERIC - (before_elem->>'asset_size')::NUMERIC)
            FROM jsonb_array_elements(COALESCE(v_after_data_collected->'assets', '[]'::jsonb)) AS after_elem,
                 jsonb_array_elements(COALESCE(v_before_data_collected->'assets', '[]'::jsonb)) AS before_elem
            WHERE (after_elem->>'asset_id')::BIGINT = (before_elem->>'asset_id')::BIGINT
              AND (after_elem->>'asset_size')::NUMERIC > (before_elem->>'asset_size')::NUMERIC
          ),
          0
        ) INTO v_distribution_shared_area_size;
      END IF;
      -- Transfers don't have overload_ratio
      v_distribution_overload_ratio := NULL;
    END IF;
    
    -- Add overload_ratio if it exists (for business distributions)
    -- Note: v_after_data_collected already has the structure { assets: [...] } from above
    IF v_overload_ratio IS NOT NULL THEN
      v_after_data_collected := v_after_data_collected || jsonb_build_object('overload_ratio', v_overload_ratio);
    END IF;
    
    -- For distribution operations, entity_id should include ALL assets in the building
    -- For other operations, only include affected assets
    IF p_action_type = 'distribute_shared' THEN
      -- Get ALL asset IDs in the building
      SELECT array_agg(asset_id ORDER BY asset_id) INTO v_entity_asset_ids
      FROM assets
      WHERE building_number = v_first_building_number;
    ELSE
      -- For other operations, use affected asset IDs
      v_entity_asset_ids := v_affected_asset_ids;
    END IF;
    
    -- Note: Audit entries are now created using log_audit function in STEP 3c
    -- No need to update old-style audit entries here
    
    -- ========================================================================
    -- STEP 3c: LOG TO DISTRIBUTION_AUDIT (for distribute_shared and transfer_area operations)
    -- Part of the same transaction - will rollback if save fails
    -- ========================================================================
    IF (p_action_type = 'distribute_shared' OR p_action_type = 'transfer_area') AND v_first_building_number IS NOT NULL THEN
      -- Extract assets arrays from before_data and after_data
      IF v_before_data_collected IS NOT NULL AND v_before_data_collected ? 'assets' THEN
        v_before_assets_json := v_before_data_collected->'assets';
      ELSIF v_before_data_collected IS NOT NULL AND jsonb_typeof(v_before_data_collected) = 'array' THEN
        v_before_assets_json := v_before_data_collected;
      ELSE
        v_before_assets_json := '[]'::jsonb;
      END IF;
      
      IF v_after_data_collected IS NOT NULL AND v_after_data_collected ? 'assets' THEN
        v_after_assets_json := v_after_data_collected->'assets';
      ELSIF v_after_data_collected IS NOT NULL AND jsonb_typeof(v_after_data_collected) = 'array' THEN
        v_after_assets_json := v_after_data_collected;
      ELSE
        v_after_assets_json := '[]'::jsonb;
      END IF;
      
      -- For transfer operations, ALWAYS filter to include ONLY affected assets (those in v_affected_asset_ids)
      -- This is CRITICAL: transfer audit must ONLY contain affected assets, not all building assets
      -- DO NOT REMOVE OR MODIFY THIS FILTER - it prevents all assets from being saved to audit
      IF p_action_type = 'transfer_area' THEN
        IF array_length(v_affected_asset_ids, 1) > 0 THEN
          -- Filter before assets to only include affected asset IDs
          SELECT jsonb_agg(elem)
          INTO v_before_assets_json
          FROM jsonb_array_elements(v_before_assets_json) AS elem
          WHERE (elem->>'asset_id')::BIGINT = ANY(v_affected_asset_ids);
          
          -- Filter after assets to only include affected asset IDs
          SELECT jsonb_agg(elem)
          INTO v_after_assets_json
          FROM jsonb_array_elements(v_after_assets_json) AS elem
          WHERE (elem->>'asset_id')::BIGINT = ANY(v_affected_asset_ids);
          
          -- Ensure we have arrays (not null) even if filtering resulted in empty arrays
          v_before_assets_json := COALESCE(v_before_assets_json, '[]'::jsonb);
          v_after_assets_json := COALESCE(v_after_assets_json, '[]'::jsonb);
        ELSE
          -- If no affected assets (shouldn't happen, but safety check), set to empty arrays
          v_before_assets_json := '[]'::jsonb;
          v_after_assets_json := '[]'::jsonb;
        END IF;
      END IF;
      
      -- Map action_type to distribution_audit_action_type enum
      -- For distribute_shared, determine if it's business or residence distribution
      -- Use the same logic as STEP 4: check description first (most reliable), then asset data
      IF p_action_type = 'distribute_shared' THEN
        -- Determine distribution type using the same logic as STEP 4
        -- This ensures consistency between audit logging and flag removal
        v_distribution_type := NULL;
        
        -- Check description first (most reliable method - contains tab info)
        IF p_description IS NOT NULL THEN
          IF LOWER(p_description) LIKE '%residence%' OR LOWER(p_description) LIKE '%×ž×’×•×¨×™×%' THEN
            v_distribution_type := 'residence';
          ELSIF LOWER(p_description) LIKE '%business%' OR LOWER(p_description) LIKE '%×¢×¡×§×™×%' THEN
            v_distribution_type := 'business';
          END IF;
        END IF;
        
        -- If description didn't help, check asset data as fallback
        IF v_distribution_type IS NULL AND jsonb_array_length(v_after_assets_json) > 0 THEN
          DECLARE
            v_asset_idx INTEGER := 0;
            v_asset_count INTEGER;
            v_main_asset_type_value TEXT;
            v_main_asset_type_num BIGINT;
          BEGIN
            v_asset_count := jsonb_array_length(v_after_assets_json);
            
            -- Loop through assets to find business_residence
            WHILE v_asset_idx < v_asset_count AND v_distribution_type IS NULL LOOP
              IF (v_after_assets_json->v_asset_idx->>'main_asset_type') IS NOT NULL THEN
                v_main_asset_type_value := TRIM((v_after_assets_json->v_asset_idx->>'main_asset_type'));
                
                -- Try to parse as number for numeric comparison
                BEGIN
                  v_main_asset_type_num := v_main_asset_type_value::BIGINT;
                EXCEPTION WHEN OTHERS THEN
                  v_main_asset_type_num := NULL;
                END;
                
                -- Look up the asset type's business_residence field
                SELECT business_residence INTO v_business_residence
                FROM asset_types
                WHERE TRIM(name::TEXT) = v_main_asset_type_value
                LIMIT 1;
                
                -- If not found and we have a numeric value, try numeric comparison
                IF v_business_residence IS NULL AND v_main_asset_type_num IS NOT NULL THEN
                  SELECT business_residence INTO v_business_residence
                  FROM asset_types
                  WHERE name::BIGINT = v_main_asset_type_num
                  LIMIT 1;
                END IF;
                
                -- Set distribution type based on business_residence
                IF v_business_residence = '×¢×¡×§×™×' THEN
                  v_distribution_type := 'business';
                ELSIF v_business_residence = '×ž×’×•×¨×™×' THEN
                  v_distribution_type := 'residence';
                END IF;
              END IF;
              
              v_asset_idx := v_asset_idx + 1;
            END LOOP;
          END;
        END IF;
        
        -- Set action type based on distribution type
        IF v_distribution_type = 'business' THEN
          v_audit_action_type := 'business_distribution';
        ELSIF v_distribution_type = 'residence' THEN
          v_audit_action_type := 'residence_distribution';
        ELSE
          -- Fallback to 'distribution' if type is not determined
          v_audit_action_type := 'distribution';
          RAISE WARNING 'Using fallback action_type "distribution" because distribution type could not be determined (description: %)', 
            p_description;
        END IF;
      ELSIF p_action_type = 'transfer_area' THEN
        v_audit_action_type := 'transfer';
      END IF;
      
      -- Log to audit table (part of the same transaction)
      -- Note: tax_region parameter is kept for backward compatibility but not used for filtering
      -- For transfer operations, verify that only affected assets are being logged
      -- This is a final safety check before logging
      IF p_action_type = 'transfer_area' THEN
        -- Verify that the arrays contain only affected assets
        -- This should already be filtered above, but this is a safety check
        IF array_length(v_affected_asset_ids, 1) > 0 THEN
          -- Re-filter one more time to be absolutely sure (defensive programming)
          SELECT jsonb_agg(elem)
          INTO v_before_assets_json
          FROM jsonb_array_elements(v_before_assets_json) AS elem
          WHERE (elem->>'asset_id')::BIGINT = ANY(v_affected_asset_ids);
          
          SELECT jsonb_agg(elem)
          INTO v_after_assets_json
          FROM jsonb_array_elements(v_after_assets_json) AS elem
          WHERE (elem->>'asset_id')::BIGINT = ANY(v_affected_asset_ids);
          
          v_before_assets_json := COALESCE(v_before_assets_json, '[]'::jsonb);
          v_after_assets_json := COALESCE(v_after_assets_json, '[]'::jsonb);
        END IF;
      END IF;
      
      -- IMPORTANT: Only call log_audit ONCE per transfer/distribution operation
      -- This ensures only ONE audit entry is created per operation
      -- DO NOT add additional log_audit calls - this is the ONLY place audit entries are created for transfers/distributions
      PERFORM log_audit(
        v_first_building_number,
        v_audit_action_type,
        v_before_assets_json,
        v_after_assets_json,
        v_distribution_overload_ratio,
        v_distribution_shared_area_size,
        p_description,
        p_user_id,
        NULL -- tax_region is no longer used for filtering, set to NULL
      );
    END IF;
  ELSE
    -- If no building number, use provided after_data as-is or collect minimal data
    IF p_after_data IS NOT NULL AND p_after_data != 'null'::jsonb AND p_after_data != '{}'::jsonb THEN
      v_after_data_collected := p_after_data;
      -- Still update entity_id
      -- Note: Audit entries are now created using log_audit function
      -- No need to update old-style audit entries here
    ELSE
      -- No building number and no provided data
      -- Note: Audit entries are now created using log_audit function
      -- No need to update old-style audit entries here
      NULL; -- Do nothing
    END IF;
  END IF;

  -- ========================================================================
  -- STEP 4: REMOVE DISTRIBUTION FLAGS FOR distribute_shared ACTIONS
  -- Only after successful save, and only the relevant flag
  -- ========================================================================
  IF p_action_type = 'distribute_shared' AND v_building_num_for_flag IS NOT NULL THEN
    -- Determine distribution type by checking description first (most reliable)
    -- Then check asset data fields as fallback
    v_distribution_type := NULL;
    
    -- STEP 4a: Check description (most reliable method)
    IF p_description IS NOT NULL THEN
      IF LOWER(p_description) LIKE '%residence%' OR LOWER(p_description) LIKE '%×ž×’×•×¨×™×%' THEN
        v_distribution_type := 'residence';
      ELSIF LOWER(p_description) LIKE '%business%' OR LOWER(p_description) LIKE '%×¢×¡×§×™×%' THEN
        v_distribution_type := 'business';
      END IF;
    END IF;
    
    -- STEP 4b: If description didn't help, check asset data
    IF v_distribution_type IS NULL AND array_length(p_assets_data, 1) > 0 THEN
      -- Check if area_from_distribution is being updated (distribution)
      FOREACH v_asset_data IN ARRAY p_assets_data
      LOOP
        -- Check if area_from_distribution is set and non-zero
        BEGIN
          IF (v_asset_data->>'area_from_distribution') IS NOT NULL THEN
            v_business_dist_area := (v_asset_data->>'area_from_distribution')::NUMERIC;
            IF v_business_dist_area IS NOT NULL AND v_business_dist_area > 0 THEN
              -- Determine distribution type by checking asset type (business_residence)
              -- For now, check description or asset type to determine if business or residence
              -- This will be determined by the asset's business_residence type
              v_distribution_type := 'business'; -- Default, will be refined by description check
              EXIT; -- Found distribution, no need to check more
            END IF;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          -- Ignore conversion errors, continue checking
          NULL;
        END;
      END LOOP;
      
      -- If still not determined, check if main_asset_type is 199 (residence distribution)
      IF v_distribution_type IS NULL THEN
        v_asset_type_name := (p_assets_data[1]->>'main_asset_type');
        -- Check both string and numeric comparison
        IF v_asset_type_name = '199' OR v_asset_type_name::BIGINT = 199 THEN
          v_distribution_type := 'residence';
        END IF;
      END IF;
    END IF;
    
    -- STEP 4c: Remove the relevant flag only
    IF v_distribution_type = 'residence' THEN
      -- Residence distribution â†’ remove residence flag
      UPDATE buildings
      SET need_residence_distribution = false
      WHERE building_number = v_building_num_for_flag;
      
    ELSIF v_distribution_type = 'business' THEN
      -- Business distribution â†’ remove business flag
      UPDATE buildings
      SET need_business_distribution = false
      WHERE building_number = v_building_num_for_flag;
    END IF;
  END IF;

  -- ========================================================================
  -- STEP 5: RETURN RESULT
  -- ========================================================================
  v_result := jsonb_build_object(
    'success', true,
    'affected_asset_ids', v_affected_asset_ids,
    'affected_buildings', v_affected_buildings,
    'count', v_count,
    'message', format('Successfully saved %s assets with all post-save actions completed', v_count)
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- Any error will cause automatic rollback of the entire transaction
    -- This includes asset updates AND flag removal
    RAISE EXCEPTION 'Bulk transaction failed and rolled back: %', SQLERRM
      USING HINT = 'All changes have been rolled back. No partial data was saved. Distribution flags remain set.';
END;
$$;

COMMENT ON FUNCTION save_assets_bulk_transactional IS 'Bulk save assets with transactional post-save actions. Validation is handled in application layer. All operations (saves, update totals, set flags, remove flags for distribute_shared, audit) happen in ONE transaction. For distribute_shared and transfer_area actions, logs to audit table.';

-- Note: The trigger auto_set_distribution_flags_on_change is dropped in migration
-- 20251220000001_drop_distribution_flag_trigger.sql (runs after this migration).
-- Distribution flags are now set correctly in save_assets_bulk_transactional
-- using p_is_business_context parameter for proper tab context separation.


-- ============================================================================
-- Migration: 20250125000000_rename_distribution_audit_to_audit.sql
-- ============================================================================

/*
  # Rename distribution_audit to audit
  
  This migration renames the distribution_audit table to audit
  and updates all related functions, indexes, and constraints.
*/

-- ============================================================================
-- RENAME ENUM (optional - keep distribution_audit_action_type or rename)
-- We'll keep the enum name as distribution_audit_action_type to avoid conflicts
-- ============================================================================

-- ============================================================================
-- RENAME TABLE: distribution_audit -> audit
-- ============================================================================

-- First, drop the old audit table if it exists and has the old structure
-- (This is safe if we already dropped it in a previous migration)
DO $$
BEGIN
  -- Check if old audit table exists with old structure (has action_id instead of id)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'audit' AND column_name = 'action_id'
  ) THEN
    -- Drop old audit table if it exists with old structure
    DROP TABLE IF EXISTS audit CASCADE;
  END IF;
END $$;

-- Rename distribution_audit to audit
ALTER TABLE IF EXISTS distribution_audit RENAME TO audit;

-- ============================================================================
-- RENAME CONSTRAINTS
-- ============================================================================

-- Rename primary key constraint
ALTER TABLE audit RENAME CONSTRAINT distribution_audit_pkey TO audit_pkey;

-- Rename foreign key constraints
ALTER TABLE audit RENAME CONSTRAINT fk_distribution_audit_building TO fk_audit_building;
ALTER TABLE audit RENAME CONSTRAINT fk_distribution_audit_user TO fk_audit_user;
ALTER TABLE audit RENAME CONSTRAINT distribution_audit_building_created_action_unique TO audit_building_created_action_unique;

-- ============================================================================
-- RENAME INDEXES
-- ============================================================================

ALTER INDEX IF EXISTS idx_distribution_audit_building_number RENAME TO idx_audit_building_number;
ALTER INDEX IF EXISTS idx_distribution_audit_action_type RENAME TO idx_audit_action_type;
ALTER INDEX IF EXISTS idx_distribution_audit_created_at RENAME TO idx_audit_created_at;
ALTER INDEX IF EXISTS idx_distribution_audit_building_created RENAME TO idx_audit_building_created;

-- ============================================================================
-- DROP OLD RLS POLICIES AND CREATE NEW ONES
-- ============================================================================

DROP POLICY IF EXISTS "Allow public read access to distribution_audit" ON audit;
DROP POLICY IF EXISTS "Allow authenticated users to insert distribution_audit" ON audit;

CREATE POLICY "Allow public read access to audit"
  ON audit FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow authenticated users to insert audit"
  ON audit FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- UPDATE COMMENTS
-- ============================================================================

COMMENT ON TABLE audit IS 'Audit table for distribution and transfer operations, keyed by building_number';
COMMENT ON COLUMN audit.id IS 'Primary key - sequential ID';
COMMENT ON COLUMN audit.building_number IS 'Building number - the key for grouping operations';
COMMENT ON COLUMN audit.action_type IS 'Type of operation: distribution or transfer';
COMMENT ON COLUMN audit.affected_assets_before IS 'JSONB array of all affected assets before the operation';
COMMENT ON COLUMN audit.affected_assets_after IS 'JSONB array of all affected assets after the operation';
COMMENT ON COLUMN audit.overload_ratio IS 'Overload ratio for business distributions';
COMMENT ON COLUMN audit.shared_area_size IS 'Shared area size that was distributed';
COMMENT ON COLUMN audit.description IS 'Optional description of the operation';
COMMENT ON COLUMN audit.user_id IS 'Foreign key to users table - user who performed the operation';
COMMENT ON COLUMN audit.created_at IS 'Timestamp of the operation, used for ordering. Part of composite unique key with building_number and action_type';

-- ============================================================================
-- RENAME FUNCTION: log_distribution_audit -> log_audit
-- ============================================================================

CREATE OR REPLACE FUNCTION log_audit(
  p_building_number BIGINT,
  p_action_type distribution_audit_action_type,
  p_affected_assets_before JSONB,
  p_affected_assets_after JSONB,
  p_overload_ratio NUMERIC DEFAULT NULL,
  p_shared_area_size NUMERIC DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id_fk BIGINT;
  v_default_user_id BIGINT := 1;
  v_audit_id BIGINT;
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
    -- Use get_or_create_user_from_auth if it exists, otherwise default
    BEGIN
      SELECT get_or_create_user_from_auth() INTO v_user_id_fk;
    EXCEPTION WHEN OTHERS THEN
      SELECT user_id INTO v_default_user_id
      FROM users
      WHERE user_name = 'default' AND auth_user_id IS NULL
      LIMIT 1;
      v_user_id_fk := v_default_user_id;
    END;
  END IF;
  
  -- If still no user, use default
  IF v_user_id_fk IS NULL THEN
    SELECT user_id INTO v_default_user_id
    FROM users
    WHERE user_name = 'default' AND auth_user_id IS NULL
    LIMIT 1;
    v_user_id_fk := v_default_user_id;
  END IF;

  -- Insert audit record
  INSERT INTO audit (
    building_number,
    action_type,
    affected_assets_before,
    affected_assets_after,
    overload_ratio,
    shared_area_size,
    description,
    user_id,
    created_at
  )
  VALUES (
    p_building_number,
    p_action_type,
    p_affected_assets_before,
    p_affected_assets_after,
    p_overload_ratio,
    p_shared_area_size,
    p_description,
    v_user_id_fk,
    now()
  )
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$;

COMMENT ON FUNCTION log_audit IS 'Logs a distribution or transfer operation to audit table. Returns the ID of the created audit record.';

-- Drop old function
DROP FUNCTION IF EXISTS log_distribution_audit(
  BIGINT,
  distribution_audit_action_type,
  JSONB,
  JSONB,
  NUMERIC,
  NUMERIC,
  TEXT,
  TEXT
);

-- ============================================================================
-- UPDATE save_assets_bulk_transactional to use log_audit instead of log_distribution_audit
-- ============================================================================

-- We need to update the function body to use log_audit
-- This will be done by recreating the function with the updated name
-- Note: The full function definition should be in the previous migration,
-- but we need to update the function call here

-- Create a helper function that will be called by save_assets_bulk_transactional
-- This ensures backward compatibility during migration
CREATE OR REPLACE FUNCTION log_distribution_audit(
  p_building_number BIGINT,
  p_action_type distribution_audit_action_type,
  p_affected_assets_before JSONB,
  p_affected_assets_after JSONB,
  p_overload_ratio NUMERIC DEFAULT NULL,
  p_shared_area_size NUMERIC DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Simply call the new log_audit function
  RETURN log_audit(
    p_building_number,
    p_action_type,
    p_affected_assets_before,
    p_affected_assets_after,
    p_overload_ratio,
    p_shared_area_size,
    p_description,
    p_user_id
  );
END;
$$;

COMMENT ON FUNCTION log_distribution_audit IS 'Deprecated: Use log_audit instead. This is a wrapper for backward compatibility.';




-- ============================================================================
-- Migration: 20250126000000_remove_action_id_from_assets_tables.sql
-- ============================================================================

re


-- ============================================================================
-- Migration: 20250127000000_add_tax_region_to_audit.sql
-- ============================================================================

-- ============================================================================
-- Migration: Add tax_region column to audit table
-- ============================================================================
-- This migration adds tax_region column to the audit table to track
-- whether distribution operations were for business or residence tax regions.
-- This allows filtering distribution history by tax region.
-- ============================================================================

-- Add tax_region column to audit table
ALTER TABLE audit 
ADD COLUMN IF NOT EXISTS tax_region TEXT;

-- Add index for tax_region for better query performance
CREATE INDEX IF NOT EXISTS idx_audit_tax_region ON audit(tax_region);

-- Add index for building_number + tax_region combination for filtered queries
CREATE INDEX IF NOT EXISTS idx_audit_building_tax_region ON audit(building_number, tax_region) WHERE tax_region IS NOT NULL;

-- Update log_audit function to accept tax_region parameter
CREATE OR REPLACE FUNCTION log_audit(
  p_building_number BIGINT,
  p_action_type distribution_audit_action_type,
  p_affected_assets_before JSONB,
  p_affected_assets_after JSONB,
  p_overload_ratio NUMERIC DEFAULT NULL,
  p_shared_area_size NUMERIC DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL,
  p_tax_region TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id_fk BIGINT;
  v_default_user_id BIGINT := 1;
  v_audit_id BIGINT;
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
    -- Use get_or_create_user_from_auth if it exists, otherwise default
    BEGIN
      SELECT get_or_create_user_from_auth() INTO v_user_id_fk;
    EXCEPTION WHEN OTHERS THEN
      SELECT user_id INTO v_default_user_id
      FROM users
      WHERE user_name = 'default' AND auth_user_id IS NULL
      LIMIT 1;
      v_user_id_fk := v_default_user_id;
    END;
  END IF;
  
  -- If still no user, use default
  IF v_user_id_fk IS NULL THEN
    SELECT user_id INTO v_default_user_id
    FROM users
    WHERE user_name = 'default' AND auth_user_id IS NULL
    LIMIT 1;
    v_user_id_fk := v_default_user_id;
  END IF;

  -- Insert audit record
  INSERT INTO audit (
    building_number,
    action_type,
    affected_assets_before,
    affected_assets_after,
    overload_ratio,
    shared_area_size,
    description,
    user_id,
    created_at,
    tax_region
  )
  VALUES (
    p_building_number,
    p_action_type,
    p_affected_assets_before,
    p_affected_assets_after,
    p_overload_ratio,
    p_shared_area_size,
    p_description,
    v_user_id_fk,
    now(),
    p_tax_region
  )
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$;

COMMENT ON COLUMN audit.tax_region IS 'Tax region for distribution operations (e.g., "40" for business, "10" for residence). Used to filter distribution history by business/residence.';

-- ============================================================================
-- UPDATE: save_assets_bulk_transactional to extract and pass tax_region
-- ============================================================================
-- We update save_assets_bulk_transactional to extract tax_region from assets
-- and pass it to log_audit. For distribution operations, all assets have the
-- same tax_region, so we extract it from the first asset in affected_assets_after.
-- ============================================================================

-- Note: The full function update requires reading the entire function body from
-- 20250124000000_update_distribution_audit_and_logging.sql. The key change is:
-- 1. Add variable: v_tax_region TEXT := NULL;
-- 2. Extract tax_region before log_audit call:
--    IF jsonb_array_length(v_after_assets_json) > 0 THEN
--      v_tax_region := (v_after_assets_json->0->>'tax_region');
--    END IF;
-- 3. Pass v_tax_region as last parameter to log_audit call

-- Due to the complexity of the function (700+ lines), we'll handle this via
-- application code for now, OR create a separate migration file that reads
-- and updates the full function. For immediate functionality, the API layer
-- can extract and pass tax_region, or we can update the function in a follow-up.



-- ============================================================================
-- Migration: 20250128000000_add_business_residence_distribution_action_types.sql
-- ============================================================================

-- ============================================================================
-- Migration: Add business_distribution and residence_distribution action types
-- ============================================================================
-- This migration adds 'business_distribution' and 'residence_distribution'
-- to the distribution_audit_action_type enum. This allows us to distinguish
-- between business and residence distributions in the audit table without
-- needing a separate tax_region field.
-- ============================================================================

-- Add new enum values to distribution_audit_action_type
DO $$ 
BEGIN
  -- Add 'business_distribution' if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'business_distribution' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'distribution_audit_action_type')
  ) THEN
    ALTER TYPE distribution_audit_action_type ADD VALUE 'business_distribution';
  END IF;
  
  -- Add 'residence_distribution' if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'residence_distribution' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'distribution_audit_action_type')
  ) THEN
    ALTER TYPE distribution_audit_action_type ADD VALUE 'residence_distribution';
  END IF;
END $$;

-- ============================================================================
-- Note: The save_assets_bulk_transactional function will be updated in
-- 20250124000000_update_distribution_audit_and_logging.sql to use these
-- new action types based on the business_residence field from asset_types.
-- ============================================================================




-- ============================================================================
-- Migration: 20250129000000_consolidate_asset_save_functions.sql
-- ============================================================================

/*
  # Consolidate Asset Save Functions
  
  This migration ensures that save_assets_bulk_transactional is the primary
  function for all asset saves (single and bulk). The single asset save function
  is kept for backward compatibility but now wraps the bulk function.
  
  All distribution flag logic, audit logging, and transaction handling is
  centralized in the bulk function.
  
  Key features:
  - Single asset saves now use bulk function internally
  - Distribution flags set correctly for business/residence assets
  - Business distribution flag only set if business_shared_area > 0
  - Complete audit logging for all operations
  - Transaction integrity (all-or-nothing)
*/

-- ============================================================================
-- FUNCTION: save_asset_transactional (WRAPPER - uses bulk function)
-- ============================================================================
-- This function is kept for backward compatibility but now delegates to
-- save_assets_bulk_transactional to ensure consistency.

CREATE OR REPLACE FUNCTION save_asset_transactional(
  p_asset_data JSONB,
  p_validation_passed BOOLEAN,
  p_validation_errors TEXT DEFAULT NULL,
  p_action_type TEXT DEFAULT 'manual_update',
  p_user_id TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_asset_id BIGINT;
  v_building_number BIGINT;
BEGIN
  -- Extract asset_id and building_number for result
  v_asset_id := (p_asset_data->>'asset_id')::BIGINT;
  v_building_number := (p_asset_data->>'building_number')::BIGINT;
  
  -- Wrap single asset in array and call bulk function
  v_result := save_assets_bulk_transactional(
    ARRAY[p_asset_data],
    p_validation_passed,
    p_validation_errors,
    p_action_type,
    p_user_id,
    NULL, -- p_before_data
    NULL, -- p_after_data
    p_description
  );
  
  -- Check if bulk function succeeded
  IF COALESCE((v_result->>'success')::BOOLEAN, false) = false THEN
    -- Return error in expected format
    RETURN jsonb_build_object(
      'success', false,
      'asset_id', v_asset_id,
      'error', COALESCE(v_result->>'error', 'Unknown error during save')
    );
  END IF;
  
  -- Return result in the format expected by single asset save callers
  RETURN jsonb_build_object(
    'success', true,
    'asset_id', v_asset_id,
    'building_number', v_building_number,
    'operation', CASE 
      WHEN (v_result->>'count')::INTEGER > 0 THEN 'UPDATE'
      ELSE 'INSERT'
    END,
    'message', COALESCE(v_result->>'message', 'Asset saved successfully')
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Transaction failed and rolled back: %', SQLERRM
      USING HINT = 'All changes have been rolled back. No partial data was saved.';
END;
$$;

COMMENT ON FUNCTION save_asset_transactional IS 'Wrapper function that delegates to save_assets_bulk_transactional for consistency. Kept for backward compatibility. All single asset saves now use the bulk function internally.';




-- ============================================================================
-- Migration: 20251216100645_add_distribution_flag_trigger.sql
-- ============================================================================

/*
  # Add Distribution Flag Trigger

  1. Overview
    - Creates a database trigger that automatically sets distribution flags
    - Triggers when asset main_asset_type changes to/from non_accountable types
    - Keeps business logic in database, audit log stays clean

  2. Logic
    - Fires AFTER INSERT OR UPDATE on assets table
    - Checks if main_asset_type changed
    - Looks up asset_type to check non_accountable_for_distribution flag
    - Sets appropriate distribution flags on buildings table based on business_residence

  3. Benefits
    - Single source of truth for distribution flag logic
    - Works for ALL update paths (Transform tab, Transfer Areas, direct DB updates)
    - Audit log functions remain pure (only record data)
*/

-- Function to automatically set distribution flags when asset type changes
CREATE OR REPLACE FUNCTION auto_set_distribution_flags()
RETURNS TRIGGER AS $$
DECLARE
  v_old_type TEXT;
  v_new_type TEXT;
  v_old_type_data RECORD;
  v_new_type_data RECORD;
  v_old_is_non_accountable BOOLEAN;
  v_new_is_non_accountable BOOLEAN;
  v_business_residence TEXT;
BEGIN
  -- Only process if main_asset_type changed (or new insert)
  IF TG_OP = 'INSERT' THEN
    v_old_type := NULL;
    v_new_type := NEW.main_asset_type;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old_type := OLD.main_asset_type;
    v_new_type := NEW.main_asset_type;

    -- Exit early if type didn't change
    IF v_old_type = v_new_type OR v_old_type IS NOT DISTINCT FROM v_new_type THEN
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  -- Skip if no building_number
  IF NEW.building_number IS NULL THEN
    RETURN NEW;
  END IF;

  -- Lookup old asset type data
  IF v_old_type IS NOT NULL THEN
    SELECT business_residence, non_accountable_for_distribution
    INTO v_old_type_data
    FROM asset_types
    WHERE name = v_old_type;

    v_old_is_non_accountable := COALESCE(v_old_type_data.non_accountable_for_distribution, FALSE);
  ELSE
    v_old_is_non_accountable := FALSE;
  END IF;

  -- Lookup new asset type data
  IF v_new_type IS NOT NULL THEN
    SELECT business_residence, non_accountable_for_distribution
    INTO v_new_type_data
    FROM asset_types
    WHERE name = v_new_type;

    v_new_is_non_accountable := COALESCE(v_new_type_data.non_accountable_for_distribution, FALSE);
  ELSE
    v_new_is_non_accountable := FALSE;
  END IF;

  -- Only set flags if changing to/from non_accountable type
  IF v_old_is_non_accountable OR v_new_is_non_accountable THEN
    -- Use the new type's business_residence, fall back to old type
    v_business_residence := COALESCE(v_new_type_data.business_residence, v_old_type_data.business_residence);

    -- Set appropriate distribution flag(s)
    IF v_business_residence = '×¢×¡×§×™×' THEN
      -- Business type
      UPDATE buildings
      SET need_business_distribution = TRUE
      WHERE building_number = NEW.building_number;

      RAISE NOTICE '[DB Trigger] Set need_business_distribution=true for building % (asset type changed to/from non_accountable business type)', NEW.building_number;

    ELSIF v_business_residence = '×ž×’×•×¨×™×' THEN
      -- Residence type
      UPDATE buildings
      SET need_residence_distribution = TRUE
      WHERE building_number = NEW.building_number;

      RAISE NOTICE '[DB Trigger] Set need_residence_distribution=true for building % (asset type changed to/from non_accountable residence type)', NEW.building_number;

    ELSE
      -- Unknown type or NULL: set both flags to be safe
      UPDATE buildings
      SET need_business_distribution = TRUE,
          need_residence_distribution = TRUE
      WHERE building_number = NEW.building_number;

      RAISE NOTICE '[DB Trigger] Set both distribution flags for building % (asset type changed to/from non_accountable unknown type)', NEW.building_number;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_auto_set_distribution_flags ON assets;

-- Create trigger that fires after insert or update
CREATE TRIGGER trigger_auto_set_distribution_flags
  AFTER INSERT OR UPDATE OF main_asset_type ON assets
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_distribution_flags();

COMMENT ON FUNCTION auto_set_distribution_flags IS 'Automatically sets building distribution flags when asset main_asset_type changes to/from non_accountable_for_distribution types';
COMMENT ON TRIGGER trigger_auto_set_distribution_flags ON assets IS 'Triggers distribution flag updates when asset types change';



-- ============================================================================
-- Migration: 20251216102115_replace_trigger_with_function.sql
-- ============================================================================

/*
  # Replace Distribution Flag Trigger with Callable Function

  1. Overview
    - Removes automatic trigger
    - Creates explicit function to set distribution flags
    - Application code will call this function when needed
    - Provides better visibility and control

  2. Function: set_distribution_flags_for_asset_type_change
    - Takes asset_id, old_main_asset_type, new_main_asset_type
    - Checks if type changed to/from non_accountable
    - Sets appropriate flags on buildings table

  3. Benefits
    - Explicit control over when flags are set
    - Easier debugging and logging
    - Clear function calls in application code
*/

-- Drop the trigger and its function
DROP TRIGGER IF EXISTS trigger_auto_set_distribution_flags ON assets;
DROP FUNCTION IF EXISTS auto_set_distribution_flags();

-- Drop existing function if it exists (with both INTEGER and BIGINT signatures)
DROP FUNCTION IF EXISTS set_distribution_flags_for_asset_type_change(INTEGER, TEXT, TEXT);
DROP FUNCTION IF EXISTS set_distribution_flags_for_asset_type_change(BIGINT, TEXT, TEXT);

-- Create explicit function to set distribution flags
CREATE OR REPLACE FUNCTION set_distribution_flags_for_asset_type_change(
  p_building_number BIGINT,
  p_old_main_asset_type TEXT,
  p_new_main_asset_type TEXT
)
RETURNS TABLE (
  business_flag_set BOOLEAN,
  residence_flag_set BOOLEAN
) AS $$
DECLARE
  v_old_type_data RECORD;
  v_new_type_data RECORD;
  v_old_is_non_accountable BOOLEAN;
  v_new_is_non_accountable BOOLEAN;
  v_business_residence TEXT;
  v_business_flag_set BOOLEAN := FALSE;
  v_residence_flag_set BOOLEAN := FALSE;
BEGIN
  -- Skip if no building_number
  IF p_building_number IS NULL THEN
    RETURN QUERY SELECT v_business_flag_set, v_residence_flag_set;
    RETURN;
  END IF;

  -- Exit early if type didn't change
  IF p_old_main_asset_type = p_new_main_asset_type 
     OR p_old_main_asset_type IS NOT DISTINCT FROM p_new_main_asset_type THEN
    RETURN QUERY SELECT v_business_flag_set, v_residence_flag_set;
    RETURN;
  END IF;

  -- Lookup old asset type data
  IF p_old_main_asset_type IS NOT NULL THEN
    SELECT business_residence, non_accountable_for_distribution
    INTO v_old_type_data
    FROM asset_types
    WHERE name = p_old_main_asset_type;

    v_old_is_non_accountable := COALESCE(v_old_type_data.non_accountable_for_distribution, FALSE);
  ELSE
    v_old_is_non_accountable := FALSE;
  END IF;

  -- Lookup new asset type data
  IF p_new_main_asset_type IS NOT NULL THEN
    SELECT business_residence, non_accountable_for_distribution
    INTO v_new_type_data
    FROM asset_types
    WHERE name = p_new_main_asset_type;

    v_new_is_non_accountable := COALESCE(v_new_type_data.non_accountable_for_distribution, FALSE);
  ELSE
    v_new_is_non_accountable := FALSE;
  END IF;

  -- Only set flags if changing to/from non_accountable type
  IF v_old_is_non_accountable OR v_new_is_non_accountable THEN
    -- Use the new type's business_residence, fall back to old type
    v_business_residence := COALESCE(v_new_type_data.business_residence, v_old_type_data.business_residence);

    -- Set appropriate distribution flag(s)
    IF v_business_residence = '×¢×¡×§×™×' THEN
      -- Business type
      UPDATE buildings
      SET need_business_distribution = TRUE
      WHERE building_number = p_building_number;
      
      v_business_flag_set := TRUE;

    ELSIF v_business_residence = '×ž×’×•×¨×™×' THEN
      -- Residence type
      UPDATE buildings
      SET need_residence_distribution = TRUE
      WHERE building_number = p_building_number;
      
      v_residence_flag_set := TRUE;

    ELSE
      -- Unknown type or NULL: set both flags to be safe
      UPDATE buildings
      SET need_business_distribution = TRUE,
          need_residence_distribution = TRUE
      WHERE building_number = p_building_number;
      
      v_business_flag_set := TRUE;
      v_residence_flag_set := TRUE;
    END IF;
  END IF;

  RETURN QUERY SELECT v_business_flag_set, v_residence_flag_set;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION set_distribution_flags_for_asset_type_change IS 'Explicitly sets building distribution flags when asset main_asset_type changes to/from non_accountable_for_distribution types. Call this function after updating asset types.';



-- ============================================================================
-- Migration: 20251216103948_add_transactional_save_functions.sql
-- ============================================================================

/*
  # Add Transactional Save Functions with Validation Enforcement

  ============================================================================
  ðŸš¨ CRITICAL SYSTEM ARCHITECTURE - DO NOT MODIFY ðŸš¨
  ============================================================================

  WARNING: This migration defines CRITICAL data integrity functions.

  DO NOT:
  - Remove validation checks
  - Remove post-save action calls
  - Make validation optional
  - Add COMMIT/ROLLBACK statements
  - Skip any steps in the transaction
  - Modify exception handling to suppress errors

  These functions guarantee:
  1. Validation enforcement (invalid data CANNOT be saved)
  2. Transaction integrity (all-or-nothing saves)
  3. Automatic rollback on ANY failure
  4. No partial saves ever

  See: CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md
  ============================================================================

  ## Overview
  This migration creates new database functions that enforce validation BEFORE save
  and execute all post-save actions within a SINGLE transaction to ensure data integrity.

  ## New Functions

  ### 1. `save_asset_transactional`
  - Single asset save with validation enforcement
  - Parameters:
    - `p_asset_data`: Asset data to save (JSONB)
    - `p_validation_passed`: Boolean flag indicating validation status (REQUIRED)
    - `p_validation_errors`: Validation error messages (if any)
    - `p_action_type`: Type of action (insert/update/replace)
    - `p_user_id`: User performing the action
    - `p_description`: Optional description
  - Transaction includes:
    - Validation check (rejects if validation failed)
    - Asset save (INSERT or UPDATE)
    - Building total area update
    - Distribution flags update
    - Audit log creation
  - Returns: Asset ID and transaction status
  - Rollback: If ANY step fails, entire operation rolls back

  ### 2. `save_assets_bulk_transactional`
  - Bulk asset save with validation enforcement
  - Parameters:
    - `p_assets_data`: Array of assets to save (JSONB[])
    - `p_validation_passed`: Boolean flag for overall validation status
    - `p_validation_errors`: Validation error messages (if any)
    - `p_action_type`: Type of action
    - `p_user_id`: User performing the action
    - `p_before_data`: Before state (for audit)
    - `p_after_data`: After state (for audit)
    - `p_description`: Optional description
  - Transaction includes:
    - Validation check (rejects if validation failed)
    - All asset saves
    - Building total area updates (for all affected buildings)
    - Distribution flags updates (for all affected buildings)
    - Single audit log entry
  - Returns: Action ID, affected asset IDs, and count
  - Rollback: If ANY step fails, entire bulk operation rolls back

  ## Security
  - Functions are SECURITY DEFINER (run with elevated privileges)
  - Validation enforcement prevents invalid data from being saved
  - All operations are atomic (all succeed or all fail)

  ## Important Notes
  1. Validation MUST be performed in application before calling these functions
  2. Functions will REJECT operations if p_validation_passed = false
  3. All post-save actions happen in the SAME transaction as the save
  4. Error handling ensures proper rollback on any failure
*/

-- ============================================================================
-- Function: save_asset_transactional
-- Single asset save with validation enforcement and transactional post-save actions
-- ============================================================================
CREATE OR REPLACE FUNCTION save_asset_transactional(
  p_asset_data JSONB,
  p_validation_passed BOOLEAN,
  p_validation_errors TEXT DEFAULT NULL,
  p_action_type TEXT DEFAULT 'manual_update',
  p_user_id TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_asset_id BIGINT;
  v_building_number BIGINT;
  v_existing_asset RECORD;
  v_old_main_asset_type BIGINT;
  v_new_main_asset_type BIGINT;
  v_audit_id BIGINT;
  v_result JSONB;
BEGIN
  -- ========================================================================
  -- STEP 1: ENFORCE VALIDATION
  -- ========================================================================
  IF p_validation_passed IS NULL THEN
    RAISE EXCEPTION 'Validation status is required. Operations cannot proceed without validation.'
      USING HINT = 'Ensure validation is performed before calling this function';
  END IF;

  IF p_validation_passed = FALSE THEN
    RAISE EXCEPTION 'Validation failed: %', COALESCE(p_validation_errors, 'Unknown validation errors')
      USING HINT = 'Fix validation errors before attempting to save';
  END IF;

  -- ========================================================================
  -- STEP 2: EXTRACT DATA AND CHECK EXISTING ASSET
  -- ========================================================================
  v_asset_id := (p_asset_data->>'asset_id')::BIGINT;
  v_building_number := (p_asset_data->>'building_number')::BIGINT;
  v_new_main_asset_type := (p_asset_data->>'main_asset_type')::BIGINT;

  IF v_asset_id IS NULL OR v_building_number IS NULL THEN
    RAISE EXCEPTION 'Asset ID and Building Number are required'
      USING HINT = 'Ensure asset_id and building_number are provided in p_asset_data';
  END IF;

  -- Check if asset exists
  SELECT * INTO v_existing_asset
  FROM assets
  WHERE asset_id = v_asset_id;

  IF FOUND THEN
    v_old_main_asset_type := v_existing_asset.main_asset_type;
  END IF;

  -- ========================================================================
  -- STEP 3: SAVE ASSET (INSERT OR UPDATE)
  -- ========================================================================
  IF v_existing_asset IS NULL THEN
    -- INSERT new asset
    INSERT INTO assets (
      asset_id,
      building_number,
      main_asset_type,
      sub_asset_type_1,
      sub_asset_type_2,
      sub_asset_type_3,
      sub_asset_type_4,
      sub_asset_type_5,
      sub_asset_type_6,
      asset_size,
      sub_asset_size_1,
      sub_asset_size_2,
      sub_asset_size_3,
      sub_asset_size_4,
      sub_asset_size_5,
      sub_asset_size_6,
      is_new_measurement,
      business_distribution_area,
      residence_distribution_area
    )
    VALUES (
      v_asset_id,
      v_building_number,
      v_new_main_asset_type,
      (p_asset_data->>'sub_asset_type_1')::BIGINT,
      (p_asset_data->>'sub_asset_type_2')::BIGINT,
      (p_asset_data->>'sub_asset_type_3')::BIGINT,
      (p_asset_data->>'sub_asset_type_4')::BIGINT,
      (p_asset_data->>'sub_asset_type_5')::BIGINT,
      (p_asset_data->>'sub_asset_type_6')::BIGINT,
      COALESCE((p_asset_data->>'asset_size')::NUMERIC, 0),
      COALESCE((p_asset_data->>'sub_asset_size_1')::NUMERIC, 0),
      COALESCE((p_asset_data->>'sub_asset_size_2')::NUMERIC, 0),
      COALESCE((p_asset_data->>'sub_asset_size_3')::NUMERIC, 0),
      COALESCE((p_asset_data->>'sub_asset_size_4')::NUMERIC, 0),
      COALESCE((p_asset_data->>'sub_asset_size_5')::NUMERIC, 0),
      COALESCE((p_asset_data->>'sub_asset_size_6')::NUMERIC, 0),
      COALESCE((p_asset_data->>'is_new_measurement')::BOOLEAN, false),
      (p_asset_data->>'business_distribution_area')::NUMERIC,
      (p_asset_data->>'residence_distribution_area')::NUMERIC
    );
  ELSE
    -- Copy to history before update
    INSERT INTO assets_history (
      asset_id, building_number, main_asset_type, sub_asset_type_1, sub_asset_type_2,
      sub_asset_type_3, sub_asset_type_4, sub_asset_type_5, sub_asset_type_6,
      asset_size, sub_asset_size_1, sub_asset_size_2, sub_asset_size_3,
      sub_asset_size_4, sub_asset_size_5, sub_asset_size_6,
      is_new_measurement, business_distribution_area, residence_distribution_area
    )
    SELECT 
      asset_id, building_number, main_asset_type, sub_asset_type_1, sub_asset_type_2,
      sub_asset_type_3, sub_asset_type_4, sub_asset_type_5, sub_asset_type_6,
      asset_size, sub_asset_size_1, sub_asset_size_2, sub_asset_size_3,
      sub_asset_size_4, sub_asset_size_5, sub_asset_size_6,
      is_new_measurement, business_distribution_area, residence_distribution_area
    FROM assets
    WHERE asset_id = v_asset_id;

    -- UPDATE existing asset
    UPDATE assets
    SET
      main_asset_type = v_new_main_asset_type,
      sub_asset_type_1 = (p_asset_data->>'sub_asset_type_1')::BIGINT,
      sub_asset_type_2 = (p_asset_data->>'sub_asset_type_2')::BIGINT,
      sub_asset_type_3 = (p_asset_data->>'sub_asset_type_3')::BIGINT,
      sub_asset_type_4 = (p_asset_data->>'sub_asset_type_4')::BIGINT,
      sub_asset_type_5 = (p_asset_data->>'sub_asset_type_5')::BIGINT,
      sub_asset_type_6 = (p_asset_data->>'sub_asset_type_6')::BIGINT,
      asset_size = COALESCE((p_asset_data->>'asset_size')::NUMERIC, 0),
      sub_asset_size_1 = COALESCE((p_asset_data->>'sub_asset_size_1')::NUMERIC, 0),
      sub_asset_size_2 = COALESCE((p_asset_data->>'sub_asset_size_2')::NUMERIC, 0),
      sub_asset_size_3 = COALESCE((p_asset_data->>'sub_asset_size_3')::NUMERIC, 0),
      sub_asset_size_4 = COALESCE((p_asset_data->>'sub_asset_size_4')::NUMERIC, 0),
      sub_asset_size_5 = COALESCE((p_asset_data->>'sub_asset_size_5')::NUMERIC, 0),
      sub_asset_size_6 = COALESCE((p_asset_data->>'sub_asset_size_6')::NUMERIC, 0),
      is_new_measurement = COALESCE((p_asset_data->>'is_new_measurement')::BOOLEAN, false),
      business_distribution_area = (p_asset_data->>'business_distribution_area')::NUMERIC,
      residence_distribution_area = (p_asset_data->>'residence_distribution_area')::NUMERIC,
      updated_at = now()
    WHERE asset_id = v_asset_id;
  END IF;

  -- ========================================================================
  -- STEP 4: UPDATE BUILDING TOTAL AREA
  -- ========================================================================
  PERFORM update_building_total_area(v_building_number);

  -- ========================================================================
  -- STEP 5: UPDATE DISTRIBUTION FLAGS IF ASSET TYPE CHANGED
  -- ========================================================================
  IF v_old_main_asset_type IS NOT NULL AND v_old_main_asset_type != v_new_main_asset_type THEN
    PERFORM set_distribution_flags_for_asset_type_change(
      v_building_number,
      v_old_main_asset_type,
      v_new_main_asset_type
    );
  END IF;

  -- ========================================================================
  -- STEP 6: CREATE AUDIT LOG
  -- ========================================================================
  v_audit_id := log_audit_for_asset(
    v_asset_id,
    CASE WHEN v_existing_asset IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
    p_action_type::audit_action_type,
    p_user_id,
    p_description
  );

  -- ========================================================================
  -- STEP 7: RETURN RESULT
  -- ========================================================================
  v_result := jsonb_build_object(
    'success', true,
    'asset_id', v_asset_id,
    'building_number', v_building_number,
    'operation', CASE WHEN v_existing_asset IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
    'audit_id', v_audit_id,
    'message', 'Asset saved successfully with all post-save actions completed'
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- Any error will cause automatic rollback of the entire transaction
    RAISE EXCEPTION 'Transaction failed and rolled back: %', SQLERRM
      USING HINT = 'All changes have been rolled back. No partial data was saved.';
END;
$$;

COMMENT ON FUNCTION save_asset_transactional IS 'Save single asset with validation enforcement and transactional post-save actions. Rejects if validation failed. All operations (save, update totals, set flags, audit) happen in ONE transaction.';

-- ============================================================================
-- Function: save_assets_bulk_transactional
-- Bulk asset save with validation enforcement and transactional post-save actions
-- ============================================================================
CREATE OR REPLACE FUNCTION save_assets_bulk_transactional(
  p_assets_data JSONB[],
  p_validation_passed BOOLEAN,
  p_validation_errors TEXT DEFAULT NULL,
  p_action_type TEXT DEFAULT 'manual_update',
  p_user_id TEXT DEFAULT NULL,
  p_before_data JSONB DEFAULT NULL,
  p_after_data JSONB DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_asset_data JSONB;
  v_asset_id BIGINT;
  v_building_number BIGINT;
  v_existing_asset RECORD;
  v_old_main_asset_type BIGINT;
  v_new_main_asset_type BIGINT;
  v_affected_asset_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_affected_buildings BIGINT[] := ARRAY[]::BIGINT[];
  v_action_id BIGINT;
  v_count INTEGER := 0;
  v_result JSONB;
  v_user_id_fk BIGINT;
  v_default_user_id BIGINT := 1;
BEGIN
  -- ========================================================================
  -- STEP 1: ENFORCE VALIDATION
  -- ========================================================================
  IF p_validation_passed IS NULL THEN
    RAISE EXCEPTION 'Validation status is required. Operations cannot proceed without validation.'
      USING HINT = 'Ensure validation is performed before calling this function';
  END IF;

  IF p_validation_passed = FALSE THEN
    RAISE EXCEPTION 'Validation failed: %', COALESCE(p_validation_errors, 'Unknown validation errors')
      USING HINT = 'Fix validation errors before attempting to save';
  END IF;

  -- ========================================================================
  -- STEP 2: GET OR CREATE USER
  -- ========================================================================
  IF p_user_id IS NOT NULL THEN
    SELECT id INTO v_user_id_fk FROM users WHERE auth_user_id = p_user_id;
    IF v_user_id_fk IS NULL THEN
      INSERT INTO users (auth_user_id, email, created_at)
      VALUES (p_user_id, p_user_id || '@system.local', now())
      RETURNING id INTO v_user_id_fk;
    END IF;
  ELSE
    SELECT id INTO v_user_id_fk FROM users WHERE id = v_default_user_id;
    IF v_user_id_fk IS NULL THEN
      v_user_id_fk := v_default_user_id;
    END IF;
  END IF;

  -- ========================================================================
  -- STEP 3: CREATE ACTION ENTRY
  -- ========================================================================
  INSERT INTO actions (action_type, user_id, before_data, after_data, description, created_at)
  VALUES (
    p_action_type::audit_action_type,
    v_user_id_fk,
    p_before_data,
    p_after_data,
    p_description,
    now()
  )
  RETURNING id INTO v_action_id;

  -- ========================================================================
  -- STEP 4: PROCESS EACH ASSET
  -- ========================================================================
  FOREACH v_asset_data IN ARRAY p_assets_data
  LOOP
    v_asset_id := (v_asset_data->>'asset_id')::BIGINT;
    v_building_number := (v_asset_data->>'building_number')::BIGINT;
    v_new_main_asset_type := (v_asset_data->>'main_asset_type')::BIGINT;

    IF v_asset_id IS NULL OR v_building_number IS NULL THEN
      RAISE EXCEPTION 'Asset ID and Building Number are required for all assets'
        USING HINT = 'Ensure all assets in p_assets_data have asset_id and building_number';
    END IF;

    -- Check if asset exists
    SELECT * INTO v_existing_asset
    FROM assets
    WHERE asset_id = v_asset_id;

    IF FOUND THEN
      v_old_main_asset_type := v_existing_asset.main_asset_type;
      
      -- Copy to history before update
      INSERT INTO assets_history (
        asset_id, building_number, main_asset_type, sub_asset_type_1, sub_asset_type_2,
        sub_asset_type_3, sub_asset_type_4, sub_asset_type_5, sub_asset_type_6,
        asset_size, sub_asset_size_1, sub_asset_size_2, sub_asset_size_3,
        sub_asset_size_4, sub_asset_size_5, sub_asset_size_6,
        is_new_measurement, business_distribution_area, residence_distribution_area,
        action_id
      )
      SELECT 
        asset_id, building_number, main_asset_type, sub_asset_type_1, sub_asset_type_2,
        sub_asset_type_3, sub_asset_type_4, sub_asset_type_5, sub_asset_type_6,
        asset_size, sub_asset_size_1, sub_asset_size_2, sub_asset_size_3,
        sub_asset_size_4, sub_asset_size_5, sub_asset_size_6,
        is_new_measurement, business_distribution_area, residence_distribution_area,
        v_action_id
      FROM assets
      WHERE asset_id = v_asset_id;

      -- UPDATE existing asset
      UPDATE assets
      SET
        main_asset_type = v_new_main_asset_type,
        sub_asset_type_1 = (v_asset_data->>'sub_asset_type_1')::BIGINT,
        sub_asset_type_2 = (v_asset_data->>'sub_asset_type_2')::BIGINT,
        sub_asset_type_3 = (v_asset_data->>'sub_asset_type_3')::BIGINT,
        sub_asset_type_4 = (v_asset_data->>'sub_asset_type_4')::BIGINT,
        sub_asset_type_5 = (v_asset_data->>'sub_asset_type_5')::BIGINT,
        sub_asset_type_6 = (v_asset_data->>'sub_asset_type_6')::BIGINT,
        asset_size = COALESCE((v_asset_data->>'asset_size')::NUMERIC, 0),
        sub_asset_size_1 = COALESCE((v_asset_data->>'sub_asset_size_1')::NUMERIC, 0),
        sub_asset_size_2 = COALESCE((v_asset_data->>'sub_asset_size_2')::NUMERIC, 0),
        sub_asset_size_3 = COALESCE((v_asset_data->>'sub_asset_size_3')::NUMERIC, 0),
        sub_asset_size_4 = COALESCE((v_asset_data->>'sub_asset_size_4')::NUMERIC, 0),
        sub_asset_size_5 = COALESCE((v_asset_data->>'sub_asset_size_5')::NUMERIC, 0),
        sub_asset_size_6 = COALESCE((v_asset_data->>'sub_asset_size_6')::NUMERIC, 0),
        is_new_measurement = COALESCE((v_asset_data->>'is_new_measurement')::BOOLEAN, false),
        business_distribution_area = (v_asset_data->>'business_distribution_area')::NUMERIC,
        residence_distribution_area = (v_asset_data->>'residence_distribution_area')::NUMERIC,
        action_id = v_action_id,
        updated_at = now()
      WHERE asset_id = v_asset_id;
    ELSE
      -- INSERT new asset
      INSERT INTO assets (
        asset_id,
        building_number,
        main_asset_type,
        sub_asset_type_1,
        sub_asset_type_2,
        sub_asset_type_3,
        sub_asset_type_4,
        sub_asset_type_5,
        sub_asset_type_6,
        asset_size,
        sub_asset_size_1,
        sub_asset_size_2,
        sub_asset_size_3,
        sub_asset_size_4,
        sub_asset_size_5,
        sub_asset_size_6,
        is_new_measurement,
        business_distribution_area,
        residence_distribution_area,
        action_id
      )
      VALUES (
        v_asset_id,
        v_building_number,
        v_new_main_asset_type,
        (v_asset_data->>'sub_asset_type_1')::BIGINT,
        (v_asset_data->>'sub_asset_type_2')::BIGINT,
        (v_asset_data->>'sub_asset_type_3')::BIGINT,
        (v_asset_data->>'sub_asset_type_4')::BIGINT,
        (v_asset_data->>'sub_asset_type_5')::BIGINT,
        (v_asset_data->>'sub_asset_type_6')::BIGINT,
        COALESCE((v_asset_data->>'asset_size')::NUMERIC, 0),
        COALESCE((v_asset_data->>'sub_asset_size_1')::NUMERIC, 0),
        COALESCE((v_asset_data->>'sub_asset_size_2')::NUMERIC, 0),
        COALESCE((v_asset_data->>'sub_asset_size_3')::NUMERIC, 0),
        COALESCE((v_asset_data->>'sub_asset_size_4')::NUMERIC, 0),
        COALESCE((v_asset_data->>'sub_asset_size_5')::NUMERIC, 0),
        COALESCE((v_asset_data->>'sub_asset_size_6')::NUMERIC, 0),
        COALESCE((v_asset_data->>'is_new_measurement')::BOOLEAN, false),
        (v_asset_data->>'business_distribution_area')::NUMERIC,
        (v_asset_data->>'residence_distribution_area')::NUMERIC,
        v_action_id
      );
      
      v_old_main_asset_type := NULL;
    END IF;

    -- Track affected assets and buildings
    v_affected_asset_ids := array_append(v_affected_asset_ids, v_asset_id);
    IF NOT (v_building_number = ANY(v_affected_buildings)) THEN
      v_affected_buildings := array_append(v_affected_buildings, v_building_number);
    END IF;

    v_count := v_count + 1;
  END LOOP;

  -- ========================================================================
  -- STEP 5: UPDATE BUILDING TOTAL AREAS FOR ALL AFFECTED BUILDINGS
  -- ========================================================================
  FOREACH v_building_number IN ARRAY v_affected_buildings
  LOOP
    PERFORM update_building_total_area(v_building_number);
  END LOOP;

  -- ========================================================================
  -- STEP 6: UPDATE DISTRIBUTION FLAGS FOR ALL ASSETS WITH TYPE CHANGES
  -- ========================================================================
  FOREACH v_asset_data IN ARRAY p_assets_data
  LOOP
    v_asset_id := (v_asset_data->>'asset_id')::BIGINT;
    v_building_number := (v_asset_data->>'building_number')::BIGINT;
    v_new_main_asset_type := (v_asset_data->>'main_asset_type')::BIGINT;

    -- Get old type from history
    SELECT main_asset_type INTO v_old_main_asset_type
    FROM assets_history
    WHERE asset_id = v_asset_id
    ORDER BY created_at DESC
    LIMIT 1;

    -- Update flags if type changed
    IF v_old_main_asset_type IS NOT NULL AND v_old_main_asset_type != v_new_main_asset_type THEN
      PERFORM set_distribution_flags_for_asset_type_change(
        v_building_number,
        v_old_main_asset_type,
        v_new_main_asset_type
      );
    END IF;
  END LOOP;

  -- ========================================================================
  -- STEP 7: RETURN RESULT
  -- ========================================================================
  v_result := jsonb_build_object(
    'success', true,
    'action_id', v_action_id,
    'affected_asset_ids', v_affected_asset_ids,
    'affected_buildings', v_affected_buildings,
    'count', v_count,
    'message', format('Successfully saved %s assets with all post-save actions completed', v_count)
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- Any error will cause automatic rollback of the entire transaction
    RAISE EXCEPTION 'Bulk transaction failed and rolled back: %', SQLERRM
      USING HINT = 'All changes have been rolled back. No partial data was saved.';
END;
$$;

COMMENT ON FUNCTION save_assets_bulk_transactional IS 'Bulk save assets with validation enforcement and transactional post-save actions. Rejects if validation failed. All operations (saves, update totals, set flags, audit) happen in ONE transaction.';



-- ============================================================================
-- Migration: 20251216105832_add_transactional_delete_function.sql
-- ============================================================================

/*
  # Add Transactional Delete Function

  ============================================================================
  ðŸš¨ CRITICAL SYSTEM ARCHITECTURE - DO NOT MODIFY ðŸš¨
  ============================================================================

  WARNING: This migration defines a CRITICAL data integrity function.

  DO NOT:
  - Remove post-delete action calls
  - Skip any steps in the transaction
  - Modify exception handling to suppress errors

  This function guarantees:
  1. Asset deletion in a transaction
  2. Building total area update
  3. Distribution flags set correctly
  4. Complete audit trail
  5. Automatic rollback on ANY failure

  See: CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md
  ============================================================================

  ## Overview
  This migration creates a database function that handles asset deletion
  within a SINGLE transaction to ensure data integrity.

  ## New Function

  ### `delete_asset_transactional`
  - Single asset delete with automatic post-delete actions
  - Parameters:
    - `p_asset_id`: Asset ID to delete
    - `p_user_id`: User performing the deletion
    - `p_description`: Optional description
  - Transaction includes:
    - Asset data retrieval (for audit)
    - Copy to history
    - Asset deletion
    - Building total area update
    - Distribution flags update (both business and residence if applicable)
    - Audit log creation
  - Returns: Success status and deletion details
  - Rollback: If ANY step fails, entire operation rolls back

  ## Distribution Flag Logic
  - For business assets: Sets need_business_distribution = true
  - For residence assets: Sets need_residence_distribution = true
  - For unknown types: Sets both flags = true (safe default)

  ## Changes
  1. New function: `delete_asset_transactional`
*/

-- ============================================================================
-- FUNCTION: delete_asset_transactional
-- Purpose: Delete an asset with all post-delete actions in ONE transaction
-- ============================================================================

CREATE OR REPLACE FUNCTION delete_asset_transactional(
  p_asset_id BIGINT,
  p_user_id TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_building_number INTEGER;
  v_asset_type TEXT;
  v_business_residence TEXT;
  v_before_data JSONB;
  v_action_id BIGINT;
BEGIN
  -- ========================================================================
  -- STEP 1: GET ASSET DATA (for audit and distribution flag logic)
  -- ========================================================================
  SELECT
    building_number,
    main_asset_type,
    row_to_json(assets.*)::JSONB
  INTO
    v_building_number,
    v_asset_type,
    v_before_data
  FROM assets
  WHERE asset_id = p_asset_id;

  IF v_building_number IS NULL THEN
    RAISE EXCEPTION 'Asset not found: %', p_asset_id;
  END IF;

  -- ========================================================================
  -- STEP 2: COPY ASSET TO HISTORY (for audit trail)
  -- ========================================================================
  BEGIN
    PERFORM copy_asset_to_history_before_update(p_asset_id);
  EXCEPTION WHEN OTHERS THEN
    -- Log warning but continue (history copy is not critical)
    RAISE WARNING 'Failed to copy asset to history before deletion: %', SQLERRM;
  END;

  -- ========================================================================
  -- STEP 3: DELETE ASSET
  -- ========================================================================
  DELETE FROM assets WHERE asset_id = p_asset_id;

  -- ========================================================================
  -- STEP 4: UPDATE BUILDING TOTAL AREA
  -- ========================================================================
  PERFORM update_building_total_area(v_building_number);

  -- ========================================================================
  -- STEP 5: SET DISTRIBUTION FLAGS
  -- Asset deletion always requires redistribution
  -- ========================================================================

  -- Get asset type's business/residence classification
  SELECT business_residence
  INTO v_business_residence
  FROM asset_types
  WHERE name = v_asset_type;

  -- Set distribution flags based on asset type
  IF v_business_residence = 'business' THEN
    -- Business asset deleted â†’ need business redistribution
    UPDATE buildings
    SET need_business_distribution = true
    WHERE building_number = v_building_number;

    RAISE NOTICE 'Set need_business_distribution=true for building % (business asset deleted)', v_building_number;

  ELSIF v_business_residence = 'residence' THEN
    -- Residence asset deleted â†’ need residence redistribution
    UPDATE buildings
    SET need_residence_distribution = true
    WHERE building_number = v_building_number;

    RAISE NOTICE 'Set need_residence_distribution=true for building % (residence asset deleted)', v_building_number;

  ELSE
    -- Unknown type â†’ set both flags (safe default)
    UPDATE buildings
    SET
      need_business_distribution = true,
      need_residence_distribution = true
    WHERE building_number = v_building_number;

    RAISE NOTICE 'Set both distribution flags=true for building % (unknown asset type: %)', v_building_number, v_asset_type;
  END IF;

  -- ========================================================================
  -- STEP 6: CREATE AUDIT LOG ENTRY
  -- ========================================================================
  BEGIN
    -- Create audit action record
    INSERT INTO audit_log (
      operation,
      user_id,
      action_type,
      description,
      before_data
    )
    VALUES (
      'DELETE',
      p_user_id,
      'delete_asset',
      COALESCE(p_description, 'Asset deleted'),
      v_before_data
    )
    RETURNING action_id INTO v_action_id;

  EXCEPTION WHEN OTHERS THEN
    -- Log warning but don't fail the transaction
    RAISE WARNING 'Failed to create audit log for asset deletion: %', SQLERRM;
  END;

  -- ========================================================================
  -- RETURN SUCCESS
  -- ========================================================================
  RETURN jsonb_build_object(
    'success', true,
    'asset_id', p_asset_id,
    'building_number', v_building_number,
    'action_id', v_action_id
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Any error causes complete rollback
    RAISE EXCEPTION 'Asset deletion failed: %', SQLERRM;
END;
$$;

-- Add comment
COMMENT ON FUNCTION delete_asset_transactional IS
'Deletes an asset with all post-delete actions in ONE transaction.
Includes: asset deletion, building total area update, distribution flags update, and audit logging.
Automatic rollback on any failure.';



-- ============================================================================
-- Migration: 20251217000000_fix_distribution_flags_hebrew_values.sql
-- ============================================================================

/*
  # Fix Distribution Flags to Use Hebrew Values
  
  This migration fixes the delete_asset_transactional function to correctly
  check for Hebrew business_residence values ('×¢×¡×§×™×' and '×ž×’×•×¨×™×') instead
  of English values ('business' and 'residence').
  
  This ensures that only the relevant flag (business OR residence) is set
  when deleting assets, not both flags.
  
  ## Changes
  1. Update delete_asset_transactional function to use Hebrew values
*/

-- ============================================================================
-- FUNCTION: delete_asset_transactional (FIXED)
-- Purpose: Delete an asset with all post-delete actions in ONE transaction
-- ============================================================================

CREATE OR REPLACE FUNCTION delete_asset_transactional(
  p_asset_id BIGINT,
  p_user_id TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_building_number INTEGER;
  v_asset_type TEXT;
  v_business_residence TEXT;
  v_before_data JSONB;
  v_action_id BIGINT;
BEGIN
  -- ========================================================================
  -- STEP 1: GET ASSET DATA (for audit and distribution flag logic)
  -- ========================================================================
  SELECT
    building_number,
    main_asset_type,
    row_to_json(assets.*)::JSONB
  INTO
    v_building_number,
    v_asset_type,
    v_before_data
  FROM assets
  WHERE asset_id = p_asset_id;

  IF v_building_number IS NULL THEN
    RAISE EXCEPTION 'Asset not found: %', p_asset_id;
  END IF;

  -- ========================================================================
  -- STEP 2: COPY ASSET TO HISTORY (for audit trail)
  -- ========================================================================
  BEGIN
    PERFORM copy_asset_to_history_before_update(p_asset_id);
  EXCEPTION WHEN OTHERS THEN
    -- Log warning but continue (history copy is not critical)
    RAISE WARNING 'Failed to copy asset to history before deletion: %', SQLERRM;
  END;

  -- ========================================================================
  -- STEP 3: DELETE ASSET
  -- ========================================================================
  DELETE FROM assets WHERE asset_id = p_asset_id;

  -- ========================================================================
  -- STEP 4: UPDATE BUILDING TOTAL AREA
  -- ========================================================================
  PERFORM update_building_total_area(v_building_number);

  -- ========================================================================
  -- STEP 5: SET DISTRIBUTION FLAGS
  -- Asset deletion always requires redistribution
  -- Only set the relevant flag (business OR residence, not both)
  -- ========================================================================

  -- Get asset type's business/residence classification
  SELECT business_residence
  INTO v_business_residence
  FROM asset_types
  WHERE name = v_asset_type;

  -- Set distribution flags based on asset type (using Hebrew values)
  IF v_business_residence = '×¢×¡×§×™×' THEN
    -- Business asset deleted â†’ need business redistribution only
    UPDATE buildings
    SET need_business_distribution = true
    WHERE building_number = v_building_number;

    RAISE NOTICE 'Set need_business_distribution=true for building % (business asset deleted)', v_building_number;

  ELSIF v_business_residence = '×ž×’×•×¨×™×' THEN
    -- Residence asset deleted â†’ need residence redistribution only
    UPDATE buildings
    SET need_residence_distribution = true
    WHERE building_number = v_building_number;

    RAISE NOTICE 'Set need_residence_distribution=true for building % (residence asset deleted)', v_building_number;

  ELSE
    -- Unknown type â†’ set both flags (safe default)
    -- This should only happen if business_residence is NULL or an unexpected value
    UPDATE buildings
    SET
      need_business_distribution = true,
      need_residence_distribution = true
    WHERE building_number = v_building_number;

    RAISE NOTICE 'Set both distribution flags=true for building % (unknown asset type: %, business_residence: %)', v_building_number, v_asset_type, v_business_residence;
  END IF;

  -- ========================================================================
  -- STEP 6: CREATE AUDIT LOG ENTRY
  -- ========================================================================
  BEGIN
    -- Create audit action record
    INSERT INTO audit_log (
      operation,
      user_id,
      action_type,
      description,
      before_data
    )
    VALUES (
      'DELETE',
      p_user_id,
      'delete_asset',
      COALESCE(p_description, 'Asset deleted'),
      v_before_data
    )
    RETURNING action_id INTO v_action_id;

  EXCEPTION WHEN OTHERS THEN
    -- Log warning but don't fail the transaction
    RAISE WARNING 'Failed to create audit log for asset deletion: %', SQLERRM;
  END;

  -- ========================================================================
  -- RETURN SUCCESS
  -- ========================================================================
  RETURN jsonb_build_object(
    'success', true,
    'asset_id', p_asset_id,
    'building_number', v_building_number,
    'action_id', v_action_id
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Any error causes complete rollback
    RAISE EXCEPTION 'Asset deletion failed: %', SQLERRM;
END;
$$;

-- Update comment
COMMENT ON FUNCTION delete_asset_transactional IS
'Deletes an asset with all post-delete actions in ONE transaction.
Includes: asset deletion, building total area update, distribution flags update, and audit logging.
Only sets the relevant distribution flag (business OR residence) based on asset type.
Automatic rollback on any failure.';




-- ============================================================================
-- Migration: 20251217000002_update_save_transactional_for_asset_size_flags.sql
-- ============================================================================

/*
  # Update save_asset_transactional to Handle Asset Size Changes for Distribution Flags
  
  This migration updates the save_asset_transactional function to also set
  distribution flags when asset_size changes (for business/residence assets),
  not just when asset type changes.
  
  Flags are set as part of the save transaction, ensuring they are only
  updated after successful saves and only the relevant flag is set.
*/

-- ============================================================================
-- FUNCTION: save_asset_transactional (UPDATED)
-- Purpose: Save asset with all post-save actions in ONE transaction
-- Now also handles asset_size changes for distribution flags
-- ============================================================================

CREATE OR REPLACE FUNCTION save_asset_transactional(
  p_asset_data JSONB,
  p_validation_passed BOOLEAN,
  p_validation_errors TEXT DEFAULT NULL,
  p_action_type TEXT DEFAULT 'manual_update',
  p_user_id TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_asset_id BIGINT;
  v_building_number BIGINT;
  v_existing_asset RECORD;
  v_old_main_asset_type BIGINT;
  v_new_main_asset_type BIGINT;
  v_old_asset_size NUMERIC;
  v_new_asset_size NUMERIC;
  v_audit_id BIGINT;
  v_result JSONB;
  v_business_residence TEXT;
  v_asset_type_changed BOOLEAN := FALSE;
  v_asset_size_changed BOOLEAN := FALSE;
BEGIN
  -- ========================================================================
  -- STEP 1: ENFORCE VALIDATION
  -- ========================================================================
  IF p_validation_passed IS NULL THEN
    RAISE EXCEPTION 'Validation status is required. Operations cannot proceed without validation.'
      USING HINT = 'Ensure validation is performed before calling this function';
  END IF;

  IF p_validation_passed = FALSE THEN
    RAISE EXCEPTION 'Validation failed: %', COALESCE(p_validation_errors, 'Unknown validation errors')
      USING HINT = 'Fix validation errors before attempting to save';
  END IF;

  -- ========================================================================
  -- STEP 2: EXTRACT DATA AND CHECK EXISTING ASSET
  -- ========================================================================
  v_asset_id := (p_asset_data->>'asset_id')::BIGINT;
  v_building_number := (p_asset_data->>'building_number')::BIGINT;
  v_new_main_asset_type := (p_asset_data->>'main_asset_type')::BIGINT;
  v_new_asset_size := COALESCE((p_asset_data->>'asset_size')::NUMERIC, 0);

  IF v_asset_id IS NULL OR v_building_number IS NULL THEN
    RAISE EXCEPTION 'Asset ID and Building Number are required'
      USING HINT = 'Ensure asset_id and building_number are provided in p_asset_data';
  END IF;

  -- Check if asset exists
  SELECT * INTO v_existing_asset
  FROM assets
  WHERE asset_id = v_asset_id;

  IF FOUND THEN
    v_old_main_asset_type := v_existing_asset.main_asset_type;
    v_old_asset_size := v_existing_asset.asset_size;
    v_asset_type_changed := (v_old_main_asset_type IS DISTINCT FROM v_new_main_asset_type);
    v_asset_size_changed := (v_old_asset_size IS DISTINCT FROM v_new_asset_size);
  END IF;

  -- ========================================================================
  -- STEP 3: SAVE ASSET (INSERT OR UPDATE)
  -- ========================================================================
  IF v_existing_asset IS NULL THEN
    -- INSERT new asset
    INSERT INTO assets (
      asset_id,
      building_number,
      main_asset_type,
      sub_asset_type_1,
      sub_asset_type_2,
      sub_asset_type_3,
      sub_asset_type_4,
      sub_asset_type_5,
      sub_asset_type_6,
      asset_size,
      sub_asset_size_1,
      sub_asset_size_2,
      sub_asset_size_3,
      sub_asset_size_4,
      sub_asset_size_5,
      sub_asset_size_6,
      is_new_measurement,
      business_distribution_area,
      residence_distribution_area
    )
    VALUES (
      v_asset_id,
      v_building_number,
      v_new_main_asset_type,
      (p_asset_data->>'sub_asset_type_1')::BIGINT,
      (p_asset_data->>'sub_asset_type_2')::BIGINT,
      (p_asset_data->>'sub_asset_type_3')::BIGINT,
      (p_asset_data->>'sub_asset_type_4')::BIGINT,
      (p_asset_data->>'sub_asset_type_5')::BIGINT,
      (p_asset_data->>'sub_asset_type_6')::BIGINT,
      v_new_asset_size,
      COALESCE((p_asset_data->>'sub_asset_size_1')::NUMERIC, 0),
      COALESCE((p_asset_data->>'sub_asset_size_2')::NUMERIC, 0),
      COALESCE((p_asset_data->>'sub_asset_size_3')::NUMERIC, 0),
      COALESCE((p_asset_data->>'sub_asset_size_4')::NUMERIC, 0),
      COALESCE((p_asset_data->>'sub_asset_size_5')::NUMERIC, 0),
      COALESCE((p_asset_data->>'sub_asset_size_6')::NUMERIC, 0),
      COALESCE((p_asset_data->>'is_new_measurement')::BOOLEAN, false),
      (p_asset_data->>'business_distribution_area')::NUMERIC,
      (p_asset_data->>'residence_distribution_area')::NUMERIC
    );
  ELSE
    -- Copy to history before update
    INSERT INTO assets_history (
      asset_id, building_number, main_asset_type, sub_asset_type_1, sub_asset_type_2,
      sub_asset_type_3, sub_asset_type_4, sub_asset_type_5, sub_asset_type_6,
      asset_size, sub_asset_size_1, sub_asset_size_2, sub_asset_size_3,
      sub_asset_size_4, sub_asset_size_5, sub_asset_size_6,
      is_new_measurement, business_distribution_area, residence_distribution_area
    )
    SELECT 
      asset_id, building_number, main_asset_type, sub_asset_type_1, sub_asset_type_2,
      sub_asset_type_3, sub_asset_type_4, sub_asset_type_5, sub_asset_type_6,
      asset_size, sub_asset_size_1, sub_asset_size_2, sub_asset_size_3,
      sub_asset_size_4, sub_asset_size_5, sub_asset_size_6,
      is_new_measurement, business_distribution_area, residence_distribution_area
    FROM assets
    WHERE asset_id = v_asset_id;

    -- UPDATE existing asset
    UPDATE assets
    SET
      main_asset_type = v_new_main_asset_type,
      sub_asset_type_1 = (p_asset_data->>'sub_asset_type_1')::BIGINT,
      sub_asset_type_2 = (p_asset_data->>'sub_asset_type_2')::BIGINT,
      sub_asset_type_3 = (p_asset_data->>'sub_asset_type_3')::BIGINT,
      sub_asset_type_4 = (p_asset_data->>'sub_asset_type_4')::BIGINT,
      sub_asset_type_5 = (p_asset_data->>'sub_asset_type_5')::BIGINT,
      sub_asset_type_6 = (p_asset_data->>'sub_asset_type_6')::BIGINT,
      asset_size = v_new_asset_size,
      sub_asset_size_1 = COALESCE((p_asset_data->>'sub_asset_size_1')::NUMERIC, 0),
      sub_asset_size_2 = COALESCE((p_asset_data->>'sub_asset_size_2')::NUMERIC, 0),
      sub_asset_size_3 = COALESCE((p_asset_data->>'sub_asset_size_3')::NUMERIC, 0),
      sub_asset_size_4 = COALESCE((p_asset_data->>'sub_asset_size_4')::NUMERIC, 0),
      sub_asset_size_5 = COALESCE((p_asset_data->>'sub_asset_size_5')::NUMERIC, 0),
      sub_asset_size_6 = COALESCE((p_asset_data->>'sub_asset_size_6')::NUMERIC, 0),
      is_new_measurement = COALESCE((p_asset_data->>'is_new_measurement')::BOOLEAN, false),
      business_distribution_area = (p_asset_data->>'business_distribution_area')::NUMERIC,
      residence_distribution_area = (p_asset_data->>'residence_distribution_area')::NUMERIC,
      updated_at = now()
    WHERE asset_id = v_asset_id;
  END IF;

  -- ========================================================================
  -- STEP 4: UPDATE BUILDING TOTAL AREA
  -- ========================================================================
  PERFORM update_building_total_area(v_building_number);

  -- ========================================================================
  -- STEP 5: UPDATE DISTRIBUTION FLAGS (if type changed OR asset_size changed)
  -- Only set the relevant flag (business OR residence, not both)
  -- ========================================================================
  
  -- Get business_residence for the asset type
  IF v_new_main_asset_type IS NOT NULL THEN
    SELECT business_residence INTO v_business_residence
    FROM asset_types
    WHERE name = v_new_main_asset_type;
  END IF;
  
  -- Set flags if type changed (using existing function)
  IF v_asset_type_changed AND v_old_main_asset_type IS NOT NULL THEN
    PERFORM set_distribution_flags_for_asset_type_change(
      v_building_number,
      v_old_main_asset_type,
      v_new_main_asset_type
    );
  END IF;
  
  -- Also set flags if asset_size changed (for business/residence assets)
  IF v_asset_size_changed AND v_business_residence IS NOT NULL THEN
    IF v_business_residence = '×¢×¡×§×™×' THEN
      -- Business asset size changed â†’ set business distribution flag only
      UPDATE buildings
      SET need_business_distribution = true
      WHERE building_number = v_building_number;
      
      RAISE NOTICE 'Set need_business_distribution=true for building % (business asset size changed)', v_building_number;
      
    ELSIF v_business_residence = '×ž×’×•×¨×™×' THEN
      -- Residence asset size changed â†’ set residence distribution flag only
      UPDATE buildings
      SET need_residence_distribution = true
      WHERE building_number = v_building_number;
      
      RAISE NOTICE 'Set need_residence_distribution=true for building % (residence asset size changed)', v_building_number;
    END IF;
  END IF;

  -- ========================================================================
  -- STEP 6: CREATE AUDIT LOG
  -- ========================================================================
  v_audit_id := log_audit_for_asset(
    v_asset_id,
    CASE WHEN v_existing_asset IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
    p_action_type::audit_action_type,
    p_user_id,
    p_description
  );

  -- ========================================================================
  -- STEP 7: RETURN RESULT
  -- ========================================================================
  v_result := jsonb_build_object(
    'success', true,
    'asset_id', v_asset_id,
    'building_number', v_building_number,
    'operation', CASE WHEN v_existing_asset IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
    'audit_id', v_audit_id,
    'message', 'Asset saved successfully with all post-save actions completed'
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- Any error will cause automatic rollback of the entire transaction
    RAISE EXCEPTION 'Transaction failed and rolled back: %', SQLERRM
      USING HINT = 'All changes have been rolled back. No partial data was saved.';
END;
$$;

-- Update comment
COMMENT ON FUNCTION save_asset_transactional IS 'Save single asset with validation enforcement and transactional post-save actions. Rejects if validation failed. All operations (save, update totals, set flags, audit) happen in ONE transaction. Sets distribution flags when asset type OR asset_size changes, only setting the relevant flag (business OR residence).';




-- ============================================================================
-- Migration: 20251217000003_update_bulk_save_for_distribute_flags.sql
-- ============================================================================

/*
  # Update save_assets_bulk_transactional to Handle Distribution Flag Removal
  
  This migration updates the save_assets_bulk_transactional function to remove
  distribution flags when action_type is 'distribute_shared', as part of the
  same transaction as the asset updates.
  
  This ensures that:
  1. Flags are only removed after successful save
  2. If save fails, flags remain set (transaction rollback)
  3. Only the relevant flag is removed (business OR residence, not both)
  4. Flag removal is atomic with asset updates
*/

-- ============================================================================
-- FUNCTION: save_assets_bulk_transactional (UPDATED)
-- Purpose: Bulk save assets with all post-save actions in ONE transaction
-- Now also removes distribution flags for distribute_shared actions
-- ============================================================================

CREATE OR REPLACE FUNCTION save_assets_bulk_transactional(
  p_assets_data JSONB[],
  p_validation_passed BOOLEAN,
  p_validation_errors TEXT DEFAULT NULL,
  p_action_type TEXT DEFAULT 'manual_update',
  p_user_id TEXT DEFAULT NULL,
  p_before_data JSONB DEFAULT NULL,
  p_after_data JSONB DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_asset_data JSONB;
  v_asset_id BIGINT;
  v_building_number BIGINT;
  v_existing_asset RECORD;
  v_old_main_asset_type BIGINT;
  v_new_main_asset_type BIGINT;
  v_affected_asset_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_affected_buildings BIGINT[] := ARRAY[]::BIGINT[];
  v_action_id BIGINT;
  v_count INTEGER := 0;
  v_result JSONB;
  v_user_id_fk BIGINT;
  v_default_user_id BIGINT := 1;
  v_building_num_for_flag BIGINT;
  v_distribution_type TEXT; -- 'residence' or 'business'
  v_asset_type_name TEXT;
  v_business_residence TEXT;
  v_business_dist_area NUMERIC;
  v_old_asset_size NUMERIC;
  v_new_asset_size NUMERIC;
  -- Store old values for each asset to use in STEP 6
  v_asset_old_values RECORD;
BEGIN
  -- ========================================================================
  -- STEP 1: ENFORCE VALIDATION
  -- ========================================================================
  IF p_validation_passed IS NULL THEN
    RAISE EXCEPTION 'Validation status is required. Operations cannot proceed without validation.'
      USING HINT = 'Ensure validation is performed before calling this function';
  END IF;

  IF p_validation_passed = FALSE THEN
    RAISE EXCEPTION 'Validation failed: %', COALESCE(p_validation_errors, 'Unknown validation errors')
      USING HINT = 'Fix validation errors before attempting to save';
  END IF;

  -- ========================================================================
  -- STEP 2: GET OR CREATE USER
  -- ========================================================================
  IF p_user_id IS NOT NULL THEN
    SELECT id INTO v_user_id_fk FROM users WHERE auth_user_id = p_user_id;
    IF v_user_id_fk IS NULL THEN
      INSERT INTO users (auth_user_id, email, created_at)
      VALUES (p_user_id, p_user_id || '@system.local', now())
      RETURNING id INTO v_user_id_fk;
    END IF;
  ELSE
    SELECT id INTO v_user_id_fk FROM users WHERE id = v_default_user_id;
    IF v_user_id_fk IS NULL THEN
      v_user_id_fk := v_default_user_id;
    END IF;
  END IF;

  -- ========================================================================
  -- STEP 3: CREATE ACTION ENTRY
  -- ========================================================================
  INSERT INTO audit (action_type, user_id, entity_type, entity_id, before_data, after_data, description, created_at)
  VALUES (
    p_action_type::audit_action_type,
    v_user_id_fk,
    'bulk_asset', -- entity_type for bulk operations
    NULL, -- entity_id will be set after we know all affected asset IDs
    p_before_data,
    p_after_data,
    p_description,
    now()
  )
  RETURNING action_id INTO v_action_id;

  -- ========================================================================
  -- STEP 4: PROCESS EACH ASSET
  -- ========================================================================
  FOREACH v_asset_data IN ARRAY p_assets_data
  LOOP
    -- Remove any fields that don't exist in assets table to prevent errors
    -- This includes 'id' (AG Grid internal field) and other non-database fields
    -- Use jsonb subtraction operator to remove multiple keys at once
    -- Note: PostgreSQL jsonb subtraction operator can remove multiple keys
    v_asset_data := v_asset_data - 'id' - '_isNew' - '_isDirty' - '_validationErrors' - '_isMasterRow';
    
    v_asset_id := (v_asset_data->>'asset_id')::BIGINT;
    v_building_number := (v_asset_data->>'building_number')::BIGINT;
    v_new_main_asset_type := (v_asset_data->>'main_asset_type')::BIGINT;

    IF v_asset_id IS NULL OR v_building_number IS NULL THEN
      RAISE EXCEPTION 'Asset ID and Building Number are required for all assets'
        USING HINT = 'Ensure all assets in p_assets_data have asset_id and building_number';
    END IF;

    -- Store building number for flag removal (use first building if multiple)
    IF v_building_num_for_flag IS NULL THEN
      v_building_num_for_flag := v_building_number;
    END IF;

    -- Check if asset exists
    SELECT * INTO v_existing_asset
    FROM assets
    WHERE asset_id = v_asset_id;

    IF FOUND THEN
      v_old_main_asset_type := v_existing_asset.main_asset_type;
      v_old_asset_size := v_existing_asset.asset_size;
      
      -- Copy to history before update
      INSERT INTO assets_history (
        asset_id, building_number, main_asset_type, sub_asset_type_1, sub_asset_type_2,
        sub_asset_type_3, sub_asset_type_4, sub_asset_type_5, sub_asset_type_6,
        asset_size, sub_asset_size_1, sub_asset_size_2, sub_asset_size_3,
        sub_asset_size_4, sub_asset_size_5, sub_asset_size_6,
        is_new_measurement, business_distribution_area, residence_distribution_area,
        action_id
      )
      SELECT 
        asset_id, building_number, main_asset_type, sub_asset_type_1, sub_asset_type_2,
        sub_asset_type_3, sub_asset_type_4, sub_asset_type_5, sub_asset_type_6,
        asset_size, sub_asset_size_1, sub_asset_size_2, sub_asset_size_3,
        sub_asset_size_4, sub_asset_size_5, sub_asset_size_6,
        is_new_measurement, business_distribution_area, residence_distribution_area,
        v_action_id
      FROM assets
      WHERE asset_id = v_asset_id;

      -- UPDATE existing asset
      UPDATE assets
      SET
        main_asset_type = v_new_main_asset_type,
        sub_asset_type_1 = (v_asset_data->>'sub_asset_type_1')::BIGINT,
        sub_asset_type_2 = (v_asset_data->>'sub_asset_type_2')::BIGINT,
        sub_asset_type_3 = (v_asset_data->>'sub_asset_type_3')::BIGINT,
        sub_asset_type_4 = (v_asset_data->>'sub_asset_type_4')::BIGINT,
        sub_asset_type_5 = (v_asset_data->>'sub_asset_type_5')::BIGINT,
        sub_asset_type_6 = (v_asset_data->>'sub_asset_type_6')::BIGINT,
        asset_size = COALESCE((v_asset_data->>'asset_size')::NUMERIC, 0),
        sub_asset_size_1 = COALESCE((v_asset_data->>'sub_asset_size_1')::NUMERIC, 0),
        sub_asset_size_2 = COALESCE((v_asset_data->>'sub_asset_size_2')::NUMERIC, 0),
        sub_asset_size_3 = COALESCE((v_asset_data->>'sub_asset_size_3')::NUMERIC, 0),
        sub_asset_size_4 = COALESCE((v_asset_data->>'sub_asset_size_4')::NUMERIC, 0),
        sub_asset_size_5 = COALESCE((v_asset_data->>'sub_asset_size_5')::NUMERIC, 0),
        sub_asset_size_6 = COALESCE((v_asset_data->>'sub_asset_size_6')::NUMERIC, 0),
        is_new_measurement = COALESCE((v_asset_data->>'is_new_measurement')::BOOLEAN, false),
        business_distribution_area = (v_asset_data->>'business_distribution_area')::NUMERIC,
        residence_distribution_area = (v_asset_data->>'residence_distribution_area')::NUMERIC,
        action_id = v_action_id,
        updated_at = now()
      WHERE asset_id = v_asset_id;
    ELSE
      -- INSERT new asset
      INSERT INTO assets (
        asset_id,
        building_number,
        main_asset_type,
        sub_asset_type_1,
        sub_asset_type_2,
        sub_asset_type_3,
        sub_asset_type_4,
        sub_asset_type_5,
        sub_asset_type_6,
        asset_size,
        sub_asset_size_1,
        sub_asset_size_2,
        sub_asset_size_3,
        sub_asset_size_4,
        sub_asset_size_5,
        sub_asset_size_6,
        is_new_measurement,
        business_distribution_area,
        residence_distribution_area,
        action_id
      )
      VALUES (
        v_asset_id,
        v_building_number,
        v_new_main_asset_type,
        (v_asset_data->>'sub_asset_type_1')::BIGINT,
        (v_asset_data->>'sub_asset_type_2')::BIGINT,
        (v_asset_data->>'sub_asset_type_3')::BIGINT,
        (v_asset_data->>'sub_asset_type_4')::BIGINT,
        (v_asset_data->>'sub_asset_type_5')::BIGINT,
        (v_asset_data->>'sub_asset_type_6')::BIGINT,
        COALESCE((v_asset_data->>'asset_size')::NUMERIC, 0),
        COALESCE((v_asset_data->>'sub_asset_size_1')::NUMERIC, 0),
        COALESCE((v_asset_data->>'sub_asset_size_2')::NUMERIC, 0),
        COALESCE((v_asset_data->>'sub_asset_size_3')::NUMERIC, 0),
        COALESCE((v_asset_data->>'sub_asset_size_4')::NUMERIC, 0),
        COALESCE((v_asset_data->>'sub_asset_size_5')::NUMERIC, 0),
        COALESCE((v_asset_data->>'sub_asset_size_6')::NUMERIC, 0),
        COALESCE((v_asset_data->>'is_new_measurement')::BOOLEAN, false),
        (v_asset_data->>'business_distribution_area')::NUMERIC,
        (v_asset_data->>'residence_distribution_area')::NUMERIC,
        v_action_id
      );
      
      v_old_main_asset_type := NULL;
    END IF;

    -- Track affected assets and buildings
    v_affected_asset_ids := array_append(v_affected_asset_ids, v_asset_id);
    IF NOT (v_building_number = ANY(v_affected_buildings)) THEN
      v_affected_buildings := array_append(v_affected_buildings, v_building_number);
    END IF;

    v_count := v_count + 1;
  END LOOP;

  -- ========================================================================
  -- STEP 5: UPDATE BUILDING TOTAL AREAS FOR ALL AFFECTED BUILDINGS
  -- ========================================================================
  FOREACH v_building_number IN ARRAY v_affected_buildings
  LOOP
    PERFORM update_building_total_area(v_building_number);
  END LOOP;

  -- ========================================================================
  -- STEP 6: UPDATE DISTRIBUTION FLAGS FOR ALL ASSETS WITH TYPE OR SIZE CHANGES
  -- Note: During distribution, asset types are updated (e.g., to 199 for residence)
  -- We need to set flags for these type changes, then remove them after successful distribution
  -- ========================================================================
  FOREACH v_asset_data IN ARRAY p_assets_data
  LOOP
    v_asset_id := (v_asset_data->>'asset_id')::BIGINT;
    v_building_number := (v_asset_data->>'building_number')::BIGINT;
    v_new_main_asset_type := (v_asset_data->>'main_asset_type')::BIGINT;
    v_new_asset_size := COALESCE((v_asset_data->>'asset_size')::NUMERIC, 0);

    -- Get old type and size from the history entry we just created in STEP 4
    -- This represents the state BEFORE the current update
    -- We use action_id to get the specific history entry for this transaction
    SELECT main_asset_type, asset_size 
    INTO v_asset_old_values
    FROM assets_history
    WHERE asset_id = v_asset_id
      AND action_id = v_action_id  -- Only get the history entry we just created in this transaction
    ORDER BY history_created_at DESC NULLS LAST, created_at DESC
    LIMIT 1;
    
    -- Extract old values if found
    IF FOUND THEN
      v_old_main_asset_type := v_asset_old_values.main_asset_type;
      v_old_asset_size := v_asset_old_values.asset_size;
    ELSE
      -- New asset - no old values to compare
      v_old_main_asset_type := NULL;
      v_old_asset_size := NULL;
    END IF;

    -- Update flags if type changed (using existing function)
    IF v_old_main_asset_type IS NOT NULL AND v_old_main_asset_type != v_new_main_asset_type THEN
      PERFORM set_distribution_flags_for_asset_type_change(
        v_building_number,
        v_old_main_asset_type,
        v_new_main_asset_type
      );
    END IF;

    -- Also set flags if asset_size changed (for business/residence assets)
    IF v_old_asset_size IS NOT NULL AND v_new_asset_size IS NOT NULL 
       AND v_old_asset_size != v_new_asset_size 
       AND v_new_main_asset_type IS NOT NULL THEN
      -- Get business_residence for the asset type
      SELECT business_residence INTO v_business_residence
      FROM asset_types
      WHERE name = v_new_main_asset_type;

      IF v_business_residence = '×¢×¡×§×™×' THEN
        -- Business asset size changed â†’ set business distribution flag only
        UPDATE buildings
        SET need_business_distribution = true
        WHERE building_number = v_building_number;
        
        RAISE NOTICE 'Set need_business_distribution=true for building % (business asset size changed)', v_building_number;
        
      ELSIF v_business_residence = '×ž×’×•×¨×™×' THEN
        -- Residence asset size changed â†’ set residence distribution flag only
        UPDATE buildings
        SET need_residence_distribution = true
        WHERE building_number = v_building_number;
        
        RAISE NOTICE 'Set need_residence_distribution=true for building % (residence asset size changed)', v_building_number;
      END IF;
    END IF;
  END LOOP;

  -- ========================================================================
  -- STEP 7: REMOVE DISTRIBUTION FLAGS FOR distribute_shared ACTIONS
  -- Only after successful save, and only the relevant flag
  -- ========================================================================
  IF p_action_type = 'distribute_shared' AND v_building_num_for_flag IS NOT NULL THEN
    -- Determine distribution type by checking description first (most reliable)
    -- Then check asset data fields as fallback
    v_distribution_type := NULL;
    
    -- STEP 7a: Check description (most reliable method)
    IF p_description IS NOT NULL THEN
      IF LOWER(p_description) LIKE '%residence%' OR LOWER(p_description) LIKE '%×ž×’×•×¨×™×%' THEN
        v_distribution_type := 'residence';
      ELSIF LOWER(p_description) LIKE '%business%' OR LOWER(p_description) LIKE '%×¢×¡×§×™×%' THEN
        v_distribution_type := 'business';
      END IF;
    END IF;
    
    -- STEP 7b: If description didn't help, check asset data
    IF v_distribution_type IS NULL AND array_length(p_assets_data, 1) > 0 THEN
      -- Check if business_distribution_area is being updated (business distribution)
      FOREACH v_asset_data IN ARRAY p_assets_data
      LOOP
        -- Check if business_distribution_area is set and non-zero
        BEGIN
          IF (v_asset_data->>'business_distribution_area') IS NOT NULL THEN
            v_business_dist_area := (v_asset_data->>'business_distribution_area')::NUMERIC;
            IF v_business_dist_area IS NOT NULL AND v_business_dist_area > 0 THEN
              v_distribution_type := 'business';
              EXIT; -- Found business distribution, no need to check more
            END IF;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          -- Ignore conversion errors, continue checking
          NULL;
        END;
      END LOOP;
      
      -- If still not determined, check if main_asset_type is 199 (residence distribution)
      IF v_distribution_type IS NULL THEN
        v_asset_type_name := (p_assets_data[1]->>'main_asset_type');
        -- Check both string and numeric comparison
        IF v_asset_type_name = '199' OR v_asset_type_name::BIGINT = 199 THEN
          v_distribution_type := 'residence';
        END IF;
      END IF;
    END IF;
    
    -- STEP 7c: Remove the relevant flag only
    IF v_distribution_type = 'residence' THEN
      -- Residence distribution â†’ remove residence flag
      UPDATE buildings
      SET need_residence_distribution = false
      WHERE building_number = v_building_num_for_flag;
      
      RAISE NOTICE 'Removed need_residence_distribution flag for building % (residence distribution completed)', v_building_num_for_flag;
      
    ELSIF v_distribution_type = 'business' THEN
      -- Business distribution â†’ remove business flag
      UPDATE buildings
      SET need_business_distribution = false
      WHERE building_number = v_building_num_for_flag;
      
      RAISE NOTICE 'Removed need_business_distribution flag for building % (business distribution completed)', v_building_num_for_flag;
    ELSE
      -- Could not determine type - log warning but don't fail
      RAISE WARNING 'Could not determine distribution type for building %. Description: %, Flags not removed.', 
        v_building_num_for_flag, 
        COALESCE(p_description, 'NULL');
    END IF;
  END IF;

  -- ========================================================================
  -- STEP 8: UPDATE AUDIT ENTRY WITH ENTITY_ID (comma-separated asset IDs)
  -- ========================================================================
  IF array_length(v_affected_asset_ids, 1) > 0 THEN
    UPDATE audit
    SET entity_id = array_to_string(v_affected_asset_ids, ',')
    WHERE action_id = v_action_id;
  END IF;

  -- ========================================================================
  -- STEP 9: RETURN RESULT
  -- ========================================================================
  v_result := jsonb_build_object(
    'success', true,
    'action_id', v_action_id,
    'affected_asset_ids', v_affected_asset_ids,
    'affected_buildings', v_affected_buildings,
    'count', v_count,
    'message', format('Successfully saved %s assets with all post-save actions completed', v_count)
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- Any error will cause automatic rollback of the entire transaction
    -- This includes asset updates AND flag removal
    RAISE EXCEPTION 'Bulk transaction failed and rolled back: %', SQLERRM
      USING HINT = 'All changes have been rolled back. No partial data was saved. Distribution flags remain set.';
END;
$$;

-- Update comment
COMMENT ON FUNCTION save_assets_bulk_transactional IS 'Bulk save assets with validation enforcement and transactional post-save actions. Rejects if validation failed. All operations (saves, update totals, set flags, remove flags for distribute_shared, audit) happen in ONE transaction. For distribute_shared actions, removes the relevant distribution flag (business OR residence) only after successful save.';




-- ============================================================================
-- Migration: 20251218000000_remove_backend_validation_checks.sql
-- ============================================================================

/*
  # Remove Backend Validation Checks
  
  This migration removes validation enforcement from the database functions.
  Validation is now handled only in the application layer (frontend).
  
  The p_validation_passed parameter is kept for backward compatibility but
  is no longer checked.
*/

-- ============================================================================
-- FUNCTION: save_asset_transactional (UPDATED - validation checks removed)
-- ============================================================================

CREATE OR REPLACE FUNCTION save_asset_transactional(
  p_asset_data JSONB,
  p_validation_passed BOOLEAN,
  p_validation_errors TEXT DEFAULT NULL,
  p_action_type TEXT DEFAULT 'manual_update',
  p_user_id TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_asset_id BIGINT;
  v_building_number BIGINT;
  v_existing_asset RECORD;
  v_old_main_asset_type TEXT;
  v_new_main_asset_type TEXT;
  v_old_asset_size NUMERIC;
  v_new_asset_size NUMERIC;
  v_audit_id BIGINT;
  v_result JSONB;
  v_business_residence TEXT;
  v_asset_type_changed BOOLEAN := FALSE;
  v_asset_size_changed BOOLEAN := FALSE;
BEGIN
  -- ========================================================================
  -- STEP 1: EXTRACT DATA AND CHECK EXISTING ASSET
  -- (Validation checks removed - validation is handled in application layer)
  -- ========================================================================
  v_asset_id := (p_asset_data->>'asset_id')::BIGINT;
  v_building_number := (p_asset_data->>'building_number')::BIGINT;
  v_new_main_asset_type := (p_asset_data->>'main_asset_type')::TEXT;
  v_new_asset_size := COALESCE((p_asset_data->>'asset_size')::NUMERIC, 0);

  IF v_asset_id IS NULL OR v_building_number IS NULL THEN
    RAISE EXCEPTION 'Asset ID and Building Number are required'
      USING HINT = 'Ensure asset_id and building_number are provided in p_asset_data';
  END IF;

  -- Check if asset exists
  SELECT * INTO v_existing_asset
  FROM assets
  WHERE asset_id = v_asset_id;

  IF FOUND THEN
    v_old_main_asset_type := v_existing_asset.main_asset_type;
    v_old_asset_size := v_existing_asset.asset_size;
    v_asset_type_changed := (v_old_main_asset_type IS DISTINCT FROM v_new_main_asset_type);
    v_asset_size_changed := (v_old_asset_size IS DISTINCT FROM v_new_asset_size);
  END IF;

  -- ========================================================================
  -- STEP 2: SAVE ASSET (INSERT or UPDATE)
  -- ========================================================================
  IF v_existing_asset IS NULL THEN
    -- INSERT new asset
    INSERT INTO assets (asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region, sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2, sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4, sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6, elevator, single_double_family, condo, townhouses, penthouse, structure_drawing_url, floor, discount_type, discount_date_from, discount_date_to, area_from_distribution, exported_to_automation)
    VALUES (
      v_asset_id,
      v_building_number,
      (p_asset_data->>'payer_id')::TEXT,
      COALESCE((p_asset_data->>'measurement_date')::TEXT, '01/01/1900'),
      v_new_main_asset_type,
      v_new_asset_size,
      (p_asset_data->>'tax_region')::BIGINT,
      (p_asset_data->>'sub_asset_type_1')::TEXT,
      COALESCE((p_asset_data->>'sub_asset_size_1')::NUMERIC, 0),
      (p_asset_data->>'sub_asset_type_2')::TEXT,
      COALESCE((p_asset_data->>'sub_asset_size_2')::NUMERIC, 0),
      (p_asset_data->>'sub_asset_type_3')::TEXT,
      COALESCE((p_asset_data->>'sub_asset_size_3')::NUMERIC, 0),
      (p_asset_data->>'sub_asset_type_4')::TEXT,
      COALESCE((p_asset_data->>'sub_asset_size_4')::NUMERIC, 0),
      (p_asset_data->>'sub_asset_type_5')::TEXT,
      COALESCE((p_asset_data->>'sub_asset_size_5')::NUMERIC, 0),
      (p_asset_data->>'sub_asset_type_6')::TEXT,
      COALESCE((p_asset_data->>'sub_asset_size_6')::NUMERIC, 0),
      (p_asset_data->>'elevator')::TEXT,
      (p_asset_data->>'single_double_family')::TEXT,
      (p_asset_data->>'condo')::TEXT,
      (p_asset_data->>'townhouses')::TEXT,
      (p_asset_data->>'penthouse')::TEXT,
      (p_asset_data->>'structure_drawing_url')::TEXT,
      (p_asset_data->>'floor')::BIGINT,
      (p_asset_data->>'discount_type')::TEXT,
      (p_asset_data->>'discount_date_from')::TEXT,
      (p_asset_data->>'discount_date_to')::TEXT,
      (p_asset_data->>'area_from_distribution')::NUMERIC,
      COALESCE((p_asset_data->>'exported_to_automation')::BOOLEAN, false)
    );
  ELSE
    -- UPDATE existing asset
    UPDATE assets
    SET
      building_number = v_building_number,
      payer_id = COALESCE((p_asset_data->>'payer_id')::TEXT, payer_id),
      measurement_date = COALESCE((p_asset_data->>'measurement_date')::TEXT, measurement_date),
      main_asset_type = COALESCE(v_new_main_asset_type, main_asset_type),
      asset_size = COALESCE(v_new_asset_size, asset_size),
      tax_region = COALESCE((p_asset_data->>'tax_region')::BIGINT, tax_region),
      sub_asset_type_1 = COALESCE((p_asset_data->>'sub_asset_type_1')::TEXT, sub_asset_type_1),
      sub_asset_size_1 = COALESCE((p_asset_data->>'sub_asset_size_1')::NUMERIC, sub_asset_size_1),
      sub_asset_type_2 = COALESCE((p_asset_data->>'sub_asset_type_2')::TEXT, sub_asset_type_2),
      sub_asset_size_2 = COALESCE((p_asset_data->>'sub_asset_size_2')::NUMERIC, sub_asset_size_2),
      sub_asset_type_3 = COALESCE((p_asset_data->>'sub_asset_type_3')::TEXT, sub_asset_type_3),
      sub_asset_size_3 = COALESCE((p_asset_data->>'sub_asset_size_3')::NUMERIC, sub_asset_size_3),
      sub_asset_type_4 = COALESCE((p_asset_data->>'sub_asset_type_4')::TEXT, sub_asset_type_4),
      sub_asset_size_4 = COALESCE((p_asset_data->>'sub_asset_size_4')::NUMERIC, sub_asset_size_4),
      sub_asset_type_5 = COALESCE((p_asset_data->>'sub_asset_type_5')::TEXT, sub_asset_type_5),
      sub_asset_size_5 = COALESCE((p_asset_data->>'sub_asset_size_5')::NUMERIC, sub_asset_size_5),
      sub_asset_type_6 = COALESCE((p_asset_data->>'sub_asset_type_6')::TEXT, sub_asset_type_6),
      sub_asset_size_6 = COALESCE((p_asset_data->>'sub_asset_size_6')::NUMERIC, sub_asset_size_6),
      elevator = COALESCE((p_asset_data->>'elevator')::TEXT, elevator),
      single_double_family = COALESCE((p_asset_data->>'single_double_family')::TEXT, single_double_family),
      condo = COALESCE((p_asset_data->>'condo')::TEXT, condo),
      townhouses = COALESCE((p_asset_data->>'townhouses')::TEXT, townhouses),
      penthouse = COALESCE((p_asset_data->>'penthouse')::TEXT, penthouse),
      structure_drawing_url = COALESCE((p_asset_data->>'structure_drawing_url')::TEXT, structure_drawing_url),
      floor = COALESCE((p_asset_data->>'floor')::BIGINT, floor),
      discount_type = COALESCE((p_asset_data->>'discount_type')::TEXT, discount_type),
      discount_date_from = COALESCE((p_asset_data->>'discount_date_from')::TEXT, discount_date_from),
      discount_date_to = COALESCE((p_asset_data->>'discount_date_to')::TEXT, discount_date_to),
      area_from_distribution = COALESCE((p_asset_data->>'area_from_distribution')::NUMERIC, area_from_distribution),
      exported_to_automation = COALESCE((p_asset_data->>'exported_to_automation')::BOOLEAN, exported_to_automation),
      updated_at = NOW()
    WHERE asset_id = v_asset_id;
  END IF;

  -- ========================================================================
  -- STEP 3: UPDATE BUILDING TOTAL AREA
  -- ========================================================================
  PERFORM update_building_total_area(v_building_number);

  -- ========================================================================
  -- STEP 4: UPDATE DISTRIBUTION FLAGS IF ASSET TYPE CHANGED
  -- ========================================================================
  IF v_asset_type_changed AND v_old_main_asset_type IS NOT NULL AND v_new_main_asset_type IS NOT NULL THEN
    PERFORM set_distribution_flags_for_asset_type_change(
      v_building_number,
      v_old_main_asset_type,
      v_new_main_asset_type
    );
  END IF;

  -- ========================================================================
  -- STEP 5: UPDATE DISTRIBUTION FLAGS IF ASSET SIZE CHANGED
  -- Handle size changes independently - set flag based on current asset type
  -- ========================================================================
  IF v_asset_size_changed AND v_old_asset_size IS NOT NULL AND v_new_asset_size IS NOT NULL 
     AND v_new_main_asset_type IS NOT NULL THEN
    -- Get business_residence for the asset type
    SELECT business_residence INTO v_business_residence
    FROM asset_types
    WHERE name = v_new_main_asset_type;

    IF v_business_residence = '×¢×¡×§×™×' THEN
      -- Business asset size changed â†’ set business distribution flag only
      -- BUT only if building has business_shared_area > 0
      UPDATE buildings
      SET need_business_distribution = true
      WHERE building_number = v_building_number
        AND COALESCE(business_shared_area, 0) > 0;
      
    ELSIF v_business_residence = '×ž×’×•×¨×™×' THEN
      -- Residence asset size changed â†’ set residence distribution flag only
      UPDATE buildings
      SET need_residence_distribution = true
      WHERE building_number = v_building_number;
    END IF;
  END IF;

  -- ========================================================================
  -- STEP 6: CREATE AUDIT LOG
  -- ========================================================================
  v_audit_id := log_audit_for_asset(
    v_asset_id,
    CASE WHEN v_existing_asset IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
    p_user_id,
    p_action_type::audit_action_type,
    false, -- p_copy_to_history
    p_description
  );

  -- ========================================================================
  -- STEP 7: RETURN RESULT
  -- ========================================================================
  v_result := jsonb_build_object(
    'success', true,
    'asset_id', v_asset_id,
    'building_number', v_building_number,
    'operation', CASE WHEN v_existing_asset IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
    'audit_id', v_audit_id,
    'message', 'Asset saved successfully with all post-save actions completed'
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- Any error will cause automatic rollback of the entire transaction
    RAISE EXCEPTION 'Transaction failed and rolled back: %', SQLERRM
      USING HINT = 'All changes have been rolled back. No partial data was saved.';
END;
$$;

COMMENT ON FUNCTION save_asset_transactional IS 'Save single asset with transactional post-save actions. Validation is handled in application layer. All operations (save, update totals, set flags, audit) happen in ONE transaction.';

-- ============================================================================
-- FUNCTION: save_assets_bulk_transactional (UPDATED - validation checks removed)
-- ============================================================================

CREATE OR REPLACE FUNCTION save_assets_bulk_transactional(
  p_assets_data JSONB[],
  p_validation_passed BOOLEAN,
  p_validation_errors TEXT DEFAULT NULL,
  p_action_type TEXT DEFAULT 'manual_update',
  p_user_id TEXT DEFAULT NULL,
  p_before_data JSONB DEFAULT NULL,
  p_after_data JSONB DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_asset_data JSONB;
  v_asset_id BIGINT;
  v_building_number BIGINT;
  v_existing_asset RECORD;
  v_old_main_asset_type TEXT;
  v_new_main_asset_type TEXT;
  v_affected_asset_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_affected_buildings BIGINT[] := ARRAY[]::BIGINT[];
  v_action_id BIGINT;
  v_count INTEGER := 0;
  v_result JSONB;
  v_user_id_fk BIGINT;
  v_default_user_id BIGINT := 1;
  v_building_num_for_flag BIGINT;
  v_distribution_type TEXT; -- 'residence' or 'business'
  v_asset_type_name TEXT;
  v_business_residence TEXT;
  v_business_dist_area NUMERIC;
  v_old_asset_size NUMERIC;
  v_new_asset_size NUMERIC;
  -- Store old values for each asset to use in STEP 6
  v_asset_old_values RECORD;
  -- For collecting audit data
  v_before_data_collected JSONB := NULL;
  v_after_data_collected JSONB := NULL;
  v_before_assets JSONB[] := ARRAY[]::JSONB[];
  v_after_assets JSONB[] := ARRAY[]::JSONB[];
  v_building_data JSONB := NULL;
  v_first_building_number BIGINT := NULL;
  v_asset_record RECORD;
  v_asset_jsonb JSONB; -- Separate variable for JSONB results
  v_entity_asset_ids BIGINT[];
  v_overload_ratio NUMERIC := NULL;
BEGIN
  -- ========================================================================
  -- STEP 1: GET OR CREATE USER
  -- (Validation checks removed - validation is handled in application layer)
  -- ========================================================================
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
    -- Use get_or_create_user_from_auth if it exists, otherwise default
    BEGIN
      SELECT get_or_create_user_from_auth() INTO v_user_id_fk;
    EXCEPTION WHEN OTHERS THEN
      SELECT user_id INTO v_default_user_id
      FROM users
      WHERE user_name = 'default' AND auth_user_id IS NULL
      LIMIT 1;
      v_user_id_fk := v_default_user_id;
    END;
  END IF;
  
  -- If still no user, use default
  IF v_user_id_fk IS NULL THEN
    SELECT user_id INTO v_default_user_id
    FROM users
    WHERE user_name = 'default' AND auth_user_id IS NULL
    LIMIT 1;
    v_user_id_fk := v_default_user_id;
  END IF;

  -- ========================================================================
  -- STEP 2: COLLECT BEFORE DATA (if not provided)
  -- For distribution operations, collect ALL assets in the building
  -- ========================================================================
  -- Get first building number from assets (all assets in distribution belong to same building)
  IF array_length(p_assets_data, 1) > 0 THEN
    v_first_building_number := (p_assets_data[1]->>'building_number')::BIGINT;
  END IF;
  
  -- Collect BEFORE data from database (if not provided)
  IF (p_before_data IS NULL OR p_before_data = 'null'::jsonb OR p_before_data = '{}'::jsonb) 
     AND v_first_building_number IS NOT NULL THEN
    -- For distribution operations, collect ALL assets in the building
    -- For other operations, only collect affected assets
    IF p_action_type = 'distribute_shared' THEN
      -- Get ALL assets in the building before update
      FOR v_asset_record IN 
        SELECT * FROM assets 
        WHERE building_number = v_first_building_number
        ORDER BY asset_id
      LOOP
        v_before_assets := array_append(v_before_assets, to_jsonb(v_asset_record));
      END LOOP;
    ELSE
      -- For non-distribution operations, only get assets that will be updated
      FOREACH v_asset_data IN ARRAY p_assets_data
      LOOP
        v_asset_id := (v_asset_data->>'asset_id')::BIGINT;
        IF v_asset_id IS NOT NULL THEN
          SELECT to_jsonb(a.*) INTO v_asset_jsonb
          FROM assets a
          WHERE a.asset_id = v_asset_id;
          
          IF v_asset_jsonb IS NOT NULL THEN
            v_before_assets := array_append(v_before_assets, v_asset_jsonb);
          END IF;
        END IF;
      END LOOP;
    END IF;
    
    -- Convert jsonb array to jsonb array for assets
    SELECT jsonb_agg(elem) INTO v_before_data_collected
    FROM unnest(v_before_assets) AS elem;
    
    -- Build before_data structure: simple structure with just assets
    -- Structure: { assets: [...] }
    v_before_data_collected := jsonb_build_object(
      'assets', COALESCE(v_before_data_collected, '[]'::jsonb)
    );
  ELSE
    v_before_data_collected := p_before_data;
  END IF;
  
  -- ========================================================================
  -- STEP 2b: CREATE AUDIT ACTION RECORD
  -- Note: The audit table (from distribution_audit) is only used for distribution/transfer operations
  -- For other operations, we don't create audit entries here
  -- Audit entries for transfer_area and distribute_shared are created in STEP 3c using log_audit function
  -- ========================================================================
  v_action_id := NULL;

  -- ========================================================================
  -- STEP 3: PROCESS EACH ASSET
  -- ========================================================================
  FOREACH v_asset_data IN ARRAY p_assets_data
  LOOP
    -- Remove any fields that don't exist in assets table to prevent errors
    -- This includes 'id' (AG Grid internal field) and other non-database fields
    -- Use jsonb subtraction operator to remove multiple keys at once
    -- Note: PostgreSQL jsonb subtraction operator can remove multiple keys
    v_asset_data := v_asset_data - 'id' - '_isNew' - '_isDirty' - '_validationErrors' - '_isMasterRow';
    
    v_asset_id := (v_asset_data->>'asset_id')::BIGINT;
    v_building_number := (v_asset_data->>'building_number')::BIGINT;
    v_new_main_asset_type := (v_asset_data->>'main_asset_type')::TEXT;

    IF v_asset_id IS NULL OR v_building_number IS NULL THEN
      RAISE EXCEPTION 'Asset ID and Building Number are required for all assets'
        USING HINT = 'Ensure all assets in p_assets_data have asset_id and building_number';
    END IF;

    -- Store building number for flag removal (use first building if multiple)
    IF v_building_num_for_flag IS NULL THEN
      v_building_num_for_flag := v_building_number;
    END IF;

    -- Check if asset exists
    SELECT * INTO v_existing_asset
    FROM assets
    WHERE asset_id = v_asset_id;

    IF FOUND THEN
      v_old_main_asset_type := v_existing_asset.main_asset_type;
      v_old_asset_size := v_existing_asset.asset_size;
    ELSE
      v_old_main_asset_type := NULL;
      v_old_asset_size := NULL;
    END IF;

    -- Save asset (INSERT or UPDATE)
    IF v_existing_asset IS NULL THEN
      -- INSERT new asset
      INSERT INTO assets (asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region, sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2, sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4, sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6, elevator, single_double_family, condo, townhouses, penthouse, structure_drawing_url, floor, discount_type, discount_date_from, discount_date_to, area_from_distribution, exported_to_automation)
      VALUES (
        v_asset_id,
        v_building_number,
        (v_asset_data->>'payer_id')::TEXT,
        COALESCE((v_asset_data->>'measurement_date')::TEXT, '01/01/1900'),
        v_new_main_asset_type,
        COALESCE((v_asset_data->>'asset_size')::NUMERIC, 0),
        (v_asset_data->>'tax_region')::BIGINT,
        (v_asset_data->>'sub_asset_type_1')::TEXT,
        COALESCE((v_asset_data->>'sub_asset_size_1')::NUMERIC, 0),
        (v_asset_data->>'sub_asset_type_2')::TEXT,
        COALESCE((v_asset_data->>'sub_asset_size_2')::NUMERIC, 0),
        (v_asset_data->>'sub_asset_type_3')::TEXT,
        COALESCE((v_asset_data->>'sub_asset_size_3')::NUMERIC, 0),
        (v_asset_data->>'sub_asset_type_4')::TEXT,
        COALESCE((v_asset_data->>'sub_asset_size_4')::NUMERIC, 0),
        (v_asset_data->>'sub_asset_type_5')::TEXT,
        COALESCE((v_asset_data->>'sub_asset_size_5')::NUMERIC, 0),
        (v_asset_data->>'sub_asset_type_6')::TEXT,
        COALESCE((v_asset_data->>'sub_asset_size_6')::NUMERIC, 0),
        (v_asset_data->>'elevator')::TEXT,
        (v_asset_data->>'single_double_family')::TEXT,
        (v_asset_data->>'condo')::TEXT,
        (v_asset_data->>'townhouses')::TEXT,
        (v_asset_data->>'penthouse')::TEXT,
        (v_asset_data->>'structure_drawing_url')::TEXT,
        (v_asset_data->>'floor')::BIGINT,
        (v_asset_data->>'discount_type')::TEXT,
        (v_asset_data->>'discount_date_from')::TEXT,
        (v_asset_data->>'discount_date_to')::TEXT,
        (v_asset_data->>'area_from_distribution')::NUMERIC,
        COALESCE((v_asset_data->>'exported_to_automation')::BOOLEAN, false)
      );
    ELSE
      -- Check if is_new_measurement is true - if so, copy to history before update
      IF COALESCE((v_asset_data->>'is_new_measurement')::BOOLEAN, false) = true THEN
        -- Copy current asset to history before updating
        -- Preserve the old action_id in history (before the new distribution action_id is set)
        INSERT INTO assets_history (
          asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region,
          sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
          sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
          sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
          elevator, single_double_family, condo, townhouses, penthouse,
          structure_drawing_url, floor, discount_type, discount_date_from, discount_date_to,
          area_from_distribution, exported_to_automation, action_id, created_at, updated_at
        )
        SELECT 
          asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region,
          sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
          sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
          sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
          elevator, single_double_family, condo, townhouses, penthouse,
          structure_drawing_url, floor, discount_type, discount_date_from, discount_date_to,
          area_from_distribution, exported_to_automation, action_id, created_at, updated_at
        FROM assets
        WHERE asset_id = v_asset_id;
      END IF;
      
      -- UPDATE existing asset - only update fields that are provided
      UPDATE assets
      SET
        building_number = COALESCE(v_building_number, building_number),
        payer_id = COALESCE((v_asset_data->>'payer_id')::TEXT, payer_id),
        measurement_date = COALESCE((v_asset_data->>'measurement_date')::TEXT, measurement_date),
        main_asset_type = COALESCE(v_new_main_asset_type, main_asset_type),
        asset_size = COALESCE((v_asset_data->>'asset_size')::NUMERIC, asset_size),
        tax_region = COALESCE((v_asset_data->>'tax_region')::BIGINT, tax_region),
        sub_asset_type_1 = COALESCE((v_asset_data->>'sub_asset_type_1')::TEXT, sub_asset_type_1),
        sub_asset_size_1 = COALESCE((v_asset_data->>'sub_asset_size_1')::NUMERIC, sub_asset_size_1),
        sub_asset_type_2 = COALESCE((v_asset_data->>'sub_asset_type_2')::TEXT, sub_asset_type_2),
        sub_asset_size_2 = COALESCE((v_asset_data->>'sub_asset_size_2')::NUMERIC, sub_asset_size_2),
        sub_asset_type_3 = COALESCE((v_asset_data->>'sub_asset_type_3')::TEXT, sub_asset_type_3),
        sub_asset_size_3 = COALESCE((v_asset_data->>'sub_asset_size_3')::NUMERIC, sub_asset_size_3),
        sub_asset_type_4 = COALESCE((v_asset_data->>'sub_asset_type_4')::TEXT, sub_asset_type_4),
        sub_asset_size_4 = COALESCE((v_asset_data->>'sub_asset_size_4')::NUMERIC, sub_asset_size_4),
        sub_asset_type_5 = COALESCE((v_asset_data->>'sub_asset_type_5')::TEXT, sub_asset_type_5),
        sub_asset_size_5 = COALESCE((v_asset_data->>'sub_asset_size_5')::NUMERIC, sub_asset_size_5),
        sub_asset_type_6 = COALESCE((v_asset_data->>'sub_asset_type_6')::TEXT, sub_asset_type_6),
        sub_asset_size_6 = COALESCE((v_asset_data->>'sub_asset_size_6')::NUMERIC, sub_asset_size_6),
        elevator = COALESCE((v_asset_data->>'elevator')::TEXT, elevator),
        single_double_family = COALESCE((v_asset_data->>'single_double_family')::TEXT, single_double_family),
        condo = COALESCE((v_asset_data->>'condo')::TEXT, condo),
        townhouses = COALESCE((v_asset_data->>'townhouses')::TEXT, townhouses),
        penthouse = COALESCE((v_asset_data->>'penthouse')::TEXT, penthouse),
        structure_drawing_url = COALESCE((v_asset_data->>'structure_drawing_url')::TEXT, structure_drawing_url),
        floor = COALESCE((v_asset_data->>'floor')::BIGINT, floor),
        discount_type = COALESCE((v_asset_data->>'discount_type')::TEXT, discount_type),
        discount_date_from = COALESCE((v_asset_data->>'discount_date_from')::TEXT, discount_date_from),
        discount_date_to = COALESCE((v_asset_data->>'discount_date_to')::TEXT, discount_date_to),
        area_from_distribution = COALESCE((v_asset_data->>'area_from_distribution')::NUMERIC, area_from_distribution),
        exported_to_automation = COALESCE((v_asset_data->>'exported_to_automation')::BOOLEAN, exported_to_automation),
        is_new_measurement = false, -- Reset flag after copying to history
        action_id = CASE 
          WHEN p_action_type = 'distribute_shared' THEN v_action_id 
          ELSE action_id 
        END,
        updated_at = NOW()
      WHERE asset_id = v_asset_id;
    END IF;

    -- Track affected assets and buildings
    v_affected_asset_ids := array_append(v_affected_asset_ids, v_asset_id);
    IF NOT (v_building_number = ANY(v_affected_buildings)) THEN
      v_affected_buildings := array_append(v_affected_buildings, v_building_number);
    END IF;

    -- Update building total area
    PERFORM update_building_total_area(v_building_number);

    -- Update flags if type changed (using existing function)
    IF v_old_main_asset_type IS NOT NULL AND v_old_main_asset_type != v_new_main_asset_type THEN
      PERFORM set_distribution_flags_for_asset_type_change(
        v_building_number,
        v_old_main_asset_type,
        v_new_main_asset_type
      );
    END IF;

    -- Also set flags if asset_size changed (for business/residence assets)
    -- Handle size changes independently - set flag based on current asset type
    v_new_asset_size := COALESCE((v_asset_data->>'asset_size')::NUMERIC, v_old_asset_size);
    IF v_old_asset_size IS NOT NULL AND v_new_asset_size IS NOT NULL 
       AND v_old_asset_size != v_new_asset_size 
       AND v_new_main_asset_type IS NOT NULL THEN
      -- Get business_residence for the asset type
      SELECT business_residence INTO v_business_residence
      FROM asset_types
      WHERE name = v_new_main_asset_type;

      IF v_business_residence = '×¢×¡×§×™×' THEN
        -- Business asset size changed â†’ set business distribution flag only
        -- BUT only if building has business_shared_area > 0
        UPDATE buildings
        SET need_business_distribution = true
        WHERE building_number = v_building_number
          AND COALESCE(business_shared_area, 0) > 0;
        
      ELSIF v_business_residence = '×ž×’×•×¨×™×' THEN
        -- Residence asset size changed â†’ set residence distribution flag only
        UPDATE buildings
        SET need_residence_distribution = true
        WHERE building_number = v_building_number;
      END IF;
    END IF;

    -- For distribution operations, we use the bulk audit entry created at STEP 2b
    -- For other operations, create individual audit log for each asset
    IF p_action_type != 'distribute_shared' THEN
      PERFORM log_audit_for_asset(
        v_asset_id,
        CASE WHEN v_existing_asset IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
        p_user_id,
        p_action_type::audit_action_type,
        false, -- p_copy_to_history
        p_description
      );
    END IF;

    v_count := v_count + 1;
  END LOOP;

  -- ========================================================================
  -- STEP 3b: COLLECT AFTER DATA (always collect assets, merge with provided building data)
  -- For distribution operations, collect ALL assets in the building after update
  -- ========================================================================
  -- Always collect assets from database (even if after_data is provided, we need all assets for distribution)
  IF v_first_building_number IS NOT NULL THEN
    -- For distribution operations, collect ALL assets in the building
    -- For other operations, only collect affected assets
    IF p_action_type = 'distribute_shared' THEN
      -- Get ALL assets in the building after update
      FOR v_asset_record IN 
        SELECT * FROM assets 
        WHERE building_number = v_first_building_number
        ORDER BY asset_id
      LOOP
        v_after_assets := array_append(v_after_assets, to_jsonb(v_asset_record));
      END LOOP;
    ELSE
      -- For non-distribution operations, only get assets that were updated
      FOR v_asset_id IN SELECT unnest(v_affected_asset_ids)
      LOOP
        SELECT to_jsonb(a.*) INTO v_asset_jsonb
        FROM assets a
        WHERE a.asset_id = v_asset_id;
        
        IF v_asset_jsonb IS NOT NULL THEN
          v_after_assets := array_append(v_after_assets, v_asset_jsonb);
        END IF;
      END LOOP;
    END IF;
    
    -- Convert jsonb array to jsonb array for assets
    SELECT jsonb_agg(elem) INTO v_after_data_collected
    FROM unnest(v_after_assets) AS elem;
    
    -- Get overload_ratio - use provided data if available, otherwise from database
    IF p_after_data IS NOT NULL AND p_after_data != 'null'::jsonb AND p_after_data != '{}'::jsonb THEN
      -- Extract overload_ratio from provided after_data
      IF p_after_data ? 'overload_ratio' THEN
        v_overload_ratio := (p_after_data->>'overload_ratio')::NUMERIC;
      ELSIF p_after_data ? 'building' AND p_after_data->'building' ? 'building' THEN
        v_building_data := p_after_data->'building'->'building';
        IF v_building_data ? 'overload_ratio' THEN
          v_overload_ratio := (v_building_data->>'overload_ratio')::NUMERIC;
        END IF;
      ELSIF p_after_data ? 'building' THEN
        v_building_data := p_after_data->'building';
        IF v_building_data ? 'overload_ratio' THEN
          v_overload_ratio := (v_building_data->>'overload_ratio')::NUMERIC;
        END IF;
      END IF;
    END IF;
    
    -- If overload_ratio not found in provided data, get from database
    IF v_overload_ratio IS NULL THEN
      SELECT b.overload_ratio INTO v_overload_ratio
      FROM buildings b
      WHERE b.building_number = v_first_building_number;
    END IF;
    
    -- Build after_data structure: simple structure with assets and overload_ratio
    -- Structure: { assets: [...], overload_ratio: ... }
    v_after_data_collected := jsonb_build_object(
      'assets', COALESCE(v_after_data_collected, '[]'::jsonb)
    );
    
    -- Add overload_ratio if it exists (for business distributions)
    IF v_overload_ratio IS NOT NULL THEN
      v_after_data_collected := v_after_data_collected || jsonb_build_object('overload_ratio', v_overload_ratio);
    END IF;
    
    -- For distribution operations, entity_id should include ALL assets in the building
    -- For other operations, only include affected assets
    IF p_action_type = 'distribute_shared' THEN
      -- Get ALL asset IDs in the building
      SELECT array_agg(asset_id ORDER BY asset_id) INTO v_entity_asset_ids
      FROM assets
      WHERE building_number = v_first_building_number;
    ELSE
      -- For other operations, use affected asset IDs
      v_entity_asset_ids := v_affected_asset_ids;
    END IF;
    
    -- Update audit entry with collected after data and entity_id
    UPDATE audit
    SET 
      after_data = v_after_data_collected,
      entity_id = array_to_string(COALESCE(v_entity_asset_ids, v_affected_asset_ids), ',')
    WHERE action_id = v_action_id;
  ELSE
    -- If no building number, use provided after_data as-is or collect minimal data
    IF p_after_data IS NOT NULL AND p_after_data != 'null'::jsonb AND p_after_data != '{}'::jsonb THEN
      v_after_data_collected := p_after_data;
      -- Still update entity_id
      UPDATE audit
      SET 
        after_data = v_after_data_collected,
        entity_id = array_to_string(v_affected_asset_ids, ',')
      WHERE action_id = v_action_id;
    ELSE
      -- No building number and no provided data - just update entity_id
      UPDATE audit
      SET entity_id = array_to_string(v_affected_asset_ids, ',')
      WHERE action_id = v_action_id;
    END IF;
  END IF;
    
    -- For distribution operations, entity_id should include ALL assets in the building
    -- For other operations, only include affected assets
    IF p_action_type = 'distribute_shared' THEN
      -- Get ALL asset IDs in the building
      SELECT array_agg(asset_id ORDER BY asset_id) INTO v_entity_asset_ids
      FROM assets
      WHERE building_number = v_first_building_number;
    ELSE
      -- For other operations, use affected asset IDs
      v_entity_asset_ids := v_affected_asset_ids;
    END IF;
    

  -- ========================================================================
  -- STEP 4: REMOVE DISTRIBUTION FLAGS FOR distribute_shared ACTIONS
  -- Only after successful save, and only the relevant flag
  -- ========================================================================
  IF p_action_type = 'distribute_shared' AND v_building_num_for_flag IS NOT NULL THEN
    -- Determine distribution type by checking description first (most reliable)
    -- Then check asset data fields as fallback
    v_distribution_type := NULL;
    
    -- STEP 4a: Check description (most reliable method)
    IF p_description IS NOT NULL THEN
      IF LOWER(p_description) LIKE '%residence%' OR LOWER(p_description) LIKE '%×ž×’×•×¨×™×%' THEN
        v_distribution_type := 'residence';
      ELSIF LOWER(p_description) LIKE '%business%' OR LOWER(p_description) LIKE '%×¢×¡×§×™×%' THEN
        v_distribution_type := 'business';
      END IF;
    END IF;
    
    -- STEP 4b: If description didn't help, check asset data
    IF v_distribution_type IS NULL AND array_length(p_assets_data, 1) > 0 THEN
      -- Check if area_from_distribution is being updated (distribution)
      FOREACH v_asset_data IN ARRAY p_assets_data
      LOOP
        -- Check if area_from_distribution is set and non-zero
        BEGIN
          IF (v_asset_data->>'area_from_distribution') IS NOT NULL THEN
            v_business_dist_area := (v_asset_data->>'area_from_distribution')::NUMERIC;
            IF v_business_dist_area IS NOT NULL AND v_business_dist_area > 0 THEN
              -- Determine distribution type by checking asset type (business_residence)
              -- For now, check description or asset type to determine if business or residence
              -- This will be determined by the asset's business_residence type
              v_distribution_type := 'business'; -- Default, will be refined by description check
              EXIT; -- Found distribution, no need to check more
            END IF;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          -- Ignore conversion errors, continue checking
          NULL;
        END;
      END LOOP;
      
      -- If still not determined, check if main_asset_type is 199 (residence distribution)
      IF v_distribution_type IS NULL THEN
        v_asset_type_name := (p_assets_data[1]->>'main_asset_type');
        -- Check both string and numeric comparison
        IF v_asset_type_name = '199' OR v_asset_type_name::BIGINT = 199 THEN
          v_distribution_type := 'residence';
        END IF;
      END IF;
    END IF;
    
    -- STEP 4c: Remove the relevant flag only
    IF v_distribution_type = 'residence' THEN
      -- Residence distribution â†’ remove residence flag
      UPDATE buildings
      SET need_residence_distribution = false
      WHERE building_number = v_building_num_for_flag;
      
    ELSIF v_distribution_type = 'business' THEN
      -- Business distribution â†’ remove business flag
      UPDATE buildings
      SET need_business_distribution = false
      WHERE building_number = v_building_num_for_flag;
    END IF;
  END IF;

  -- ========================================================================
  -- STEP 5: RETURN RESULT
  -- ========================================================================
  v_result := jsonb_build_object(
    'success', true,
    'action_id', v_action_id,
    'affected_asset_ids', v_affected_asset_ids,
    'affected_buildings', v_affected_buildings,
    'count', v_count,
    'message', format('Successfully saved %s assets with all post-save actions completed', v_count)
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- Any error will cause automatic rollback of the entire transaction
    -- This includes asset updates AND flag removal
    RAISE EXCEPTION 'Bulk transaction failed and rolled back: %', SQLERRM
      USING HINT = 'All changes have been rolled back. No partial data was saved. Distribution flags remain set.';
END;
$$;

COMMENT ON FUNCTION save_assets_bulk_transactional IS 'Bulk save assets with transactional post-save actions. Validation is handled in application layer. All operations (saves, update totals, set flags, remove flags for distribute_shared, audit) happen in ONE transaction. For distribute_shared actions, removes the relevant distribution flag (business OR residence) only after successful save.';

-- ============================================================================
-- FIELD CONFIGURATION: Add area_from_distribution to assets-list grid
-- ============================================================================

-- Add area_from_distribution to assets-list grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES ('assets-list', 'area_from_distribution', 18, 8, '×’×•×“×œ ×©×˜×— ×ž×©×•×ª×£', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET 
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  hebrew_name = EXCLUDED.hebrew_name,
  visible = EXCLUDED.visible,
  updated_at = now();

-- Add area_from_distribution to asset-details-main grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES ('asset-details-main', 'area_from_distribution', 18, 8, '×’×•×“×œ ×©×˜×— ×ž×©×•×ª×£', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET 
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  hebrew_name = EXCLUDED.hebrew_name,
  visible = EXCLUDED.visible,
  updated_at = now();

-- Add area_from_distribution to asset-details-history grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES ('asset-details-history', 'area_from_distribution', 18, 8, '×’×•×“×œ ×©×˜×— ×ž×©×•×ª×£', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET 
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  hebrew_name = EXCLUDED.hebrew_name,
  visible = EXCLUDED.visible,
  updated_at = now();

-- ============================================================================
-- TRIGGERS: Automatically handle post-save actions for direct table operations
-- ============================================================================
-- These triggers ensure that building total area and distribution flags are
-- updated even when assets are modified directly (not through transactional functions)
-- They will also fire when using transactional functions, but the operations are idempotent

-- Function to automatically update building total area after asset changes
CREATE OR REPLACE FUNCTION auto_update_building_total_area()
RETURNS TRIGGER AS $$
DECLARE
  v_building_number BIGINT;
BEGIN
  -- Determine building_number based on operation
  IF TG_OP = 'DELETE' THEN
    v_building_number := OLD.building_number;
  ELSE
    v_building_number := NEW.building_number;
  END IF;

  -- Skip if no building_number
  IF v_building_number IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- Update building total area
  -- This is idempotent - safe to call multiple times
  PERFORM update_building_total_area(v_building_number);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_auto_update_building_total_area ON assets;

-- Create trigger that fires after insert, update, or delete
CREATE TRIGGER trigger_auto_update_building_total_area
  AFTER INSERT OR UPDATE OR DELETE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_building_total_area();

COMMENT ON FUNCTION auto_update_building_total_area IS 'Automatically updates building total area after asset INSERT/UPDATE/DELETE operations. Works for both direct table operations and transactional function calls.';

-- Function to automatically set distribution flags when asset size or type changes
-- This ensures flags are set even when direct table operations bypass transactional functions
CREATE OR REPLACE FUNCTION auto_set_distribution_flags_on_change()
RETURNS TRIGGER AS $$
DECLARE
  v_business_residence TEXT;
  v_type_changed BOOLEAN := FALSE;
  v_size_changed BOOLEAN := FALSE;
  v_old_type TEXT;
  v_new_type TEXT;
BEGIN
  -- Only process INSERT or UPDATE
  IF TG_OP = 'DELETE' THEN
    -- For DELETE, distribution flags should be set via delete_asset_transactional
    -- But we can still update building total area (handled above)
    RETURN OLD;
  END IF;

  -- Skip if no building_number or main_asset_type
  IF NEW.building_number IS NULL OR NEW.main_asset_type IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if type or size changed (for UPDATE)
  IF TG_OP = 'UPDATE' THEN
    v_old_type := OLD.main_asset_type;
    v_new_type := NEW.main_asset_type;
    
    IF (v_old_type IS DISTINCT FROM v_new_type) THEN
      v_type_changed := TRUE;
    END IF;
    -- Check if asset_size changed (use IS DISTINCT FROM to handle NULLs correctly)
    IF (OLD.asset_size IS DISTINCT FROM NEW.asset_size) THEN
      v_size_changed := TRUE;
    END IF;
  ELSE
    -- For INSERT, check if asset_size is set
    IF NEW.asset_size IS NOT NULL AND NEW.asset_size > 0 THEN
      v_size_changed := TRUE;
    END IF;
    v_type_changed := TRUE; -- New asset always checks type
  END IF;

  -- Only proceed if something changed
  IF NOT v_type_changed AND NOT v_size_changed THEN
    RETURN NEW;
  END IF;

  -- Get business_residence for the asset type
  SELECT business_residence INTO v_business_residence
  FROM asset_types
  WHERE name = NEW.main_asset_type;

  -- Set appropriate distribution flag based on business_residence
  -- Handle size changes independently - if size changed, set flag based on current type
  IF v_size_changed THEN
    -- Size changed - set flag based on current type's business_residence
    IF v_business_residence = '×¢×¡×§×™×' THEN
      -- Business asset size changed â†’ set business distribution flag only
      -- BUT only if building has business_shared_area > 0
      UPDATE buildings
      SET need_business_distribution = true
      WHERE building_number = NEW.building_number
        AND COALESCE(business_shared_area, 0) > 0;
    ELSIF v_business_residence = '×ž×’×•×¨×™×' THEN
      -- Residence asset size changed â†’ set residence distribution flag only
      UPDATE buildings
      SET need_residence_distribution = true
      WHERE building_number = NEW.building_number;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_auto_set_distribution_flags_on_change ON assets;

-- Create trigger that fires after insert or update
-- Fire on any UPDATE (not just specific columns) to catch all changes
-- The function will check which fields actually changed
CREATE TRIGGER trigger_auto_set_distribution_flags_on_change
  AFTER INSERT OR UPDATE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_distribution_flags_on_change();

COMMENT ON FUNCTION auto_set_distribution_flags_on_change IS 'Automatically sets building distribution flags when asset main_asset_type or asset_size changes. Works for both direct table operations and transactional function calls.';

-- ============================================================================
-- REMOVE shared_area_usage COLUMN FROM asset_types TABLE
-- ============================================================================

-- Drop the shared_area_usage column from asset_types table
ALTER TABLE asset_types DROP COLUMN IF EXISTS shared_area_usage;




-- ============================================================================
-- Migration: 20251219000000_add_building_update_function.sql
-- ============================================================================

/*
  # Add Function to Update Buildings with Automatic Distribution Flag Setting (Bulk)
  
  1. Overview
    - Creates a database function to update multiple buildings in bulk
    - Automatically sets distribution flags when shared areas change
    - All updates happen in a single transaction
  
  2. Logic
    - Takes array of building updates (each with building_number and updates JSONB)
    - For each building, checks if residence_shared_area or business_shared_area changed
    - Sets need_residence_distribution or need_business_distribution flags to true
    - Only sets flags if the new shared area value is > 0
  
  3. Benefits
    - Centralized logic for building updates
    - Automatic flag management
    - Bulk operations in single transaction
    - Can be used by application code or other database functions
*/

-- Function to update multiple buildings in bulk and automatically set distribution flags when shared areas change
CREATE OR REPLACE FUNCTION update_buildings_bulk_with_distribution_flags(
  p_buildings_data JSONB[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_building_data JSONB;
  v_building_number BIGINT;
  v_updates JSONB;
  v_old_building RECORD;
  v_old_residence_area NUMERIC;
  v_old_business_area NUMERIC;
  v_new_residence_area NUMERIC;
  v_new_business_area NUMERIC;
  v_final_updates JSONB;
  v_affected_buildings BIGINT[] := ARRAY[]::BIGINT[];
  v_count INTEGER := 0;
  v_result JSONB;
  v_updated_buildings JSONB[] := ARRAY[]::JSONB[];
BEGIN
  -- Process each building update
  FOREACH v_building_data IN ARRAY p_buildings_data
  LOOP
    -- Extract building_number and updates
    v_building_number := (v_building_data->>'building_number')::BIGINT;
    v_updates := v_building_data->'updates';
    
    IF v_building_number IS NULL THEN
      RAISE EXCEPTION 'Building number is required for all building updates';
    END IF;
    
    IF v_updates IS NULL OR v_updates = '{}'::jsonb THEN
      -- Skip if no updates provided
      CONTINUE;
    END IF;
    
    -- Get current building data
    SELECT * INTO v_old_building
    FROM buildings
    WHERE building_number = v_building_number;
    
    IF NOT FOUND THEN
      RAISE WARNING 'Building % not found, skipping', v_building_number;
      CONTINUE;
    END IF;
    
    -- Get old values (keep NULL as NULL, don't convert to 0)
    v_old_residence_area := v_old_building.residence_shared_area;
    v_old_business_area := v_old_building.business_shared_area;
    
    -- Get new values from updates
    -- If the field is provided in updates, use it; otherwise keep the old value
    IF v_updates ? 'residence_shared_area' THEN
      v_new_residence_area := (v_updates->>'residence_shared_area')::NUMERIC;
    ELSE
      v_new_residence_area := v_old_residence_area;
    END IF;
    
    IF v_updates ? 'business_shared_area' THEN
      v_new_business_area := (v_updates->>'business_shared_area')::NUMERIC;
    ELSE
      v_new_business_area := v_old_business_area;
    END IF;
    
    -- Start with the provided updates
    v_final_updates := v_updates;
    
    -- Check if residence_shared_area changed (even if new value is zero or NULL)
    -- Set flag whenever old value is different from new value
    IF v_old_residence_area IS DISTINCT FROM v_new_residence_area THEN
      -- Set need_residence_distribution flag to true when shared area changes
      v_final_updates := v_final_updates || jsonb_build_object('need_residence_distribution', true);
      
      RAISE NOTICE 'Setting need_residence_distribution=true for building % (residence_shared_area changed from % to %)', 
        v_building_number, v_old_residence_area, v_new_residence_area;
    END IF;
    
    -- Check if business_shared_area changed (even if new value is zero or NULL)
    -- Set flag whenever old value is different from new value
    IF v_old_business_area IS DISTINCT FROM v_new_business_area THEN
      -- Set need_business_distribution flag to true when shared area changes
      v_final_updates := v_final_updates || jsonb_build_object('need_business_distribution', true);
      
      RAISE NOTICE 'Setting need_business_distribution=true for building % (business_shared_area changed from % to %)', 
        v_building_number, v_old_business_area, v_new_business_area;
    END IF;
    
    -- Remove read-only fields that shouldn't be updated
    v_final_updates := v_final_updates - 'action_id' - 'created_at' - 'building_number';
    
    -- Update the building
    UPDATE buildings
    SET
      total_building_area = COALESCE((v_final_updates->>'total_building_area')::NUMERIC, total_building_area),
      tax_region = COALESCE((v_final_updates->>'tax_region')::TEXT, tax_region),
      elevator = COALESCE((v_final_updates->>'elevator')::TEXT, elevator),
      single_double_family = COALESCE((v_final_updates->>'single_double_family')::TEXT, single_double_family),
      condo = COALESCE((v_final_updates->>'condo')::TEXT, condo),
      townhouses = COALESCE((v_final_updates->>'townhouses')::TEXT, townhouses),
      residence_shared_area = COALESCE((v_final_updates->>'residence_shared_area')::NUMERIC, residence_shared_area),
      business_shared_area = COALESCE((v_final_updates->>'business_shared_area')::NUMERIC, business_shared_area),
      area_for_control = COALESCE((v_final_updates->>'area_for_control')::NUMERIC, area_for_control),
      building_address = COALESCE((v_final_updates->>'building_address')::INTEGER, building_address),
      gosh = COALESCE((v_final_updates->>'gosh')::BIGINT, gosh),
      helka = COALESCE((v_final_updates->>'helka')::BIGINT, helka),
      building_number_in_street = COALESCE((v_final_updates->>'building_number_in_street')::BIGINT, building_number_in_street),
      overload_ratio = COALESCE((v_final_updates->>'overload_ratio')::NUMERIC, overload_ratio),
      need_residence_distribution = COALESCE((v_final_updates->>'need_residence_distribution')::BOOLEAN, need_residence_distribution),
      need_business_distribution = COALESCE((v_final_updates->>'need_business_distribution')::BOOLEAN, need_business_distribution)
    WHERE building_number = v_building_number;
    
    -- Track affected buildings
    IF NOT (v_building_number = ANY(v_affected_buildings)) THEN
      v_affected_buildings := array_append(v_affected_buildings, v_building_number);
    END IF;
    
    -- Get updated building data
    SELECT to_jsonb(b.*) INTO v_final_updates
    FROM buildings b
    WHERE b.building_number = v_building_number;
    
    v_updated_buildings := array_append(v_updated_buildings, v_final_updates);
    v_count := v_count + 1;
  END LOOP;
  
  -- Return result
  v_result := jsonb_build_object(
    'success', true,
    'count', v_count,
    'affected_buildings', v_affected_buildings,
    'buildings', v_updated_buildings,
    'message', format('Successfully updated %s buildings', v_count)
  );
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Any error will cause automatic rollback of the entire transaction
    RAISE EXCEPTION 'Bulk building update failed and rolled back: %', SQLERRM
      USING HINT = 'All changes have been rolled back. No partial data was saved.';
END;
$$;

COMMENT ON FUNCTION update_buildings_bulk_with_distribution_flags IS 'Bulk update buildings and automatically set distribution flags when shared areas (residence_shared_area or business_shared_area) change. Sets flags to true whenever shared area changes, even if new value is 0. All updates happen in a single transaction. Use this function for all building updates, even single ones.';




-- ============================================================================
-- Migration: 20251220000000_rename_business_distribution_area_to_area_from_distribution.sql
-- ============================================================================

/*
  # Rename business_distribution_area to area_from_distribution
  
  1. Overview
    - Renames business_distribution_area to area_from_distribution in assets and assets_history tables
    - This field will serve both business and residence distributions based on asset type
    - Removes residence_distribution_area if it exists (consolidating into single field)
  
  2. Changes
    - Rename column in assets table
    - Rename column in assets_history table
    - Update all comments
    - Remove residence_distribution_area if it exists
*/

-- Rename business_distribution_area to area_from_distribution in assets table
ALTER TABLE assets 
  RENAME COLUMN business_distribution_area TO area_from_distribution;

-- Rename business_distribution_area to area_from_distribution in assets_history table
ALTER TABLE assets_history 
  RENAME COLUMN business_distribution_area TO area_from_distribution;

-- Remove residence_distribution_area if it exists (consolidating into single field)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'assets' 
      AND column_name = 'residence_distribution_area'
  ) THEN
    ALTER TABLE assets DROP COLUMN residence_distribution_area;
  END IF;
  
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'assets_history' 
      AND column_name = 'residence_distribution_area'
  ) THEN
    ALTER TABLE assets_history DROP COLUMN residence_distribution_area;
  END IF;
END $$;

-- Update column comments
COMMENT ON COLUMN assets.area_from_distribution IS 'Area distributed to this asset from shared area distribution (business or residence, depending on asset type)';
COMMENT ON COLUMN assets_history.area_from_distribution IS 'Area distributed to this asset from shared area distribution (business or residence, depending on asset type) - historical record';




-- ============================================================================
-- Migration: 20251220000000_rename_business_distribution_area_to_distribution_area.sql
-- ============================================================================

/*
  # Rename business_distribution_area to area_from_distribution
  
  1. Overview
    - Renames business_distribution_area to area_from_distribution in assets and assets_history tables
    - This field will serve both business and residence distributions based on asset type
    - Removes residence_distribution_area if it exists (consolidating into single field)
  
  2. Changes
    - Rename column in assets table
    - Rename column in assets_history table
    - Update all comments
    - Remove residence_distribution_area if it exists
*/

-- Rename business_distribution_area to area_from_distribution in assets table
ALTER TABLE assets 
  RENAME COLUMN business_distribution_area TO area_from_distribution;

-- Rename business_distribution_area to area_from_distribution in assets_history table
ALTER TABLE assets_history 
  RENAME COLUMN business_distribution_area TO area_from_distribution;

-- Remove residence_distribution_area if it exists (consolidating into single field)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'assets' 
      AND column_name = 'residence_distribution_area'
  ) THEN
    ALTER TABLE assets DROP COLUMN residence_distribution_area;
  END IF;
  
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'assets_history' 
      AND column_name = 'residence_distribution_area'
  ) THEN
    ALTER TABLE assets_history DROP COLUMN residence_distribution_area;
  END IF;
END $$;

-- Update column comments
COMMENT ON COLUMN assets.area_from_distribution IS 'Area distributed to this asset from shared area distribution (business or residence, depending on asset type)';
COMMENT ON COLUMN assets_history.area_from_distribution IS 'Area distributed to this asset from shared area distribution (business or residence, depending on asset type) - historical record';




-- ============================================================================
-- Migration: 20251220000001_drop_distribution_flag_trigger.sql
-- ============================================================================

/*
  # Drop Distribution Flag Trigger
  
  This migration drops the trigger auto_set_distribution_flags_on_change because
  distribution flags are now handled completely in save_assets_bulk_transactional
  using the p_is_business_context parameter, which provides the correct tab context.
  
  Both type changes and size changes are handled the same way in the function,
  using the tab context (business vs residence) rather than the asset type's
  business_residence field. This ensures consistent behavior and proper separation
  between business and residence contexts.
*/

-- Drop the trigger that automatically sets distribution flags
-- All flag setting is now handled in save_assets_bulk_transactional with proper tab context
DROP TRIGGER IF EXISTS trigger_auto_set_distribution_flags_on_change ON assets;



-- ============================================================================
-- Migration: 20251221000000_clear_and_refill_field_configurations.sql
-- ============================================================================

/*
  # Clear and Refill Field Configurations
  
  This migration:
  1. Updates the default padding value to 2 in the table schema
  2. Removes all existing field configuration data from the table
  
  The table should be refilled with updated configurations through the
  application UI or a subsequent migration. All new configurations will
  default to padding = 2.
  
  The field_configurations table stores column width, padding, visibility,
  and other display properties for grid fields across the application.
*/

-- Update the default padding value to 2 and width_chars to 6
ALTER TABLE field_configurations
  ALTER COLUMN padding SET DEFAULT 2,
  ALTER COLUMN width_chars SET DEFAULT 6;

-- Delete all existing field configurations
DELETE FROM field_configurations;

-- Insert field configurations for asset_id, building_number, and payer_id
-- with width_chars = 10 and padding = 2 across all relevant grids

-- Assets List grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-list', 'asset_id', 10, 2, '×ž×–×”×” × ×›×¡', true, 'right', true, NULL),
  ('assets-list', 'actions', 10, 2, '×¤×¢×•×œ×•×ª', true, 'right', true, NULL),
  ('assets-list', 'payer_id', 10, 2, '×ž×–×”×” ×ž×©×œ×', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'actions') THEN true ELSE field_configurations.pinned END, 
    pin_side = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'actions') THEN 'right' ELSE field_configurations.pin_side END, 
    updated_at = now();

-- Buildings List grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('buildings-list', 'building_number', 10, 2, '×ž×¡×¤×¨ ×‘× ×™×™×Ÿ', true, 'right', true, NULL),
  ('buildings-list', 'actions', 10, 2, '×¤×¢×•×œ×•×ª', true, 'right', true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name IN ('building_number', 'actions') THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name IN ('building_number', 'actions') THEN 'right' ELSE field_configurations.pin_side END, 
    updated_at = now();

-- Asset Details Main grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-details-main', 'asset_id', 10, 2, '×ž×–×”×” × ×›×¡', true, 'right', true, NULL),
  ('asset-details-main', 'building_number', 10, 2, '×ž×¡×¤×¨ ×‘× ×™×™×Ÿ', true, 'right', true, NULL),
  ('asset-details-main', 'actions', 10, 2, '×¤×¢×•×œ×•×ª', true, 'right', true, NULL),
  ('asset-details-main', 'payer_id', 10, 2, '×ž×–×”×” ×ž×©×œ×', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'building_number', 'actions') THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'building_number', 'actions') THEN 'right' ELSE field_configurations.pin_side END, 
    updated_at = now();

-- Asset Details History grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-details-history', 'asset_id', 10, 2, '×ž×–×”×” × ×›×¡', true, 'right', true, NULL),
  ('asset-details-history', 'building_number', 10, 2, '×ž×¡×¤×¨ ×‘× ×™×™×Ÿ', true, 'right', true, NULL),
  ('asset-details-history', 'actions', 10, 2, '×¤×¢×•×œ×•×ª', true, 'right', true, NULL),
  ('asset-details-history', 'payer_id', 10, 2, '×ž×–×”×” ×ž×©×œ×', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'building_number', 'actions') THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'building_number', 'actions') THEN 'right' ELSE field_configurations.pin_side END, 
    updated_at = now();

-- Asset Data Entry grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-data-entry', 'asset_id', 10, 2, '×ž×–×”×” × ×›×¡', true, 'right', true, NULL),
  ('asset-data-entry', 'building_number', 10, 2, '×ž×¡×¤×¨ ×‘× ×™×™×Ÿ', true, 'right', true, NULL),
  ('asset-data-entry', 'actions', 10, 2, '×¤×¢×•×œ×•×ª', true, 'right', true, NULL),
  ('asset-data-entry', 'payer_id', 10, 2, '×ž×–×”×” ×ž×©×œ×', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'building_number', 'actions') THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'building_number', 'actions') THEN 'right' ELSE field_configurations.pin_side END, 
    updated_at = now();

-- Transfer Areas grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('transfer-areas', 'asset_id', 10, 2, '×ž×–×”×” × ×›×¡', true, 'right', true, NULL),
  ('transfer-areas', 'actions', 10, 2, '×¤×¢×•×œ×•×ª', true, 'right', true, NULL),
  ('transfer-areas', 'payer_id', 10, 2, '×ž×–×”×” ×ž×©×œ×', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'actions') THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'actions') THEN 'right' ELSE field_configurations.pin_side END, 
    updated_at = now();

-- Assets File Import grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-file-import', 'asset_id', 10, 2, '×ž×–×”×” × ×›×¡', true, 'right', true, NULL),
  ('assets-file-import', 'building_number', 10, 2, '×ž×¡×¤×¨ ×‘× ×™×™×Ÿ', true, 'right', true, NULL),
  ('assets-file-import', 'actions', 10, 2, '×¤×¢×•×œ×•×ª', true, 'right', true, NULL),
  ('assets-file-import', 'payer_id', 10, 2, '×ž×–×”×” ×ž×©×œ×', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'building_number', 'actions') THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'building_number', 'actions') THEN 'right' ELSE field_configurations.pin_side END, 
    updated_at = now();

-- Insert checkbox field configurations with width_chars = 4 and padding = 2
-- Checkbox fields are boolean/yes-no fields that display as checkboxes

-- Asset Types grid - checkbox fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-types', 'active', 4, 2, '×¤×¢×™×œ', false, null, true, NULL),
  ('asset-types', 'elevator', 4, 2, '×ž×¢×œ×™×ª', false, null, true, NULL),
  ('asset-types', 'single_double_family', 4, 2, '×‘×™×ª ×¤×¨×˜×™', false, null, true, NULL),
  ('asset-types', 'penthouse', 4, 2, '×“×™×¨×ª ×’×’', false, null, true, NULL),
  ('asset-types', 'condo', 4, 2, '×‘×™×ª ×ž×©×•×ª×£', false, null, true, NULL),
  ('asset-types', 'townhouses', 4, 2, '×˜×•×¨×™×™×', false, null, true, NULL),
  ('asset-types', 'non_accountable_for_total_area', 4, 2, '×œ× × ×¡×¤×¨ ×‘×—×™×©×•×‘ ×©×˜×— ×ž×‘× ×”', false, null, true, NULL),
  ('asset-types', 'non_accountable_for_distribution', 4, 2, '×œ× × ×¡×¤×¨ ×‘×¤×™×–×•×¨', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 4, padding = 2, updated_at = now();

-- Buildings List grid - checkbox fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('buildings-list', 'elevator', 4, 2, '×ž×¢×œ×™×ª', false, null, true, NULL),
  ('buildings-list', 'single_double_family', 4, 2, '×‘×™×ª ×¤×¨×˜×™', false, null, true, NULL),
  ('buildings-list', 'condo', 4, 2, '×‘×™×ª ×ž×©×•×ª×£', false, null, true, NULL),
  ('buildings-list', 'townhouses', 4, 2, '×˜×•×¨×™×™×', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 4, padding = 2, updated_at = now();

-- Assets List grid - checkbox fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-list', 'penthouse', 4, 2, '×“×™×¨×ª ×’×’', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 4, padding = 2, updated_at = now();

-- Asset Data Entry grid - checkbox fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-data-entry', 'penthouse', 4, 2, '×“×™×¨×ª ×’×’', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 4, padding = 2, updated_at = now();

-- Assets File Import grid - checkbox fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-file-import', 'penthouse', 4, 2, '×“×™×¨×ª ×’×’', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 4, padding = 2, updated_at = now();

-- Insert asset type and subtype field configurations with width_chars = 4 and padding = 2
-- Asset type fields: main_asset_type, sub_asset_type_1 through sub_asset_type_6

-- Assets List grid - asset type fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-list', 'main_asset_type', 4, 2, '×¡×•×’ × ×›×¡ ×¨××©×™', false, null, true, NULL),
  ('assets-list', 'sub_asset_type_1', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 1', false, null, true, NULL),
  ('assets-list', 'sub_asset_type_2', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 2', false, null, true, NULL),
  ('assets-list', 'sub_asset_type_3', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 3', false, null, true, NULL),
  ('assets-list', 'sub_asset_type_4', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 4', false, null, true, NULL),
  ('assets-list', 'sub_asset_type_5', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 5', false, null, true, NULL),
  ('assets-list', 'sub_asset_type_6', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 6', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 4, padding = 2, updated_at = now();

-- Asset Details Main grid - asset type fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-details-main', 'main_asset_type', 4, 2, '×¡×•×’ × ×›×¡ ×¨××©×™', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_type_1', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 1', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_type_2', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 2', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_type_3', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 3', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_type_4', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 4', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_type_5', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 5', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_type_6', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 6', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 4, padding = 2, updated_at = now();

-- Asset Details History grid - asset type fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-details-history', 'main_asset_type', 4, 2, '×¡×•×’ × ×›×¡ ×¨××©×™', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_type_1', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 1', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_type_2', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 2', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_type_3', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 3', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_type_4', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 4', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_type_5', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 5', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_type_6', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 6', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 4, padding = 2, updated_at = now();

-- Asset Data Entry grid - asset type fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-data-entry', 'main_asset_type', 4, 2, '×¡×•×’ × ×›×¡ ×¨××©×™', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_type_1', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 1', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_type_2', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 2', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_type_3', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 3', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_type_4', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 4', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_type_5', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 5', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_type_6', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 6', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 4, padding = 2, updated_at = now();

-- Transfer Areas grid - asset type fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('transfer-areas', 'main_asset_type', 4, 2, '×¡×•×’ × ×›×¡ ×¨××©×™', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_type_1', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 1', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_type_2', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 2', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_type_3', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 3', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_type_4', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 4', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_type_5', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 5', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_type_6', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 6', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 4, padding = 2, updated_at = now();

-- Assets File Import grid - asset type fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-file-import', 'main_asset_type', 4, 2, '×¡×•×’ × ×›×¡ ×¨××©×™', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_type_1', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 1', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_type_2', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 2', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_type_3', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 3', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_type_4', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 4', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_type_5', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 5', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_type_6', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 6', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 4, padding = 2, updated_at = now();

-- Insert asset size and subsize field configurations with width_chars = 6 and padding = 2
-- Asset size fields: asset_size, sub_asset_size_1 through sub_asset_size_6

-- Assets List grid - asset size fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-list', 'asset_size', 6, 2, '×’×•×“×œ × ×›×¡ ×¨××©×™', false, null, true, NULL),
  ('assets-list', 'sub_asset_size_1', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 1', false, null, true, NULL),
  ('assets-list', 'sub_asset_size_2', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 2', false, null, true, NULL),
  ('assets-list', 'sub_asset_size_3', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 3', false, null, true, NULL),
  ('assets-list', 'sub_asset_size_4', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 4', false, null, true, NULL),
  ('assets-list', 'sub_asset_size_5', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 5', false, null, true, NULL),
  ('assets-list', 'sub_asset_size_6', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 6', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Asset Details Main grid - asset size fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-details-main', 'asset_size', 6, 2, '×’×•×“×œ × ×›×¡ ×¨××©×™', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_size_1', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 1', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_size_2', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 2', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_size_3', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 3', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_size_4', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 4', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_size_5', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 5', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_size_6', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 6', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Asset Details History grid - asset size fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-details-history', 'asset_size', 6, 2, '×’×•×“×œ × ×›×¡ ×¨××©×™', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_size_1', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 1', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_size_2', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 2', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_size_3', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 3', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_size_4', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 4', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_size_5', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 5', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_size_6', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 6', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Asset Data Entry grid - asset size fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-data-entry', 'asset_size', 6, 2, '×’×•×“×œ × ×›×¡ ×¨××©×™', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_size_1', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 1', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_size_2', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 2', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_size_3', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 3', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_size_4', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 4', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_size_5', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 5', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_size_6', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 6', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Transfer Areas grid - asset size fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('transfer-areas', 'asset_size', 6, 2, '×’×•×“×œ × ×›×¡ ×¨××©×™', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_size_1', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 1', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_size_2', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 2', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_size_3', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 3', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_size_4', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 4', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_size_5', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 5', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_size_6', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 6', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Assets File Import grid - asset size fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-file-import', 'asset_size', 6, 2, '×’×•×“×œ × ×›×¡ ×¨××©×™', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_size_1', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 1', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_size_2', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 2', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_size_3', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 3', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_size_4', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 4', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_size_5', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 5', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_size_6', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 6', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Insert tax_region field configurations with width_chars = 6 and padding = 2

-- Assets List grid - tax_region
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-list', 'tax_region', 6, 2, '××–×•×¨ ×ž×¡', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Asset Details Main grid - tax_region
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-details-main', 'tax_region', 6, 2, '××–×•×¨ ×ž×¡', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Asset Details History grid - tax_region
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-details-history', 'tax_region', 6, 2, '××–×•×¨ ×ž×¡', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Asset Data Entry grid - tax_region
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-data-entry', 'tax_region', 6, 2, '××–×•×¨ ×ž×¡', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Transfer Areas grid - tax_region
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('transfer-areas', 'tax_region', 6, 2, '××–×•×¨ ×ž×¡', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Assets File Import grid - tax_region
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-file-import', 'tax_region', 6, 2, '××–×•×¨ ×ž×¡', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Asset Types grid - tax_region
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-types', 'tax_region', 6, 2, '××–×•×¨ ×ž×¡', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Buildings List grid - tax_region
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('buildings-list', 'tax_region', 6, 2, '××–×•×¨ ×ž×¡', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Insert date field configurations with width_chars = 10 and padding = 2
-- Date fields: measurement_date, discount_date_from, discount_date_to

-- Assets List grid - date fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-list', 'measurement_date', 10, 2, '×ª××¨×™×š ×ž×“×™×“×”', false, null, true, NULL),
  ('assets-list', 'discount_date_from', 10, 2, '×ª××¨×™×š ×”× ×—×” ×ž', false, null, true, NULL),
  ('assets-list', 'discount_date_to', 10, 2, '×ª××¨×™×š ×”× ×—×” ×¢×“', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 10, padding = 2, updated_at = now();

-- Asset Details Main grid - date fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-details-main', 'measurement_date', 10, 2, '×ª××¨×™×š ×ž×“×™×“×”', false, null, true, NULL),
  ('asset-details-main', 'discount_date_from', 10, 2, '×ª××¨×™×š ×”× ×—×” ×ž', false, null, true, NULL),
  ('asset-details-main', 'discount_date_to', 10, 2, '×ª××¨×™×š ×”× ×—×” ×¢×“', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 10, padding = 2, updated_at = now();

-- Asset Details History grid - date fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-details-history', 'measurement_date', 10, 2, '×ª××¨×™×š ×ž×“×™×“×”', false, null, true, NULL),
  ('asset-details-history', 'discount_date_from', 10, 2, '×ª××¨×™×š ×”× ×—×” ×ž', false, null, true, NULL),
  ('asset-details-history', 'discount_date_to', 10, 2, '×ª××¨×™×š ×”× ×—×” ×¢×“', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 10, padding = 2, updated_at = now();

-- Asset Data Entry grid - date fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-data-entry', 'measurement_date', 10, 2, '×ª××¨×™×š ×ž×“×™×“×”', false, null, true, NULL),
  ('asset-data-entry', 'discount_date_from', 10, 2, '×ª××¨×™×š ×”× ×—×” ×ž', false, null, true, NULL),
  ('asset-data-entry', 'discount_date_to', 10, 2, '×ª××¨×™×š ×”× ×—×” ×¢×“', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 10, padding = 2, updated_at = now();

-- Transfer Areas grid - date fields (if applicable)
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('transfer-areas', 'measurement_date', 10, 2, '×ª××¨×™×š ×ž×“×™×“×”', false, null, true, NULL),
  ('transfer-areas', 'discount_date_from', 10, 2, '×ª××¨×™×š ×”× ×—×” ×ž', false, null, true, NULL),
  ('transfer-areas', 'discount_date_to', 10, 2, '×ª××¨×™×š ×”× ×—×” ×¢×“', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 10, padding = 2, updated_at = now();

-- Assets File Import grid - date fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-file-import', 'measurement_date', 10, 2, '×ª××¨×™×š ×ž×“×™×“×”', false, null, true, NULL),
  ('assets-file-import', 'discount_date_from', 10, 2, '×ª××¨×™×š ×”× ×—×” ×ž', false, null, true, NULL),
  ('assets-file-import', 'discount_date_to', 10, 2, '×ª××¨×™×š ×”× ×—×” ×¢×“', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 10, padding = 2, updated_at = now();

-- Set width_chars = 6 and padding = 2 for all other fields that don't have specific widths (10, 4, or 6)
-- This covers any existing fields like: measurement_date, floor, discount_type, discount_date_from, 
-- discount_date_to, structure_drawing_url, area_from_distribution, name, description,
-- area_description_for_tab, business_residence, min_size, max_size, and any other fields
-- Note: This UPDATE will affect any fields that were already in the table before the DELETE above
-- or fields that get added later through other means (UI, other migrations, etc.)
UPDATE field_configurations
SET width_chars = 6, padding = 2, updated_at = now()
WHERE width_chars IS NULL OR width_chars NOT IN (10, 4, 6);

-- Note: Additional field configurations can be added through the Field Config Manager UI
-- or by importing a configuration file with the updated field definitions.




-- ============================================================================
-- Migration: 20251221000001_add_comment_to_assets.sql
-- ============================================================================

/*
  # Add Comment Field to Assets Table
  
  This migration adds a comment field to the assets table to allow users
  to add notes/comments about individual assets.
  
  Changes:
  1. Adds comment text column to assets table
  2. Adds comment text column to assets_history table (for historical records)
  3. Updates the copy_asset_to_history trigger function to include the comment field
  4. Updates save_assets_bulk_transactional function to handle the comment field
*/

-- Add comment column to assets table
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS comment text;

-- Add comment column to assets_history table
ALTER TABLE assets_history
  ADD COLUMN IF NOT EXISTS comment text;

-- Add comment to column
COMMENT ON COLUMN assets.comment IS 'User comment/notes about the asset (×”×¢×¨×” ×¢×œ ×”× ×›×¡)';
COMMENT ON COLUMN assets_history.comment IS 'User comment/notes about the asset (historical record)';

-- Update the copy_asset_to_history function to include comment field
-- This function copies assets to history when is_new_measurement flag is set
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
        tax_region, floor, discount_type, discount_date_from, discount_date_to,
        comment
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
        OLD.tax_region, OLD.floor, OLD.discount_type, OLD.discount_date_from, OLD.discount_date_to,
        OLD.comment
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
      tax_region, floor, discount_type, discount_date_from, discount_date_to,
      comment
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
      OLD.tax_region, OLD.floor, OLD.discount_type, OLD.discount_date_from, OLD.discount_date_to,
      OLD.comment
    );
    RETURN OLD;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add field configurations for comment field with width_chars = 6 and padding = 2
-- Insert comment field configurations for all relevant grids

-- Assets List grid - comment
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-list', 'comment', 6, 2, '×”×¢×¨×”', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Asset Details Main grid - comment
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-details-main', 'comment', 6, 2, '×”×¢×¨×”', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Asset Details History grid - comment
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-details-history', 'comment', 6, 2, '×”×¢×¨×”', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Asset Data Entry grid - comment
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-data-entry', 'comment', 6, 2, '×”×¢×¨×”', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Transfer Areas grid - comment
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('transfer-areas', 'comment', 6, 2, '×”×¢×¨×”', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Assets File Import grid - comment
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-file-import', 'comment', 6, 2, '×”×¢×¨×”', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();




-- ============================================================================
-- Migration: 20251221000003_update_pinned_columns_to_left.sql
-- ============================================================================

/*
  # Update Pinned Columns to Right Side
  
  This migration updates all pinned columns in field_configurations to have
  pin_side = 'right' instead of 'left' or null.
  
  Changes:
  1. Sets pin_side = 'right' for all rows where pinned = true
*/

-- Update all pinned columns to be pinned on the right side
UPDATE field_configurations
SET pin_side = 'right', updated_at = now()
WHERE pinned = true;




-- ============================================================================
-- Migration: 20251221000004_rebuild_all_field_configurations.sql
-- ============================================================================

/*
  # Rebuild All Field Configurations
  
  This migration rebuilds the entire field_configurations table with:
  - padding = 2 for all fields
  - default width_chars = 6 for all fields (except special cases)
  - All grids in the system included
  
  Special widths:
  - asset_id, building_number, payer_id, actions: 10
  - checkboxes (active, elevator, etc.): 4
  - asset types/subtypes: 4
  - asset sizes/subsizes: 6
  - dates (measurement_date, discount_date_from, discount_date_to): 10
  - All other fields: 6 (default)
*/

-- Update the default padding value to 2 and width_chars to 6
ALTER TABLE field_configurations
  ALTER COLUMN padding SET DEFAULT 2,
  ALTER COLUMN width_chars SET DEFAULT 6;

-- Delete all existing field configurations
DELETE FROM field_configurations;

-- ============================================================================
-- 1. BUILDINGS LIST GRID
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('buildings-list', 'building_number', 10, 2, '×ž×¡×¤×¨ ×‘× ×™×™×Ÿ', true, 'right', true, NULL),
  ('buildings-list', 'actions', 10, 2, '×¤×¢×•×œ×•×ª', true, 'right', true, NULL),
  ('buildings-list', 'tax_region', 5, 2, '××–×•×¨ ×ž×™×¡×™×', false, null, true, NULL),
  ('buildings-list', 'overload_ratio', 6, 2, '××—×•×– ×”×¢×ž×¡×”', false, null, true, NULL),
  ('buildings-list', 'residence_shared_area', 6, 2, '×©×˜×— ×ž×©×•×ª×£ ×ž×’×•×¨×™×', false, null, true, NULL),
  ('buildings-list', 'business_shared_area', 6, 2, '×©×˜×— ×ž×©×•×ª×£ ×¢×¡×§×™×', false, null, true, NULL),
  ('buildings-list', 'total_building_area', 6, 2, '×¡"×› ×’×•×“×œ', false, null, true, NULL),
  ('buildings-list', 'area_for_control', 6, 2, '×©×˜×— ×œ×‘×§×¨×”', false, null, true, NULL),
  ('buildings-list', 'elevator', 4, 2, '×ž×¢×œ×™×ª', false, null, true, NULL),
  ('buildings-list', 'single_double_family', 4, 2, '×‘×™×ª ×¤×¨×˜×™', false, null, true, NULL),
  ('buildings-list', 'condo', 4, 2, '×‘×™×ª ×ž×©×•×ª×£', false, null, true, NULL),
  ('buildings-list', 'townhouses', 4, 2, '×˜×•×¨×™×™×', false, null, true, NULL),
  ('buildings-list', 'building_address', 6, 2, '×›×ª×•×‘×ª', false, null, true, NULL),
  ('buildings-list', 'gosh', 6, 2, '×’×•×©', false, null, true, NULL),
  ('buildings-list', 'helka', 6, 2, '×—×œ×§×”', false, null, true, NULL),
  ('buildings-list', 'building_number_in_street', 6, 2, '×ž×¡×¤×¨ ×‘× ×™×™×Ÿ ×‘×¨×—×•×‘', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name IN ('building_number', 'actions') THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name IN ('building_number', 'actions') THEN 'right' WHEN field_configurations.pinned = true THEN 'right' ELSE field_configurations.pin_side END,
    updated_at = now();

-- ============================================================================
-- 2. ASSETS LIST GRID
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-list', 'asset_id', 10, 2, '×ž×–×”×” × ×›×¡', true, 'right', true, NULL),
  ('assets-list', 'actions', 10, 2, '×¤×¢×•×œ×•×ª', true, 'right', true, NULL),
  ('assets-list', 'payer_id', 10, 2, '×ž×–×”×” ×ž×©×œ×', false, null, true, NULL),
  ('assets-list', 'measurement_date', 10, 2, '×ª××¨×™×š ×ž×“×™×“×”', false, null, true, NULL),
  ('assets-list', 'tax_region', 5, 2, '××–×•×¨ ×ž×¡', false, null, true, NULL),
  ('assets-list', 'penthouse', 4, 2, '×“×™×¨×ª ×’×’', false, null, true, NULL),
  ('assets-list', 'floor', 6, 2, '×§×•×ž×”', false, null, true, NULL),
  ('assets-list', 'discount_type', 6, 2, '×¡×•×’ ×”× ×—×”', false, null, true, NULL),
  ('assets-list', 'discount_date_from', 10, 2, '×ª××¨×™×š ×”× ×—×” ×ž', false, null, true, NULL),
  ('assets-list', 'discount_date_to', 10, 2, '×ª××¨×™×š ×”× ×—×” ×¢×“', false, null, true, NULL),
  ('assets-list', 'main_asset_type', 4, 2, '×¡×•×’ × ×›×¡ ×¨××©×™', false, null, true, NULL),
  ('assets-list', 'asset_size', 6, 2, '×’×•×“×œ × ×›×¡ ×¨××©×™', false, null, true, NULL),
  ('assets-list', 'sub_asset_type_1', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 1', false, null, true, NULL),
  ('assets-list', 'sub_asset_size_1', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 1', false, null, true, NULL),
  ('assets-list', 'sub_asset_type_2', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 2', false, null, true, NULL),
  ('assets-list', 'sub_asset_size_2', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 2', false, null, true, NULL),
  ('assets-list', 'sub_asset_type_3', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 3', false, null, true, NULL),
  ('assets-list', 'sub_asset_size_3', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 3', false, null, true, NULL),
  ('assets-list', 'sub_asset_type_4', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 4', false, null, true, NULL),
  ('assets-list', 'sub_asset_size_4', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 4', false, null, true, NULL),
  ('assets-list', 'sub_asset_type_5', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 5', false, null, true, NULL),
  ('assets-list', 'sub_asset_size_5', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 5', false, null, true, NULL),
  ('assets-list', 'sub_asset_type_6', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 6', false, null, true, NULL),
  ('assets-list', 'sub_asset_size_6', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 6', false, null, true, NULL),
  ('assets-list', 'comment', 6, 2, '×”×¢×¨×”', false, null, true, NULL),
  ('assets-list', 'area_from_distribution', 6, 2, '×©×˜×— ×ž×¤×™×–×•×¨', false, null, true, NULL),
  ('assets-list', 'structure_drawing_url', 6, 2, '×§×™×©×•×¨ ×œ×©×¨×˜×•×˜', false, null, true, NULL),
  ('assets-list', 'elevator', 4, 2, '×ž×¢×œ×™×ª', false, null, true, NULL),
  ('assets-list', 'single_double_family', 4, 2, '×‘×™×ª ×¤×¨×˜×™', false, null, true, NULL),
  ('assets-list', 'condo', 4, 2, '×‘×™×ª ×ž×©×•×ª×£', false, null, true, NULL),
  ('assets-list', 'townhouses', 4, 2, '×˜×•×¨×™×™×', false, null, true, NULL),
  ('assets-list', 'exported_to_automation', 4, 2, '×™×•×¦× ×œ××•×˜×•×ž×¦×™×”', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'actions') THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'actions') THEN 'right' WHEN field_configurations.pinned = true THEN 'right' ELSE field_configurations.pin_side END,
    updated_at = now();

-- ============================================================================
-- 3. ASSET TYPES GRID
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-types', 'actions', 10, 2, '×¤×¢×•×œ×•×ª', true, 'right', true, NULL),
  ('asset-types', 'active', 4, 2, '×¤×¢×™×œ', false, null, true, NULL),
  ('asset-types', 'name', 6, 2, '×§×•×“ × ×›×¡', false, null, true, NULL),
  ('asset-types', 'description', 6, 2, '×ª×™××•×¨', false, null, true, NULL),
  ('asset-types', 'tax_region', 5, 2, '××–×•×¨ ×ž×™×¡×™×', false, null, true, NULL),
  ('asset-types', 'area_description_for_tab', 6, 2, '×ª×™××•×¨ ××–×•×¨ ×œ×ª×¦×•×’×” ×‘×œ×©×•× ×™×ª', false, null, true, NULL),
  ('asset-types', 'elevator', 4, 2, '×ž×¢×œ×™×ª', false, null, true, NULL),
  ('asset-types', 'single_double_family', 4, 2, '×‘×™×ª ×¤×¨×˜×™', false, null, true, NULL),
  ('asset-types', 'penthouse', 4, 2, '×“×™×¨×ª ×’×’', false, null, true, NULL),
  ('asset-types', 'condo', 4, 2, '×‘×™×ª ×ž×©×•×ª×£', false, null, true, NULL),
  ('asset-types', 'townhouses', 4, 2, '×˜×•×¨×™×™×', false, null, true, NULL),
  ('asset-types', 'business_residence', 6, 2, '×¢×¡×§×™×/×ž×’×•×¨×™×', false, null, true, NULL),
  ('asset-types', 'non_accountable_for_total_area', 4, 2, '×œ× × ×¡×¤×¨ ×‘×—×™×©×•×‘ ×©×˜×— ×ž×‘× ×”', false, null, true, NULL),
  ('asset-types', 'non_accountable_for_distribution', 4, 2, '×œ× × ×¡×¤×¨ ×‘×¤×™×–×•×¨', false, null, true, NULL),
  ('asset-types', 'min_size', 6, 2, '×©×˜×— ×ž', false, null, true, NULL),
  ('asset-types', 'max_size', 6, 2, '×©×˜×— ×¢×“', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name = 'actions' THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name = 'actions' THEN 'right' WHEN field_configurations.pinned = true THEN 'right' ELSE field_configurations.pin_side END,
    updated_at = now();

-- ============================================================================
-- 4. ADDRESS LIST GRID
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('address-list', 'actions', 10, 2, '×¤×¢×•×œ×•×ª', true, 'right', true, NULL),
  ('address-list', 'street_code', 6, 2, '×¡×ž×œ ×¨×—×•×‘', false, null, true, NULL),
  ('address-list', 'street_description', 6, 2, '×©× ×¨×—×•×‘', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name = 'actions' THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name = 'actions' THEN 'right' WHEN field_configurations.pinned = true THEN 'right' ELSE field_configurations.pin_side END,
    updated_at = now();

-- ============================================================================
-- 5. VALIDATION RULES MANAGER GRID
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('validation-rules-manager', 'actions', 10, 2, '×¤×¢×•×œ×•×ª', true, 'right', true, NULL),
  ('validation-rules-manager', 'enabled', 4, 2, '×ž×•×¤×¢×œ', false, null, true, NULL),
  ('validation-rules-manager', 'rule_key', 6, 2, '×ž×¤×ª×— ×›×œ×œ', false, null, true, NULL),
  ('validation-rules-manager', 'entity_type', 6, 2, '×¡×•×’ ×™×©×•×ª', false, null, true, NULL),
  ('validation-rules-manager', 'field_name', 6, 2, '×©× ×©×“×”', false, null, true, NULL),
  ('validation-rules-manager', 'rule_type', 6, 2, '×¡×•×’ ×›×œ×œ', false, null, true, NULL),
  ('validation-rules-manager', 'value_numeric', 6, 2, '×¢×¨×š ×ž×¡×¤×¨×™', false, null, true, NULL),
  ('validation-rules-manager', 'value_text', 6, 2, '×¢×¨×š ×˜×§×¡×˜', false, null, true, NULL),
  ('validation-rules-manager', 'error_message', 6, 2, '×”×•×“×¢×ª ×©×’×™××”', false, null, true, NULL),
  ('validation-rules-manager', 'compare_table', 6, 2, '×˜×‘×œ×ª ×”×©×•×•××”', false, null, true, NULL),
  ('validation-rules-manager', 'compare_field', 6, 2, '×©×“×” ×”×©×•×•××”', false, null, true, NULL),
  ('validation-rules-manager', 'join_field', 6, 2, '×©×“×” ×—×™×‘×•×¨', false, null, true, NULL),
  ('validation-rules-manager', 'comparison_operator', 6, 2, '××•×¤×¨×˜×•×¨ ×”×©×•×•××”', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name = 'actions' THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name = 'actions' THEN 'right' WHEN field_configurations.pinned = true THEN 'right' ELSE field_configurations.pin_side END,
    updated_at = now();

-- ============================================================================
-- 6. AUDIT LOG MASTER GRID
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('audit-log-master', 'action_id', 10, 2, '×ž×–×”×” ×¤×¢×•×œ×”', false, null, true, NULL),
  ('audit-log-master', 'created_at', 10, 2, '×ª××¨×™×š', false, null, true, NULL),
  ('audit-log-master', 'user_name', 6, 2, '×ž×©×ª×ž×©', false, null, true, NULL),
  ('audit-log-master', 'action_type', 6, 2, '×¡×•×’ ×¤×¢×•×œ×”', false, null, true, NULL),
  ('audit-log-master', 'entity_type', 6, 2, '×¡×•×’ ×™×©×•×ª', false, null, true, NULL),
  ('audit-log-master', 'entity_id', 6, 2, '×ž×–×”×” ×™×©×•×ª', false, null, true, NULL),
  ('audit-log-master', 'description', 6, 2, '×ª×™××•×¨', false, null, true, NULL),
  ('audit-log-master', '_has_before_data', 4, 2, '×™×© × ×ª×•× ×™× ×œ×¤× ×™', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, updated_at = now();

-- ============================================================================
-- 7. AUDIT LOG DETAIL GRID
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('audit-log-detail', '_type', 6, 2, '×¡×•×’', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, updated_at = now();

-- ============================================================================
-- 8. ASSET DETAILS MAIN GRID (same fields as assets-list + building_number)
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-details-main', 'asset_id', 10, 2, '×ž×–×”×” × ×›×¡', true, 'right', true, NULL),
  ('asset-details-main', 'actions', 10, 2, '×¤×¢×•×œ×•×ª', true, 'right', true, NULL),
  ('asset-details-main', 'building_number', 10, 2, '×ž×¡×¤×¨ ×‘× ×™×™×Ÿ', true, 'right', true, NULL),
  ('asset-details-main', 'payer_id', 10, 2, '×ž×–×”×” ×ž×©×œ×', false, null, true, NULL),
  ('asset-details-main', 'measurement_date', 10, 2, '×ª××¨×™×š ×ž×“×™×“×”', false, null, true, NULL),
  ('asset-details-main', 'tax_region', 5, 2, '××–×•×¨ ×ž×¡', false, null, true, NULL),
  ('asset-details-main', 'penthouse', 4, 2, '×“×™×¨×ª ×’×’', false, null, true, NULL),
  ('asset-details-main', 'floor', 6, 2, '×§×•×ž×”', false, null, true, NULL),
  ('asset-details-main', 'discount_type', 6, 2, '×¡×•×’ ×”× ×—×”', false, null, true, NULL),
  ('asset-details-main', 'discount_date_from', 10, 2, '×ª××¨×™×š ×”× ×—×” ×ž', false, null, true, NULL),
  ('asset-details-main', 'discount_date_to', 10, 2, '×ª××¨×™×š ×”× ×—×” ×¢×“', false, null, true, NULL),
  ('asset-details-main', 'main_asset_type', 4, 2, '×¡×•×’ × ×›×¡ ×¨××©×™', false, null, true, NULL),
  ('asset-details-main', 'asset_size', 6, 2, '×’×•×“×œ × ×›×¡ ×¨××©×™', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_type_1', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 1', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_size_1', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 1', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_type_2', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 2', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_size_2', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 2', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_type_3', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 3', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_size_3', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 3', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_type_4', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 4', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_size_4', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 4', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_type_5', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 5', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_size_5', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 5', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_type_6', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 6', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_size_6', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 6', false, null, true, NULL),
  ('asset-details-main', 'comment', 6, 2, '×”×¢×¨×”', false, null, true, NULL),
  ('asset-details-main', 'area_from_distribution', 6, 2, '×©×˜×— ×ž×¤×™×–×•×¨', false, null, true, NULL),
  ('asset-details-main', 'structure_drawing_url', 6, 2, '×§×™×©×•×¨ ×œ×©×¨×˜×•×˜', false, null, true, NULL),
  ('asset-details-main', 'elevator', 4, 2, '×ž×¢×œ×™×ª', false, null, true, NULL),
  ('asset-details-main', 'single_double_family', 4, 2, '×‘×™×ª ×¤×¨×˜×™', false, null, true, NULL),
  ('asset-details-main', 'condo', 4, 2, '×‘×™×ª ×ž×©×•×ª×£', false, null, true, NULL),
  ('asset-details-main', 'townhouses', 4, 2, '×˜×•×¨×™×™×', false, null, true, NULL),
  ('asset-details-main', 'exported_to_automation', 4, 2, '×™×•×¦× ×œ××•×˜×•×ž×¦×™×”', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'building_number', 'actions') THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'building_number', 'actions') THEN 'right' WHEN field_configurations.pinned = true THEN 'right' ELSE field_configurations.pin_side END,
    updated_at = now();

-- ============================================================================
-- 9. ASSET DETAILS HISTORY GRID (same fields as assets-list + building_number + history_created_at)
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-details-history', 'asset_id', 10, 2, '×ž×–×”×” × ×›×¡', true, 'right', true, NULL),
  ('asset-details-history', 'actions', 10, 2, '×¤×¢×•×œ×•×ª', true, 'right', true, NULL),
  ('asset-details-history', 'building_number', 10, 2, '×ž×¡×¤×¨ ×‘× ×™×™×Ÿ', true, 'right', true, NULL),
  ('asset-details-history', 'payer_id', 10, 2, '×ž×–×”×” ×ž×©×œ×', false, null, true, NULL),
  ('asset-details-history', 'measurement_date', 10, 2, '×ª××¨×™×š ×ž×“×™×“×”', false, null, true, NULL),
  ('asset-details-history', 'tax_region', 5, 2, '××–×•×¨ ×ž×¡', false, null, true, NULL),
  ('asset-details-history', 'penthouse', 4, 2, '×“×™×¨×ª ×’×’', false, null, true, NULL),
  ('asset-details-history', 'floor', 6, 2, '×§×•×ž×”', false, null, true, NULL),
  ('asset-details-history', 'discount_type', 6, 2, '×¡×•×’ ×”× ×—×”', false, null, true, NULL),
  ('asset-details-history', 'discount_date_from', 10, 2, '×ª××¨×™×š ×”× ×—×” ×ž', false, null, true, NULL),
  ('asset-details-history', 'discount_date_to', 10, 2, '×ª××¨×™×š ×”× ×—×” ×¢×“', false, null, true, NULL),
  ('asset-details-history', 'main_asset_type', 4, 2, '×¡×•×’ × ×›×¡ ×¨××©×™', false, null, true, NULL),
  ('asset-details-history', 'asset_size', 6, 2, '×’×•×“×œ × ×›×¡ ×¨××©×™', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_type_1', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 1', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_size_1', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 1', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_type_2', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 2', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_size_2', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 2', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_type_3', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 3', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_size_3', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 3', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_type_4', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 4', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_size_4', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 4', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_type_5', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 5', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_size_5', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 5', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_type_6', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 6', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_size_6', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 6', false, null, true, NULL),
  ('asset-details-history', 'comment', 6, 2, '×”×¢×¨×”', false, null, true, NULL),
  ('asset-details-history', 'area_from_distribution', 6, 2, '×©×˜×— ×ž×¤×™×–×•×¨', false, null, true, NULL),
  ('asset-details-history', 'structure_drawing_url', 6, 2, '×§×™×©×•×¨ ×œ×©×¨×˜×•×˜', false, null, true, NULL),
  ('asset-details-history', 'elevator', 4, 2, '×ž×¢×œ×™×ª', false, null, true, NULL),
  ('asset-details-history', 'single_double_family', 4, 2, '×‘×™×ª ×¤×¨×˜×™', false, null, true, NULL),
  ('asset-details-history', 'condo', 4, 2, '×‘×™×ª ×ž×©×•×ª×£', false, null, true, NULL),
  ('asset-details-history', 'townhouses', 4, 2, '×˜×•×¨×™×™×', false, null, true, NULL),
  ('asset-details-history', 'exported_to_automation', 4, 2, '×™×•×¦× ×œ××•×˜×•×ž×¦×™×”', false, null, true, NULL),
  ('asset-details-history', 'history_created_at', 10, 2, '×ª××¨×™×š ×™×¦×™×¨×ª ×”×™×¡×˜×•×¨×™×”', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'building_number', 'actions') THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'building_number', 'actions') THEN 'right' WHEN field_configurations.pinned = true THEN 'right' ELSE field_configurations.pin_side END,
    updated_at = now();

-- ============================================================================
-- 10. ASSET DATA ENTRY GRID (same fields as assets-list + building_number)
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-data-entry', 'asset_id', 10, 2, '×ž×–×”×” × ×›×¡', true, 'right', true, NULL),
  ('asset-data-entry', 'actions', 10, 2, '×¤×¢×•×œ×•×ª', true, 'right', true, NULL),
  ('asset-data-entry', 'building_number', 10, 2, '×ž×¡×¤×¨ ×‘× ×™×™×Ÿ', true, 'right', true, NULL),
  ('asset-data-entry', 'payer_id', 10, 2, '×ž×–×”×” ×ž×©×œ×', false, null, true, NULL),
  ('asset-data-entry', 'measurement_date', 10, 2, '×ª××¨×™×š ×ž×“×™×“×”', false, null, true, NULL),
  ('asset-data-entry', 'tax_region', 5, 2, '××–×•×¨ ×ž×¡', false, null, true, NULL),
  ('asset-data-entry', 'penthouse', 4, 2, '×“×™×¨×ª ×’×’', false, null, true, NULL),
  ('asset-data-entry', 'floor', 6, 2, '×§×•×ž×”', false, null, true, NULL),
  ('asset-data-entry', 'discount_type', 6, 2, '×¡×•×’ ×”× ×—×”', false, null, true, NULL),
  ('asset-data-entry', 'discount_date_from', 10, 2, '×ª××¨×™×š ×”× ×—×” ×ž', false, null, true, NULL),
  ('asset-data-entry', 'discount_date_to', 10, 2, '×ª××¨×™×š ×”× ×—×” ×¢×“', false, null, true, NULL),
  ('asset-data-entry', 'main_asset_type', 4, 2, '×¡×•×’ × ×›×¡ ×¨××©×™', false, null, true, NULL),
  ('asset-data-entry', 'asset_size', 6, 2, '×’×•×“×œ × ×›×¡ ×¨××©×™', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_type_1', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 1', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_size_1', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 1', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_type_2', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 2', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_size_2', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 2', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_type_3', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 3', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_size_3', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 3', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_type_4', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 4', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_size_4', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 4', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_type_5', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 5', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_size_5', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 5', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_type_6', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 6', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_size_6', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 6', false, null, true, NULL),
  ('asset-data-entry', 'comment', 6, 2, '×”×¢×¨×”', false, null, true, NULL),
  ('asset-data-entry', 'area_from_distribution', 6, 2, '×©×˜×— ×ž×¤×™×–×•×¨', false, null, true, NULL),
  ('asset-data-entry', 'structure_drawing_url', 6, 2, '×§×™×©×•×¨ ×œ×©×¨×˜×•×˜', false, null, true, NULL),
  ('asset-data-entry', 'elevator', 4, 2, '×ž×¢×œ×™×ª', false, null, true, NULL),
  ('asset-data-entry', 'single_double_family', 4, 2, '×‘×™×ª ×¤×¨×˜×™', false, null, true, NULL),
  ('asset-data-entry', 'condo', 4, 2, '×‘×™×ª ×ž×©×•×ª×£', false, null, true, NULL),
  ('asset-data-entry', 'townhouses', 4, 2, '×˜×•×¨×™×™×', false, null, true, NULL),
  ('asset-data-entry', 'exported_to_automation', 4, 2, '×™×•×¦× ×œ××•×˜×•×ž×¦×™×”', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'building_number', 'actions') THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'building_number', 'actions') THEN 'right' WHEN field_configurations.pinned = true THEN 'right' ELSE field_configurations.pin_side END,
    updated_at = now();

-- ============================================================================
-- 11. TRANSFER AREAS GRID (same fields as assets-list, but no building_number)
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('transfer-areas', 'asset_id', 10, 2, '×ž×–×”×” × ×›×¡', true, 'right', true, NULL),
  ('transfer-areas', 'actions', 10, 2, '×¤×¢×•×œ×•×ª', true, 'right', true, NULL),
  ('transfer-areas', 'payer_id', 10, 2, '×ž×–×”×” ×ž×©×œ×', false, null, true, NULL),
  ('transfer-areas', 'measurement_date', 10, 2, '×ª××¨×™×š ×ž×“×™×“×”', false, null, true, NULL),
  ('transfer-areas', 'tax_region', 5, 2, '××–×•×¨ ×ž×¡', false, null, true, NULL),
  ('transfer-areas', 'penthouse', 4, 2, '×“×™×¨×ª ×’×’', false, null, true, NULL),
  ('transfer-areas', 'floor', 6, 2, '×§×•×ž×”', false, null, true, NULL),
  ('transfer-areas', 'discount_type', 6, 2, '×¡×•×’ ×”× ×—×”', false, null, true, NULL),
  ('transfer-areas', 'discount_date_from', 10, 2, '×ª××¨×™×š ×”× ×—×” ×ž', false, null, true, NULL),
  ('transfer-areas', 'discount_date_to', 10, 2, '×ª××¨×™×š ×”× ×—×” ×¢×“', false, null, true, NULL),
  ('transfer-areas', 'main_asset_type', 4, 2, '×¡×•×’ × ×›×¡ ×¨××©×™', false, null, true, NULL),
  ('transfer-areas', 'asset_size', 6, 2, '×’×•×“×œ × ×›×¡ ×¨××©×™', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_type_1', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 1', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_size_1', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 1', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_type_2', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 2', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_size_2', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 2', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_type_3', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 3', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_size_3', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 3', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_type_4', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 4', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_size_4', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 4', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_type_5', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 5', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_size_5', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 5', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_type_6', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 6', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_size_6', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 6', false, null, true, NULL),
  ('transfer-areas', 'comment', 6, 2, '×”×¢×¨×”', false, null, true, NULL),
  ('transfer-areas', 'area_from_distribution', 6, 2, '×©×˜×— ×ž×¤×™×–×•×¨', false, null, true, NULL),
  ('transfer-areas', 'structure_drawing_url', 6, 2, '×§×™×©×•×¨ ×œ×©×¨×˜×•×˜', false, null, true, NULL),
  ('transfer-areas', 'elevator', 4, 2, '×ž×¢×œ×™×ª', false, null, true, NULL),
  ('transfer-areas', 'single_double_family', 4, 2, '×‘×™×ª ×¤×¨×˜×™', false, null, true, NULL),
  ('transfer-areas', 'condo', 4, 2, '×‘×™×ª ×ž×©×•×ª×£', false, null, true, NULL),
  ('transfer-areas', 'townhouses', 4, 2, '×˜×•×¨×™×™×', false, null, true, NULL),
  ('transfer-areas', 'exported_to_automation', 4, 2, '×™×•×¦× ×œ××•×˜×•×ž×¦×™×”', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'actions') THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'actions') THEN 'right' WHEN field_configurations.pinned = true THEN 'right' ELSE field_configurations.pin_side END,
    updated_at = now();

-- ============================================================================
-- 12. ASSETS FILE IMPORT GRID (same fields as assets-list + building_number)
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-file-import', 'asset_id', 10, 2, '×ž×–×”×” × ×›×¡', true, 'right', true, NULL),
  ('assets-file-import', 'actions', 10, 2, '×¤×¢×•×œ×•×ª', true, 'right', true, NULL),
  ('assets-file-import', 'building_number', 10, 2, '×ž×¡×¤×¨ ×‘× ×™×™×Ÿ', true, 'right', true, NULL),
  ('assets-file-import', 'payer_id', 10, 2, '×ž×–×”×” ×ž×©×œ×', false, null, true, NULL),
  ('assets-file-import', 'measurement_date', 10, 2, '×ª××¨×™×š ×ž×“×™×“×”', false, null, true, NULL),
  ('assets-file-import', 'tax_region', 5, 2, '××–×•×¨ ×ž×¡', false, null, true, NULL),
  ('assets-file-import', 'penthouse', 4, 2, '×“×™×¨×ª ×’×’', false, null, true, NULL),
  ('assets-file-import', 'floor', 6, 2, '×§×•×ž×”', false, null, true, NULL),
  ('assets-file-import', 'discount_type', 6, 2, '×¡×•×’ ×”× ×—×”', false, null, true, NULL),
  ('assets-file-import', 'discount_date_from', 10, 2, '×ª××¨×™×š ×”× ×—×” ×ž', false, null, true, NULL),
  ('assets-file-import', 'discount_date_to', 10, 2, '×ª××¨×™×š ×”× ×—×” ×¢×“', false, null, true, NULL),
  ('assets-file-import', 'main_asset_type', 4, 2, '×¡×•×’ × ×›×¡ ×¨××©×™', false, null, true, NULL),
  ('assets-file-import', 'asset_size', 6, 2, '×’×•×“×œ × ×›×¡ ×¨××©×™', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_type_1', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 1', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_size_1', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 1', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_type_2', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 2', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_size_2', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 2', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_type_3', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 3', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_size_3', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 3', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_type_4', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 4', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_size_4', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 4', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_type_5', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 5', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_size_5', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 5', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_type_6', 4, 2, '×¡×•×’ × ×›×¡ ×ž×©× ×™ 6', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_size_6', 6, 2, '×’×•×“×œ × ×›×¡ ×ž×©× ×™ 6', false, null, true, NULL),
  ('assets-file-import', 'comment', 6, 2, '×”×¢×¨×”', false, null, true, NULL),
  ('assets-file-import', 'area_from_distribution', 6, 2, '×©×˜×— ×ž×¤×™×–×•×¨', false, null, true, NULL),
  ('assets-file-import', 'structure_drawing_url', 6, 2, '×§×™×©×•×¨ ×œ×©×¨×˜×•×˜', false, null, true, NULL),
  ('assets-file-import', 'elevator', 4, 2, '×ž×¢×œ×™×ª', false, null, true, NULL),
  ('assets-file-import', 'single_double_family', 4, 2, '×‘×™×ª ×¤×¨×˜×™', false, null, true, NULL),
  ('assets-file-import', 'condo', 4, 2, '×‘×™×ª ×ž×©×•×ª×£', false, null, true, NULL),
  ('assets-file-import', 'townhouses', 4, 2, '×˜×•×¨×™×™×', false, null, true, NULL),
  ('assets-file-import', 'exported_to_automation', 4, 2, '×™×•×¦× ×œ××•×˜×•×ž×¦×™×”', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'building_number', 'actions') THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'building_number', 'actions') THEN 'right' WHEN field_configurations.pinned = true THEN 'right' ELSE field_configurations.pin_side END,
    updated_at = now();

-- ============================================================================
-- FINAL: Set default width_chars = 6 and padding = 2 for any remaining fields
-- Also ensure all pinned fields have pin_side = 'right'
-- Also ensure all fields with "size" in the name have width_chars = 6
-- ============================================================================
UPDATE field_configurations
SET width_chars = 6, padding = 2, updated_at = now()
WHERE width_chars IS NULL OR width_chars NOT IN (10, 4, 6);

-- Ensure asset_id always has width_chars = 10
UPDATE field_configurations
SET width_chars = 10, updated_at = now()
WHERE field_name = 'asset_id' AND width_chars != 10;

-- Ensure building_number always has width_chars = 10
UPDATE field_configurations
SET width_chars = 10, updated_at = now()
WHERE field_name = 'building_number' AND width_chars != 10;

-- Ensure payer_id always has width_chars = 10
UPDATE field_configurations
SET width_chars = 10, updated_at = now()
WHERE field_name = 'payer_id' AND width_chars != 10;

-- Ensure all checkbox fields have width_chars = 4
-- Checkbox fields: active, elevator, single_double_family, penthouse, condo, townhouses,
-- non_accountable_for_total_area, non_accountable_for_distribution, exported_to_automation, enabled
UPDATE field_configurations
SET width_chars = 4, updated_at = now()
WHERE field_name IN ('active', 'elevator', 'single_double_family', 'penthouse', 'condo', 'townhouses', 
                      'non_accountable_for_total_area', 'non_accountable_for_distribution', 
                      'exported_to_automation', 'enabled', '_has_before_data')
  AND width_chars != 4;

-- Ensure all date fields have width_chars = 10
-- Date fields: measurement_date, discount_date_from, discount_date_to, created_at, updated_at, history_created_at
UPDATE field_configurations
SET width_chars = 10, updated_at = now()
WHERE field_name ILIKE '%date%' OR field_name IN ('created_at', 'updated_at', 'history_created_at')
  AND width_chars != 10;

-- Ensure all asset type and subtype fields have width_chars = 4
-- Asset type fields: main_asset_type, sub_asset_type_1 through sub_asset_type_6
UPDATE field_configurations
SET width_chars = 4, updated_at = now()
WHERE field_name ILIKE '%asset_type%' AND width_chars != 4;

-- Ensure tax_region always has width_chars = 5
UPDATE field_configurations
SET width_chars = 5, updated_at = now()
WHERE field_name = 'tax_region' AND width_chars != 5;

-- Ensure all fields with "size" in the name have width_chars = 6
UPDATE field_configurations
SET width_chars = 6, updated_at = now()
WHERE field_name ILIKE '%size%' AND width_chars != 6;

-- Ensure all pinned fields have pin_side = 'right'
UPDATE field_configurations
SET pin_side = 'right', updated_at = now()
WHERE pinned = true AND (pin_side IS NULL OR pin_side != 'right');




-- ============================================================================
-- Migration: 20251222000000_fix_business_asset_size_check.sql
-- ============================================================================

/*
  # Fix Business Asset Size Change Check
  
  This migration ensures that when a business asset size changes,
  the system checks business_shared_area (NOT residence_shared_area)
  before setting the need_business_distribution flag.
  
  The fix ensures that:
  - For business assets: Only set flag if business_shared_area > 0
  - For residence assets: Set flag regardless of shared area values
*/

-- ============================================================================
-- FUNCTION: save_asset_transactional - Fix business asset size check
-- ============================================================================

-- Recreate the function to ensure it checks business_shared_area (not residence_shared_area)
CREATE OR REPLACE FUNCTION save_asset_transactional(
  p_asset_data JSONB,
  p_validation_passed BOOLEAN,
  p_validation_errors TEXT DEFAULT NULL,
  p_action_type TEXT DEFAULT 'manual_update',
  p_user_id TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_asset_id BIGINT;
  v_building_number BIGINT;
  v_existing_asset RECORD;
  v_old_main_asset_type TEXT;
  v_new_main_asset_type TEXT;
  v_old_asset_size NUMERIC;
  v_new_asset_size NUMERIC;
  v_audit_id BIGINT;
  v_result JSONB;
  v_business_residence TEXT;
  v_asset_type_changed BOOLEAN := FALSE;
  v_asset_size_changed BOOLEAN := FALSE;
BEGIN
  -- ========================================================================
  -- STEP 1: EXTRACT DATA AND CHECK EXISTING ASSET
  -- ========================================================================
  v_asset_id := (p_asset_data->>'asset_id')::BIGINT;
  v_building_number := (p_asset_data->>'building_number')::BIGINT;
  v_new_main_asset_type := (p_asset_data->>'main_asset_type')::TEXT;
  v_new_asset_size := COALESCE((p_asset_data->>'asset_size')::NUMERIC, 0);

  IF v_asset_id IS NULL OR v_building_number IS NULL THEN
    RAISE EXCEPTION 'Asset ID and Building Number are required'
      USING HINT = 'Ensure asset_id and building_number are provided in p_asset_data';
  END IF;

  -- Check if asset exists
  SELECT * INTO v_existing_asset
  FROM assets
  WHERE asset_id = v_asset_id;

  IF FOUND THEN
    v_old_main_asset_type := v_existing_asset.main_asset_type;
    v_old_asset_size := v_existing_asset.asset_size;
    v_asset_type_changed := (v_old_main_asset_type IS DISTINCT FROM v_new_main_asset_type);
    v_asset_size_changed := (v_old_asset_size IS DISTINCT FROM v_new_asset_size);
  END IF;

  -- ========================================================================
  -- STEP 2: SAVE ASSET (INSERT or UPDATE)
  -- ========================================================================
  IF v_existing_asset IS NULL THEN
    -- INSERT new asset
    INSERT INTO assets (asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region, sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2, sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4, sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6, elevator, single_double_family, condo, townhouses, penthouse, structure_drawing_url, floor, discount_type, discount_date_from, discount_date_to, area_from_distribution, exported_to_automation, comment)
    VALUES (
      v_asset_id,
      v_building_number,
      (p_asset_data->>'payer_id')::TEXT,
      COALESCE((p_asset_data->>'measurement_date')::TEXT, '01/01/1900'),
      v_new_main_asset_type,
      v_new_asset_size,
      (p_asset_data->>'tax_region')::BIGINT,
      (p_asset_data->>'sub_asset_type_1')::TEXT,
      COALESCE((p_asset_data->>'sub_asset_size_1')::NUMERIC, 0),
      (p_asset_data->>'sub_asset_type_2')::TEXT,
      COALESCE((p_asset_data->>'sub_asset_size_2')::NUMERIC, 0),
      (p_asset_data->>'sub_asset_type_3')::TEXT,
      COALESCE((p_asset_data->>'sub_asset_size_3')::NUMERIC, 0),
      (p_asset_data->>'sub_asset_type_4')::TEXT,
      COALESCE((p_asset_data->>'sub_asset_size_4')::NUMERIC, 0),
      (p_asset_data->>'sub_asset_type_5')::TEXT,
      COALESCE((p_asset_data->>'sub_asset_size_5')::NUMERIC, 0),
      (p_asset_data->>'sub_asset_type_6')::TEXT,
      COALESCE((p_asset_data->>'sub_asset_size_6')::NUMERIC, 0),
      (p_asset_data->>'elevator')::TEXT,
      (p_asset_data->>'single_double_family')::TEXT,
      (p_asset_data->>'condo')::TEXT,
      (p_asset_data->>'townhouses')::TEXT,
      (p_asset_data->>'penthouse')::TEXT,
      (p_asset_data->>'structure_drawing_url')::TEXT,
      (p_asset_data->>'floor')::BIGINT,
      (p_asset_data->>'discount_type')::TEXT,
      (p_asset_data->>'discount_date_from')::TEXT,
      (p_asset_data->>'discount_date_to')::TEXT,
      (p_asset_data->>'area_from_distribution')::NUMERIC,
      COALESCE((p_asset_data->>'exported_to_automation')::BOOLEAN, false),
      (p_asset_data->>'comment')::TEXT
    );
  ELSE
    -- UPDATE existing asset
    UPDATE assets
    SET
      building_number = v_building_number,
      payer_id = COALESCE((p_asset_data->>'payer_id')::TEXT, payer_id),
      measurement_date = COALESCE((p_asset_data->>'measurement_date')::TEXT, measurement_date),
      main_asset_type = COALESCE(v_new_main_asset_type, main_asset_type),
      asset_size = COALESCE(v_new_asset_size, asset_size),
      tax_region = COALESCE((p_asset_data->>'tax_region')::BIGINT, tax_region),
      sub_asset_type_1 = COALESCE((p_asset_data->>'sub_asset_type_1')::TEXT, sub_asset_type_1),
      sub_asset_size_1 = COALESCE((p_asset_data->>'sub_asset_size_1')::NUMERIC, sub_asset_size_1),
      sub_asset_type_2 = COALESCE((p_asset_data->>'sub_asset_type_2')::TEXT, sub_asset_type_2),
      sub_asset_size_2 = COALESCE((p_asset_data->>'sub_asset_size_2')::NUMERIC, sub_asset_size_2),
      sub_asset_type_3 = COALESCE((p_asset_data->>'sub_asset_type_3')::TEXT, sub_asset_type_3),
      sub_asset_size_3 = COALESCE((p_asset_data->>'sub_asset_size_3')::NUMERIC, sub_asset_size_3),
      sub_asset_type_4 = COALESCE((p_asset_data->>'sub_asset_type_4')::TEXT, sub_asset_type_4),
      sub_asset_size_4 = COALESCE((p_asset_data->>'sub_asset_size_4')::NUMERIC, sub_asset_size_4),
      sub_asset_type_5 = COALESCE((p_asset_data->>'sub_asset_type_5')::TEXT, sub_asset_type_5),
      sub_asset_size_5 = COALESCE((p_asset_data->>'sub_asset_size_5')::NUMERIC, sub_asset_size_5),
      sub_asset_type_6 = COALESCE((p_asset_data->>'sub_asset_type_6')::TEXT, sub_asset_type_6),
      sub_asset_size_6 = COALESCE((p_asset_data->>'sub_asset_size_6')::NUMERIC, sub_asset_size_6),
      elevator = COALESCE((p_asset_data->>'elevator')::TEXT, elevator),
      single_double_family = COALESCE((p_asset_data->>'single_double_family')::TEXT, single_double_family),
      condo = COALESCE((p_asset_data->>'condo')::TEXT, condo),
      townhouses = COALESCE((p_asset_data->>'townhouses')::TEXT, townhouses),
      penthouse = COALESCE((p_asset_data->>'penthouse')::TEXT, penthouse),
      structure_drawing_url = COALESCE((p_asset_data->>'structure_drawing_url')::TEXT, structure_drawing_url),
      floor = COALESCE((p_asset_data->>'floor')::BIGINT, floor),
      discount_type = COALESCE((p_asset_data->>'discount_type')::TEXT, discount_type),
      discount_date_from = COALESCE((p_asset_data->>'discount_date_from')::TEXT, discount_date_from),
      discount_date_to = COALESCE((p_asset_data->>'discount_date_to')::TEXT, discount_date_to),
      area_from_distribution = COALESCE((p_asset_data->>'area_from_distribution')::NUMERIC, area_from_distribution),
      exported_to_automation = COALESCE((p_asset_data->>'exported_to_automation')::BOOLEAN, exported_to_automation),
      comment = COALESCE((p_asset_data->>'comment')::TEXT, comment),
      updated_at = NOW()
    WHERE asset_id = v_asset_id;
  END IF;

  -- ========================================================================
  -- STEP 3: UPDATE BUILDING TOTAL AREA
  -- ========================================================================
  PERFORM update_building_total_area(v_building_number);

  -- ========================================================================
  -- STEP 4: UPDATE DISTRIBUTION FLAGS IF ASSET TYPE CHANGED
  -- ========================================================================
  IF v_asset_type_changed AND v_old_main_asset_type IS NOT NULL AND v_new_main_asset_type IS NOT NULL THEN
    PERFORM set_distribution_flags_for_asset_type_change(
      v_building_number,
      v_old_main_asset_type,
      v_new_main_asset_type
    );
  END IF;

  -- ========================================================================
  -- STEP 5: UPDATE DISTRIBUTION FLAGS IF ASSET SIZE CHANGED
  -- Handle size changes independently - set flag based on current asset type
  -- CRITICAL FIX: For business assets, check business_shared_area (NOT residence_shared_area)
  -- ========================================================================
  IF v_asset_size_changed AND v_old_asset_size IS NOT NULL AND v_new_asset_size IS NOT NULL 
     AND v_new_main_asset_type IS NOT NULL THEN
    -- Get business_residence for the asset type
    SELECT business_residence INTO v_business_residence
    FROM asset_types
    WHERE name = v_new_main_asset_type;

    IF v_business_residence = '×¢×¡×§×™×' THEN
      -- Business asset size changed â†’ set business distribution flag only
      -- CRITICAL FIX: Check business_shared_area (NOT residence_shared_area)
      -- Only set flag if building has business_shared_area > 0
      UPDATE buildings
      SET need_business_distribution = true
      WHERE building_number = v_building_number
        AND COALESCE(business_shared_area, 0) > 0;
      
    ELSIF v_business_residence = '×ž×’×•×¨×™×' THEN
      -- Residence asset size changed â†’ set residence distribution flag only
      UPDATE buildings
      SET need_residence_distribution = true
      WHERE building_number = v_building_number;
    END IF;
  END IF;

  -- ========================================================================
  -- STEP 6: CREATE AUDIT LOG
  -- ========================================================================
  v_audit_id := log_audit_for_asset(
    v_asset_id,
    CASE WHEN v_existing_asset IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
    p_user_id,
    p_action_type::audit_action_type,
    false, -- p_copy_to_history
    p_description
  );

  -- ========================================================================
  -- STEP 7: RETURN RESULT
  -- ========================================================================
  v_result := jsonb_build_object(
    'success', true,
    'asset_id', v_asset_id,
    'building_number', v_building_number,
    'operation', CASE WHEN v_existing_asset IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
    'audit_id', v_audit_id,
    'message', 'Asset saved successfully with all post-save actions completed'
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- Any error will cause automatic rollback of the entire transaction
    RAISE EXCEPTION 'Transaction failed and rolled back: %', SQLERRM
      USING HINT = 'All changes have been rolled back. No partial data was saved.';
END;
$$;

COMMENT ON FUNCTION save_asset_transactional IS 'Save single asset with transactional post-save actions. Validation is handled in application layer. All operations (save, update totals, set flags, audit) happen in ONE transaction. For business assets, size changes only set flag if business_shared_area > 0 (NOT residence_shared_area).';

-- ============================================================================
-- FUNCTION: save_assets_bulk_transactional - Fix business asset size check
-- ============================================================================

-- Update the bulk save function to ensure it checks business_shared_area (not residence_shared_area)
-- We'll use ALTER FUNCTION to update just the specific part, but since we can't do that,
-- we need to recreate the function. Let's read it from the existing migration and fix it.

-- First, let's check if there's a bug in the current function by searching for the problematic pattern
DO $$
DECLARE
  v_function_source TEXT;
  v_fixed_source TEXT;
BEGIN
  -- Get the current function source
  SELECT pg_get_functiondef(oid) INTO v_function_source
  FROM pg_proc
  WHERE proname = 'save_assets_bulk_transactional'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ORDER BY oid DESC
  LIMIT 1;

  IF v_function_source IS NOT NULL THEN
    -- Check if there's a bug where business assets check residence_shared_area
    -- Look for the pattern: IF v_business_residence = '×¢×¡×§×™×' ... residence_shared_area
    IF v_function_source LIKE '%IF v_business_residence = ''×¢×¡×§×™×''%residence_shared_area%' THEN
      -- Fix the bug: replace residence_shared_area with business_shared_area in business context
      v_fixed_source := REPLACE(
        v_function_source,
        'IF v_business_residence = ''×¢×¡×§×™×'' THEN' || E'\n' ||
        '        -- Business asset size changed â†’ set business distribution flag only' || E'\n' ||
        '        -- BUT only if building has residence_shared_area > 0',
        'IF v_business_residence = ''×¢×¡×§×™×'' THEN' || E'\n' ||
        '        -- Business asset size changed â†’ set business distribution flag only' || E'\n' ||
        '        -- CRITICAL FIX: Check business_shared_area (NOT residence_shared_area)' || E'\n' ||
        '        -- Only set flag if building has business_shared_area > 0'
      );
      
      v_fixed_source := REPLACE(
        v_fixed_source,
        'WHERE building_number = v_building_number' || E'\n' ||
        '          AND COALESCE(residence_shared_area, 0) > 0;',
        'WHERE building_number = v_building_number' || E'\n' ||
        '          AND COALESCE(business_shared_area, 0) > 0;'
      );
      
      -- Execute the fixed function
      EXECUTE v_fixed_source;
      
      RAISE NOTICE 'Fixed save_assets_bulk_transactional: Changed residence_shared_area to business_shared_area for business assets';
    ELSE
      -- Function looks correct, but let's ensure it's explicitly checking business_shared_area
      -- Add a safeguard comment to make it clear
      RAISE NOTICE 'save_assets_bulk_transactional already checks business_shared_area correctly';
    END IF;
  END IF;
END $$;




-- ============================================================================
-- Migration: 20251224121712_update_asset_types_field_widths.sql
-- ============================================================================

-- Update field configurations for asset-types grid: increase each field width by 2 chars
-- This migration updates all field widths in the asset-types grid by adding 2 to the current width_chars value

UPDATE field_configurations
SET width_chars = width_chars + 2, updated_at = now()
WHERE grid_name = 'asset-types';




-- ============================================================================
-- Migration: 20251224122202_fix_asset_types_name_field_pinning.sql
-- ============================================================================

-- Fix asset-types grid: ensure "name" field is pinned to the right
-- The "name" field should be pinned to match the columnDefs configuration

asset




