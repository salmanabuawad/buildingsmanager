/*
  # Add import_order to assets

  New nullable column `import_order` (bigint) is populated during Excel
  import with a value that preserves the original file row order. The
  assets list sorts by `import_order ASC NULLS LAST, asset_id ASC` so
  imported assets display in the exact order they appeared in the file.

  Existing rows remain NULL and fall back to asset_id ordering.
*/

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS import_order BIGINT;

CREATE INDEX IF NOT EXISTS idx_assets_import_order ON assets(import_order);

COMMENT ON COLUMN assets.import_order IS
  'Preserves Excel import row order. Sort key is (import_order ASC NULLS LAST, asset_id ASC). NULL for assets created outside an Excel import.';

-- Backfill existing records so their current display order is preserved.
-- We use created_at (with asset_id tiebreaker) as the best available proxy
-- for original insertion order. Values 1..N are far below the batchBase used
-- by future imports (Date.now()*10000 ~ 1.76e16), so existing rows always
-- sort before newly imported batches.
UPDATE assets AS a
SET import_order = sub.rn
FROM (
  SELECT asset_id,
         ROW_NUMBER() OVER (ORDER BY created_at ASC NULLS LAST, asset_id ASC) AS rn
  FROM assets
  WHERE import_order IS NULL
) AS sub
WHERE a.asset_id = sub.asset_id
  AND a.import_order IS NULL;
