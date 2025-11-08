/*
  # Update Apartments Schema

  1. Changes
    - Add new columns to `apartments` table:
      - `apartment_area` (numeric) - דירה - Main apartment area in square meters
      - `storage_area` (numeric) - מחסן - Storage area in square meters
      - `pergola_area` (numeric) - פרגולה - Pergola area in square meters
      - `balcony_area` (numeric) - מרפסת - Balcony area in square meters
      - `total_area` (numeric) - סה"כ - Total area in square meters
    - Remove existing columns:
      - `floor` - Removing floor field
      - `bedrooms` - Removing bedrooms field
      - `bathrooms` - Removing bathrooms field
      - `area_sqft` - Removing area_sqft field
      - `rent_price` - Removing rent price field
      - `is_available` - Removing availability status field
    - Keep only: id, building_id, apartment_number, area fields, created_at
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'apartments' AND column_name = 'apartment_area'
  ) THEN
    ALTER TABLE apartments ADD COLUMN apartment_area numeric(10, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'apartments' AND column_name = 'storage_area'
  ) THEN
    ALTER TABLE apartments ADD COLUMN storage_area numeric(10, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'apartments' AND column_name = 'pergola_area'
  ) THEN
    ALTER TABLE apartments ADD COLUMN pergola_area numeric(10, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'apartments' AND column_name = 'balcony_area'
  ) THEN
    ALTER TABLE apartments ADD COLUMN balcony_area numeric(10, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'apartments' AND column_name = 'total_area'
  ) THEN
    ALTER TABLE apartments ADD COLUMN total_area numeric(10, 2) DEFAULT 0;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'apartments' AND column_name = 'floor'
  ) THEN
    ALTER TABLE apartments DROP COLUMN floor;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'apartments' AND column_name = 'bedrooms'
  ) THEN
    ALTER TABLE apartments DROP COLUMN bedrooms;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'apartments' AND column_name = 'bathrooms'
  ) THEN
    ALTER TABLE apartments DROP COLUMN bathrooms;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'apartments' AND column_name = 'area_sqft'
  ) THEN
    ALTER TABLE apartments DROP COLUMN area_sqft;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'apartments' AND column_name = 'rent_price'
  ) THEN
    ALTER TABLE apartments DROP COLUMN rent_price;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'apartments' AND column_name = 'is_available'
  ) THEN
    ALTER TABLE apartments DROP COLUMN is_available;
  END IF;
END $$;
