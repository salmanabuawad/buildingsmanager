/*
  # Add missing audit action types to enum
  
  1. Changes
    - Add 'business_distribution' to audit_action_type enum
    - Add 'residence_distribution' to audit_action_type enum
    - Add 'tax_region_change' to audit_action_type enum
    - These action types are used in the save functions but were missing from the enum
  
  2. Security
    - No changes to RLS policies
*/

-- Add business_distribution if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'business_distribution' 
    AND enumtypid = 'audit_action_type'::regtype
  ) THEN
    ALTER TYPE audit_action_type ADD VALUE 'business_distribution';
  END IF;
END $$;

-- Add residence_distribution if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'residence_distribution' 
    AND enumtypid = 'audit_action_type'::regtype
  ) THEN
    ALTER TYPE audit_action_type ADD VALUE 'residence_distribution';
  END IF;
END $$;

-- Add tax_region_change if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'tax_region_change' 
    AND enumtypid = 'audit_action_type'::regtype
  ) THEN
    ALTER TYPE audit_action_type ADD VALUE 'tax_region_change';
  END IF;
END $$;
