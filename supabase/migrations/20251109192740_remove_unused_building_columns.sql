/*
  # Remove unused columns from buildings table

  1. Changes
    - Drop columns: asset_area, storage_area, pergola_area, balcony_area
    - Keep only: building_number (PK), tax_region, total_units, total_building_area, created_at
  
  2. Notes
    - These columns are no longer needed as they're calculated from assets
    - Data will be preserved in the assets table
    - Dropping trigger and function that depend on these columns
*/

-- Drop the trigger first
DROP TRIGGER IF EXISTS update_building_totals_trigger ON assets;

-- Drop the function with CASCADE to drop all dependencies
DROP FUNCTION IF EXISTS update_building_totals() CASCADE;

-- Drop the unused columns
ALTER TABLE buildings DROP COLUMN IF EXISTS asset_area;
ALTER TABLE buildings DROP COLUMN IF EXISTS storage_area;
ALTER TABLE buildings DROP COLUMN IF EXISTS pergola_area;
ALTER TABLE buildings DROP COLUMN IF EXISTS balcony_area;