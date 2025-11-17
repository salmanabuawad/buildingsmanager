/*
  # Change Building tax_region to Support Multiple Values

  1. Purpose
    - Allow buildings to have one or more tax zones
    - Store multiple tax zones as comma-separated values in a text field
    
  2. Changes
    - Convert building.tax_region from integer to text
    - Preserve existing integer values by converting them to text
    
  3. Data Safety
    - Uses USING clause to safely convert integer to text
    - All existing values are preserved
    
  4. Notes
    - Values will be stored as comma-separated strings (e.g., "1", "1,2", "1,2,3")
    - Application layer will handle parsing and validation
*/

-- Convert building tax_region column from integer to text to support comma-separated values
ALTER TABLE building 
ALTER COLUMN tax_region TYPE text 
USING CASE 
  WHEN tax_region IS NULL THEN NULL
  ELSE tax_region::text
END;
