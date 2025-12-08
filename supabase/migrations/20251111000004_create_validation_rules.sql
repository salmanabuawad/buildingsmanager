/*
  # Create Validation Rules Table
  
  1. Tables
    - `validation_rules` - Table with all validation rules including cross-table support
    
  2. Table Structure
    - Basic fields: id, rule_key, rule_type, field_name, entity_type, value_numeric, value_text
    - Status: enabled, error_message, description
    - Cross-table support: compare_table, compare_field, join_field, comparison_operator
    - Timestamps: created_at, updated_at
  
  3. Security
    - Enable RLS on `validation_rules` table
    - Allow anonymous read/write access (needed for validation to work)
  
  4. Initial Data
    - Insert all validation rules for asset types, assets, buildings, and measurements
    - Includes cross-table validation rules
*/

-- Create validation_rules table
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

-- Enable RLS
ALTER TABLE validation_rules ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can read validation rules" ON validation_rules;
DROP POLICY IF EXISTS "Authenticated users can insert validation rules" ON validation_rules;
DROP POLICY IF EXISTS "Authenticated users can update validation rules" ON validation_rules;
DROP POLICY IF EXISTS "Authenticated users can delete validation rules" ON validation_rules;
DROP POLICY IF EXISTS "Allow anonymous read access to validation rules" ON validation_rules;
DROP POLICY IF EXISTS "Allow anonymous insert validation rules" ON validation_rules;
DROP POLICY IF EXISTS "Allow anonymous update validation rules" ON validation_rules;
DROP POLICY IF EXISTS "Allow anonymous delete validation rules" ON validation_rules;

-- Allow anonymous read access
CREATE POLICY "Allow anonymous read access to validation rules"
  ON validation_rules
  FOR SELECT
  USING (true);

-- Allow anonymous insert access
CREATE POLICY "Allow anonymous insert validation rules"
  ON validation_rules
  FOR INSERT
  WITH CHECK (true);

