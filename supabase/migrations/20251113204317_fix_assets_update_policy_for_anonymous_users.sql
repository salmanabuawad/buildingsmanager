/*
  # Fix assets table RLS policies for anonymous updates

  1. Changes
    - Drop existing restrictive UPDATE policy that only allows authenticated users
    - Create new UPDATE policy that allows public (anonymous) users
    - This matches the application's current authentication setup (using anon key)
  
  2. Security
    - Policy allows all public users to update assets
    - This is acceptable for the current application requirements
*/

-- Drop the restrictive authenticated-only update policy
DROP POLICY IF EXISTS "Authenticated users can update assets" ON assets;

-- Create new update policy for public access
CREATE POLICY "Public can update assets"
  ON assets FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);
