/*
  # Add unique constraint to unit_types name

  1. Changes
    - Add unique constraint to `name` column in `unit_types` table
    - Ensures no duplicate unit type names can be created
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'unit_types_name_key' 
    AND conrelid = 'unit_types'::regclass
  ) THEN
    ALTER TABLE unit_types ADD CONSTRAINT unit_types_name_key UNIQUE (name);
  END IF;
END $$;