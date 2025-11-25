-- Add active field to asset_types table
-- This field indicates whether an asset type is active (yes/no)

ALTER TABLE asset_types 
ADD COLUMN IF NOT EXISTS active TEXT DEFAULT 'כן';

-- Add comment
COMMENT ON COLUMN asset_types.active IS 'Indicates if the asset type is active. Values: "כן" (yes) or NULL (no)';

