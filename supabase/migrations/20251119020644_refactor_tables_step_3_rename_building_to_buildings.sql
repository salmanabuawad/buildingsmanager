/*
  # Refactor Step 3: Rename building table to buildings

  1. Table Rename
    - Rename `building` table to `buildings` for consistency
    - All constraints and indexes are automatically renamed
    - All dependent objects are updated

  2. Security
    - RLS policies are preserved
    - All existing policies continue to work

  3. Notes
    - This is a simple DDL operation
    - No data changes
    - Foreign keys will be added in next step
*/

-- Rename building table to buildings
ALTER TABLE IF EXISTS building RENAME TO buildings;