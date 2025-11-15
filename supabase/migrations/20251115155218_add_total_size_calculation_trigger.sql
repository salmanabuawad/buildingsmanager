/*
  # Add total_size calculation trigger
  
  1. Changes
    - Create function to calculate total_size for assets
    - Create trigger to automatically update total_size on insert/update
    - Update existing assets with calculated total_size
    
  2. Notes
    - total_size = main_asset_size + sum of all sub_asset_sizes
    - Handles null values by treating them as 0
*/

-- Create function to calculate total size
CREATE OR REPLACE FUNCTION calculate_asset_total_size()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_size := COALESCE(NEW.main_asset_size, 0) +
                    COALESCE(NEW.sub_asset_size_1, 0) +
                    COALESCE(NEW.sub_asset_size_2, 0) +
                    COALESCE(NEW.sub_asset_size_3, 0) +
                    COALESCE(NEW.sub_asset_size_4, 0) +
                    COALESCE(NEW.sub_asset_size_5, 0) +
                    COALESCE(NEW.sub_asset_size_6, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS trigger_calculate_asset_total_size ON assets;

-- Create trigger
CREATE TRIGGER trigger_calculate_asset_total_size
  BEFORE INSERT OR UPDATE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION calculate_asset_total_size();

-- Update existing assets with calculated total_size
UPDATE assets
SET total_size = COALESCE(main_asset_size, 0) +
                 COALESCE(sub_asset_size_1, 0) +
                 COALESCE(sub_asset_size_2, 0) +
                 COALESCE(sub_asset_size_3, 0) +
                 COALESCE(sub_asset_size_4, 0) +
                 COALESCE(sub_asset_size_5, 0) +
                 COALESCE(sub_asset_size_6, 0)
WHERE total_size IS NULL;
