/*
  # Add export_to_automation_at column to assets table

  1. Overview
    - Adds timestamp column to track when assets were exported to automation
    
  2. Changes
    - Add export_to_automation_at column (timestamptz) to assets table
    - Column is nullable and defaults to NULL
*/

-- Add export_to_automation_at column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assets' 
      AND table_schema = 'public'
      AND column_name = 'export_to_automation_at'
  ) THEN
    ALTER TABLE assets ADD COLUMN export_to_automation_at timestamptz DEFAULT NULL;
  END IF;
END $$;
