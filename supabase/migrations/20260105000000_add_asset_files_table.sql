/*
  # Add Asset Files Table for Multiple Files per Asset
  
  This migration:
  1. Creates asset_files table to store multiple files per asset
  2. Migrates existing structure_drawing_url data to asset_files table
  3. Keeps structure_drawing_url for backward compatibility (can be removed later)
*/

-- Create asset_files table
CREATE TABLE IF NOT EXISTS asset_files (
  id BIGSERIAL PRIMARY KEY,
  asset_id BIGINT NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT,
  file_size BIGINT,
  file_type TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  uploaded_by TEXT,
  FOREIGN KEY (asset_id) REFERENCES assets(asset_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_asset_files_asset_id ON asset_files(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_files_uploaded_at ON asset_files(uploaded_at);

COMMENT ON TABLE asset_files IS 'Stores multiple files (drawings, documents) associated with assets';
COMMENT ON COLUMN asset_files.asset_id IS 'Reference to the asset this file belongs to';
COMMENT ON COLUMN asset_files.file_url IS 'Public URL of the file in storage';
COMMENT ON COLUMN asset_files.file_name IS 'Original filename';
COMMENT ON COLUMN asset_files.file_size IS 'File size in bytes';
COMMENT ON COLUMN asset_files.file_type IS 'MIME type of the file';

-- Enable RLS
ALTER TABLE asset_files ENABLE ROW LEVEL SECURITY;

-- Create policies
DROP POLICY IF EXISTS "Public can view asset files" ON asset_files;
CREATE POLICY "Public can view asset files"
  ON asset_files FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Public can insert asset files" ON asset_files;
CREATE POLICY "Public can insert asset files"
  ON asset_files FOR INSERT
  TO public
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public can update asset files" ON asset_files;
CREATE POLICY "Public can update asset files"
  ON asset_files FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public can delete asset files" ON asset_files;
CREATE POLICY "Public can delete asset files"
  ON asset_files FOR DELETE
  TO public
  USING (true);

-- Migrate existing structure_drawing_url data to asset_files
INSERT INTO asset_files (asset_id, file_url, file_name, uploaded_at)
SELECT 
  asset_id,
  structure_drawing_url,
  CASE 
    WHEN structure_drawing_url IS NOT NULL THEN 
      SPLIT_PART(structure_drawing_url, '/', -1)
    ELSE NULL
  END,
  updated_at
FROM assets
WHERE structure_drawing_url IS NOT NULL 
  AND structure_drawing_url != ''
  AND NOT EXISTS (
    SELECT 1 FROM asset_files af WHERE af.asset_id = assets.asset_id AND af.file_url = assets.structure_drawing_url
  );

