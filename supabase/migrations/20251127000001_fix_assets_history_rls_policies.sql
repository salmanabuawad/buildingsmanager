/*
  # Fix assets_history RLS policies to allow public/anon access
  
  1. Changes
    - Update RLS policies on assets_history to allow public/anon access for INSERT
    - This matches the RLS policies on the assets table
    - Allows the API to insert records into assets_history when creating new measurements
  
  2. Notes
    - The application uses public/anon key for API access
    - Need to allow INSERT operations for public role
*/

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Public can view assets_history" ON assets_history;
DROP POLICY IF EXISTS "Authenticated users can manage assets_history" ON assets_history;

-- Create policies that allow public access (matching assets table policies)
CREATE POLICY "Public can view assets_history"
  ON assets_history FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public can insert assets_history"
  ON assets_history FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Public can update assets_history"
  ON assets_history FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can delete assets_history"
  ON assets_history FOR DELETE
  TO public
  USING (true);

