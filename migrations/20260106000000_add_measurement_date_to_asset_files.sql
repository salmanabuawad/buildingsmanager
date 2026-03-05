/*
  # Add measurement_date to asset_files table
  
  This migration:
  1. Adds measurement_date column to asset_files table (nullable for backward compatibility)
  2. Sets measurement_date to NULL for existing files (they belong to all measurements)
  3. Creates index for efficient querying by asset_id and measurement_date
*/

-- Add measurement_date column
ALTER TABLE asset_files 
ADD COLUMN IF NOT EXISTS measurement_date TEXT;

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_asset_files_asset_id_measurement_date 
ON asset_files(asset_id, measurement_date);

-- Add comment
COMMENT ON COLUMN asset_files.measurement_date IS 'Measurement date this file belongs to (NULL = belongs to all measurements, for backward compatibility)';

