/*
  # Add apartment/storage fields and remove floor field
  
  1. Adds new fields to assets table:
     - apartment_number (text)
     - apartment_floor (text)
     - storage_number (text)
     - storage_floor (text)
  
  2. Removes floor field from assets table
  
  3. Adds same fields to assets_history table
  
  4. Removes floor field from assets_history table
*/

-- Add new fields to assets table
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS apartment_number text,
  ADD COLUMN IF NOT EXISTS apartment_floor text,
  ADD COLUMN IF NOT EXISTS storage_number text,
  ADD COLUMN IF NOT EXISTS storage_floor text;

-- Remove floor field from assets table
ALTER TABLE assets DROP COLUMN IF EXISTS floor;

-- Add new fields to assets_history table
ALTER TABLE assets_history
  ADD COLUMN IF NOT EXISTS apartment_number text,
  ADD COLUMN IF NOT EXISTS apartment_floor text,
  ADD COLUMN IF NOT EXISTS storage_number text,
  ADD COLUMN IF NOT EXISTS storage_floor text;

-- Remove floor field from assets_history table
ALTER TABLE assets_history DROP COLUMN IF EXISTS floor;
