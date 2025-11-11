/*
  # Add Cross-Table Validation Support

  1. Changes
    - Add `compare_table` (text) - The table to compare with (e.g., 'buildings', 'assets')
    - Add `compare_field` (text) - The field in the comparison table (e.g., 'total_building_area')
    - Add `join_field` (text) - The field to join on (e.g., 'building_number')
    - Add `comparison_operator` (text) - The comparison operator (e.g., '=', '!=', '>', '<', '>=', '<=')
    
  2. New Rule Types
    - Add 'cross_table_comparison' rule type for comparing fields across tables
    - Example: Compare assets.total_size with buildings.total_building_area where assets.building_number = buildings.building_number
  
  3. Example Rules
    - Insert example cross-table validation rule for area mismatch detection
*/

-- Add new columns for cross-table comparison support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'validation_rules' AND column_name = 'compare_table'
  ) THEN
    ALTER TABLE validation_rules ADD COLUMN compare_table text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'validation_rules' AND column_name = 'compare_field'
  ) THEN
    ALTER TABLE validation_rules ADD COLUMN compare_field text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'validation_rules' AND column_name = 'join_field'
  ) THEN
    ALTER TABLE validation_rules ADD COLUMN join_field text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'validation_rules' AND column_name = 'comparison_operator'
  ) THEN
    ALTER TABLE validation_rules ADD COLUMN comparison_operator text;
  END IF;
END $$;

-- Insert example cross-table validation rule for building area mismatch
INSERT INTO validation_rules (
  rule_key, 
  rule_type, 
  field_name, 
  entity_type, 
  compare_table,
  compare_field,
  join_field,
  comparison_operator,
  error_message, 
  description, 
  enabled
) VALUES (
  'building_area_mismatch',
  'cross_table_comparison',
  'total_building_area',
  'building',
  'buildings',
  'total_area_for_control',
  'building_number',
  '!=',
  'Total building area does not match control area',
  'Compares total_building_area with total_area_for_control to detect discrepancies',
  true
) ON CONFLICT (rule_key) DO NOTHING;

-- Insert example for comparing asset total_size with expected values
INSERT INTO validation_rules (
  rule_key, 
  rule_type, 
  field_name, 
  entity_type, 
  compare_table,
  compare_field,
  join_field,
  comparison_operator,
  error_message, 
  description, 
  enabled
) VALUES (
  'asset_size_validation',
  'cross_table_comparison',
  'total_size',
  'asset',
  'asset_types',
  'expected_size',
  'main_asset_type',
  '>',
  'Asset total size exceeds expected value for this type',
  'Validates that asset total_size does not exceed the expected size defined in asset_types',
  false
) ON CONFLICT (rule_key) DO NOTHING;
