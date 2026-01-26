/*
  # Add missing export_to_automation_at column

  1. Changes
    - Adds export_to_automation_at column to assets table (TEXT, nullable)
    - Adds export_to_automation_at column to assets_history table (TEXT, nullable)
    - Stores date in DD/MM/YYYY format
    - Creates indexes for efficient querying

  2. Notes
    - This column tracks when assets were exported to the automation system
    - Uses TEXT type to match other date fields (measurement_date, discount_date_from, discount_date_to)
*/

-- Add export_to_automation_at column to assets table
ALTER TABLE assets 
ADD COLUMN IF NOT EXISTS export_to_automation_at TEXT;

-- Add export_to_automation_at column to assets_history table
ALTER TABLE assets_history 
ADD COLUMN IF NOT EXISTS export_to_automation_at TEXT;

-- Create index for efficient querying on assets table
CREATE INDEX IF NOT EXISTS idx_assets_export_to_automation_at 
ON assets(export_to_automation_at);

-- Create index for efficient querying on assets_history table
CREATE INDEX IF NOT EXISTS idx_assets_history_export_to_automation_at 
ON assets_history(export_to_automation_at);

-- Add comments
COMMENT ON COLUMN assets.export_to_automation_at IS 'Date when asset was exported to automation system (DD/MM/YYYY format)';
COMMENT ON COLUMN assets_history.export_to_automation_at IS 'Date when asset was exported to automation system (DD/MM/YYYY format) - historical snapshot';