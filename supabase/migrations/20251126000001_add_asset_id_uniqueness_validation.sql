/*
  # Add Asset ID Uniqueness Validation Rule
  
  1. Changes
    - Add validation rule to check uniqueness of asset_id
    - This rule will be enforced at the application level
    - Database already has unique constraint, but this provides user-friendly error messages
  
  2. Validation Rule
    - rule_key: 'asset_id_unique'
    - rule_type: 'unique'
    - entity_type: 'asset'
    - field_name: 'asset_id'
    - enabled: true
*/

-- Insert validation rule for asset_id uniqueness
INSERT INTO validation_rules (
  rule_key,
  rule_type,
  field_name,
  entity_type,
  value_numeric,
  value_text,
  error_message,
  error_message_he,
  enabled
) VALUES (
  'asset_id_unique',
  'unique',
  'asset_id',
  'asset',
  NULL,
  NULL,
  'Asset ID must be unique',
  'מספר נכס חייב להיות ייחודי',
  true
)
ON CONFLICT (rule_key) DO UPDATE SET
  enabled = true,
  error_message = EXCLUDED.error_message,
  error_message_he = EXCLUDED.error_message_he;

