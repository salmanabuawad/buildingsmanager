/*
  # Add DWG File Field to Apartments

  1. Changes
    - Add `dwg_file_url` column to apartments table to store the PDF file URL
  
  2. Security
    - No changes to RLS policies needed
*/

-- Add dwg_file_url column to apartments table
ALTER TABLE apartments 
ADD COLUMN IF NOT EXISTS dwg_file_url text;
