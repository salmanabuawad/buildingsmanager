/*
  # Add total_area_for_control field to buildings table

  1. Changes
    - Add `total_area_for_control` column to `buildings` table
      - Type: numeric
      - Nullable: true (allows NULL values)
      - Default: NULL
  
  2. Notes
    - This field will store control area calculations for buildings
    - Field is editable and will be displayed in the buildings grid
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buildings' AND column_name = 'total_area_for_control'
  ) THEN
    ALTER TABLE buildings ADD COLUMN total_area_for_control numeric;
  END IF;
END $$;