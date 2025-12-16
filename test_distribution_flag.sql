-- Check a building's distribution flags
-- Replace 1005 with your building number
SELECT
  building_number,
  need_business_distribution,
  need_residence_distribution,
  last_business_distribution_date,
  last_residence_distribution_date
FROM buildings
WHERE building_number = 1005;

-- Check what assets are in that building
SELECT
  asset_id,
  main_asset_type,
  asset_size,
  building_number
FROM assets
WHERE building_number = 1005
ORDER BY asset_id;

-- Check asset type 990's flags
SELECT
  name,
  business_residence,
  non_accountable_for_distribution,
  non_accountable_for_total_area
FROM asset_types
WHERE name = '990';
