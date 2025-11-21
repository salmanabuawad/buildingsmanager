/*
  # Remove Condition Fields from Asset Types
  
  1. Changes
    - Remove condition_elevator column
    - Remove condition_shared_area column
    - Remove condition_size column
  
  These fields were mistakenly added based on CSV import but are not needed.
*/

ALTER TABLE asset_types DROP COLUMN IF EXISTS condition_elevator;
ALTER TABLE asset_types DROP COLUMN IF EXISTS condition_shared_area;
ALTER TABLE asset_types DROP COLUMN IF EXISTS condition_size;
