/*
  # Add Constraint: Minimum Two Sub Assets

  1. Changes
    - Adds a check constraint to the assets table
    - If any sub asset type has a value, at least two sub asset types must be filled
  
  2. Logic
    - Count how many sub asset types are NOT NULL and NOT empty
    - If the count is 1, the constraint fails
    - If the count is 0 (no sub assets) or >= 2, the constraint passes
  
  3. Business Rule
    - When using sub assets, you must have at least 2 sub assets
    - This prevents having only one sub asset which doesn't make sense logically
*/

-- Drop the constraint if it exists
ALTER TABLE assets DROP CONSTRAINT IF EXISTS check_minimum_two_sub_assets;

-- Add constraint: if there are sub assets, must have at least 2
ALTER TABLE assets
ADD CONSTRAINT check_minimum_two_sub_assets
CHECK (
  -- Count non-null and non-empty sub asset types
  (
    (CASE WHEN sub_asset_type_1 IS NOT NULL AND sub_asset_type_1 != '' THEN 1 ELSE 0 END) +
    (CASE WHEN sub_asset_type_2 IS NOT NULL AND sub_asset_type_2 != '' THEN 1 ELSE 0 END) +
    (CASE WHEN sub_asset_type_3 IS NOT NULL AND sub_asset_type_3 != '' THEN 1 ELSE 0 END) +
    (CASE WHEN sub_asset_type_4 IS NOT NULL AND sub_asset_type_4 != '' THEN 1 ELSE 0 END) +
    (CASE WHEN sub_asset_type_5 IS NOT NULL AND sub_asset_type_5 != '' THEN 1 ELSE 0 END) +
    (CASE WHEN sub_asset_type_6 IS NOT NULL AND sub_asset_type_6 != '' THEN 1 ELSE 0 END)
  ) != 1
);
