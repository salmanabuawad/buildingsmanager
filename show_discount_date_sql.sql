/*
  # Add discount date and floor columns to assets table
  
  תאריך הנחה (Discount Date) and קומה (Floor) - SQL for adding these fields
  
  Columns:
  - floor: קומה (Floor number) - SMALLINT with CHECK constraint (>= -99 AND <= 99)
  - discount_type: סוג הנחה (Discount type)
  - discount_date_from: תאריך הנחה מ (Discount date from)  
  - discount_date_to: תאריך הנחה עד (Discount date to)
*/

DO $$
BEGIN
  -- Add floor column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assets' AND column_name = 'floor'
  ) THEN
    ALTER TABLE assets ADD COLUMN floor SMALLINT;
    ALTER TABLE assets ADD CONSTRAINT check_floor_range 
      CHECK (floor IS NULL OR (floor >= -99 AND floor <= 99));
    COMMENT ON COLUMN assets.floor IS 'קומה - Floor number (2 digits, allows negative for basements)';
  END IF;

  -- Add discount_type column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assets' AND column_name = 'discount_type'
  ) THEN
    ALTER TABLE assets ADD COLUMN discount_type TEXT;
    COMMENT ON COLUMN assets.discount_type IS 'סוג הנחה - Discount type';
  END IF;

  -- Add discount_date_from column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assets' AND column_name = 'discount_date_from'
  ) THEN
    ALTER TABLE assets ADD COLUMN discount_date_from TEXT;
    COMMENT ON COLUMN assets.discount_date_from IS 'תאריך הנחה מ - Discount date from';
  END IF;

  -- Add discount_date_to column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assets' AND column_name = 'discount_date_to'
  ) THEN
    ALTER TABLE assets ADD COLUMN discount_date_to TEXT;
    COMMENT ON COLUMN assets.discount_date_to IS 'תאריך הנחה עד - Discount date to';
  END IF;
END $$;

-- Query examples for קומה (Floor) and תאריך הנחה (Discount Date):

-- Select assets with floor information
SELECT 
  asset_id,
  floor,
  building_number
FROM assets
WHERE floor IS NOT NULL
ORDER BY floor;

-- Select assets by floor range (including basements)
SELECT 
  asset_id,
  floor,
  building_number
FROM assets
WHERE floor BETWEEN -5 AND 10
ORDER BY floor DESC;

-- Select assets with discount dates
SELECT 
  asset_id,
  discount_type,
  discount_date_from,
  discount_date_to
FROM assets
WHERE discount_date_from IS NOT NULL 
   OR discount_date_to IS NOT NULL;

-- Select assets with active discounts (if dates are in DD/MM/YYYY format)
-- Note: This example assumes you have a function to parse DD/MM/YYYY dates
SELECT 
  asset_id,
  discount_type,
  discount_date_from,
  discount_date_to
FROM assets
WHERE discount_date_from IS NOT NULL 
  AND discount_date_to IS NOT NULL
  AND TO_DATE(discount_date_from, 'DD/MM/YYYY') <= CURRENT_DATE
  AND TO_DATE(discount_date_to, 'DD/MM/YYYY') >= CURRENT_DATE;

-- Combined query: Select assets with floor and discount information
SELECT 
  asset_id,
  floor,
  discount_type,
  discount_date_from,
  discount_date_to,
  building_number
FROM assets
WHERE floor IS NOT NULL 
   OR discount_date_from IS NOT NULL
   OR discount_date_to IS NOT NULL
ORDER BY floor NULLS LAST, discount_date_from;

