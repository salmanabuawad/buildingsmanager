/*
  # Add CASCADE DELETE from buildings to assets

  1. Changes
    - Add foreign key constraint on assets.building_number to cascade delete when building is deleted
    - This ensures complete data cleanup when a building is deleted

  2. Complete Cascade Flow
    - When building is deleted:
      → assets CASCADE delete
        → assets_history CASCADE delete (via fk_assets_history_asset_id)
        → asset_files CASCADE delete (via existing foreign key)

  3. Audit Records
    - Audit records are kept as historical logs and not deleted with buildings
    - They use entity_id (text) to reference buildings/assets, not a foreign key
    - This preserves audit trail even after entities are deleted

  4. Important Notes
    - All asset data for a building will be permanently removed
    - This prevents orphaned records in the database
    - Orphaned assets (referencing non-existent buildings) will be cleaned up first
*/

-- Clean up orphaned records in assets that reference non-existent buildings
DELETE FROM assets
WHERE building_number NOT IN (SELECT building_number FROM buildings);

-- Add foreign key constraint on assets for cascade deletion
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_assets_building_number'
  ) THEN
    ALTER TABLE assets DROP CONSTRAINT fk_assets_building_number;
  END IF;

  -- Add new constraint with CASCADE DELETE
  ALTER TABLE assets
  ADD CONSTRAINT fk_assets_building_number
  FOREIGN KEY (building_number) REFERENCES buildings(building_number) ON DELETE CASCADE;
END $$;

-- Add comment explaining the cascade behavior
COMMENT ON CONSTRAINT fk_assets_building_number ON assets IS
'Cascade deletes all assets (and their history and files) when the parent building is deleted.';