/*
  # Add Numeric Validation Rules for Payer ID and Asset ID

  1. New Validation Rules
    - payer_id must contain only digits (numeric string)
    - asset_id must contain only digits (numeric string)
  
  2. Purpose
    - Ensure data quality by validating that IDs are numeric
    - Provide clear error messages when validation fails
  
  3. Implementation
    - Uses pattern validation type
    - Checks against regex pattern for numeric strings
*/

-- Add validation rule for payer_id to be numeric
INSERT INTO validation_rules (
  rule_key,
  rule_type,
  field_name,
  entity_type,
  value_text,
  error_message,
  description,
  enabled
) VALUES (
  'asset_payer_id_numeric',
  'pattern',
  'payer_id',
  'asset',
  '^[0-9]+$',
  'מזהה משלם חייב להכיל ספרות בלבד',
  'Payer ID must contain only numeric digits',
  true
) ON CONFLICT (rule_key) DO UPDATE SET
  value_text = EXCLUDED.value_text,
  error_message = EXCLUDED.error_message,
  description = EXCLUDED.description,
  enabled = EXCLUDED.enabled;

-- Add validation rule for asset_id to be numeric
INSERT INTO validation_rules (
  rule_key,
  rule_type,
  field_name,
  entity_type,
  value_text,
  error_message,
  description,
  enabled
) VALUES (
  'asset_asset_id_numeric',
  'pattern',
  'asset_id',
  'asset',
  '^[0-9]+$',
  'מזהה נכס חייב להכיל ספרות בלבד',
  'Asset ID must contain only numeric digits',
  true
) ON CONFLICT (rule_key) DO UPDATE SET
  value_text = EXCLUDED.value_text,
  error_message = EXCLUDED.error_message,
  description = EXCLUDED.description,
  enabled = EXCLUDED.enabled;
