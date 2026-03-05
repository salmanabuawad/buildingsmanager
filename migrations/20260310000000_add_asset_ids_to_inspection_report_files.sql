-- Add asset_ids to inspection_report_files so each file can be associated with specific assets.
-- When admin approves a task, files with asset_ids are copied to asset_files for each asset.

ALTER TABLE inspection_report_files
ADD COLUMN IF NOT EXISTS asset_ids bigint[] DEFAULT '{}';

COMMENT ON COLUMN inspection_report_files.asset_ids IS 'Asset IDs this file belongs to; on approve, copied to asset_files for each';
