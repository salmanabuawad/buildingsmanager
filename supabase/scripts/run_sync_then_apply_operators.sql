-- =============================================================================
-- 1) SYNC: Check current DB state (review the result sets below)
-- =============================================================================

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('operators', 'assets', 'tax_regions_mailing_list')
ORDER BY table_name;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'assets'
ORDER BY ordinal_position;

-- =============================================================================
-- 2) APPLY: Operators table + operator_id on assets (idempotent)
-- =============================================================================

CREATE TABLE IF NOT EXISTS operators (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operators_email ON operators(email);
COMMENT ON TABLE operators IS 'Operators: each asset can be assigned one; used to group export and email each operator their data';

ALTER TABLE assets ADD COLUMN IF NOT EXISTS operator_id BIGINT REFERENCES operators(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_assets_operator_id ON assets(operator_id);
COMMENT ON COLUMN assets.operator_id IS 'Operator responsible for this asset; used when sending to automation to email each operator their assets';

ALTER TABLE operators ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon to view operators" ON operators;
CREATE POLICY "Allow anon to view operators" ON operators FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "Allow anon to insert operators" ON operators;
CREATE POLICY "Allow anon to insert operators" ON operators FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "Allow anon to update operators" ON operators;
CREATE POLICY "Allow anon to update operators" ON operators FOR UPDATE TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow anon to delete operators" ON operators;
CREATE POLICY "Allow anon to delete operators" ON operators FOR DELETE TO anon USING (true);

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
