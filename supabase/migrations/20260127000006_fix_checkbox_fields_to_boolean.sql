/*
  Migration: Fix all checkbox fields to use boolean true/false instead of null
  
  This migration:
  1. Updates all NULL values in checkbox fields to false
  2. Sets NOT NULL constraint with DEFAULT false for all checkbox fields
  3. Ensures all checkbox fields are properly typed as boolean
*/

-- ============================================================================
-- 1. BUILDINGS TABLE - Checkbox fields
-- ============================================================================
-- Update NULL values to false
UPDATE buildings
SET elevator = false WHERE elevator IS NULL;
UPDATE buildings
SET single_double_family = false WHERE single_double_family IS NULL;
UPDATE buildings
SET condo = false WHERE condo IS NULL;
UPDATE buildings
SET townhouses = false WHERE townhouses IS NULL;

-- Set NOT NULL constraint with DEFAULT false
ALTER TABLE buildings
  ALTER COLUMN elevator SET DEFAULT false,
  ALTER COLUMN elevator SET NOT NULL,
  ALTER COLUMN single_double_family SET DEFAULT false,
  ALTER COLUMN single_double_family SET NOT NULL,
  ALTER COLUMN condo SET DEFAULT false,
  ALTER COLUMN condo SET NOT NULL,
  ALTER COLUMN townhouses SET DEFAULT false,
  ALTER COLUMN townhouses SET NOT NULL;

-- Ensure boolean type (convert TEXT to BOOLEAN if needed)
-- Note: These fields are currently TEXT, so we need to convert them
DO $$
BEGIN
  -- Check if elevator is TEXT and convert to BOOLEAN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'buildings' 
    AND column_name = 'elevator' 
    AND data_type = 'text'
  ) THEN
    ALTER TABLE buildings
      ALTER COLUMN elevator TYPE boolean USING (elevator = 'כן' OR elevator = 'true' OR elevator = 'TRUE' OR elevator = '1'),
      ALTER COLUMN elevator SET DEFAULT false,
      ALTER COLUMN elevator SET NOT NULL;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'buildings' 
    AND column_name = 'single_double_family' 
    AND data_type = 'text'
  ) THEN
    ALTER TABLE buildings
      ALTER COLUMN single_double_family TYPE boolean USING (single_double_family = 'כן' OR single_double_family = 'true' OR single_double_family = 'TRUE' OR single_double_family = '1'),
      ALTER COLUMN single_double_family SET DEFAULT false,
      ALTER COLUMN single_double_family SET NOT NULL;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'buildings' 
    AND column_name = 'condo' 
    AND data_type = 'text'
  ) THEN
    ALTER TABLE buildings
      ALTER COLUMN condo TYPE boolean USING (condo = 'כן' OR condo = 'true' OR condo = 'TRUE' OR condo = '1'),
      ALTER COLUMN condo SET DEFAULT false,
      ALTER COLUMN condo SET NOT NULL;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'buildings' 
    AND column_name = 'townhouses' 
    AND data_type = 'text'
  ) THEN
    ALTER TABLE buildings
      ALTER COLUMN townhouses TYPE boolean USING (townhouses = 'כן' OR townhouses = 'true' OR townhouses = 'TRUE' OR townhouses = '1'),
      ALTER COLUMN townhouses SET DEFAULT false,
      ALTER COLUMN townhouses SET NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- 2. ASSETS TABLE - Checkbox fields
-- ============================================================================
-- Update NULL values to false
UPDATE assets
SET elevator = false WHERE elevator IS NULL;
UPDATE assets
SET single_double_family = false WHERE single_double_family IS NULL;
UPDATE assets
SET condo = false WHERE condo IS NULL;
UPDATE assets
SET townhouses = false WHERE townhouses IS NULL;
UPDATE assets
SET penthouse = false WHERE penthouse IS NULL;
UPDATE assets
SET exported_to_automation = false WHERE exported_to_automation IS NULL;
UPDATE assets
SET is_new_measurement = false WHERE is_new_measurement IS NULL;
UPDATE assets
SET data_from_automation = false WHERE data_from_automation IS NULL;

-- Set NOT NULL constraint with DEFAULT false
ALTER TABLE assets
  ALTER COLUMN exported_to_automation SET DEFAULT false,
  ALTER COLUMN exported_to_automation SET NOT NULL,
  ALTER COLUMN is_new_measurement SET DEFAULT false,
  ALTER COLUMN is_new_measurement SET NOT NULL,
  ALTER COLUMN data_from_automation SET DEFAULT false,
  ALTER COLUMN data_from_automation SET NOT NULL;

