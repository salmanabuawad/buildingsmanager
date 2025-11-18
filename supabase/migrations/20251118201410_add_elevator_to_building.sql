/*
  # Add elevator field to building table

  1. Changes
    - Add `has_elevator` column to `building` table
      - Type: boolean
      - Default: false
      - Not null
    
  2. Notes
    - Field indicates whether the building has an elevator
    - Default value is false for existing and new buildings
*/

-- Add has_elevator column to building table
ALTER TABLE building 
ADD COLUMN IF NOT EXISTS has_elevator boolean NOT NULL DEFAULT false;