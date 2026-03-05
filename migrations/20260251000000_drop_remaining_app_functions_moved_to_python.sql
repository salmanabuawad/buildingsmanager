-- Drop all app functions that have been reimplemented in Python.
-- Apply after confirming backend uses Python implementations for:
--   users_*, auth_login (auth uses users_table), update_buildings_bulk_with_distribution_flags,
--   update_asset_type_with_distribution_reset, update_asset_types_bulk_with_distribution_reset,
--   save_assets_bulk_transactional, update_building_total_area, copy_asset_to_history_before_update,
--   get_or_create_user_from_auth (only used by dropped functions).

-- Users (Python: app.transactions.users)
DROP FUNCTION IF EXISTS public.users_create_internal(text, text, text, text);
DROP FUNCTION IF EXISTS public.users_set_password(bigint, text);
DROP FUNCTION IF EXISTS public.users_ensure_defaults();

-- Auth: backend uses app.users_table.login_with_users_table (no RPC)
DROP FUNCTION IF EXISTS public.auth_login(text, text);

-- Buildings bulk (Python: app.transactions.buildings_bulk)
DROP FUNCTION IF EXISTS public.update_buildings_bulk_with_distribution_flags(jsonb[]);

-- Asset types (Python: app.transactions.asset_types)
DROP FUNCTION IF EXISTS public.update_asset_type_with_distribution_reset(bigint, jsonb);
DROP FUNCTION IF EXISTS public.update_asset_types_bulk_with_distribution_reset(jsonb[]);

-- Bulk save and its DB helpers (Python: app.transactions.save_assets_bulk, building_assets)
DROP FUNCTION IF EXISTS public.save_assets_bulk_transactional(jsonb[], boolean, text, text, text, jsonb, jsonb, text, boolean);
DROP FUNCTION IF EXISTS public.update_building_total_area(bigint);
DROP FUNCTION IF EXISTS public.copy_asset_to_history_before_update(bigint);

-- User resolution (only used by dropped RPCs; Python uses app.transactions.audit._resolve_user_id)
DROP FUNCTION IF EXISTS public.get_or_create_user_from_auth();
