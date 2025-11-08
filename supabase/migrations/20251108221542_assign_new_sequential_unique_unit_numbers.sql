/*
  # Assign new sequential unique unit numbers

  1. Changes
    - Replace all existing apartment numbers with new sequential unique numbers
    - Numbers will start from 1001 and increment by 1
    - Maintains uniqueness constraint on apartment_number
  
  2. Migration Strategy
    - Temporarily disable the unique constraint
    - Assign sequential numbers starting from 1001
    - Re-enable the unique constraint
  
  3. Notes
    - All existing apartment numbers will be replaced
    - New numbers are system-wide unique: 1001, 1002, 1003, etc.
*/

-- Drop the unique constraint temporarily
ALTER TABLE apartments DROP CONSTRAINT IF EXISTS apartments_apartment_number_key;

-- Assign new sequential unique numbers starting from 1001
WITH numbered_apartments AS (
  SELECT 
    id,
    (1000 + ROW_NUMBER() OVER (ORDER BY created_at))::text AS new_number
  FROM apartments
)
UPDATE apartments
SET apartment_number = numbered_apartments.new_number
FROM numbered_apartments
WHERE apartments.id = numbered_apartments.id;

-- Re-add the unique constraint
ALTER TABLE apartments 
ADD CONSTRAINT apartments_apartment_number_key 
UNIQUE (apartment_number);