-- Allow anonymous update access
CREATE POLICY "Allow anonymous update validation rules"
  ON validation_rules
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Allow anonymous delete access
CREATE POLICY "Allow anonymous delete validation rules"
  ON validation_rules
  FOR DELETE
  USING (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_validation_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS validation_rules_updated_at ON validation_rules;
CREATE TRIGGER validation_rules_updated_at
  BEFORE UPDATE ON validation_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_validation_rules_updated_at();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_validation_rules_entity_type ON validation_rules(entity_type);
CREATE INDEX IF NOT EXISTS idx_validation_rules_field_name ON validation_rules(field_name);
CREATE INDEX IF NOT EXISTS idx_validation_rules_enabled ON validation_rules(enabled);

-- ============================================================================
-- ASSET TYPE VALIDATION RULES
-- ============================================================================

INSERT INTO validation_rules (rule_key, rule_type, field_name, entity_type, value_numeric, value_text, error_message, description, enabled) VALUES
  ('asset_type_name_required', 'required', 'name', 'asset_type', NULL, NULL, 'Type name is required', 'Asset type name must be provided', true),
  ('asset_type_name_length', 'exact_length', 'name', 'asset_type', 3, NULL, 'Type name must be exactly 3 characters', 'Asset type name must be exactly 3 digits', true),
  ('asset_type_name_pattern', 'pattern', 'name', 'asset_type', NULL, '^\d{3}$', 'Type name must contain only digits', 'Asset type name must be 3 digits (0-9)', true),
  ('asset_type_tax_region_numeric', 'numeric', 'tax_region', 'asset_type', NULL, NULL, 'Tax region must be a number', 'Tax region must be a valid number', true)
ON CONFLICT (rule_key) DO UPDATE SET
  rule_type = EXCLUDED.rule_type,
  field_name = EXCLUDED.field_name,
  entity_type = EXCLUDED.entity_type,
  value_numeric = EXCLUDED.value_numeric,
  value_text = EXCLUDED.value_text,
  error_message = EXCLUDED.error_message,
  description = EXCLUDED.description,
  enabled = EXCLUDED.enabled;

-- ============================================================================
-- ASSET VALIDATION RULES
-- ============================================================================

INSERT INTO validation_rules (rule_key, rule_type, field_name, entity_type, value_numeric, value_text, error_message, description, enabled) VALUES
  ('asset_id_required', 'required', 'asset_id', 'asset', NULL, NULL, 'Asset ID is required', 'Asset ID must be provided', true),
  ('asset_id_not_empty', 'min_length', 'asset_id', 'asset', 1, NULL, 'Asset ID cannot be empty', 'Asset ID must have at least 1 character', true),
  ('asset_id_unique', 'unique', 'asset_id', 'asset', NULL, NULL, 'Asset ID must be unique', 'מספר נכס חייב להיות ייחודי', true),
  ('asset_asset_id_numeric', 'pattern', 'asset_id', 'asset', NULL, '^[0-9]+$', 'מזהה נכס חייב להכיל ספרות בלבד', 'Asset ID must contain only numeric digits', true),
  
  ('asset_building_number_required', 'required', 'building_number', 'asset', NULL, NULL, 'Building number is required', 'Building number must be provided', true),
  ('asset_building_number_numeric', 'numeric', 'building_number', 'asset', NULL, NULL, 'Building number must be a number', 'Building number must be a valid number', true),
  
  ('asset_payer_id_not_empty', 'min_length', 'payer_id', 'asset', 1, NULL, 'Payer ID cannot be empty', 'Payer ID must have at least 1 character', true),
  ('asset_payer_id_numeric', 'pattern', 'payer_id', 'asset', NULL, '^[0-9]+$', 'מזהה משלם חייב להכיל ספרות בלבד', 'Payer ID must contain only numeric digits', false),
  
  ('asset_main_asset_type_required', 'required', 'main_asset_type', 'asset', NULL, NULL, 'סוג נכס ראשי הוא שדה חובה', 'Main asset type must be provided', true),
  ('asset_main_type_exists', 'exists_in_table', 'main_asset_type', 'asset', NULL, NULL, 'Main asset type must exist in asset types', 'Validates that the main_asset_type value exists in the asset_types table', true),
  
  ('asset_sub_type_1_exists', 'exists_in_table', 'sub_asset_type_1', 'asset', NULL, NULL, 'Sub asset type 1 must exist in asset types', 'Validates that the sub_asset_type_1 value exists in the asset_types table', true),
  ('asset_sub_type_2_exists', 'exists_in_table', 'sub_asset_type_2', 'asset', NULL, NULL, 'Sub asset type 2 must exist in asset types', 'Validates that the sub_asset_type_2 value exists in the asset_types table', true),
  ('asset_sub_type_3_exists', 'exists_in_table', 'sub_asset_type_3', 'asset', NULL, NULL, 'Sub asset type 3 must exist in asset types', 'Validates that the sub_asset_type_3 value exists in the asset_types table', true),
  ('asset_sub_type_4_exists', 'exists_in_table', 'sub_asset_type_4', 'asset', NULL, NULL, 'Sub asset type 4 must exist in asset types', 'Validates that the sub_asset_type_4 value exists in the asset_types table', true),
  ('asset_sub_type_5_exists', 'exists_in_table', 'sub_asset_type_5', 'asset', NULL, NULL, 'Sub asset type 5 must exist in asset types', 'Validates that the sub_asset_type_5 value exists in the asset_types table', true),
  ('asset_sub_type_6_exists', 'exists_in_table', 'sub_asset_type_6', 'asset', NULL, NULL, 'Sub asset type 6 must exist in asset types', 'Validates that the sub_asset_type_6 value exists in the asset_types table', true),
  
  ('asset_size_required', 'required', 'asset_size', 'asset', NULL, NULL, 'גודל נכס הוא שדה חובה', 'Asset size must be provided', true),
  ('asset_main_size_numeric', 'numeric', 'main_asset_size', 'asset', NULL, NULL, 'Main asset size must be a number', 'Main asset size must be a valid number', true),
  ('asset_main_size_positive', 'positive_number', 'main_asset_size', 'asset', NULL, NULL, 'Main asset size must be positive', 'Main asset size must be greater than 0', true),
  
  ('asset_sub_size_1_numeric', 'numeric', 'sub_asset_size_1', 'asset', NULL, NULL, 'Sub asset size 1 must be a number', 'Sub asset size 1 must be a valid number', true),
  ('asset_sub_size_1_positive', 'positive_number', 'sub_asset_size_1', 'asset', NULL, NULL, 'Sub asset size 1 must be positive', 'Sub asset size 1 must be greater than 0', true),
  ('asset_sub_size_2_numeric', 'numeric', 'sub_asset_size_2', 'asset', NULL, NULL, 'Sub asset size 2 must be a number', 'Sub asset size 2 must be a valid number', true),
  ('asset_sub_size_2_positive', 'positive_number', 'sub_asset_size_2', 'asset', NULL, NULL, 'Sub asset size 2 must be positive', 'Sub asset size 2 must be greater than 0', true),
  ('asset_sub_size_3_numeric', 'numeric', 'sub_asset_size_3', 'asset', NULL, NULL, 'Sub asset size 3 must be a number', 'Sub asset size 3 must be a valid number', true),
  ('asset_sub_size_3_positive', 'positive_number', 'sub_asset_size_3', 'asset', NULL, NULL, 'Sub asset size 3 must be positive', 'Sub asset size 3 must be greater than 0', true),
  ('asset_sub_size_4_numeric', 'numeric', 'sub_asset_size_4', 'asset', NULL, NULL, 'Sub asset size 4 must be a number', 'Sub asset size 4 must be a valid number', true),
  ('asset_sub_size_4_positive', 'positive_number', 'sub_asset_size_4', 'asset', NULL, NULL, 'Sub asset size 4 must be positive', 'Sub asset size 4 must be greater than 0', true),
  ('asset_sub_size_5_numeric', 'numeric', 'sub_asset_size_5', 'asset', NULL, NULL, 'Sub asset size 5 must be a number', 'Sub asset size 5 must be a valid number', true),
  ('asset_sub_size_5_positive', 'positive_number', 'sub_asset_size_5', 'asset', NULL, NULL, 'Sub asset size 5 must be positive', 'Sub asset size 5 must be greater than 0', true),
  ('asset_sub_size_6_numeric', 'numeric', 'sub_asset_size_6', 'asset', NULL, NULL, 'Sub asset size 6 must be a number', 'Sub asset size 6 must be a valid number', true),
  ('asset_sub_size_6_positive', 'positive_number', 'sub_asset_size_6', 'asset', NULL, NULL, 'Sub asset size 6 must be positive', 'Sub asset size 6 must be greater than 0', true),
  
  ('asset_measurement_date_required', 'required', 'measurement_date', 'asset', NULL, NULL, 'תאריך מדידה הוא שדה חובה', 'Measurement date must be provided', true),
  
  ('asset_main_type_matches_building_tax_region', 'exists_in_table_with_join', 'main_asset_type', 'asset', NULL, NULL, 'סוג הנכס הראשי לא שייך לאזור המס של הבניין', 'Validates that the main asset type belongs to the building''s tax region', false),
  
  ('asset_type_299_requires_tax_region_40', 'conditional_tax_region_check', 'main_asset_type', 'asset', NULL, '299', 'סוג נכס 299 תקף רק בבניינים עם אזור מס 40', 'Asset type 299 is only valid in buildings with tax region 40', true),
  ('asset_type_199_requires_tax_region_not_40', 'conditional_tax_region_check', 'main_asset_type', 'asset', NULL, '199', 'סוג נכס 199 תקף רק בבניינים עם אזור מס שאינו 40', 'Asset type 199 is only valid in buildings with tax region other than 40', true)
ON CONFLICT (rule_key) DO UPDATE SET
  rule_type = EXCLUDED.rule_type,
  field_name = EXCLUDED.field_name,
  entity_type = EXCLUDED.entity_type,
  value_numeric = EXCLUDED.value_numeric,
  value_text = EXCLUDED.value_text,
  error_message = EXCLUDED.error_message,
  error_message_he = EXCLUDED.error_message_he,
  description = EXCLUDED.description,
  enabled = EXCLUDED.enabled;

-- Update cross-table fields for asset type existence rules
UPDATE validation_rules SET
  compare_table = 'asset_types',
  compare_field = 'name'
WHERE rule_key IN (
  'asset_main_type_exists',
  'asset_sub_type_1_exists',
  'asset_sub_type_2_exists',
  'asset_sub_type_3_exists',
  'asset_sub_type_4_exists',
  'asset_sub_type_5_exists',
  'asset_sub_type_6_exists'
);

-- Update cross-table fields for conditional tax region checks
UPDATE validation_rules SET
  compare_table = 'buildings',
  compare_field = 'tax_region',
  join_field = 'building_number'
WHERE rule_key = 'asset_type_299_requires_tax_region_40';

UPDATE validation_rules SET
  compare_table = 'buildings',
  compare_field = 'tax_region',
  join_field = 'building_number',
  comparison_operator = '!='
WHERE rule_key = 'asset_type_199_requires_tax_region_not_40';

-- ============================================================================
-- BUILDING VALIDATION RULES
-- ============================================================================

INSERT INTO validation_rules (rule_key, rule_type, field_name, entity_type, value_numeric, value_text, error_message, description, enabled, compare_table, compare_field) VALUES
  ('building_number_required', 'required', 'building_number', 'building', NULL, NULL, 'Building number is required', 'Building number must be provided', true, NULL, NULL),
  ('building_number_numeric', 'numeric', 'building_number', 'building', NULL, NULL, 'Building number must be a number', 'Building number must be a valid number', true, NULL, NULL),
  ('building_number_positive', 'positive_number', 'building_number', 'building', NULL, NULL, 'Building number must be positive', 'Building number must be greater than 0', true, NULL, NULL),
  
  ('building_tax_region_required', 'required', 'tax_region', 'building', NULL, NULL, 'Tax region is required', 'Building tax region must be provided', true, NULL, NULL),
  ('building_tax_region_numeric', 'numeric', 'tax_region', 'building', NULL, NULL, 'Tax region must be a number', 'Building tax region must be a valid number', true, NULL, NULL),
  ('building_tax_region_positive', 'positive_number', 'tax_region', 'building', NULL, NULL, 'Tax region must be positive', 'Building tax region must be greater than 0', true, NULL, NULL),
  ('building_tax_region_exists_in_asset_types', 'exists_in_table', 'tax_region', 'building', NULL, NULL, 'Tax region must exist in asset types', 'Validates that building tax_region value exists in the asset_types table tax_region values', true, 'asset_types', 'tax_region'),
  
  ('building_area_mismatch', 'cross_table_comparison', 'total_building_area', 'building', NULL, NULL, 'Building area mismatch: calculated total does not match control area', 'Validates that total_building_area (sum of assets) equals total_area_for_control (manual control value). Shows error when values do not match.', true, 'buildings', 'total_area_for_control')
ON CONFLICT (rule_key) DO UPDATE SET
  rule_type = EXCLUDED.rule_type,
  field_name = EXCLUDED.field_name,
  entity_type = EXCLUDED.entity_type,
  value_numeric = EXCLUDED.value_numeric,
  value_text = EXCLUDED.value_text,
  error_message = EXCLUDED.error_message,
  description = EXCLUDED.description,
  enabled = EXCLUDED.enabled,
  compare_table = EXCLUDED.compare_table,
  compare_field = EXCLUDED.compare_field;

-- Update cross-table fields for building area mismatch
UPDATE validation_rules SET
  join_field = 'building_number',
  comparison_operator = '='
WHERE rule_key = 'building_area_mismatch';

-- ============================================================================
-- MEASUREMENT VALIDATION RULES
-- ============================================================================

INSERT INTO validation_rules (rule_key, rule_type, field_name, entity_type, value_numeric, value_text, error_message, description, enabled) VALUES
  ('measurement_date_required', 'required', 'measurement_date', 'measurement', NULL, NULL, 'Measurement date is required', 'Measurement date must be provided', true),
  
  ('measurement_asset_area_numeric', 'numeric', 'asset_area', 'measurement', NULL, NULL, 'Asset area must be a number', 'Asset area must be a valid number', true),
  ('measurement_asset_area_positive', 'positive_number', 'asset_area', 'measurement', NULL, NULL, 'Asset area must be positive', 'Asset area must be greater than 0', true),
  
  ('measurement_storage_area_numeric', 'numeric', 'storage_area', 'measurement', NULL, NULL, 'Storage area must be a number', 'Storage area must be a valid number', true),
  ('measurement_storage_area_positive', 'positive_number', 'storage_area', 'measurement', NULL, NULL, 'Storage area must be positive', 'Storage area must be greater than 0', true),
  
  ('measurement_pergola_area_numeric', 'numeric', 'pergola_area', 'measurement', NULL, NULL, 'Pergola area must be a number', 'Pergola area must be a valid number', true),
  ('measurement_pergola_area_positive', 'positive_number', 'pergola_area', 'measurement', NULL, NULL, 'Pergola area must be positive', 'Pergola area must be greater than 0', true),
  
  ('measurement_balcony_area_numeric', 'numeric', 'balcony_area', 'measurement', NULL, NULL, 'Balcony area must be a number', 'Balcony area must be a valid number', true),
  ('measurement_balcony_area_positive', 'positive_number', 'balcony_area', 'measurement', NULL, NULL, 'Balcony area must be positive', 'Balcony area must be greater than 0', true),
  
  ('measurement_garden_area_numeric', 'numeric', 'garden_area', 'measurement', NULL, NULL, 'Garden area must be a number', 'Garden area must be a valid number', true),
  ('measurement_garden_area_positive', 'positive_number', 'garden_area', 'measurement', NULL, NULL, 'Garden area must be positive', 'Garden area must be greater than 0', true)
ON CONFLICT (rule_key) DO UPDATE SET
  rule_type = EXCLUDED.rule_type,
  field_name = EXCLUDED.field_name,
  entity_type = EXCLUDED.entity_type,
  value_numeric = EXCLUDED.value_numeric,
  value_text = EXCLUDED.value_text,
  error_message = EXCLUDED.error_message,
  description = EXCLUDED.description,
  enabled = EXCLUDED.enabled;

