-- Add note column to buildings table for free-text notes
ALTER TABLE buildings
ADD COLUMN IF NOT EXISTS note TEXT;

COMMENT ON COLUMN buildings.note IS 'Free-text note for the building (הערות)';
