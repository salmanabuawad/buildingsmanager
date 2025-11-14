/*
  # Add Main Asset Type Tax Region Validation

  1. New Validation Rules
    - Add validation that checks main_asset_type belongs to building's tax region
    - This is a complex cross-table validation involving 3 tables:
      - assets (has building_number and main_asset_type)
      - building (has building_number and tax_region)
      - asset_types (has name and tax_region)

  2. Implementation
    - Create a validation rule that checks:
      asset.main_asset_type exists in asset_types 
      WHERE asset_types.tax_region = (SELECT tax_region FROM building WHERE building_number = asset.building_number)
*/

-- Add validation rule for main_asset_type matching building's tax region
INSERT INTO validation_rules (
  rule_key,
  rule_type,
  field_name,
  entity_type,
  enabled,
  error_message,
  description,
  compare_table,
  compare_field,
  join_field
) VALUES (
  'asset_main_type_matches_building_tax_region',
  'exists_in_table_with_join',
  'main_asset_type',
  'asset',
  true,
  'סוג הנכס הראשי לא שייך לאזור המס של הבניין',
  'Validates that the main asset type belongs to the building''s tax region',
  'asset_types',
  'name',
  'tax_region'
) ON CONFLICT (rule_key) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  error_message = EXCLUDED.error_message,
  description = EXCLUDED.description;