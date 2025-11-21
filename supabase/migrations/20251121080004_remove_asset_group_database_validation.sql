/*
  # Remove asset_group database validation

  1. Changes
    - Drop the validate_asset_group trigger
    - Drop the validate_asset_group function
  
  2. Notes
    - Validation will be handled in the UI instead
*/

-- Drop the trigger
DROP TRIGGER IF EXISTS validate_asset_group_trigger ON assets;

-- Drop the function
DROP FUNCTION IF EXISTS validate_asset_group();
