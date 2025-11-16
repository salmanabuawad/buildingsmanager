/*
  # Add measurement_date to assets table and create composite primary key
  
  1. Changes
    - Add `measurement_date` column (date, NOT NULL, default CURRENT_DATE) to `assets` table
    - Drop existing primary key constraint on `id`
    - Drop existing unique constraint on `asset_id`
    - Create new composite primary key on (`asset_id`, `measurement_date`)
    - Keep `id` column as a regular bigint column for backward compatibility
  
  2. Security
    - No changes to RLS policies
  
  3. Important Notes
    - This allows tracking multiple measurements for the same asset over time
    - Each asset can have one record per measurement date
    - The `id` column remains for any existing foreign key relationships
*/

-- Add measurement_date column
ALTER TABLE assets 
ADD COLUMN IF NOT EXISTS measurement_date date NOT NULL DEFAULT CURRENT_DATE;

-- Drop the existing primary key constraint on id
ALTER TABLE assets 
DROP CONSTRAINT IF EXISTS assets_pkey;

-- Drop the existing unique constraint on asset_id
ALTER TABLE assets 
DROP CONSTRAINT IF EXISTS assets_asset_id_key;

-- Create composite primary key on (asset_id, measurement_date)
ALTER TABLE assets 
ADD CONSTRAINT assets_pkey PRIMARY KEY (asset_id, measurement_date);

-- Create index on id for faster lookups if needed
CREATE INDEX IF NOT EXISTS assets_id_idx ON assets(id);