-- Add a unique field combining asset_id and measurement_date (DD/MM/YYYY)
-- This replaces the composite primary key with a single unique field

DO $$
BEGIN
  -- Check if the table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'assets_history'
  ) THEN
    
    -- Add the new combined field if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'assets_history' 
      AND column_name = 'asset_measurement_key'
    ) THEN
      ALTER TABLE assets_history 
      ADD COLUMN asset_measurement_key text;
      
      -- Populate the new field with existing data
      -- Format: asset_id + '_' + measurement_date (DD/MM/YYYY)
      UPDATE assets_history 
      SET asset_measurement_key = asset_id::text || '_' || measurement_date
      WHERE asset_measurement_key IS NULL;
      
      -- Make it NOT NULL after populating
      ALTER TABLE assets_history 
      ALTER COLUMN asset_measurement_key SET NOT NULL;
    END IF;
    
    -- Drop the old composite primary key if it exists
    IF EXISTS (
      SELECT 1 
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'assets_history'
      AND c.contype = 'p'
      AND c.conname = 'assets_history_pkey'
    ) THEN
      ALTER TABLE assets_history DROP CONSTRAINT assets_history_pkey;
    END IF;
    
    -- Create new primary key on the combined field
    IF NOT EXISTS (
      SELECT 1 
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'assets_history'
      AND c.contype = 'p'
      AND c.conname = 'assets_history_pkey'
    ) THEN
      ALTER TABLE assets_history 
      ADD CONSTRAINT assets_history_pkey PRIMARY KEY (asset_measurement_key);
    END IF;
    
    -- Add a trigger to automatically populate the key on insert/update
    CREATE OR REPLACE FUNCTION set_asset_measurement_key()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.asset_measurement_key := NEW.asset_id::text || '_' || NEW.measurement_date;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    
    -- Drop trigger if it exists
    DROP TRIGGER IF EXISTS trigger_set_asset_measurement_key ON assets_history;
    
    -- Create the trigger
    CREATE TRIGGER trigger_set_asset_measurement_key
    BEFORE INSERT OR UPDATE OF asset_id, measurement_date ON assets_history
    FOR EACH ROW
    EXECUTE FUNCTION set_asset_measurement_key();
    
    -- Add comment to document the field
    COMMENT ON COLUMN assets_history.asset_measurement_key IS 
    'Unique key combining asset_id and measurement_date (DD/MM/YYYY format). Format: asset_id_measurement_date (e.g., "100501_01/01/2024"). Automatically populated by trigger.';
    
  END IF;
END $$;

