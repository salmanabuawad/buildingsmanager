-- ============================================================================
-- Temporary SQL script to fix constraint syntax errors
-- This fixes the "ADD CONSTRAINT IF NOT EXISTS" syntax which is not supported
-- ============================================================================

-- Fix foreign key constraint to users table for audit
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_audit_user_id'
  ) THEN
    ALTER TABLE audit
    ADD CONSTRAINT fk_audit_user_id
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE RESTRICT;
  END IF;
END $$;

-- Fix action_id foreign key for assets table
DO $$
BEGIN
  -- First, set invalid action_id values to NULL
  UPDATE assets
  SET action_id = NULL
  WHERE action_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM audit WHERE audit.action_id = assets.action_id
    );
  
  -- Now add the constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assets_action_id_fkey'
  ) THEN
    ALTER TABLE assets
    ADD CONSTRAINT assets_action_id_fkey 
    FOREIGN KEY (action_id) REFERENCES audit(action_id);
  END IF;
END $$;

-- Fix action_id foreign key for buildings table
DO $$
BEGIN
  -- First, set invalid action_id values to NULL
  UPDATE buildings
  SET action_id = NULL
  WHERE action_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM audit WHERE audit.action_id = buildings.action_id
    );
  
  -- Now add the constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'buildings_action_id_fkey'
  ) THEN
    ALTER TABLE buildings
    ADD CONSTRAINT buildings_action_id_fkey 
    FOREIGN KEY (action_id) REFERENCES audit(action_id);
  END IF;
END $$;

-- Fix action_id foreign key for assets_history table
DO $$
BEGIN
  -- First, set invalid action_id values to NULL
  UPDATE assets_history
  SET action_id = NULL
  WHERE action_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM audit WHERE audit.action_id = assets_history.action_id
    );
  
  -- Now add the constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assets_history_action_id_fkey'
  ) THEN
    ALTER TABLE assets_history
    ADD CONSTRAINT assets_history_action_id_fkey 
    FOREIGN KEY (action_id) REFERENCES audit(action_id);
  END IF;
END $$;

-- Fix foreign key constraint to users table for change_log
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_change_log_user_id'
  ) THEN
    ALTER TABLE change_log
    ADD CONSTRAINT fk_change_log_user_id
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE RESTRICT;
  END IF;
END $$;

