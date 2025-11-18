/*
  # Add new fields to asset_types table

  1. Changes
    - Add `shared_area` column (שטח משותף) - numeric field for shared area
    - Add `has_elevator` column (מעלית) - boolean field for elevator existence
    - Add `min_asset_size` column (גודל נכס מ) - numeric field for minimum asset size
    - Add `max_asset_size` column (גודל נכס עד) - numeric field for maximum asset size
  
  2. Notes
    - All fields are optional (nullable) to support existing records
    - shared_area and size fields use numeric type for decimal values
    - has_elevator uses boolean type with default false
*/

-- Add shared_area column to asset_types table
ALTER TABLE asset_types 
ADD COLUMN IF NOT EXISTS shared_area numeric;

-- Add has_elevator column to asset_types table
ALTER TABLE asset_types 
ADD COLUMN IF NOT EXISTS has_elevator boolean DEFAULT false;

-- Add min_asset_size column to asset_types table
ALTER TABLE asset_types 
ADD COLUMN IF NOT EXISTS min_asset_size numeric;

-- Add max_asset_size column to asset_types table
ALTER TABLE asset_types 
ADD COLUMN IF NOT EXISTS max_asset_size numeric;