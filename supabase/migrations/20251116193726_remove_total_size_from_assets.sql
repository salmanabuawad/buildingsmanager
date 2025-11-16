/*
  # Remove total_size column from assets table
  
  1. Changes
    - Drop trigger that calculates total_size
    - Drop function that calculates total_size
    - Drop total_size column from assets table
    
  2. Notes
    - This field is redundant as it can be calculated on the fly
    - Removes unnecessary database storage and maintenance overhead
*/

-- Drop the trigger
DROP TRIGGER IF EXISTS trigger_calculate_asset_total_size ON assets;

-- Drop the function
DROP FUNCTION IF EXISTS calculate_asset_total_size();

-- Drop the column
ALTER TABLE assets DROP COLUMN IF EXISTS total_size;
