/*
  # Refactor Step 4: Add Foreign Key Constraints

  1. Foreign Keys Added
    - Add FK from `assets` to `buildings` on building_number
    - Add FK from `sub_assets` to `assets` on (asset_id, building_number, measurement_date)
    - Add FK from `sub_assets` to `buildings` on building_number

  2. Referential Integrity
    - Ensures assets cannot reference non-existent buildings
    - Ensures sub_assets cannot reference non-existent assets
    - Cascading deletes: when asset is deleted, its sub-assets are deleted
    - Cascading deletes: when building is deleted, its assets and sub-assets are deleted

  3. Notes
    - Uses ON DELETE CASCADE for proper cleanup
    - Uses ON UPDATE CASCADE to maintain referential integrity
    - Existing data must satisfy constraints (already validated)
*/

-- Add foreign key from assets to buildings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_assets_building_number'
    AND table_name = 'assets'
  ) THEN
    ALTER TABLE assets
    ADD CONSTRAINT fk_assets_building_number
    FOREIGN KEY (building_number)
    REFERENCES buildings(building_number)
    ON DELETE CASCADE
    ON UPDATE CASCADE;
  END IF;
END $$;

-- Add foreign key from sub_assets to buildings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_sub_assets_building_number'
    AND table_name = 'sub_assets'
  ) THEN
    ALTER TABLE sub_assets
    ADD CONSTRAINT fk_sub_assets_building_number
    FOREIGN KEY (building_number)
    REFERENCES buildings(building_number)
    ON DELETE CASCADE
    ON UPDATE CASCADE;
  END IF;
END $$;

-- Add foreign key from sub_assets to assets (composite key)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_sub_assets_asset'
    AND table_name = 'sub_assets'
  ) THEN
    ALTER TABLE sub_assets
    ADD CONSTRAINT fk_sub_assets_asset
    FOREIGN KEY (asset_id, building_number, measurement_date)
    REFERENCES assets(asset_id, building_number, measurement_date)
    ON DELETE CASCADE
    ON UPDATE CASCADE;
  END IF;
END $$;