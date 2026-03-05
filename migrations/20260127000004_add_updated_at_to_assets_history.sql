-- Add updated_at column to assets_history table if it doesn't exist
-- This fixes the error: column "updated_at" of relation "assets_history" does not exist

ALTER TABLE assets_history
ADD COLUMN IF NOT EXISTS updated_at timestamptz;

COMMENT ON COLUMN assets_history.updated_at IS 'Timestamp when the asset was last updated (copied from assets table)';
