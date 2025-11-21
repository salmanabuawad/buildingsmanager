/*
  # Add elevator text field to buildings table

  1. Changes
    - Add `elevator` text column to buildings table to match asset_types table
    - Populate elevator based on has_elevator boolean value
    - Keep has_elevator for backward compatibility
  
  2. Notes
    - Buildings will now have both has_elevator (boolean) and elevator (text)
    - elevator will contain 'כן' or 'לא' to match asset_types format
*/

-- Add elevator column to buildings
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS elevator text;

-- Populate elevator column based on has_elevator
UPDATE buildings
SET elevator = CASE
  WHEN has_elevator = true THEN 'כן'
  WHEN has_elevator = false THEN 'לא'
  ELSE NULL
END
WHERE elevator IS NULL;
