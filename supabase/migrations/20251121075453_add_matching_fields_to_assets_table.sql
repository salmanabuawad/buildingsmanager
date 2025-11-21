/*
  # Add matching fields to assets table

  1. Changes
    - Add `elevator` text column to assets table
    - Add `single_double_family` text column to assets table
    - Add `condo` text column to assets table
    - Add `townhouses` text column to assets table
    - Add `basement` text column to assets table
    - Add `penthouse` text column to assets table
  
  2. Notes
    - These fields match the corresponding fields in asset_types and buildings tables
    - This allows assets to have specific property characteristics
*/

-- Add elevator column to assets
ALTER TABLE assets ADD COLUMN IF NOT EXISTS elevator text;

-- Add single_double_family column to assets
ALTER TABLE assets ADD COLUMN IF NOT EXISTS single_double_family text;

-- Add condo column to assets
ALTER TABLE assets ADD COLUMN IF NOT EXISTS condo text;

-- Add townhouses column to assets
ALTER TABLE assets ADD COLUMN IF NOT EXISTS townhouses text;

-- Add basement column to assets
ALTER TABLE assets ADD COLUMN IF NOT EXISTS basement text;

-- Add penthouse column to assets
ALTER TABLE assets ADD COLUMN IF NOT EXISTS penthouse text;
