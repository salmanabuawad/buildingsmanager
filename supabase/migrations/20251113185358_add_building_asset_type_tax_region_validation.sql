/*
  # Add Building to Asset Type Tax Region Validation Rule

  1. Purpose
    - Add validation rule to ensure building's tax_region exists in asset_types table
    - Prevents creation of buildings with tax regions that don't have corresponding asset types
    
  2. New Rule
    - Rule Type: 'exists_in_table' - Validates that a value exists in another table
    - Entity: building
    - Field: tax_region
    - Compare Table: asset_types
    - Compare Field: tax_region
    
  3. Implementation
    - Add new rule type 'exists_in_table' for existence checks
    - Insert validation rule for building tax_region existence check
*/

-- Insert the validation rule for building tax_region existence in asset_types
INSERT INTO validation_rules (
  rule_key, 
  rule_type, 
  field_name, 
  entity_type, 
  compare_table,
  compare_field,
  error_message, 
  description, 
  enabled
) VALUES (
  'building_tax_region_exists_in_asset_types',
  'exists_in_table',
  'tax_region',
  'building',
  'asset_types',
  'tax_region',
  'Building tax region must exist in asset types',
  'Validates that the building tax_region value exists in the asset_types table tax_region column',
  true
) ON CONFLICT (rule_key) DO UPDATE SET
  rule_type = EXCLUDED.rule_type,
  field_name = EXCLUDED.field_name,
  entity_type = EXCLUDED.entity_type,
  compare_table = EXCLUDED.compare_table,
  compare_field = EXCLUDED.compare_field,
  error_message = EXCLUDED.error_message,
  description = EXCLUDED.description,
  enabled = EXCLUDED.enabled;
