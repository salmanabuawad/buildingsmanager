/*
  # Refactor Step 5: Remove Redundant Calculated Fields

  1. Columns Removed from buildings table
    - `total_assets` - Can be calculated from COUNT of assets
    - `total_building_area` - Can be calculated from SUM of asset_size
    - `total_area_for_control` - Redundant field

  2. Benefits
    - Reduces data redundancy
    - Eliminates need for complex triggers to maintain calculated fields
    - Simplifies data model
    - Values can be calculated on-demand with SQL queries

  3. Migration Strategy
    - Drop the trigger that maintains these fields first
    - Then drop the columns
    - Frontend will calculate these values when needed

  4. Notes
    - Shared_area and has_elevator are kept (they are NOT calculated fields)
    - These are user-input fields that describe building properties
*/

-- Drop the trigger that updates building totals
DROP TRIGGER IF EXISTS update_building_totals_trigger ON assets;
DROP FUNCTION IF EXISTS update_building_totals();

-- Remove calculated columns from buildings table
ALTER TABLE buildings DROP COLUMN IF EXISTS total_assets;
ALTER TABLE buildings DROP COLUMN IF EXISTS total_building_area;
ALTER TABLE buildings DROP COLUMN IF EXISTS total_area_for_control;