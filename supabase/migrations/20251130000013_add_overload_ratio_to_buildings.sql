/*
  # Add overload_ratio field to buildings table
  
  1. Changes
    - Add overload_ratio column to buildings table
    - overload_ratio: numeric field representing overload percentage (אחוז העמסה)
    - This field stores the overload ratio as a decimal number
  
  2. Structure
    - overload_ratio: numeric(5,2) (nullable, allows values like 99.99)
    - Field is nullable to allow existing buildings without this value
  
  3. Notes
    - Field represents percentage, so values typically range from 0 to 100+
    - Using numeric(5,2) to allow up to 999.99 with 2 decimal places
*/

-- Add overload_ratio column to buildings table
ALTER TABLE buildings
ADD COLUMN IF NOT EXISTS overload_ratio numeric(5,2);

-- Add comment
COMMENT ON COLUMN buildings.overload_ratio IS 'אחוז העמסה - Overload ratio percentage';

