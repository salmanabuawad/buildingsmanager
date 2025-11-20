/*
  # Remove All Database-Level Validation

  1. Changes
    - Drop all validation triggers on assets table
    - Drop the validate_asset_before_insert function
    - Validation will now be handled entirely in the frontend
  
  2. Security
    - No RLS changes
    - Assets table remains protected by existing RLS policies
*/

-- Drop validation triggers if they exist
DROP TRIGGER IF EXISTS trigger_validate_asset_before_insert ON assets;
DROP TRIGGER IF EXISTS trigger_validate_asset_before_update ON assets;

-- Drop validation function if it exists
DROP FUNCTION IF EXISTS public.validate_asset_before_insert();