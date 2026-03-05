/*
  # Rename area_from_distribution to business_distribution_area

  Local DBs that ran the 20251220/20260126 rename have area_from_distribution.
  All later functions (save_assets_bulk_transactional, update_asset_business_total_area, etc.)
  and Python code expect business_distribution_area.

  This migration aligns local DB with functions and Supabase schema.
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'area_from_distribution'
  ) THEN
    ALTER TABLE assets RENAME COLUMN area_from_distribution TO business_distribution_area;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assets_history' AND column_name = 'area_from_distribution'
  ) THEN
    ALTER TABLE assets_history RENAME COLUMN area_from_distribution TO business_distribution_area;
  END IF;
END $$;

COMMENT ON COLUMN assets.business_distribution_area IS 'Area distributed to this asset from shared area distribution (business or residence, depending on asset type)';
COMMENT ON COLUMN assets_history.business_distribution_area IS 'Area distributed to this asset from shared area distribution - historical record';
