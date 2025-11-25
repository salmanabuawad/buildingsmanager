-- Update the copy_asset_to_history trigger function to:
-- 1. Remove 'id' from INSERT so database generates new unique id
-- 2. Always copy to history on UPDATE (not just when specific fields change)
-- 3. Also handle DELETE to copy to history before deletion
-- 4. Remove ALL unique constraints and primary key from assets_history table

DO $$
DECLARE
  constraint_rec RECORD;
BEGIN
  -- Drop primary key constraint if it exists (regardless of which column it's on)
  IF EXISTS (
    SELECT 1 
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'assets_history'
    AND c.contype = 'p'
    AND c.conname = 'assets_history_pkey'
  ) THEN
    ALTER TABLE assets_history DROP CONSTRAINT assets_history_pkey;
    RAISE NOTICE 'Dropped primary key constraint from assets_history';
  END IF;
  
  -- Drop all unique constraints
  FOR constraint_rec IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'assets_history'
    AND c.contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE assets_history DROP CONSTRAINT %I', constraint_rec.conname);
    RAISE NOTICE 'Dropped unique constraint % from assets_history', constraint_rec.conname;
  END LOOP;
  
  -- Drop any unique indexes
  FOR constraint_rec IN
    SELECT indexname
    FROM pg_indexes
    WHERE tablename = 'assets_history'
    AND indexdef LIKE '%UNIQUE%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', constraint_rec.indexname);
    RAISE NOTICE 'Dropped unique index % from assets_history', constraint_rec.indexname;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION copy_asset_to_history()
RETURNS TRIGGER AS $$
BEGIN
  -- For UPDATE: always copy old record to history before update
  IF TG_OP = 'UPDATE' THEN
    -- Copy old record to history (without id so database generates new unique id)
    INSERT INTO assets_history (
      building_number, payer_id, asset_id, measurement_date,
      main_asset_type, asset_size,
      sub_asset_type_1, sub_asset_size_1,
      sub_asset_type_2, sub_asset_size_2,
      sub_asset_type_3, sub_asset_size_3,
      sub_asset_type_4, sub_asset_size_4,
      sub_asset_type_5, sub_asset_size_5,
      sub_asset_type_6, sub_asset_size_6,
      structure_drawing_url, created_at, updated_at,
      elevator, single_double_family, condo, townhouses, basement, penthouse
    ) VALUES (
      OLD.building_number, OLD.payer_id, OLD.asset_id, OLD.measurement_date,
      OLD.main_asset_type, OLD.asset_size,
      OLD.sub_asset_type_1, OLD.sub_asset_size_1,
      OLD.sub_asset_type_2, OLD.sub_asset_size_2,
      OLD.sub_asset_type_3, OLD.sub_asset_size_3,
      OLD.sub_asset_type_4, OLD.sub_asset_size_4,
      OLD.sub_asset_type_5, OLD.sub_asset_size_5,
      OLD.sub_asset_type_6, OLD.sub_asset_size_6,
      OLD.structure_drawing_url, OLD.created_at, OLD.updated_at,
      OLD.elevator, OLD.single_double_family, OLD.condo, OLD.townhouses, OLD.basement, OLD.penthouse
    );
  END IF;
  
  -- For DELETE: copy record to history before deletion
  IF TG_OP = 'DELETE' THEN
    INSERT INTO assets_history (
      building_number, payer_id, asset_id, measurement_date,
      main_asset_type, asset_size,
      sub_asset_type_1, sub_asset_size_1,
      sub_asset_type_2, sub_asset_size_2,
      sub_asset_type_3, sub_asset_size_3,
      sub_asset_type_4, sub_asset_size_4,
      sub_asset_type_5, sub_asset_size_5,
      sub_asset_type_6, sub_asset_size_6,
      structure_drawing_url, created_at, updated_at,
      elevator, single_double_family, condo, townhouses, basement, penthouse
    ) VALUES (
      OLD.building_number, OLD.payer_id, OLD.asset_id, OLD.measurement_date,
      OLD.main_asset_type, OLD.asset_size,
      OLD.sub_asset_type_1, OLD.sub_asset_size_1,
      OLD.sub_asset_type_2, OLD.sub_asset_size_2,
      OLD.sub_asset_type_3, OLD.sub_asset_size_3,
      OLD.sub_asset_type_4, OLD.sub_asset_size_4,
      OLD.sub_asset_type_5, OLD.sub_asset_size_5,
      OLD.sub_asset_type_6, OLD.sub_asset_size_6,
      OLD.structure_drawing_url, OLD.created_at, OLD.updated_at,
      OLD.elevator, OLD.single_double_family, OLD.condo, OLD.townhouses, OLD.basement, OLD.penthouse
    );
    RETURN OLD;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update trigger to fire on UPDATE
DROP TRIGGER IF EXISTS copy_asset_to_history_trigger ON assets;
CREATE TRIGGER copy_asset_to_history_trigger
  BEFORE UPDATE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION copy_asset_to_history();

-- Also create trigger for DELETE
DROP TRIGGER IF EXISTS copy_asset_to_history_delete_trigger ON assets;
CREATE TRIGGER copy_asset_to_history_delete_trigger
  BEFORE DELETE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION copy_asset_to_history();

-- Add comment
COMMENT ON FUNCTION copy_asset_to_history() IS 'Copies asset records to assets_history before UPDATE or DELETE. Does not include id field so database generates new unique id for each history record.';

