/*
  # Add CHECK constraints for sub-asset types
  
  1. Changes
    - Add CHECK constraints to prevent 199 and 299 in all sub_asset_type columns
    - These constraints enforce the rule at database level
    
  2. Notes
    - Type 199 (mixed residential) can only be used as main_asset_type
    - Type 299 (mixed business) can only be used as main_asset_type
    - NULL values are allowed (sub-assets are optional)
*/

-- Delete any existing rows that violate the constraint
DELETE FROM assets WHERE sub_asset_type_1 IN ('199', '299');
DELETE FROM assets WHERE sub_asset_type_2 IN ('199', '299');
DELETE FROM assets WHERE sub_asset_type_3 IN ('199', '299');
DELETE FROM assets WHERE sub_asset_type_4 IN ('199', '299');
DELETE FROM assets WHERE sub_asset_type_5 IN ('199', '299');
DELETE FROM assets WHERE sub_asset_type_6 IN ('199', '299');

-- Add CHECK constraints for each sub_asset_type column
ALTER TABLE assets 
  ADD CONSTRAINT check_sub_asset_type_1_not_composite 
  CHECK (sub_asset_type_1 IS NULL OR (sub_asset_type_1 != '199' AND sub_asset_type_1 != '299'));

ALTER TABLE assets 
  ADD CONSTRAINT check_sub_asset_type_2_not_composite 
  CHECK (sub_asset_type_2 IS NULL OR (sub_asset_type_2 != '199' AND sub_asset_type_2 != '299'));

ALTER TABLE assets 
  ADD CONSTRAINT check_sub_asset_type_3_not_composite 
  CHECK (sub_asset_type_3 IS NULL OR (sub_asset_type_3 != '199' AND sub_asset_type_3 != '299'));

ALTER TABLE assets 
  ADD CONSTRAINT check_sub_asset_type_4_not_composite 
  CHECK (sub_asset_type_4 IS NULL OR (sub_asset_type_4 != '199' AND sub_asset_type_4 != '299'));

ALTER TABLE assets 
  ADD CONSTRAINT check_sub_asset_type_5_not_composite 
  CHECK (sub_asset_type_5 IS NULL OR (sub_asset_type_5 != '199' AND sub_asset_type_5 != '299'));

ALTER TABLE assets 
  ADD CONSTRAINT check_sub_asset_type_6_not_composite 
  CHECK (sub_asset_type_6 IS NULL OR (sub_asset_type_6 != '199' AND sub_asset_type_6 != '299'));
