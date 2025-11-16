/*
  # Fix: Remove total_size trigger that was not properly dropped
  
  1. Changes
    - Drop trigger_calculate_total_size trigger from assets table
    - Drop calculate_total_size() function
    
  2. Notes
    - The previous migration attempted to drop these but the names didn't match
    - This trigger is trying to set total_size which no longer exists in the table
    - The trigger was causing "record has no field total_size" errors
*/

-- Drop the trigger with correct name
DROP TRIGGER IF EXISTS trigger_calculate_total_size ON assets;

-- Drop the function with correct name
DROP FUNCTION IF EXISTS calculate_total_size();
