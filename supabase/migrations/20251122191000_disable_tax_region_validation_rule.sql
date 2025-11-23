/*
  # Disable Tax Region Validation Rule
  
  1. Changes
    - Disables the database validation rule for main_asset_type tax region matching
    - Tax region validation is now handled only by frontend code (validateMainAssetTypeComplete)
    - Prevents duplicate error messages in batch validation
  
  2. Security
    - No RLS changes
    - Frontend validation still enforces the rule
*/

-- Disable the tax region validation rule (handled by frontend now)
UPDATE validation_rules 
SET enabled = false,
    updated_at = now()
WHERE rule_key = 'asset_main_type_matches_building_tax_region';

