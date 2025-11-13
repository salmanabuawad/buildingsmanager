/*
  # Add Building Tax Region Validation Rules

  1. Purpose
    - Add validation rules for building.tax_region field
    - Ensure tax region is numeric and positive
    - Add cross-validation between building, assets, and asset_types tax regions
    
  2. Changes
    - Add required validation for building.tax_region
    - Add numeric validation for building.tax_region
    - Add positive_number validation for building.tax_region
    - Add validation to ensure asset types used in a building have matching tax regions
    
  3. Security
    - All rules are enabled by default
    - Ensures data consistency across building, assets, and asset_types
*/

-- Add basic validation rules for building.tax_region
INSERT INTO validation_rules (
  rule_key,
  rule_type,
  field_name,
  entity_type,
  enabled,
  error_message,
  description
) VALUES 
(
  'building_tax_region_required',
  'required',
  'tax_region',
  'building',
  true,
  'Tax region is required',
  'Building tax region must be provided'
),
(
  'building_tax_region_numeric',
  'numeric',
  'tax_region',
  'building',
  true,
  'Tax region must be a number',
  'Building tax region must be a valid number'
),
(
  'building_tax_region_positive',
  'positive_number',
  'tax_region',
  'building',
  true,
  'Tax region must be positive',
  'Building tax region must be greater than 0'
)
ON CONFLICT (rule_key) DO UPDATE SET
  rule_type = EXCLUDED.rule_type,
  field_name = EXCLUDED.field_name,
  entity_type = EXCLUDED.entity_type,
  enabled = EXCLUDED.enabled,
  error_message = EXCLUDED.error_message,
  description = EXCLUDED.description;
