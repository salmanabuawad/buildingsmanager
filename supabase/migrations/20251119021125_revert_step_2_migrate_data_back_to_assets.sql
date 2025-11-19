/*
  # Revert Step 2: Migrate Data from sub_assets Back to assets Table

  1. Data Migration
    - Update assets table with sub-asset data from sub_assets table
    - Match on (asset_id, building_number, measurement_date)
    - Populate columns based on sequence_order (1-6)

  2. Migration Strategy
    - Use UPDATE statements with subqueries for each sequence_order
    - Only update rows where sub-asset data exists
    - Preserves all existing data in assets table

  3. Notes
    - This restores the denormalized structure
    - After this migration, sub_assets table will no longer be needed
*/

-- Migrate sub-asset 1
UPDATE assets a
SET 
  sub_asset_type_1 = sa.sub_asset_type,
  sub_asset_size_1 = sa.sub_asset_size
FROM sub_assets sa
WHERE a.asset_id = sa.asset_id
  AND a.building_number = sa.building_number
  AND a.measurement_date = sa.measurement_date
  AND sa.sequence_order = 1;

-- Migrate sub-asset 2
UPDATE assets a
SET 
  sub_asset_type_2 = sa.sub_asset_type,
  sub_asset_size_2 = sa.sub_asset_size
FROM sub_assets sa
WHERE a.asset_id = sa.asset_id
  AND a.building_number = sa.building_number
  AND a.measurement_date = sa.measurement_date
  AND sa.sequence_order = 2;

-- Migrate sub-asset 3
UPDATE assets a
SET 
  sub_asset_type_3 = sa.sub_asset_type,
  sub_asset_size_3 = sa.sub_asset_size
FROM sub_assets sa
WHERE a.asset_id = sa.asset_id
  AND a.building_number = sa.building_number
  AND a.measurement_date = sa.measurement_date
  AND sa.sequence_order = 3;

-- Migrate sub-asset 4
UPDATE assets a
SET 
  sub_asset_type_4 = sa.sub_asset_type,
  sub_asset_size_4 = sa.sub_asset_size
FROM sub_assets sa
WHERE a.asset_id = sa.asset_id
  AND a.building_number = sa.building_number
  AND a.measurement_date = sa.measurement_date
  AND sa.sequence_order = 4;

-- Migrate sub-asset 5
UPDATE assets a
SET 
  sub_asset_type_5 = sa.sub_asset_type,
  sub_asset_size_5 = sa.sub_asset_size
FROM sub_assets sa
WHERE a.asset_id = sa.asset_id
  AND a.building_number = sa.building_number
  AND a.measurement_date = sa.measurement_date
  AND sa.sequence_order = 5;

-- Migrate sub-asset 6
UPDATE assets a
SET 
  sub_asset_type_6 = sa.sub_asset_type,
  sub_asset_size_6 = sa.sub_asset_size
FROM sub_assets sa
WHERE a.asset_id = sa.asset_id
  AND a.building_number = sa.building_number
  AND a.measurement_date = sa.measurement_date
  AND sa.sequence_order = 6;