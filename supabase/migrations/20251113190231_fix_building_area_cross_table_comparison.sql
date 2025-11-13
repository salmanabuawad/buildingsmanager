/*
  # Fix Building Area Cross-Table Comparison Rule

  1. Purpose
    - Update the building_area_mismatch rule to use the correct comparison operator
    - The rule should check for equality (=) to validate when areas DO match
    - When areas match, validation passes; when they don't match, it fails
    
  2. Changes
    - Change comparison_operator from '!=' to '='
    - Update error message to be more descriptive
    - The validation logic will invert the result - when comparison fails (areas don't match), the validation error shows
    
  3. Implementation Details
    - Field: total_building_area (calculated sum from assets)
    - Compare Field: total_area_for_control (manual control value)
    - Operator: '=' (checks if they are equal)
    - When they DON'T match (comparison fails), validation error is shown
*/

-- Update the building area mismatch rule with correct comparison
UPDATE validation_rules
SET 
  comparison_operator = '=',
  error_message = 'Building area mismatch: calculated total does not match control area',
  description = 'Validates that total_building_area (sum of assets) equals total_area_for_control (manual control value). Shows error when values do not match.'
WHERE rule_key = 'building_area_mismatch';
