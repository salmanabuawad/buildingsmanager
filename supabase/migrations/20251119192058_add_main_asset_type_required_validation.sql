/*
  # Add main_asset_type required validation rule
  
  1. New Validation Rule
    - Adds required validation for main_asset_type field
    - Ensures consistency with database trigger validation
  
  2. Security
    - No changes to RLS policies
*/

INSERT INTO validation_rules (
  rule_key,
  rule_type,
  field_name,
  entity_type,
  enabled,
  error_message,
  description
) VALUES (
  'asset_main_asset_type_required',
  'required',
  'main_asset_type',
  'asset',
  true,
  'סוג נכס ראשי הוא שדה חובה',
  'Main asset type must be provided'
)
ON CONFLICT (rule_key) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  error_message = EXCLUDED.error_message,
  description = EXCLUDED.description;
