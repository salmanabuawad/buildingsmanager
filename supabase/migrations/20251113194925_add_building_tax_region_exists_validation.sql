/*
  # Add Building Tax Region Exists in Asset Types Validation

  1. New Validation Rule
    - Adds a cross-table validation rule to ensure building.tax_region exists in asset_types.tax_region
    - Rule type: 'exists_in_table' - validates that a value exists in another table
    - Checks that the tax_region value assigned to a building is valid (exists in asset_types)
  
  2. Details
    - Rule key: building_tax_region_exists_in_asset_types
    - Entity type: building
    - Field: tax_region
    - Compare table: asset_types
    - Compare field: tax_region
    - Error message explains that the tax region must exist in asset types
*/

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
  'building_tax_region_exists_in_asset_types',
  'exists_in_table',
  'tax_region',
  'building',
  true,
  'Tax region must exist in asset types',
  'Validates that building tax_region value exists in the asset_types table tax_region values',
  'asset_types',
  'tax_region'
)
ON CONFLICT (rule_key) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  error_message = EXCLUDED.error_message,
  description = EXCLUDED.description,
  compare_table = EXCLUDED.compare_table,
  compare_field = EXCLUDED.compare_field,
  updated_at = now();
