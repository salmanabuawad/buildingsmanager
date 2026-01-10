/*
  # Consolidated Initial Database Schema
  
  This migration creates a complete, consolidated database schema for the Buildings Manager application.
  It should be used for fresh installations from scratch.
  
  This schema consolidates all previous migrations into a single, clean initial state.
  
  Tables created:
  1. address_list - Street addresses
  2. asset_types - Asset type definitions (with use_shared_area field)
  3. validation_rules - Dynamic validation rules
  4. buildings - Building information (with distribution flags defaulting to false)
  5. assets - Asset records (with area_from_distribution, comment, exported_to_automation)
  6. assets_history - Historical asset measurements
  7. field_configurations - Field width/padding configurations
  8. users - Application users
  9. audit - Audit table for tracking all operations (replaces distribution_audit)
  
  Includes:
  - Proper foreign key relationships
  - Indexes for performance
  - Triggers for automatic updates
  - RLS policies for security
  - All helper functions
  - All enums with latest values
  
  Note: This schema does NOT include:
  - asset_type_fields table (deprecated, not in use)
  - distribution_audit table (renamed to audit)
*/

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Create enum for audit action types (with all current values)
DO $$ BEGIN
  CREATE TYPE audit_action_type AS ENUM (
    'manual_update',
    'import_file',
    'transfer_area',
    'distribute_shared',
    'business_distribution',
    'residence_distribution'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

COMMENT ON TYPE audit_action_type IS 'Action types for audit table: manual_update, import_file, transfer_area, distribute_shared (deprecated), business_distribution, residence_distribution';

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
-- 2. ASSET TYPES TABLE (with use_shared_area field)
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
  active TEXT DEFAULT 'כן',
  non_accountable_for_total_area BOOLEAN DEFAULT false,
  non_accountable_for_distribution BOOLEAN DEFAULT false,
  use_shared_area BOOLEAN DEFAULT NULL,
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

COMMENT ON TABLE asset_types IS 'Asset type definitions with validation rules';
COMMENT ON COLUMN asset_types.use_shared_area IS 'שימוש בשטח משותף - Checkbox indicating if asset type uses shared area';

-- ============================================================================
-- 3. VALIDATION RULES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS validation_rules (
  id SERIAL PRIMARY KEY,
  rule_name TEXT NOT NULL UNIQUE,
  rule_type TEXT NOT NULL,
  rule_value JSONB NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_validation_rules_rule_name ON validation_rules(rule_name);
CREATE INDEX IF NOT EXISTS idx_validation_rules_rule_type ON validation_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_validation_rules_active ON validation_rules(active);

ALTER TABLE validation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to validation_rules" ON validation_rules;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to insert validation_rules" ON validation_rules;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to update validation_rules" ON validation_rules;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to delete validation_rules" ON validation_rules;

CREATE POLICY "Allow public read access to validation_rules"
  ON validation_rules FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow anonymous and authenticated users to insert validation_rules"
  ON validation_rules FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow anonymous and authenticated users to update validation_rules"
  ON validation_rules FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anonymous and authenticated users to delete validation_rules"
  ON validation_rules FOR DELETE
  TO anon, authenticated
  USING (true);

COMMENT ON TABLE validation_rules IS 'Dynamic validation rules for assets and buildings';

-- ============================================================================
-- 4. BUILDINGS TABLE (with distribution flags defaulting to false)
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
  building_number_in_street bigint,
  gosh bigint,
  helka bigint,
  overload_ratio numeric(5,2),
  need_residence_distribution boolean DEFAULT false,
  need_business_distribution boolean DEFAULT false,
  action_id bigint,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_buildings_tax_region ON buildings(tax_region);
CREATE INDEX IF NOT EXISTS idx_buildings_building_number ON buildings(building_number);

ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to buildings" ON buildings;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to insert buildings" ON buildings;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to update buildings" ON buildings;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to delete buildings" ON buildings;

CREATE POLICY "Allow public read access to buildings"
  ON buildings FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow anonymous and authenticated users to insert buildings"
  ON buildings FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow anonymous and authenticated users to update buildings"
  ON buildings FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anonymous and authenticated users to delete buildings"
  ON buildings FOR DELETE
  TO anon, authenticated
  USING (true);

COMMENT ON TABLE buildings IS 'Building information and shared area management';
COMMENT ON COLUMN buildings.need_residence_distribution IS 'Flag indicating if residence shared area needs to be distributed to assets (true = needs distribution, false = already distributed/not applicable). Defaults to false.';
COMMENT ON COLUMN buildings.need_business_distribution IS 'Flag indicating if business shared area needs to be distributed to assets (true = needs distribution, false = already distributed/not applicable). Defaults to false.';

-- ============================================================================
-- 5. ASSETS TABLE (with area_from_distribution, comment, exported_to_automation)
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
  area_from_distribution numeric,
  exported_to_automation boolean DEFAULT false,
  comment text,
  FOREIGN KEY (building_number) REFERENCES buildings(building_number) ON DELETE CASCADE
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

COMMENT ON TABLE assets IS 'Asset records with all measurements and metadata';
COMMENT ON COLUMN assets.area_from_distribution IS 'Area allocated from shared area distribution (business distribution only)';
COMMENT ON COLUMN assets.exported_to_automation IS 'Flag indicating if asset has been exported to automation system. Set to false when asset is updated.';
COMMENT ON COLUMN assets.comment IS 'Optional comment/note for the asset';

-- ============================================================================
-- 6. ASSETS HISTORY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS assets_history (
  id bigserial PRIMARY KEY,
  asset_id bigint NOT NULL,
  building_number bigint NOT NULL,
  payer_id text,
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
  elevator text,
  single_double_family text,
  condo text,
  townhouses text,
  penthouse text,
  tax_region integer,
  floor smallint,
  discount_type text,
  discount_date_from text,
  discount_date_to text,
  action_id bigint,
  area_from_distribution numeric,
  exported_to_automation boolean DEFAULT false,
  export_to_automation_at text,
  comment text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assets_history_asset_id ON assets_history(asset_id);
CREATE INDEX IF NOT EXISTS idx_assets_history_building_number ON assets_history(building_number);
CREATE INDEX IF NOT EXISTS idx_assets_history_action_id ON assets_history(action_id);
CREATE INDEX IF NOT EXISTS idx_assets_history_created_at ON assets_history(created_at DESC);

ALTER TABLE assets_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to assets_history" ON assets_history;
CREATE POLICY "Allow public read access to assets_history"
  ON assets_history FOR SELECT
  TO public
  USING (true);

COMMENT ON TABLE assets_history IS 'Historical asset measurements for audit trail';

-- ============================================================================
-- 7. FIELD CONFIGURATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS field_configurations (
  id SERIAL PRIMARY KEY,
  grid_name TEXT NOT NULL,
  field_name TEXT NOT NULL,
  width_chars INTEGER,
  padding INTEGER,
  hebrew_name TEXT,
  pinned BOOLEAN DEFAULT false,
  pin_side TEXT CHECK (pin_side IN ('left', 'right', NULL)),
  visible BOOLEAN DEFAULT true,
  column_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(grid_name, field_name)
);

CREATE INDEX IF NOT EXISTS idx_field_configurations_grid_name ON field_configurations(grid_name);
CREATE INDEX IF NOT EXISTS idx_field_configurations_field_name ON field_configurations(field_name);

ALTER TABLE field_configurations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to field_configurations" ON field_configurations;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to insert field_configurations" ON field_configurations;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to update field_configurations" ON field_configurations;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to delete field_configurations" ON field_configurations;

CREATE POLICY "Allow public read access to field_configurations"
  ON field_configurations FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow anonymous and authenticated users to insert field_configurations"
  ON field_configurations FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow anonymous and authenticated users to update field_configurations"
  ON field_configurations FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anonymous and authenticated users to delete field_configurations"
  ON field_configurations FOR DELETE
  TO anon, authenticated
  USING (true);

COMMENT ON TABLE field_configurations IS 'Field width, padding, and display configurations for grid columns';

-- ============================================================================
-- 8. USERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  user_id bigserial PRIMARY KEY,
  auth_user_id text UNIQUE,
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
-- 9. AUDIT TABLE (replaces distribution_audit)
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit (
  id bigserial PRIMARY KEY,
  user_id bigint,
  action_type audit_action_type NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('building', 'asset', 'bulk_building', 'bulk_asset')),
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  description text,
  building_number bigint,
  overload_ratio numeric,
  shared_area_size numeric,
  created_at timestamptz DEFAULT now(),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action_type ON audit(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_entity_type ON audit(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_entity_id ON audit(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_building_number ON audit(building_number);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit(created_at DESC);

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

COMMENT ON TABLE audit IS 'Audit table tracking changes to entities (buildings, assets, bulk operations) using generic before_data and after_data JSONB columns.';
COMMENT ON COLUMN audit.before_data IS 'JSONB containing the state of the entity(ies) before the action (e.g., {assets: [...], building: {...}})';
COMMENT ON COLUMN audit.after_data IS 'JSONB containing the state of the entity(ies) after the action (e.g., {assets: [...], building: {...}, overload_ratio: ...})';
COMMENT ON COLUMN audit.building_number IS 'Building number for distribution and transfer operations';
COMMENT ON COLUMN audit.overload_ratio IS 'Overload ratio for business distributions';
COMMENT ON COLUMN audit.shared_area_size IS 'Shared area size that was distributed';

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

-- Function to update building total area
CREATE OR REPLACE FUNCTION update_building_total_area(p_building_number BIGINT)
RETURNS void AS $$
DECLARE
  v_asset_sum NUMERIC := 0;
  v_business_shared_area NUMERIC := 0;
BEGIN
  -- Calculate sum of assets where non_accountable_for_total_area is false
  SELECT COALESCE(SUM(a.asset_size), 0) INTO v_asset_sum
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
  );
  
  -- Get business_shared_area from building
  SELECT COALESCE(business_shared_area, 0) INTO v_business_shared_area
  FROM buildings
  WHERE building_number = p_building_number;
  
  -- Update building total area = asset sum + business shared area
  UPDATE buildings
  SET total_building_area = v_asset_sum + v_business_shared_area
  WHERE building_number = p_building_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_building_total_area IS 'Update building total area based on sum of asset sizes (excluding non_accountable_for_total_area assets) plus business_shared_area';

-- Function to copy asset to history before update
CREATE OR REPLACE FUNCTION copy_asset_to_history_before_update(p_asset_id BIGINT)
RETURNS void AS $$
DECLARE
  v_asset RECORD;
BEGIN
  SELECT * INTO v_asset
  FROM assets
  WHERE asset_id = p_asset_id;
  
  IF FOUND THEN
    INSERT INTO assets_history (
      asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size,
      sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
      sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
      sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
      structure_drawing_url, elevator, single_double_family, condo, townhouses, penthouse,
      tax_region, floor, discount_type, discount_date_from, discount_date_to,
      area_from_distribution, exported_to_automation, export_to_automation_at, comment
    )
    VALUES (
      v_asset.asset_id, v_asset.building_number, v_asset.payer_id, v_asset.measurement_date,
      v_asset.main_asset_type, v_asset.asset_size,
      v_asset.sub_asset_type_1, v_asset.sub_asset_size_1,
      v_asset.sub_asset_type_2, v_asset.sub_asset_size_2,
      v_asset.sub_asset_type_3, v_asset.sub_asset_size_3,
      v_asset.sub_asset_type_4, v_asset.sub_asset_size_4,
      v_asset.sub_asset_type_5, v_asset.sub_asset_size_5,
      v_asset.sub_asset_type_6, v_asset.sub_asset_size_6,
      v_asset.structure_drawing_url, v_asset.elevator, v_asset.single_double_family,
      v_asset.condo, v_asset.townhouses, v_asset.penthouse,
      v_asset.tax_region, v_asset.floor, v_asset.discount_type,
      v_asset.discount_date_from, v_asset.discount_date_to,
      v_asset.area_from_distribution, v_asset.exported_to_automation, v_asset.export_to_automation_at, v_asset.comment
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION copy_asset_to_history_before_update IS 'Copies current asset state to history table before update';

-- Function to set distribution flags for asset type change
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
  v_building_record buildings;
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

  -- Get current building shared area values
  SELECT * INTO v_building_record FROM buildings WHERE building_number = p_building_number;

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

    -- Set appropriate distribution flag(s) ONLY IF relevant shared area > 0
    IF v_business_residence = 'עסקים' THEN
      -- Business type
      IF COALESCE(v_building_record.business_shared_area, 0) > 0 THEN
        UPDATE buildings
        SET need_business_distribution = TRUE
        WHERE building_number = p_building_number;
        v_business_flag_set := TRUE;
      END IF;

    ELSIF v_business_residence = 'מגורים' THEN
      -- Residence type
      IF COALESCE(v_building_record.residence_shared_area, 0) > 0 THEN
        UPDATE buildings
        SET need_residence_distribution = TRUE
        WHERE building_number = p_building_number;
        v_residence_flag_set := TRUE;
      END IF;

    ELSE
      -- Unknown type or NULL: set both flags to be safe, but only if shared area > 0
      IF COALESCE(v_building_record.business_shared_area, 0) > 0 THEN
        UPDATE buildings
        SET need_business_distribution = TRUE
        WHERE building_number = p_building_number;
        v_business_flag_set := TRUE;
      END IF;
      IF COALESCE(v_building_record.residence_shared_area, 0) > 0 THEN
        UPDATE buildings
        SET need_residence_distribution = TRUE
        WHERE building_number = p_building_number;
        v_residence_flag_set := TRUE;
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT v_business_flag_set, v_residence_flag_set;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION set_distribution_flags_for_asset_type_change IS 'Explicitly sets building distribution flags when asset main_asset_type changes to/from non_accountable_for_distribution types. Only sets flags if building has relevant shared area > 0.';

-- Function to automatically set distribution flags on asset change
CREATE OR REPLACE FUNCTION auto_set_distribution_flags_on_change()
RETURNS TRIGGER AS $$
DECLARE
  v_business_residence TEXT;
  v_type_changed BOOLEAN := FALSE;
  v_size_changed BOOLEAN := FALSE;
  v_old_type TEXT;
  v_new_type TEXT;
  v_building_record buildings;
BEGIN
  -- Only process INSERT or UPDATE
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  -- Skip if no building_number or main_asset_type
  IF NEW.building_number IS NULL OR NEW.main_asset_type IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get current building shared area values
  SELECT * INTO v_building_record FROM buildings WHERE building_number = NEW.building_number;

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
    IF v_business_residence = 'עסקים' THEN
      -- Business asset size changed → set business distribution flag only
      -- BUT only if building has business_shared_area > 0
      IF COALESCE(v_building_record.business_shared_area, 0) > 0 THEN
        UPDATE buildings
        SET need_business_distribution = true
        WHERE building_number = NEW.building_number;
      END IF;
    ELSIF v_business_residence = 'מגורים' THEN
      -- Residence asset size changed → set residence distribution flag only
      -- BUT only if building has residence_shared_area > 0
      IF COALESCE(v_building_record.residence_shared_area, 0) > 0 THEN
        UPDATE buildings
        SET need_residence_distribution = true
        WHERE building_number = NEW.building_number;
      END IF;
    END IF;
  END IF;

  -- If type changed, also set flags (only if relevant shared area > 0)
  IF v_type_changed THEN
    IF v_business_residence = 'עסקים' THEN
      IF COALESCE(v_building_record.business_shared_area, 0) > 0 THEN
        UPDATE buildings
        SET need_business_distribution = TRUE
        WHERE building_number = NEW.building_number;
      END IF;
    ELSIF v_business_residence = 'מגורים' THEN
      IF COALESCE(v_building_record.residence_shared_area, 0) > 0 THEN
        UPDATE buildings
        SET need_residence_distribution = TRUE
        WHERE building_number = NEW.building_number;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_set_distribution_flags_on_change IS 'Automatically sets building distribution flags when asset main_asset_type or asset_size changes. Only sets flags if building has relevant shared area > 0.';

-- Function to automatically update building total area
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
  PERFORM update_building_total_area(v_building_number);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_update_building_total_area IS 'Automatically updates building total area after asset INSERT/UPDATE/DELETE operations. Works for both direct table operations and transactional function calls.';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger to update updated_at timestamp for asset_types
DROP TRIGGER IF EXISTS update_asset_types_updated_at ON asset_types;
CREATE TRIGGER update_asset_types_updated_at BEFORE UPDATE ON asset_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update updated_at timestamp for field_configurations
DROP TRIGGER IF EXISTS update_field_configurations_updated_at ON field_configurations;
CREATE TRIGGER update_field_configurations_updated_at BEFORE UPDATE ON field_configurations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update updated_at timestamp for users
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to automatically update building total area
DROP TRIGGER IF EXISTS trigger_auto_update_building_total_area ON assets;
CREATE TRIGGER trigger_auto_update_building_total_area
  AFTER INSERT OR UPDATE OR DELETE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_building_total_area();

-- Trigger to automatically set distribution flags
DROP TRIGGER IF EXISTS trigger_auto_set_distribution_flags_on_change ON assets;
CREATE TRIGGER trigger_auto_set_distribution_flags_on_change
  AFTER INSERT OR UPDATE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_distribution_flags_on_change();

-- ============================================================================
-- NOTE: The following functions are defined in separate migration files
-- due to their size and complexity. They should be included in the
-- consolidated schema or run as separate migrations:
--
-- 1. log_audit_entry - Logs audit entries with before/after data
-- 2. save_asset_transactional - Saves single asset with transactional operations
-- 3. save_assets_bulk_transactional - Saves multiple assets with transactional operations
-- 4. delete_asset_transactional - Deletes asset with transactional operations
-- 5. update_buildings_bulk_with_distribution_flags - Updates buildings with distribution flag management
--
-- These functions are too large to include here and should be loaded from:
-- supabase/migrations/20251218000000_remove_backend_validation_checks.sql
-- supabase/migrations/20251219000000_add_building_update_function.sql
-- supabase/migrations/20251229000000_prevent_distribution_flag_when_shared_area_zero.sql
-- ============================================================================

