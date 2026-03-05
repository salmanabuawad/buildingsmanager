/*
  # Add Mailing List Table
  
  This migration creates a mailing_list table to store tax region and email associations
  for managing email subscriptions by tax region.
*/

-- Create mailing_list table
CREATE TABLE IF NOT EXISTS mailing_list (
  id BIGSERIAL PRIMARY KEY,
  tax_region TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tax_region, email)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_mailing_list_tax_region ON mailing_list(tax_region);
CREATE INDEX IF NOT EXISTS idx_mailing_list_email ON mailing_list(email);
CREATE INDEX IF NOT EXISTS idx_mailing_list_created_at ON mailing_list(created_at);

-- Add comments
COMMENT ON TABLE mailing_list IS 'Stores email addresses associated with tax regions for mailing purposes';
COMMENT ON COLUMN mailing_list.tax_region IS 'Tax region identifier (e.g., business, residence)';
COMMENT ON COLUMN mailing_list.email IS 'Email address for the mailing list';
COMMENT ON COLUMN mailing_list.created_at IS 'Timestamp when the entry was created';
COMMENT ON COLUMN mailing_list.updated_at IS 'Timestamp when the entry was last updated';

-- Enable RLS
ALTER TABLE mailing_list ENABLE ROW LEVEL SECURITY;

-- Create policies
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to view mailing list" ON mailing_list;
CREATE POLICY "Allow anonymous and authenticated users to view mailing list"
  ON mailing_list FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow anonymous and authenticated users to insert mailing list" ON mailing_list;
CREATE POLICY "Allow anonymous and authenticated users to insert mailing list"
  ON mailing_list FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anonymous and authenticated users to update mailing list" ON mailing_list;
CREATE POLICY "Allow anonymous and authenticated users to update mailing list"
  ON mailing_list FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anonymous and authenticated users to delete mailing list" ON mailing_list;
CREATE POLICY "Allow anonymous and authenticated users to delete mailing list"
  ON mailing_list FOR DELETE
  TO anon, authenticated
  USING (true);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_mailing_list_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_mailing_list_updated_at ON mailing_list;
CREATE TRIGGER trigger_update_mailing_list_updated_at
  BEFORE UPDATE ON mailing_list
  FOR EACH ROW
  EXECUTE FUNCTION update_mailing_list_updated_at();
