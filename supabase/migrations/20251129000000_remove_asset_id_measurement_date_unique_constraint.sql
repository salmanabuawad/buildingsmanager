-- Remove unique constraint on (asset_id, measurement_date) from assets_history table
-- This allows multiple records with the same asset_id and measurement_date combination

DO $$
BEGIN
  -- Check if the table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'assets_history'
  ) THEN
    
    -- Drop the primary key constraint if it's on (asset_id, measurement_date)
    IF EXISTS (
      SELECT 1 
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'assets_history'
      AND c.contype = 'p'
      AND c.conname = 'assets_history_pkey'
      AND EXISTS (
        SELECT 1 
        FROM pg_attribute a1, pg_attribute a2
        WHERE a1.attrelid = c.conrelid 
        AND a1.attnum = c.conkey[1]
        AND a1.attname = 'asset_id'
        AND a2.attrelid = c.conrelid 
        AND a2.attnum = c.conkey[2]
        AND a2.attname = 'measurement_date'
        AND array_length(c.conkey, 1) = 2
      )
    ) THEN
      ALTER TABLE assets_history DROP CONSTRAINT assets_history_pkey;
    END IF;
    
    -- Drop the primary key constraint if it's on asset_measurement_key
    -- (since asset_measurement_key is generated from asset_id + measurement_date, it enforces uniqueness)
    IF EXISTS (
      SELECT 1 
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE t.relname = 'assets_history'
      AND c.contype = 'p'
      AND c.conname = 'assets_history_pkey'
      AND a.attname = 'asset_measurement_key'
    ) THEN
      ALTER TABLE assets_history DROP CONSTRAINT assets_history_pkey;
    END IF;
    
    -- Drop the trigger that generates asset_measurement_key (since we don't need uniqueness anymore)
    DROP TRIGGER IF EXISTS trigger_set_asset_measurement_key ON assets_history;
    
    -- Drop the function if it exists
    DROP FUNCTION IF EXISTS set_asset_measurement_key();
    
    -- Make asset_measurement_key nullable and non-unique (or we can drop it entirely)
    -- For now, let's keep it but make it nullable and remove uniqueness
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'assets_history' 
      AND column_name = 'asset_measurement_key'
    ) THEN
      -- Make it nullable
      ALTER TABLE assets_history 
      ALTER COLUMN asset_measurement_key DROP NOT NULL;
      
      -- Drop any unique index on asset_measurement_key
      DROP INDEX IF EXISTS idx_assets_history_unique_key;
    END IF;
    
    -- Set primary key to id if id column exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'assets_history' 
      AND column_name = 'id'
    ) THEN
      -- Check if primary key already exists on id
      IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'assets_history'
        AND c.contype = 'p'
        AND c.conname = 'assets_history_pkey'
      ) THEN
        ALTER TABLE assets_history 
        ADD CONSTRAINT assets_history_pkey PRIMARY KEY (id);
      END IF;
    END IF;
    
    -- Drop any unique constraints on (asset_id, measurement_date) if they exist
    DO $$
    DECLARE
      constraint_rec RECORD;
    BEGIN
      FOR constraint_rec IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'assets_history'
        AND c.contype = 'u'
        AND EXISTS (
          SELECT 1 
          FROM pg_attribute a1, pg_attribute a2
          WHERE a1.attrelid = c.conrelid 
          AND a1.attnum = ANY(c.conkey)
          AND a1.attname = 'asset_id'
          AND a2.attrelid = c.conrelid 
          AND a2.attnum = ANY(c.conkey)
          AND a2.attname = 'measurement_date'
          AND array_length(c.conkey, 1) = 2
        )
      LOOP
        EXECUTE format('ALTER TABLE assets_history DROP CONSTRAINT %I', constraint_rec.conname);
      END LOOP;
    END $$;
    
  END IF;
END $$;

-- Update the trigger function to remove ON CONFLICT clause since we no longer have unique constraint
CREATE OR REPLACE FUNCTION copy_asset_to_history()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if key fields have changed
  IF (OLD.asset_id IS DISTINCT FROM NEW.asset_id) OR
     (OLD.measurement_date IS DISTINCT FROM NEW.measurement_date) OR
     (OLD.building_number IS DISTINCT FROM NEW.building_number) THEN
    
    -- Copy old record to history (no ON CONFLICT since we allow duplicates)
    INSERT INTO assets_history (
      id, building_number, payer_id, asset_id, measurement_date,
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
      OLD.id, OLD.building_number, OLD.payer_id, OLD.asset_id, OLD.measurement_date,
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
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add comment to document the change
COMMENT ON TABLE assets_history IS 'Historical asset measurements. Multiple records can exist for the same asset_id and measurement_date combination. No unique constraint on (asset_id, measurement_date).';

