/*
  # Add Building Level Fields to Buildings Table
  
  1. Changes
    - Add fields to buildings table that are marked as building level in asset_type_fields
    - Fields to add: elevator, penthouse (if not already present)
    - Update existing fields if needed
  
  2. Fields from asset_type_fields with is_building_level = true
    - tax_region (already exists)
    - elevator (add as text, similar to asset_types)
    - single_double_family (already exists)
    - penthouse (add as text)
    - condo (already exists)
    - townhouses (already exists)
*/

DO $$
BEGIN
  -- Add elevator field (text) if not exists
  -- Note: buildings table already has has_elevator (boolean), but we need elevator (text) to match asset_types
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buildings' AND column_name = 'elevator'
  ) THEN
    ALTER TABLE buildings ADD COLUMN elevator text;
  END IF;

  -- Add penthouse field if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buildings' AND column_name = 'penthouse'
  ) THEN
    ALTER TABLE buildings ADD COLUMN penthouse text;
  END IF;

  -- Ensure single_double_family exists (should already exist)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buildings' AND column_name = 'single_double_family'
  ) THEN
    ALTER TABLE buildings ADD COLUMN single_double_family text;
  END IF;

  -- Ensure condo exists (should already exist)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buildings' AND column_name = 'condo'
  ) THEN
    ALTER TABLE buildings ADD COLUMN condo text;
  END IF;

  -- Ensure townhouses exists (should already exist)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buildings' AND column_name = 'townhouses'
  ) THEN
    ALTER TABLE buildings ADD COLUMN townhouses text;
  END IF;
END $$;

