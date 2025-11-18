/*
  # Change shared_area to boolean in asset_types table

  1. Changes
    - Drop existing `shared_area` numeric column
    - Add new `shared_area` boolean column with default false
  
  2. Notes
    - Converts shared_area from numeric to boolean type
    - Uses 1/0 representation (true/false)
    - Default value is false
*/

-- Drop the existing shared_area column
ALTER TABLE asset_types 
DROP COLUMN IF EXISTS shared_area;

-- Add shared_area as boolean
ALTER TABLE asset_types 
ADD COLUMN IF NOT EXISTS shared_area boolean DEFAULT false;