/*
  # Set Distribution Flags to False by Default When Creating Buildings
  
  This migration updates the default values for need_residence_distribution and
  need_business_distribution to false when creating new buildings.
  
  Previously, these flags defaulted to true, meaning new buildings needed
  distribution by default. Now they default to false, and will be set to true
  only when shared areas are actually set.
*/

-- ============================================================================
-- UPDATE DEFAULT VALUES FOR DISTRIBUTION FLAGS
-- ============================================================================

-- Change the default values from true to false
ALTER TABLE buildings 
  ALTER COLUMN need_residence_distribution SET DEFAULT false,
  ALTER COLUMN need_business_distribution SET DEFAULT false;

-- Update comments to reflect the new default behavior
COMMENT ON COLUMN buildings.need_residence_distribution IS 
  'Flag indicating if residence shared area needs to be distributed to assets (true = needs distribution, false = already distributed or no distribution needed). Defaults to false when creating a building.';

COMMENT ON COLUMN buildings.need_business_distribution IS 
  'Flag indicating if business shared area needs to be distributed to assets (true = needs distribution, false = already distributed or no distribution needed). Defaults to false when creating a building.';

