/*
  # Add Asset Type Validation Rules

  1. Purpose
    - Add validation rules to ensure asset types used in assets exist in asset_types table
    - Validate main_asset_type and all sub_asset_type fields (1-6)
    
  2. Changes
    - Add exists_in_table validation for main_asset_type
    - Add exists_in_table validation for sub_asset_type_1 through sub_asset_type_6
    - These rules check that the type name exists in asset_types.name column
    
  3. Security
    - Rules are enabled by default
    - Provides data integrity by preventing invalid asset type references
*/

-- Add validation rule for main_asset_type
INSERT INTO validation_rules (
  rule_key,
  rule_type,
  field_name,
  entity_type,
  enabled,
  error_message,
  description,
  compare_table,
  compare_field
) VALUES (
  'asset_main_type_exists',
  'exists_in_table',
  'main_asset_type',
  'asset',
  true,
  'Main asset type must exist in asset types',
  'Validates that the main_asset_type value exists in the asset_types table',
  'asset_types',
  'name'
) ON CONFLICT (rule_key) DO UPDATE SET
  rule_type = EXCLUDED.rule_type,
  field_name = EXCLUDED.field_name,
  entity_type = EXCLUDED.entity_type,
  enabled = EXCLUDED.enabled,
  error_message = EXCLUDED.error_message,
  description = EXCLUDED.description,
  compare_table = EXCLUDED.compare_table,
  compare_field = EXCLUDED.compare_field;

-- Add validation rules for sub_asset_type_1 through sub_asset_type_6
INSERT INTO validation_rules (
  rule_key,
  rule_type,
  field_name,
  entity_type,
  enabled,
  error_message,
  description,
  compare_table,
  compare_field
) VALUES 
(
  'asset_sub_type_1_exists',
  'exists_in_table',
  'sub_asset_type_1',
  'asset',
  true,
  'Sub asset type 1 must exist in asset types',
  'Validates that the sub_asset_type_1 value exists in the asset_types table',
  'asset_types',
  'name'
),
(
  'asset_sub_type_2_exists',
  'exists_in_table',
  'sub_asset_type_2',
  'asset',
  true,
  'Sub asset type 2 must exist in asset types',
  'Validates that the sub_asset_type_2 value exists in the asset_types table',
  'asset_types',
  'name'
),
(
  'asset_sub_type_3_exists',
  'exists_in_table',
  'sub_asset_type_3',
  'asset',
  true,
  'Sub asset type 3 must exist in asset types',
  'Validates that the sub_asset_type_3 value exists in the asset_types table',
  'asset_types',
  'name'
),
(
  'asset_sub_type_4_exists',
  'exists_in_table',
  'sub_asset_type_4',
  'asset',
  true,
  'Sub asset type 4 must exist in asset types',
  'Validates that the sub_asset_type_4 value exists in the asset_types table',
  'asset_types',
  'name'
),
(
  'asset_sub_type_5_exists',
  'exists_in_table',
  'sub_asset_type_5',
  'asset',
  true,
  'Sub asset type 5 must exist in asset types',
  'Validates that the sub_asset_type_5 value exists in the asset_types table',
  'asset_types',
  'name'
),
(
  'asset_sub_type_6_exists',
  'exists_in_table',
  'sub_asset_type_6',
  'asset',
  true,
  'Sub asset type 6 must exist in asset types',
  'Validates that the sub_asset_type_6 value exists in the asset_types table',
  'asset_types',
  'name'
)
ON CONFLICT (rule_key) DO UPDATE SET
  rule_type = EXCLUDED.rule_type,
  field_name = EXCLUDED.field_name,
  entity_type = EXCLUDED.entity_type,
  enabled = EXCLUDED.enabled,
  error_message = EXCLUDED.error_message,
  description = EXCLUDED.description,
  compare_table = EXCLUDED.compare_table,
  compare_field = EXCLUDED.compare_field;
