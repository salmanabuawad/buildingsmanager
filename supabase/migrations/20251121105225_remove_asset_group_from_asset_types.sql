/*
  # Remove asset_group column from asset_types table

  1. Changes
    - Drop the `asset_group` column from the `asset_types` table
    - This field is no longer needed in the system

  2. Notes
    - This is a destructive operation that will remove all asset_group data from asset_types
    - This completes the removal of asset_group from the entire system
*/

-- Remove the asset_group column from asset_types table
ALTER TABLE asset_types DROP COLUMN IF EXISTS asset_group;
