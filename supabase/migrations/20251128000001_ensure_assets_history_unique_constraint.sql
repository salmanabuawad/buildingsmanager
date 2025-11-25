-- Ensure assets_history has unique constraint on (asset_id, measurement_date)
-- This ensures no duplicate historical records for the same asset with the same measurement date

-- Check if the table exists first
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'assets_history'
  ) THEN
    -- Check if primary key exists with correct columns
    IF NOT EXISTS (
      SELECT 1 
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'assets_history'
      AND c.contype = 'p'
      AND array_length(c.conkey, 1) = 2
      AND EXISTS (
        SELECT 1 
        FROM pg_attribute a1, pg_attribute a2
        WHERE a1.attrelid = c.conrelid 
        AND a1.attnum = c.conkey[1]
        AND a1.attname = 'asset_id'
        AND a2.attrelid = c.conrelid 
        AND a2.attnum = c.conkey[2]
        AND a2.attname = 'measurement_date'
      )
    ) THEN
      -- Drop existing primary key if it exists but is different
      IF EXISTS (
        SELECT 1 
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'assets_history'
        AND c.contype = 'p'
      ) THEN
        ALTER TABLE assets_history DROP CONSTRAINT assets_history_pkey;
      END IF;
      
      -- Add the correct primary key constraint
      ALTER TABLE assets_history 
      ADD CONSTRAINT assets_history_pkey PRIMARY KEY (asset_id, measurement_date);
    END IF;
  END IF;
END $$;

-- Add comment to document the constraint
COMMENT ON CONSTRAINT assets_history_pkey ON assets_history IS 
'Primary key ensuring unique combination of asset_id and measurement_date (DD/MM/YYYY format, text field with no time component). Prevents duplicate historical records for the same asset with the same measurement date.';

