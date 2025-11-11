/*
  # Create Validation Rules Table

  1. New Tables
    - `validation_rules`
      - `id` (uuid, primary key)
      - `rule_key` (text, unique) - Unique identifier for the rule (e.g., 'asset_type_name_length')
      - `rule_type` (text) - Type of validation (e.g., 'length', 'pattern', 'numeric', 'required')
      - `field_name` (text) - The field this rule applies to (e.g., 'Asset Type Name')
      - `entity_type` (text) - The entity this applies to (e.g., 'asset_type', 'asset', 'building')
      - `value_numeric` (integer) - Numeric value for rules like min/max length
      - `value_text` (text) - Text value for rules like patterns, error messages
      - `enabled` (boolean, default true) - Whether the rule is active
      - `error_message` (text) - Custom error message for this rule
      - `description` (text) - Human-readable description of what the rule does
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `validation_rules` table
    - Add policy for authenticated users to read rules
    - Add policy for authenticated users to manage rules (admin only in future)

  3. Initial Data
    - Insert default validation rules for asset types, assets, and buildings
*/

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
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE validation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read validation rules"
  ON validation_rules
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert validation rules"
  ON validation_rules
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update validation rules"
  ON validation_rules
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete validation rules"
  ON validation_rules
  FOR DELETE
  TO authenticated
  USING (true);

-- Insert default validation rules for Asset Types
INSERT INTO validation_rules (rule_key, rule_type, field_name, entity_type, value_numeric, value_text, error_message, description, enabled) VALUES
  ('asset_type_name_required', 'required', 'Type name', 'asset_type', NULL, NULL, 'Type name is required', 'Asset type name must be provided', true),
  ('asset_type_name_length', 'exact_length', 'Type name', 'asset_type', 3, NULL, 'Type name must be exactly 3 characters', 'Asset type name must be exactly 3 digits', true),
  ('asset_type_name_pattern', 'pattern', 'Type name', 'asset_type', NULL, '^\d{3}$', 'Type name must contain only digits', 'Asset type name must be 3 digits (0-9)', true),
  ('asset_type_tax_region_numeric', 'numeric', 'Tax region', 'asset_type', NULL, NULL, 'Tax region must be a number', 'Tax region must be a valid number', true);

-- Insert default validation rules for Assets
INSERT INTO validation_rules (rule_key, rule_type, field_name, entity_type, value_numeric, value_text, error_message, description, enabled) VALUES
  ('asset_id_required', 'required', 'Asset ID', 'asset', NULL, NULL, 'Asset ID is required', 'Asset ID must be provided', true),
  ('asset_building_number_required', 'required', 'Building number', 'asset', NULL, NULL, 'Building number is required', 'Building number must be provided', true),
  ('asset_building_number_numeric', 'numeric', 'Building number', 'asset', NULL, NULL, 'Building number must be a number', 'Building number must be a valid number', true),
  ('asset_size_numeric', 'numeric', 'Size', 'asset', NULL, NULL, 'Size must be a number', 'Size fields must be valid numbers', true),
  ('asset_size_positive', 'positive_number', 'Size', 'asset', NULL, NULL, 'Size must be a positive number', 'Size fields must be positive numbers', true);

-- Insert default validation rules for Buildings
INSERT INTO validation_rules (rule_key, rule_type, field_name, entity_type, value_numeric, value_text, error_message, description, enabled) VALUES
  ('building_number_numeric', 'numeric', 'Building number', 'building', NULL, NULL, 'Building number must be a number', 'Building number must be a valid number', true),
  ('building_number_positive', 'positive_number', 'Building number', 'building', NULL, NULL, 'Building number must be a positive number', 'Building number must be greater than 0', true),
  ('building_tax_region_numeric', 'numeric', 'Tax region', 'building', NULL, NULL, 'Tax region must be a number', 'Tax region must be a valid number', true);

-- Insert default validation rules for Measurements
INSERT INTO validation_rules (rule_key, rule_type, field_name, entity_type, value_numeric, value_text, error_message, description, enabled) VALUES
  ('measurement_date_required', 'required', 'Measurement date', 'measurement', NULL, NULL, 'Measurement date is required', 'Measurement date must be provided', true),
  ('measurement_area_numeric', 'numeric', 'Area', 'measurement', NULL, NULL, 'Area must be a number', 'Area fields must be valid numbers', true),
  ('measurement_area_positive', 'positive_number', 'Area', 'measurement', NULL, NULL, 'Area must be a positive number', 'Area fields must be positive numbers', true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_validation_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER validation_rules_updated_at
  BEFORE UPDATE ON validation_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_validation_rules_updated_at();
