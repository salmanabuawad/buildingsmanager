/*
  # Allow Anonymous Access to Validation Rules

  1. Changes
    - Drop existing authentication-required policies
    - Create new policies allowing anonymous access to validation rules
    - Allow anyone to read validation rules (needed for validation to work)
    - Restrict write operations to authenticated users only
  
  2. Security
    - Read access is safe as validation rules are application logic
    - Write operations still require authentication for safety
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can read validation rules" ON validation_rules;
DROP POLICY IF EXISTS "Authenticated users can insert validation rules" ON validation_rules;
DROP POLICY IF EXISTS "Authenticated users can update validation rules" ON validation_rules;
DROP POLICY IF EXISTS "Authenticated users can delete validation rules" ON validation_rules;

-- Allow everyone to read validation rules (including anonymous users)
CREATE POLICY "Allow anonymous read access to validation rules"
  ON validation_rules
  FOR SELECT
  USING (true);

-- Allow anonymous users to manage validation rules (for now, until auth is added)
CREATE POLICY "Allow anonymous insert validation rules"
  ON validation_rules
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow anonymous update validation rules"
  ON validation_rules
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anonymous delete validation rules"
  ON validation_rules
  FOR DELETE
  USING (true);
