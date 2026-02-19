/*
  # Managers table

  Managers receive assets list by tax_regions when exporting to automation.
  tax_regions: comma-separated list (e.g. "1,2,3" or "10, 20").
*/

CREATE TABLE IF NOT EXISTS managers (
  manager_id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  tax_regions TEXT NOT NULL DEFAULT '',
  mail TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_managers_mail ON managers(mail);
COMMENT ON TABLE managers IS 'Managers: receive assets list (filtered by tax_regions) when exporting to automation';

-- RLS
ALTER TABLE managers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon to view managers" ON managers;
CREATE POLICY "Allow anon to view managers" ON managers FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "Allow anon to insert managers" ON managers;
CREATE POLICY "Allow anon to insert managers" ON managers FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "Allow anon to update managers" ON managers;
CREATE POLICY "Allow anon to update managers" ON managers FOR UPDATE TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow anon to delete managers" ON managers;
CREATE POLICY "Allow anon to delete managers" ON managers FOR DELETE TO anon USING (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_managers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_managers_updated_at ON managers;
CREATE TRIGGER trigger_update_managers_updated_at
  BEFORE UPDATE ON managers
  FOR EACH ROW
  EXECUTE FUNCTION update_managers_updated_at();
