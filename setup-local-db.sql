-- Buildings Manager Database Setup Script
-- This script creates all tables and schema for local PostgreSQL database

-- Drop existing tables if they exist (optional - comment out if you want to preserve data)
DROP TABLE IF EXISTS validation_rules CASCADE;
DROP TABLE IF EXISTS asset_measurements CASCADE;
DROP TABLE IF EXISTS assets CASCADE;
DROP TABLE IF EXISTS asset_types CASCADE;
DROP TABLE IF EXISTS buildings CASCADE;

-- Create buildings table
CREATE TABLE buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_number BIGINT UNIQUE NOT NULL,
  tax_region TEXT,
  has_elevator BOOLEAN DEFAULT false,
  elevator TEXT,
  shared_area BOOLEAN DEFAULT false,
  single_double_family TEXT,
  condo TEXT,
  townhouses TEXT,
  total_units INTEGER DEFAULT 0,
  total_building_area NUMERIC DEFAULT 0,
  area_for_control NUMERIC,
  gosh BIGINT, -- גוש (Block number)
  helka BIGINT, -- חלקה (Parcel number)
  building_number_in_street BIGINT, -- מספר בניין (Building number in street)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create asset_types table
CREATE TABLE asset_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  tax_region INTEGER,
  area_description_for_tab TEXT, -- תיאור אזור לתצוגה בלשונית
  min_size NUMERIC,
  max_size NUMERIC,
  elevator TEXT,
  single_double_family TEXT,
  condo TEXT,
  townhouses TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create assets table
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_number BIGINT NOT NULL REFERENCES buildings(building_number) ON DELETE CASCADE,
  asset_id BIGINT NOT NULL,
  payer_id TEXT,
  main_asset_type TEXT,
  asset_size NUMERIC,
  sub_asset_1_type TEXT,
  sub_asset_1_size NUMERIC,
  sub_asset_2_type TEXT,
  sub_asset_2_size NUMERIC,
  sub_asset_3_type TEXT,
  sub_asset_3_size NUMERIC,
  sub_asset_4_type TEXT,
  sub_asset_4_size NUMERIC,
  sub_asset_5_type TEXT,
  sub_asset_5_size NUMERIC,
  sub_asset_6_type TEXT,
  sub_asset_6_size NUMERIC,
  structure_drawing TEXT,
  measurement_date TEXT DEFAULT '01/01/1900',
  floor SMALLINT CHECK (floor >= -99 AND floor <= 99), -- קומה (Floor number) - 2 digits, allows negative
  discount_type TEXT, -- סוג הנחה (Discount type)
  discount_date_from TEXT, -- תאריך הנחה מ (Discount date from)
  discount_date_to TEXT, -- תאריך הנחה עד (Discount date to)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (building_number, asset_id, measurement_date)
);

-- Create asset_measurements table
CREATE TABLE asset_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_number BIGINT NOT NULL,
  asset_id BIGINT NOT NULL,
  measurement_date TEXT NOT NULL,
  asset_size NUMERIC,
  sub_asset_1_size NUMERIC,
  sub_asset_2_size NUMERIC,
  sub_asset_3_size NUMERIC,
  sub_asset_4_size NUMERIC,
  sub_asset_5_size NUMERIC,
  sub_asset_6_size NUMERIC,
  drawing_file TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (building_number, asset_id, measurement_date)
    REFERENCES assets(building_number, asset_id, measurement_date) ON DELETE CASCADE
);

-- Create validation_rules table
CREATE TABLE validation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key TEXT UNIQUE NOT NULL,
  entity_type TEXT NOT NULL,
  field_name TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  value_numeric NUMERIC,
  value_text TEXT,
  error_message TEXT,
  description TEXT,
  enabled BOOLEAN DEFAULT true,
  compare_table TEXT,
  compare_field TEXT,
  join_field TEXT,
  comparison_operator TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create user_preferences table
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL DEFAULT 'default',
  preference_key TEXT NOT NULL,
  preference_value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, preference_key)
);

-- Create indexes for better performance
CREATE INDEX idx_buildings_building_number ON buildings(building_number);
CREATE INDEX idx_buildings_tax_region ON buildings(tax_region);

CREATE INDEX idx_asset_types_name ON asset_types(name);
CREATE INDEX idx_asset_types_tax_region ON asset_types(tax_region);
CREATE INDEX idx_asset_types_asset_type ON asset_types(asset_type);

CREATE INDEX idx_assets_building_number ON assets(building_number);
CREATE INDEX idx_assets_asset_id ON assets(asset_id);
CREATE INDEX idx_assets_measurement_date ON assets(measurement_date);
CREATE INDEX idx_assets_main_asset_type ON assets(main_asset_type);

