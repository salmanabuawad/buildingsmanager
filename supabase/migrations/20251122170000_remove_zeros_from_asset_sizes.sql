/*
  # Remove Zeros from Asset Size Fields
  
  1. Changes
    - Set all size fields to NULL where they are 0
    - Affects: asset_size, sub_asset_size_1 through sub_asset_size_6
    - This cleans up the data by removing meaningless zero values
*/

-- Update asset_size to NULL where it is 0
UPDATE assets
SET asset_size = NULL
WHERE asset_size = 0;

-- Update sub_asset_size_1 to NULL where it is 0
UPDATE assets
SET sub_asset_size_1 = NULL
WHERE sub_asset_size_1 = 0;

-- Update sub_asset_size_2 to NULL where it is 0
UPDATE assets
SET sub_asset_size_2 = NULL
WHERE sub_asset_size_2 = 0;

-- Update sub_asset_size_3 to NULL where it is 0
UPDATE assets
SET sub_asset_size_3 = NULL
WHERE sub_asset_size_3 = 0;

-- Update sub_asset_size_4 to NULL where it is 0
UPDATE assets
SET sub_asset_size_4 = NULL
WHERE sub_asset_size_4 = 0;

-- Update sub_asset_size_5 to NULL where it is 0
UPDATE assets
SET sub_asset_size_5 = NULL
WHERE sub_asset_size_5 = 0;

-- Update sub_asset_size_6 to NULL where it is 0
UPDATE assets
SET sub_asset_size_6 = NULL
WHERE sub_asset_size_6 = 0;

