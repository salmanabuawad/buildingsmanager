/*
  # Add Tax Region Combination Constraint

  1. Purpose
    - Enforce that tax regions can only be single values or specific combinations
    - Valid combinations: 40,10 or 40,20 or 40,30 only
    
  2. Changes
    - Add check constraint to building.tax_region column
    - Validates that comma-separated values are one of the allowed combinations
    
  3. Validation Rules
    - Single values: allowed (e.g., "10", "20", "30", "40")
    - Multiple values: only "10,40", "20,40", "30,40" (normalized order)
    
  4. Data Safety
    - Constraint validates format before accepting data
    - Existing valid data is preserved
*/

-- Add check constraint for tax_region combinations
ALTER TABLE building 
ADD CONSTRAINT check_tax_region_combinations 
CHECK (
  tax_region IS NULL 
  OR tax_region !~ ',' 
  OR tax_region IN ('10,40', '20,40', '30,40', '40,10', '40,20', '40,30')
);

-- Add comment explaining the constraint
COMMENT ON CONSTRAINT check_tax_region_combinations ON building IS 
'Tax region can be a single value or one of these combinations only: 40,10 or 40,20 or 40,30';
