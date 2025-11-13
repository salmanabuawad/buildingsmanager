/*
  # Align Assets Table Columns with Frontend

  1. Changes
    - Rename asset_type to main_asset_type
    - Rename asset_size to main_asset_size
    - Rename sub_asset_1 to sub_asset_type_1
    - Rename sub_asset_2 to sub_asset_type_2
    - Rename sub_asset_3 to sub_asset_type_3
    - Rename sub_asset_4 to sub_asset_type_4
    - Rename sub_asset_5 to sub_asset_type_5
    - Add total_size column (numeric, nullable)
    - Ensure all nullable columns accept NULL

  2. Security
    - Maintain existing RLS policies
*/

-- Rename columns to match frontend expectations
ALTER TABLE assets RENAME COLUMN asset_type TO main_asset_type;
ALTER TABLE assets RENAME COLUMN asset_size TO main_asset_size;
ALTER TABLE assets RENAME COLUMN sub_asset_1 TO sub_asset_type_1;
ALTER TABLE assets RENAME COLUMN sub_asset_2 TO sub_asset_type_2;
ALTER TABLE assets RENAME COLUMN sub_asset_3 TO sub_asset_type_3;
ALTER TABLE assets RENAME COLUMN sub_asset_4 TO sub_asset_type_4;
ALTER TABLE assets RENAME COLUMN sub_asset_5 TO sub_asset_type_5;

-- Add total_size column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assets' AND column_name = 'total_size'
  ) THEN
    ALTER TABLE assets ADD COLUMN total_size numeric;
  END IF;
END $$;

-- Make payer_id nullable if not already
ALTER TABLE assets ALTER COLUMN payer_id DROP NOT NULL;

-- Make building_number nullable to accept NULL on import
ALTER TABLE assets ALTER COLUMN building_number DROP NOT NULL;