-- Add shared_parking_area to assets and assets_history.
-- Apply this and the following 20260225* migrations only after syncing with DB.
ALTER TABLE assets ADD COLUMN IF NOT EXISTS shared_parking_area NUMERIC;
ALTER TABLE assets_history ADD COLUMN IF NOT EXISTS shared_parking_area NUMERIC;
COMMENT ON COLUMN assets.shared_parking_area IS 'Per-asset shared parking area from building';
