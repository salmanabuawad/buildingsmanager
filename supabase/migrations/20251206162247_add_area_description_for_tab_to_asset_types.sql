/*
  # Add area_description_for_tab column to asset_types table
  
  1. Changes
    - Add `area_description_for_tab` TEXT column to asset_types table
    - This column stores the area description for display in tabs (תיאור אזור לתצוגה בלשונית)
  
  2. Column Details
    - Column name: `area_description_for_tab`
    - Type: TEXT
    - Nullable: YES (optional field)
*/

-- Add area_description_for_tab column to asset_types table
ALTER TABLE asset_types
ADD COLUMN IF NOT EXISTS area_description_for_tab TEXT;

-- Add comment on the column
COMMENT ON COLUMN asset_types.area_description_for_tab IS 'תיאור אזור לתצוגה בלשונית - Area description for display in tabs';

