/*
  # Change asset_id to bigint
  
  1. Changes
    - Change `asset_id` column type from text to bigint in `assets` table
    - This allows for numeric asset IDs with larger values
  
  2. Security
    - No changes to RLS policies
*/

-- Change asset_id to bigint in assets table
ALTER TABLE assets 
ALTER COLUMN asset_id TYPE bigint USING asset_id::bigint;
