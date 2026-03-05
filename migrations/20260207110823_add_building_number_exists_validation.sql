/*
  # Add Building Number Existence Validation

  This migration adds a validation rule to ensure that the building_number in assets
  exists in the buildings table.

  ## Changes
  
  1. Add cross-table validation rule for building_number
     - Ensures building_number exists in buildings table
     - Uses foreign key validation type
     - Hebrew error message for consistency
  
  ## Background
  
  The database already has:
  - NOT NULL constraint on assets.building_number
  - FOREIGN KEY constraint from assets.building_number to buildings.building_number
  
  This validation rule adds frontend validation to provide immediate feedback to users.
*/

-- Add validation rule to check that building_number exists in buildings table
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
  'asset_building_number_exists',
  'foreign_key',
  'building_number',
  'asset',
  true,
  'מספר מבנה לא קיים במערכת. יש ליצור את המבנה תחילה',
  'Building number must exist in buildings table',
  'buildings',
  'building_number',
  'building_number'
)
ON CONFLICT (rule_key) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  error_message = EXCLUDED.error_message,
  description = EXCLUDED.description,
  compare_table = EXCLUDED.compare_table,
  compare_field = EXCLUDED.compare_field,
  join_field = EXCLUDED.join_field,
  updated_at = now();