-- Convert TEXT fields to BOOLEAN
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'assets' 
    AND column_name = 'elevator' 
    AND data_type = 'text'
  ) THEN
    ALTER TABLE assets
      ALTER COLUMN elevator TYPE boolean USING (elevator = 'כן' OR elevator = 'true' OR elevator = 'TRUE' OR elevator = '1'),
      ALTER COLUMN elevator SET DEFAULT false,
      ALTER COLUMN elevator SET NOT NULL;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'assets' 
    AND column_name = 'single_double_family' 
    AND data_type = 'text'
  ) THEN
    ALTER TABLE assets
      ALTER COLUMN single_double_family TYPE boolean USING (single_double_family = 'כן' OR single_double_family = 'true' OR single_double_family = 'TRUE' OR single_double_family = '1'),
      ALTER COLUMN single_double_family SET DEFAULT false,
      ALTER COLUMN single_double_family SET NOT NULL;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'assets' 
    AND column_name = 'condo' 
    AND data_type = 'text'
  ) THEN
    ALTER TABLE assets
      ALTER COLUMN condo TYPE boolean USING (condo = 'כן' OR condo = 'true' OR condo = 'TRUE' OR condo = '1'),
      ALTER COLUMN condo SET DEFAULT false,
      ALTER COLUMN condo SET NOT NULL;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'assets' 
    AND column_name = 'townhouses' 
    AND data_type = 'text'
  ) THEN
    ALTER TABLE assets
      ALTER COLUMN townhouses TYPE boolean USING (townhouses = 'כן' OR townhouses = 'true' OR townhouses = 'TRUE' OR townhouses = '1'),
      ALTER COLUMN townhouses SET DEFAULT false,
      ALTER COLUMN townhouses SET NOT NULL;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'assets' 
    AND column_name = 'penthouse' 
    AND data_type = 'text'
  ) THEN
    ALTER TABLE assets
      ALTER COLUMN penthouse TYPE boolean USING (penthouse = 'כן' OR penthouse = 'true' OR penthouse = 'TRUE' OR penthouse = '1'),
      ALTER COLUMN penthouse SET DEFAULT false,
      ALTER COLUMN penthouse SET NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- 3. ASSETS_HISTORY TABLE - Checkbox fields
-- ============================================================================
-- Update NULL values to false
UPDATE assets_history
SET elevator = false WHERE elevator IS NULL;
UPDATE assets_history
SET single_double_family = false WHERE single_double_family IS NULL;
UPDATE assets_history
SET condo = false WHERE condo IS NULL;
UPDATE assets_history
SET townhouses = false WHERE townhouses IS NULL;
UPDATE assets_history
SET penthouse = false WHERE penthouse IS NULL;
UPDATE assets_history
SET exported_to_automation = false WHERE exported_to_automation IS NULL;
UPDATE assets_history
SET data_from_automation = false WHERE data_from_automation IS NULL;

-- Set NOT NULL constraint with DEFAULT false
ALTER TABLE assets_history
  ALTER COLUMN exported_to_automation SET DEFAULT false,
  ALTER COLUMN exported_to_automation SET NOT NULL,
  ALTER COLUMN data_from_automation SET DEFAULT false,
  ALTER COLUMN data_from_automation SET NOT NULL;

-- Convert TEXT fields to BOOLEAN
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'assets_history' 
    AND column_name = 'elevator' 
    AND data_type = 'text'
  ) THEN
    ALTER TABLE assets_history
      ALTER COLUMN elevator TYPE boolean USING (elevator = 'כן' OR elevator = 'true' OR elevator = 'TRUE' OR elevator = '1'),
      ALTER COLUMN elevator SET DEFAULT false,
      ALTER COLUMN elevator SET NOT NULL;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'assets_history' 
    AND column_name = 'single_double_family' 
    AND data_type = 'text'
  ) THEN
    ALTER TABLE assets_history
      ALTER COLUMN single_double_family TYPE boolean USING (single_double_family = 'כן' OR single_double_family = 'true' OR single_double_family = 'TRUE' OR single_double_family = '1'),
      ALTER COLUMN single_double_family SET DEFAULT false,
      ALTER COLUMN single_double_family SET NOT NULL;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'assets_history' 
    AND column_name = 'condo' 
    AND data_type = 'text'
  ) THEN
    ALTER TABLE assets_history
      ALTER COLUMN condo TYPE boolean USING (condo = 'כן' OR condo = 'true' OR condo = 'TRUE' OR condo = '1'),
      ALTER COLUMN condo SET DEFAULT false,
      ALTER COLUMN condo SET NOT NULL;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'assets_history' 
    AND column_name = 'townhouses' 
    AND data_type = 'text'
  ) THEN
    ALTER TABLE assets_history
      ALTER COLUMN townhouses TYPE boolean USING (townhouses = 'כן' OR townhouses = 'true' OR townhouses = 'TRUE' OR townhouses = '1'),
      ALTER COLUMN townhouses SET DEFAULT false,
      ALTER COLUMN townhouses SET NOT NULL;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'assets_history' 
    AND column_name = 'penthouse' 
    AND data_type = 'text'
  ) THEN
    ALTER TABLE assets_history
      ALTER COLUMN penthouse TYPE boolean USING (penthouse = 'כן' OR penthouse = 'true' OR penthouse = 'TRUE' OR penthouse = '1'),
      ALTER COLUMN penthouse SET DEFAULT false,
      ALTER COLUMN penthouse SET NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- 4. ASSET_TYPES TABLE - Checkbox fields
