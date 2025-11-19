/*
  # Revert Step 3: Drop sub_assets Table

  1. Tables Removed
    - `sub_assets` - No longer needed as data is back in assets table

  2. Rationale
    - Data has been successfully migrated back to assets table
    - Reverting to denormalized structure as requested
    - Foreign keys will be automatically dropped with the table

  3. Notes
    - This completes the revert to the original structure
    - All sub-asset data is now in the assets table columns
*/

-- Drop sub_assets table
DROP TABLE IF EXISTS sub_assets CASCADE;