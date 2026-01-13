-- ============================================================================
-- DROP legacy need_to_export_to_automation COLUMN (replaced by data_from_automation)
-- ============================================================================

-- Drop legacy column if it exists (safety for DBs that already ran an older version)
ALTER TABLE assets
DROP COLUMN IF EXISTS need_to_export_to_automation;

ALTER TABLE assets_history
DROP COLUMN IF EXISTS need_to_export_to_automation;

-- Drop legacy trigger/function if they exist (older deployments)
DROP TRIGGER IF EXISTS trigger_set_need_to_export_to_automation_on_asset_change ON assets;
DROP FUNCTION IF EXISTS set_need_to_export_to_automation_on_asset_change();

