/*
  # Drop old get_assets_by_ids function version
  
  1. Overview
    - Remove the old version of get_assets_by_ids that uses integer[] and area_from_distribution
    - Keep only the new version that uses bigint[] and business_distribution_area
*/

-- Drop the old version with integer[] parameter that still references area_from_distribution
DROP FUNCTION IF EXISTS get_assets_by_ids(integer[]);
