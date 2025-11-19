/*
  # Set default measurement_date to 01/01/1900

  1. Changes
    - Alter the `measurement_date` column in `assets` table
    - Set default value to '01/01/1900'
    - Ensure column remains NOT NULL

  2. Security
    - No changes to RLS policies
*/

-- Set default value for measurement_date column
ALTER TABLE assets
ALTER COLUMN measurement_date SET DEFAULT '01/01/1900';
