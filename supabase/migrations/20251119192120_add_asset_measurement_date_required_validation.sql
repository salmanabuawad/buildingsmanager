/*
  # Add measurement_date required validation for assets
  
  1. New Validation Rule
    - Adds required validation for measurement_date field on asset entity
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
  'asset_measurement_date_required',
  'required',
  'measurement_date',
  'asset',
  true,
  'תאריך מדידה הוא שדה חובה',
  'Measurement date must be provided'
)
ON CONFLICT (rule_key) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  error_message = EXCLUDED.error_message,
  description = EXCLUDED.description;
