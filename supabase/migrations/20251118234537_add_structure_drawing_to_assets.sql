/*
  # Add Structure Drawing Support to Assets

  1. Changes
    - Add `structure_drawing_url` column to `assets` table to store the drawing file URL
  
  2. Notes
    - This field will store URLs to structure drawings stored in Supabase Storage
    - The field is optional (nullable) as not all assets may have drawings
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assets' AND column_name = 'structure_drawing_url'
  ) THEN
    ALTER TABLE assets ADD COLUMN structure_drawing_url text;
  END IF;
END $$;