-- ============================================================================
-- Update NULL values to false (except use_shared_area which can be NULL)
UPDATE asset_types
SET active = false WHERE active IS NULL;
UPDATE asset_types
SET elevator = false WHERE elevator IS NULL;
UPDATE asset_types
SET single_double_family = false WHERE single_double_family IS NULL;
UPDATE asset_types
SET condo = false WHERE condo IS NULL;
UPDATE asset_types
SET townhouses = false WHERE townhouses IS NULL;
UPDATE asset_types
SET penthouse = false WHERE penthouse IS NULL;
UPDATE asset_types
SET non_accountable_for_total_area = false WHERE non_accountable_for_total_area IS NULL;
UPDATE asset_types
SET non_accountable_for_distribution = false WHERE non_accountable_for_distribution IS NULL;
UPDATE asset_types
SET not_accountable_for_statistics = false WHERE not_accountable_for_statistics IS NULL;
-- use_shared_area can remain NULL (it's a special case)

-- Set NOT NULL constraint with DEFAULT false
ALTER TABLE asset_types
  ALTER COLUMN active SET DEFAULT true,
  ALTER COLUMN active SET NOT NULL,
  ALTER COLUMN non_accountable_for_total_area SET DEFAULT false,
  ALTER COLUMN non_accountable_for_total_area SET NOT NULL,
  ALTER COLUMN non_accountable_for_distribution SET DEFAULT false,
  ALTER COLUMN non_accountable_for_distribution SET NOT NULL,
  ALTER COLUMN not_accountable_for_statistics SET DEFAULT false,
  ALTER COLUMN not_accountable_for_statistics SET NOT NULL;

-- Convert TEXT fields to BOOLEAN
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'asset_types' 
    AND column_name = 'elevator' 
    AND data_type = 'text'
  ) THEN
    ALTER TABLE asset_types
      ALTER COLUMN elevator TYPE boolean USING (elevator = 'כן' OR elevator = 'true' OR elevator = 'TRUE' OR elevator = '1'),
      ALTER COLUMN elevator SET DEFAULT false,
      ALTER COLUMN elevator SET NOT NULL;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'asset_types' 
    AND column_name = 'single_double_family' 
    AND data_type = 'text'
  ) THEN
    ALTER TABLE asset_types
      ALTER COLUMN single_double_family TYPE boolean USING (single_double_family = 'כן' OR single_double_family = 'true' OR single_double_family = 'TRUE' OR single_double_family = '1'),
      ALTER COLUMN single_double_family SET DEFAULT false,
      ALTER COLUMN single_double_family SET NOT NULL;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'asset_types' 
    AND column_name = 'condo' 
    AND data_type = 'text'
  ) THEN
    ALTER TABLE asset_types
      ALTER COLUMN condo TYPE boolean USING (condo = 'כן' OR condo = 'true' OR condo = 'TRUE' OR condo = '1'),
      ALTER COLUMN condo SET DEFAULT false,
      ALTER COLUMN condo SET NOT NULL;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'asset_types' 
    AND column_name = 'townhouses' 
    AND data_type = 'text'
  ) THEN
    ALTER TABLE asset_types
      ALTER COLUMN townhouses TYPE boolean USING (townhouses = 'כן' OR townhouses = 'true' OR townhouses = 'TRUE' OR townhouses = '1'),
      ALTER COLUMN townhouses SET DEFAULT false,
      ALTER COLUMN townhouses SET NOT NULL;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'asset_types' 
    AND column_name = 'penthouse' 
    AND data_type = 'text'
  ) THEN
    ALTER TABLE asset_types
      ALTER COLUMN penthouse TYPE boolean USING (penthouse = 'כן' OR penthouse = 'true' OR penthouse = 'TRUE' OR penthouse = '1'),
      ALTER COLUMN penthouse SET DEFAULT false,
      ALTER COLUMN penthouse SET NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN buildings.elevator IS 'מעלית - Boolean checkbox (true/false, not null)';
COMMENT ON COLUMN buildings.single_double_family IS 'בית פרטי - Boolean checkbox (true/false, not null)';
COMMENT ON COLUMN buildings.condo IS 'בית משותף - Boolean checkbox (true/false, not null)';
COMMENT ON COLUMN buildings.townhouses IS 'טוריים - Boolean checkbox (true/false, not null)';
COMMENT ON COLUMN assets.elevator IS 'מעלית - Boolean checkbox (true/false, not null)';
COMMENT ON COLUMN assets.single_double_family IS 'בית פרטי - Boolean checkbox (true/false, not null)';
COMMENT ON COLUMN assets.condo IS 'בית משותף - Boolean checkbox (true/false, not null)';
COMMENT ON COLUMN assets.townhouses IS 'טוריים - Boolean checkbox (true/false, not null)';
COMMENT ON COLUMN assets.penthouse IS 'דירת גג - Boolean checkbox (true/false, not null)';
