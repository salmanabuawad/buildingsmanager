/*
  # Cleanup orphaned records and add CASCADE DELETE for building deletion

  1. Changes
    - Clean up orphaned records in assets_history that reference non-existent assets
    - Add foreign key constraint on assets_history to cascade delete when asset is deleted
    - This ensures complete data cleanup when a building is deleted

  2. Cascade Flow
    - When building is deleted → assets CASCADE delete (already exists)
    - When assets are deleted → assets_history CASCADE delete (added here)
    - When assets are deleted → asset_files CASCADE delete (already exists)
    - When building is deleted → audit CASCADE delete (already exists)

  3. Important Notes
    - All related data for a building will be permanently removed
    - This prevents orphaned records in the database
    - History records will be deleted along with their parent assets
*/

-- First, delete orphaned records in assets_history that reference non-existent assets
DELETE FROM assets_history
WHERE asset_id NOT IN (SELECT asset_id FROM assets);

-- Add foreign key constraint to assets_history for cascade deletion
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_assets_history_asset_id'
  ) THEN
    ALTER TABLE assets_history DROP CONSTRAINT fk_assets_history_asset_id;
  END IF;

  -- Add new constraint with CASCADE DELETE
  ALTER TABLE assets_history
  ADD CONSTRAINT fk_assets_history_asset_id
  FOREIGN KEY (asset_id) REFERENCES assets(asset_id) ON DELETE CASCADE;
END $$;

-- Add comment explaining the cascade behavior
COMMENT ON CONSTRAINT fk_assets_history_asset_id ON assets_history IS
'Cascade deletes asset history when the parent asset is deleted. Assets cascade delete when buildings are deleted.';