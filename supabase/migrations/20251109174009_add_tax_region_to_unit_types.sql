/*
  # Add tax_region field to unit_types table

  1. Changes
    - Add `tax_region` numeric field to unit_types table
    - Field is optional (nullable)

  2. Tables Modified
    - `unit_types`: Add tax_region column
*/

-- Add tax_region column to unit_types table
ALTER TABLE unit_types ADD COLUMN IF NOT EXISTS tax_region numeric(10,2);