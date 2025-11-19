/*
  # Revert Step 1: Add Sub-Asset Columns Back to Assets Table

  1. Columns Added to assets table
    - `sub_asset_type_1` (text) - Type of first sub-asset
    - `sub_asset_size_1` (numeric) - Size of first sub-asset
    - `sub_asset_type_2` (text) - Type of second sub-asset
    - `sub_asset_size_2` (numeric) - Size of second sub-asset
    - `sub_asset_type_3` (text) - Type of third sub-asset
    - `sub_asset_size_3` (numeric) - Size of third sub-asset
    - `sub_asset_type_4` (text) - Type of fourth sub-asset
    - `sub_asset_size_4` (numeric) - Size of fourth sub-asset
    - `sub_asset_type_5` (text) - Type of fifth sub-asset
    - `sub_asset_size_5` (numeric) - Size of fifth sub-asset
    - `sub_asset_type_6` (text) - Type of sixth sub-asset
    - `sub_asset_size_6` (numeric) - Size of sixth sub-asset

  2. Notes
    - Restores the original denormalized structure
    - All columns are nullable
    - Data will be migrated in next step
*/

-- Add sub-asset columns back to assets table
ALTER TABLE assets ADD COLUMN IF NOT EXISTS sub_asset_type_1 text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS sub_asset_size_1 numeric;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS sub_asset_type_2 text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS sub_asset_size_2 numeric;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS sub_asset_type_3 text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS sub_asset_size_3 numeric;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS sub_asset_type_4 text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS sub_asset_size_4 numeric;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS sub_asset_type_5 text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS sub_asset_size_5 numeric;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS sub_asset_type_6 text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS sub_asset_size_6 numeric;