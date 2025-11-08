/*
  # Add drawing file support to apartment measurements

  1. Changes
    - Add `drawing_file_url` column to apartment_measurements table
      - This will store the URL to the drawing/PDF file for each measurement
      - Optional field (nullable)
      - Type: text

  2. Notes
    - Uses the existing dwg-files storage bucket for consistency
    - Each measurement can have its own drawing file
*/

-- Add drawing_file_url column to apartment_measurements
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'apartment_measurements' AND column_name = 'drawing_file_url'
  ) THEN
    ALTER TABLE apartment_measurements ADD COLUMN drawing_file_url text;
  END IF;
END $$;