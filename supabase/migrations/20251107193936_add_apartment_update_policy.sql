/*
  # Add RLS Policy for Apartment Updates

  1. Security Changes
    - Add policy to allow all users to update apartment data
    - This enables editing functionality for apartment area fields
  
  Note: Currently set to allow all updates. In production, this should be 
  restricted based on user authentication and authorization requirements.
*/

CREATE POLICY "Allow all users to update apartments"
  ON apartments
  FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);
