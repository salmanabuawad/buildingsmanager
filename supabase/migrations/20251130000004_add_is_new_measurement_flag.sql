-- Add is_new_measurement flag to assets table
-- This flag indicates that when this record is updated, it should be moved to history
-- Used when creating a new measurement (save as new measurement)

ALTER TABLE assets 
ADD COLUMN IF NOT EXISTS is_new_measurement boolean DEFAULT false;

-- Add comment
COMMENT ON COLUMN assets.is_new_measurement IS 'When true, indicates this is a new measurement. On UPDATE, the old record will be moved to history.';