CREATE INDEX idx_asset_measurements_building_asset ON asset_measurements(building_number, asset_id);
CREATE INDEX idx_asset_measurements_date ON asset_measurements(measurement_date);

CREATE INDEX idx_validation_rules_entity_type ON validation_rules(entity_type);
CREATE INDEX idx_validation_rules_field_name ON validation_rules(field_name);
CREATE INDEX idx_validation_rules_enabled ON validation_rules(enabled);

CREATE INDEX idx_user_preferences_user_key ON user_preferences(user_id, preference_key);

-- Enable Row Level Security (RLS) - optional for local dev
-- ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE asset_types ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE asset_measurements ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE validation_rules ENABLE ROW LEVEL SECURITY;

-- Create policies for anonymous access (for local dev without auth)
-- CREATE POLICY "Allow all access" ON buildings FOR ALL USING (true);
-- CREATE POLICY "Allow all access" ON assets FOR ALL USING (true);
-- CREATE POLICY "Allow all access" ON asset_types FOR ALL USING (true);
-- CREATE POLICY "Allow all access" ON asset_measurements FOR ALL USING (true);
-- CREATE POLICY "Allow all access" ON validation_rules FOR SELECT USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_buildings_updated_at BEFORE UPDATE ON buildings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assets_updated_at BEFORE UPDATE ON assets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_asset_types_updated_at BEFORE UPDATE ON asset_types
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_validation_rules_updated_at BEFORE UPDATE ON validation_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to search assets by range
CREATE OR REPLACE FUNCTION search_assets_by_range(
  start_building BIGINT,
  end_building BIGINT,
  start_asset BIGINT,
  end_asset BIGINT
)
RETURNS TABLE (
  id UUID,
  building_number BIGINT,
  asset_id BIGINT,
  payer_id TEXT,
  main_asset_type TEXT,
  asset_size NUMERIC,
  sub_asset_1_type TEXT,
  sub_asset_1_size NUMERIC,
  sub_asset_2_type TEXT,
  sub_asset_2_size NUMERIC,
  sub_asset_3_type TEXT,
  sub_asset_3_size NUMERIC,
  sub_asset_4_type TEXT,
  sub_asset_4_size NUMERIC,
  sub_asset_5_type TEXT,
  sub_asset_5_size NUMERIC,
  sub_asset_6_type TEXT,
  sub_asset_6_size NUMERIC,
  structure_drawing TEXT,
  measurement_date TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.building_number,
    a.asset_id,
    a.payer_id,
    a.main_asset_type,
    a.asset_size,
    a.sub_asset_1_type,
    a.sub_asset_1_size,
    a.sub_asset_2_type,
    a.sub_asset_2_size,
    a.sub_asset_3_type,
    a.sub_asset_3_size,
    a.sub_asset_4_type,
    a.sub_asset_4_size,
    a.sub_asset_5_type,
    a.sub_asset_5_size,
    a.sub_asset_6_type,
    a.sub_asset_6_size,
    a.structure_drawing,
    a.measurement_date,
    a.created_at,
    a.updated_at
  FROM assets a
  WHERE a.building_number >= start_building
    AND a.building_number <= end_building
    AND a.asset_id >= start_asset
    AND a.asset_id <= end_asset
  ORDER BY a.building_number, a.asset_id;
END;
$$ LANGUAGE plpgsql;

-- Insert sample validation rules
INSERT INTO validation_rules (rule_key, entity_type, field_name, rule_type, value_numeric, error_message, description, enabled) VALUES
('asset_id_required', 'asset', 'asset_id', 'required', NULL, 'מזהה נכס הוא שדה חובה', 'Asset ID is required', true),
('asset_id_numeric', 'asset', 'asset_id', 'numeric', NULL, 'מזהה נכס חייב להיות מספר', 'Asset ID must be numeric', true),
('building_number_required', 'asset', 'building_number', 'required', NULL, 'מספר בניין הוא שדה חובה', 'Building number is required', true),
('building_number_numeric', 'asset', 'building_number', 'numeric', NULL, 'מספר בניין חייב להיות מספר', 'Building number must be numeric', true),
('payer_id_numeric', 'asset', 'payer_id', 'numeric', NULL, 'מזהה משלם חייב להיות מספר', 'Payer ID must be numeric', true),
('asset_size_positive', 'asset', 'asset_size', 'positive_number', NULL, 'שטח נכס חייב להיות מספר חיובי', 'Asset size must be positive', true),
('asset_type_name_required', 'asset_type', 'name', 'required', NULL, 'שם סוג הנכס הוא שדה חובה', 'Asset type name is required', true);

COMMIT;

-- Success message
SELECT 'Database setup completed successfully!' as status;
