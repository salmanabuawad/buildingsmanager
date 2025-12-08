/*
  # Fix Assets RLS Policies for Public/Anon Access
  
  1. Changes
    - Ensure RLS policies allow public/anon key access for all operations
    - Drop existing policies and recreate them to ensure they're correct
    - This fixes the "new row violates row-level security policy" error
  
  2. Operations
    - Drop all existing policies on assets table
    - Create new policies that allow public (anon key) access for:
      - SELECT (view)
      - INSERT (create)
      - UPDATE (modify)
      - DELETE (remove)
*/

-- Drop all existing policies on assets table
DROP POLICY IF EXISTS "Public can view assets" ON assets;
DROP POLICY IF EXISTS "Public can insert assets" ON assets;
DROP POLICY IF EXISTS "Public can update assets" ON assets;
DROP POLICY IF EXISTS "Public can delete assets" ON assets;
DROP POLICY IF EXISTS "Authenticated users can manage assets" ON assets;
DROP POLICY IF EXISTS "Anyone can view assets" ON assets;
DROP POLICY IF EXISTS "Anyone can insert assets" ON assets;
DROP POLICY IF EXISTS "Anyone can update assets" ON assets;
DROP POLICY IF EXISTS "Anyone can delete assets" ON assets;

-- Create policies for public (anon key) access
CREATE POLICY "Public can view assets"
  ON assets FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public can insert assets"
  ON assets FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Public can update assets"
  ON assets FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can delete assets"
  ON assets FOR DELETE
  TO public
  USING (true);

-- Also allow authenticated users (for consistency)
CREATE POLICY "Authenticated users can manage assets"
  ON assets FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Add comment
COMMENT ON POLICY "Public can insert assets" ON assets IS 
  'Allows public (anon key) access to insert assets. This is required for the application which uses anon key for API calls.';

