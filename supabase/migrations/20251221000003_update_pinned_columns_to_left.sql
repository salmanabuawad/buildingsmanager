/*
  # Update Pinned Columns to Right Side
  
  This migration updates all pinned columns in field_configurations to have
  pin_side = 'right' instead of 'left' or null.
  
  Changes:
  1. Sets pin_side = 'right' for all rows where pinned = true
*/

-- Update all pinned columns to be pinned on the right side
UPDATE field_configurations
SET pin_side = 'right', updated_at = now()
WHERE pinned = true;

