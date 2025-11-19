/*
  # Add asset_size required validation rule
  
  1. New Validation Rule
    - Adds required validation for asset_size field
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
  'asset_size_required',
  'required',
  'asset_size',
  'asset',
  true,
  'גודל נכס הוא שדה חובה',
  'Asset size must be provided'
)
ON CONFLICT (rule_key) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  error_message = EXCLUDED.error_message,
  description = EXCLUDED.description;
