/*
  # Remove Tax Region Combination Constraint

  1. Purpose
    - Remove the hardcoded check_tax_region_combinations constraint
    - Tax region validation is now handled dynamically in the application layer
    - Validation checks against actual tax regions in the asset_types table
    
  2. Changes
    - Drop the check_tax_region_combinations constraint from building table
    - Application-level validation now ensures tax regions exist in asset_types
    
  3. Data Safety
    - Existing data remains valid
    - New validation is more flexible and data-driven
*/

-- Drop the hardcoded tax region combination constraint
-- The constraint was originally added to 'building' table, but table may have been renamed to 'buildings'
ALTER TABLE buildings 
DROP CONSTRAINT IF EXISTS check_tax_region_combinations;

