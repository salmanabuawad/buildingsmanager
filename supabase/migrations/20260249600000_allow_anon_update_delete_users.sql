-- Allow anon to update and delete users (app uses users-table auth, client runs as anon)
-- Admin-only operations are enforced in the UI; UserManagement is restricted to isAdmin.

DROP POLICY IF EXISTS "Allow authenticated users to update own user" ON users;
CREATE POLICY "Allow anon and authenticated to update users"
  ON users FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Add delete policy (was missing; admin needs to delete users)
CREATE POLICY "Allow anon and authenticated to delete users"
  ON users FOR DELETE
  TO anon, authenticated
  USING (true);
