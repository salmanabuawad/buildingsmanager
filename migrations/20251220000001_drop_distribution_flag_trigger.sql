/*
  # Drop Distribution Flag Trigger
  
  This migration drops the trigger auto_set_distribution_flags_on_change because
  distribution flags are now handled completely in save_assets_bulk_transactional
  using the p_is_business_context parameter, which provides the correct tab context.
  
  Both type changes and size changes are handled the same way in the function,
  using the tab context (business vs residence) rather than the asset type's
  business_residence field. This ensures consistent behavior and proper separation
  between business and residence contexts.
*/

-- Drop the trigger that automatically sets distribution flags
-- All flag setting is now handled in save_assets_bulk_transactional with proper tab context
DROP TRIGGER IF EXISTS trigger_auto_set_distribution_flags_on_change ON assets;
