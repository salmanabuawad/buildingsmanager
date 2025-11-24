/*
  # Truncate assets_history table
  
  1. Changes
    - Delete all records from assets_history table
    - This will clear all historical asset measurement data
  
  2. Notes
    - This operation cannot be undone
    - Only the history table is affected, current assets in the assets table remain intact
*/

-- Truncate assets_history table
TRUNCATE TABLE assets_history;

