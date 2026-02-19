-- Before applying: run supabase/scripts/sync_with_db_queries.sql in Supabase SQL Editor
-- and confirm current state (e.g. operators table / assets.operator_id missing). Then run this migration.
--
-- Operators table: id, name, email (for grouping assets and sending per-operator emails)
CREATE TABLE IF NOT EXISTS operators (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operators_email ON operators(email);
COMMENT ON TABLE operators IS 'Operators: each asset can be assigned one; used to group export and email each operator their data';

-- Add operator_id to assets (nullable FK)
ALTER TABLE assets ADD COLUMN IF NOT EXISTS operator_id BIGINT REFERENCES operators(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_assets_operator_id ON assets(operator_id);
COMMENT ON COLUMN assets.operator_id IS 'Operator responsible for this asset; used when sending to automation to email each operator their assets';

-- RLS
ALTER TABLE operators ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon to view operators" ON operators;
CREATE POLICY "Allow anon to view operators" ON operators FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "Allow anon to insert operators" ON operators;
CREATE POLICY "Allow anon to insert operators" ON operators FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "Allow anon to update operators" ON operators;
CREATE POLICY "Allow anon to update operators" ON operators FOR UPDATE TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow anon to delete operators" ON operators;
CREATE POLICY "Allow anon to delete operators" ON operators FOR DELETE TO anon USING (true);

-- Updated_at trigger for operators
CREATE OR REPLACE FUNCTION update_operators_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_operators_updated_at ON operators;
CREATE TRIGGER trigger_update_operators_updated_at
  BEFORE UPDATE ON operators
  FOR EACH ROW
  EXECUTE FUNCTION update_operators_updated_at();
