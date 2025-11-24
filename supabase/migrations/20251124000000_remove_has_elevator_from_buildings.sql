/*
  # Remove has_elevator column from buildings table
  
  1. Changes
    - Drop `has_elevator` column from `buildings` table
    - This field has been replaced by the `elevator` text field
  
  2. Notes
    - The `elevator` field (text) is now the single source of truth for elevator status
    - All elevator validation now uses the `elevator` field instead of `has_elevator`
*/

-- Drop has_elevator column from buildings table
ALTER TABLE buildings 
DROP COLUMN IF EXISTS has_elevator;

