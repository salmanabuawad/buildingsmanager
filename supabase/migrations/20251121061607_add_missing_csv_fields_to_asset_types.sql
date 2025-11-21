/*
  # Add Missing CSV Fields to Asset Types
  
  1. New Columns
    - `single_double_family` (text) - Single/double family house indicator
    - `penthouse` (text) - Penthouse indicator
    - `condo` (text) - Condo/shared building indicator
    - `nursing_home` (text) - Nursing home indicator
    - `townhouses` (text) - Townhouses 2+ units indicator
  
  These fields match columns 6-10 from the CSV import file.
*/

ALTER TABLE asset_types 
  ADD COLUMN IF NOT EXISTS single_double_family TEXT,
  ADD COLUMN IF NOT EXISTS penthouse TEXT,
  ADD COLUMN IF NOT EXISTS condo TEXT,
  ADD COLUMN IF NOT EXISTS nursing_home TEXT,
  ADD COLUMN IF NOT EXISTS townhouses TEXT;
