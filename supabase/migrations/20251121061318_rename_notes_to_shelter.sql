/*
  # Rename notes field to shelter
  
  1. Changes
    - Rename 'notes' column to 'shelter' in asset_types table
    - This better reflects the Hebrew CSV column 'מרתף' (shelter/basement)
*/

ALTER TABLE asset_types RENAME COLUMN notes TO shelter;
