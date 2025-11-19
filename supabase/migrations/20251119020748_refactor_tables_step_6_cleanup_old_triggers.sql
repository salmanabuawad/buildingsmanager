/*
  # Refactor Step 6: Cleanup Old Triggers

  1. Triggers Removed
    - `trigger_update_building_totals_from_assets` - No longer needed since we removed calculated fields
    - `update_building_totals_from_assets()` function - No longer needed

  2. Rationale
    - The buildings table no longer has calculated fields (total_assets, total_building_area)
    - These values will be calculated on-demand in queries when needed
    - Simplifies the data model and reduces maintenance overhead

  3. Notes
    - This completes the backend refactoring
    - Frontend will need updates to calculate totals on-demand
*/

-- Drop the trigger
DROP TRIGGER IF EXISTS trigger_update_building_totals_from_assets ON assets;

-- Drop the function
DROP FUNCTION IF EXISTS update_building_totals_from_assets();