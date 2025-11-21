/*
  # Rename id column to asset_type in asset_types table

  1. Changes
    - Rename the `id` column to `asset_type` in the `asset_types` table
    - This makes the column name more descriptive and consistent with domain terminology
  
  2. Notes
    - The column remains the primary key
    - All existing data is preserved
    - Any foreign key references will need to be updated separately if they exist
*/

ALTER TABLE asset_types 
RENAME COLUMN id TO asset_type;
