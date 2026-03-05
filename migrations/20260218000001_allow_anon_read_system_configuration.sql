/*
  # Allow anon to read/write system_configuration
  
  App uses custom users-table auth (not Supabase Auth), so Supabase client runs as anon.
  Without SELECT, getByName('email_config') returns no rows and email config is "not found".
  INSERT/UPDATE/DELETE are needed so System Configuration UI can save settings.
*/

DROP POLICY IF EXISTS "Allow anon to view system configuration" ON system_configuration;
CREATE POLICY "Allow anon to view system configuration"
  ON system_configuration FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Allow anon to insert system configuration" ON system_configuration;
CREATE POLICY "Allow anon to insert system configuration"
  ON system_configuration FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon to update system configuration" ON system_configuration;
CREATE POLICY "Allow anon to update system configuration"
  ON system_configuration FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon to delete system configuration" ON system_configuration;
CREATE POLICY "Allow anon to delete system configuration"
  ON system_configuration FOR DELETE
  TO anon
  USING (true);
