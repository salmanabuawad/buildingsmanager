/*
  # Change building_number to bigint
  
  1. Changes
    - Change `building_number` column type from integer to bigint in both `building` and `assets` tables
    - This allows for larger building numbers (up to 9,223,372,036,854,775,807)
  
  2. Security
    - No changes to RLS policies
*/

-- Change building_number to bigint in building table
ALTER TABLE building 
ALTER COLUMN building_number TYPE bigint;

-- Change building_number to bigint in assets table
ALTER TABLE assets 
ALTER COLUMN building_number TYPE bigint;
