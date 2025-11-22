/*
  # Add Asset Type 299 and 199 Tax Region Validation

  1. New Validation Rules
    - Asset type 299 is only valid in buildings with tax region 40
    - Asset type 199 is only valid in buildings with tax region NOT 40 (other tax regions)
    - This is a conditional validation that checks:
      - If main_asset_type is '299', then building.tax_region must be '40'
      - If main_asset_type is '199', then building.tax_region must NOT be '40'
    
  2. Security
    - No changes to RLS policies
*/

-- Add validation rule for asset type 299 requiring tax region 40
INSERT INTO validation_rules (
  rule_key,
  rule_type,
  field_name,
  entity_type,
  enabled,
  error_message,
  description,
  value_text,
  compare_table,
  compare_field,
  join_field
) VALUES (
  'asset_type_299_requires_tax_region_40',
  'conditional_tax_region_check',
  'main_asset_type',
  'asset',
  true,
  'סוג נכס 299 תקף רק בבניינים עם אזור מס 40',
  'Asset type 299 is only valid in buildings with tax region 40',
  '299',
  'buildings',
  'tax_region',
  'building_number'
)
ON CONFLICT (rule_key) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  error_message = EXCLUDED.error_message,
  description = EXCLUDED.description,
  value_text = EXCLUDED.value_text;

-- Add validation rule for asset type 199 requiring tax region NOT 40
INSERT INTO validation_rules (
  rule_key,
  rule_type,
  field_name,
  entity_type,
  enabled,
  error_message,
  description,
  value_text,
  compare_table,
  compare_field,
  join_field,
  comparison_operator
) VALUES (
  'asset_type_199_requires_tax_region_not_40',
  'conditional_tax_region_check',
  'main_asset_type',
  'asset',
  true,
  'סוג נכס 199 תקף רק בבניינים עם אזור מס שאינו 40',
  'Asset type 199 is only valid in buildings with tax region other than 40',
  '199',
  'buildings',
  'tax_region',
  'building_number',
  '!='
)
ON CONFLICT (rule_key) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  error_message = EXCLUDED.error_message,
  description = EXCLUDED.description,
  value_text = EXCLUDED.value_text,
  comparison_operator = EXCLUDED.comparison_operator;

