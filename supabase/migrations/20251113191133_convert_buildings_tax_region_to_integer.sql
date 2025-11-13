/*
  # Convert Buildings tax_region from Text to Integer

  1. Purpose
    - Fix validation issue where buildings.tax_region (text) doesn't match asset_types.tax_region (integer)
    - Convert all existing text values to integers
    - Change column type from text to integer
    
  2. Changes
    - Convert existing tax_region values from text to integer
    - Alter column type from text to integer
    - This enables proper validation against asset_types table
    
  3. Data Safety
    - Uses USING clause to safely convert text to integer
    - Handles null values appropriately
*/

-- Convert buildings tax_region column from text to integer
ALTER TABLE buildings 
ALTER COLUMN tax_region TYPE integer 
USING CASE 
  WHEN tax_region IS NULL THEN NULL
  WHEN tax_region ~ '^\d+$' THEN tax_region::integer
  ELSE NULL
END;
