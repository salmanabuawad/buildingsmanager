-- Add note column to buildings table
-- This is a text field for general notes about the building

ALTER TABLE buildings
ADD COLUMN IF NOT EXISTS note TEXT;

COMMENT ON COLUMN buildings.note IS 'General notes about the building';
