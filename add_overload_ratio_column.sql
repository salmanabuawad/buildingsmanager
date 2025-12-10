-- Add overload_ratio column to buildings table
-- Run this script directly in your Supabase SQL editor or PostgreSQL client

-- Add overload_ratio column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'buildings' 
    AND column_name = 'overload_ratio'
  ) THEN
    ALTER TABLE buildings
    ADD COLUMN overload_ratio numeric(5,2);
    
    COMMENT ON COLUMN buildings.overload_ratio IS 'Overload ratio percentage (אחוז העמסה)';
    
    RAISE NOTICE 'Column overload_ratio added successfully to buildings table';
  ELSE
    RAISE NOTICE 'Column overload_ratio already exists in buildings table';
  END IF;
END $$;

