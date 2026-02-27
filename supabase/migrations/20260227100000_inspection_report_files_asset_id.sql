-- Link inspection report files to an asset (optional)
ALTER TABLE inspection_report_files
  ADD COLUMN IF NOT EXISTS asset_id BIGINT REFERENCES assets(asset_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inspection_report_files_asset_id ON inspection_report_files(asset_id);
COMMENT ON COLUMN inspection_report_files.asset_id IS 'Optional: asset this file (image/video) is associated with';
