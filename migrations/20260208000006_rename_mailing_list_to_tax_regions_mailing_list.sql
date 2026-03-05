/*
  # Rename Mailing List Table to Tax Regions Mailing List
  
  This migration renames the mailing_list table to tax_regions_mailing_list
  and updates all related objects (indexes, triggers, policies, etc.)
*/

-- Rename the table
ALTER TABLE IF EXISTS mailing_list RENAME TO tax_regions_mailing_list;

-- Rename indexes
ALTER INDEX IF EXISTS idx_mailing_list_tax_region RENAME TO idx_tax_regions_mailing_list_tax_region;
ALTER INDEX IF EXISTS idx_mailing_list_email RENAME TO idx_tax_regions_mailing_list_email;
ALTER INDEX IF EXISTS idx_mailing_list_created_at RENAME TO idx_tax_regions_mailing_list_created_at;

-- Drop old trigger and function
DROP TRIGGER IF EXISTS trigger_update_mailing_list_updated_at ON tax_regions_mailing_list;
DROP FUNCTION IF EXISTS update_mailing_list_updated_at();

-- Create new trigger function
CREATE OR REPLACE FUNCTION update_tax_regions_mailing_list_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create new trigger
CREATE TRIGGER trigger_update_tax_regions_mailing_list_updated_at
  BEFORE UPDATE ON tax_regions_mailing_list
  FOR EACH ROW
  EXECUTE FUNCTION update_tax_regions_mailing_list_updated_at();

-- Drop old policies
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to view mailing list" ON tax_regions_mailing_list;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to insert mailing list" ON tax_regions_mailing_list;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to update mailing list" ON tax_regions_mailing_list;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to delete mailing list" ON tax_regions_mailing_list;

-- Create new policies with updated names
CREATE POLICY "Allow anonymous and authenticated users to view tax_regions_mailing_list"
  ON tax_regions_mailing_list FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow anonymous and authenticated users to insert tax_regions_mailing_list"
  ON tax_regions_mailing_list FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow anonymous and authenticated users to update tax_regions_mailing_list"
  ON tax_regions_mailing_list FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anonymous and authenticated users to delete tax_regions_mailing_list"
  ON tax_regions_mailing_list FOR DELETE
  TO anon, authenticated
  USING (true);

-- Update comments
COMMENT ON TABLE tax_regions_mailing_list IS 'Stores email addresses associated with tax regions for mailing purposes';
COMMENT ON COLUMN tax_regions_mailing_list.tax_region IS 'Tax region identifier (e.g., business, residence)';
COMMENT ON COLUMN tax_regions_mailing_list.email IS 'Email address for the mailing list';
COMMENT ON COLUMN tax_regions_mailing_list.created_at IS 'Timestamp when the entry was created';
COMMENT ON COLUMN tax_regions_mailing_list.updated_at IS 'Timestamp when the entry was last updated';
