/*
  # Add Building Attributes

  1. Changes
    - Add new columns to `buildings` table:
      - `apartment_area` (numeric) - דירה - Main apartment area in square meters
      - `storage_area` (numeric) - מחסן - Storage area in square meters
      - `pergola_area` (numeric) - פרגולה - Pergola area in square meters
      - `balcony_area` (numeric) - מרפסת - Balcony area in square meters
      - `total_building_area` (numeric) - סה"כ-מבנה - Total building area in square meters
    - All new columns default to 0
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buildings' AND column_name = 'apartment_area'
  ) THEN
    ALTER TABLE buildings ADD COLUMN apartment_area numeric(10, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buildings' AND column_name = 'storage_area'
  ) THEN
    ALTER TABLE buildings ADD COLUMN storage_area numeric(10, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buildings' AND column_name = 'pergola_area'
  ) THEN
    ALTER TABLE buildings ADD COLUMN pergola_area numeric(10, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buildings' AND column_name = 'balcony_area'
  ) THEN
    ALTER TABLE buildings ADD COLUMN balcony_area numeric(10, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buildings' AND column_name = 'total_building_area'
  ) THEN
    ALTER TABLE buildings ADD COLUMN total_building_area numeric(10, 2) DEFAULT 0;
  END IF;
END $$;
