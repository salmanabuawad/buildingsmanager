/*
  # Change tax_region from numeric to integer in unit_types table

  1. Changes
    - Alter `tax_region` column type from numeric(10,2) to integer

  2. Tables Modified
    - `unit_types`: Change tax_region column type
*/

-- Change tax_region column type to integer
ALTER TABLE unit_types ALTER COLUMN tax_region TYPE integer USING tax_region::integer;