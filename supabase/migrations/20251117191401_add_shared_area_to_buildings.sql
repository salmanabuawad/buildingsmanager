/*
  # Add Shared Area to Buildings

  1. Purpose
    - Add a new field to track shared area for each building
    
  2. Changes
    - Add shared_area column to building table as numeric type
    - Set default value to 0
    - Column is nullable to allow buildings without shared area
    
  3. Notes
    - Shared area represents common spaces in the building
    - This is independent of the total building area calculation
*/

-- Add shared_area column to building table
ALTER TABLE building 
ADD COLUMN IF NOT EXISTS shared_area NUMERIC(10, 2) DEFAULT 0;

-- Add comment to explain the column
COMMENT ON COLUMN building.shared_area IS 'Shared/common area in the building (שטח משותף)';
