/*
  # Remove asset_group column from assets table

  1. Changes
    - Drop the `asset_group` column from the `assets` table
    - This field is no longer needed in the system

  2. Notes
    - This is a destructive operation that will remove all asset_group data
    - No rollback migration is provided as the field is being permanently removed
*/

-- Remove the asset_group column from assets table
ALTER TABLE assets DROP COLUMN IF EXISTS asset_group;
