/*
  # Fix apartments schema to match frontend expectations

  1. Changes
    - Rename `total_area` to `total_apartment_area` in apartments table
    - Add `floor` and `garden_area` columns if they don't exist
    - Add `pdf_file_url` column if it doesn't exist
    - Update the generated column formula

  2. Notes
    - This ensures the database schema matches what the frontend expects
    - All changes use IF EXISTS/IF NOT EXISTS to prevent errors
*/

-- First, check if we need to rename total_area to total_apartment_area
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'apartments' AND column_name = 'total_area'
  ) THEN
    -- Drop the generated column first
    ALTER TABLE apartments DROP COLUMN total_area;
    
    -- Add the new column with the correct name
    ALTER TABLE apartments ADD COLUMN total_apartment_area numeric 
      GENERATED ALWAYS AS (apartment_area + storage_area + pergola_area + balcony_area) STORED;
  END IF;
END $$;

-- Add floor column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'apartments' AND column_name = 'floor'
  ) THEN
    ALTER TABLE apartments ADD COLUMN floor integer;
  END IF;
END $$;

-- Add garden_area column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'apartments' AND column_name = 'garden_area'
  ) THEN
    ALTER TABLE apartments ADD COLUMN garden_area numeric DEFAULT 0;
  END IF;
END $$;

-- Add pdf_file_url column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'apartments' AND column_name = 'pdf_file_url'
  ) THEN
    ALTER TABLE apartments ADD COLUMN pdf_file_url text;
  END IF;
END $$;