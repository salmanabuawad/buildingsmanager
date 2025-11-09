/*
  # Add tax_region field to buildings table

  1. Changes
    - Add `tax_region` text field to buildings table
    - Field is optional (nullable)

  2. Tables Modified
    - `buildings`: Add tax_region column
*/

-- Add tax_region column to buildings table
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS tax_region text;