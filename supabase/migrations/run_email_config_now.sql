-- Run this in Supabase Dashboard → SQL Editor to apply email config + RLS in one go.
-- 1) Seed email_config
INSERT INTO system_configuration (name, value, description, created_by, updated_by)
VALUES (
  'email_config',
  '{"smtp_host":"smtp.gmail.com","smtp_port":587,"smtp_encryption":"tls","smtp_username":"profile.group.system@gmail.com","smtp_password":"iqgqkyfsxdklidsp","from_email":"profile.group.system@gmail.com","from_name":""}'::text,
  'הגדרות SMTP לשליחת דוא"ל',
  'migration',
  'migration'
)
ON CONFLICT (name) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_by = EXCLUDED.updated_by,
  updated_at = now();

-- 2) Allow anon to read/write system_configuration (fixes "Email configuration not found")
DROP POLICY IF EXISTS "Allow anon to view system configuration" ON system_configuration;
CREATE POLICY "Allow anon to view system configuration"
  ON system_configuration FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow anon to insert system configuration" ON system_configuration;
CREATE POLICY "Allow anon to insert system configuration"
  ON system_configuration FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon to update system configuration" ON system_configuration;
CREATE POLICY "Allow anon to update system configuration"
  ON system_configuration FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon to delete system configuration" ON system_configuration;
CREATE POLICY "Allow anon to delete system configuration"
  ON system_configuration FOR DELETE TO anon USING (true);
