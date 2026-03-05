# Supabase (original DB) vs migrations – functions and triggers

**Supabase is the single source of truth.** Local DB triggers and trigger-only functions are dropped by migration `20260249000000_drop_triggers_and_functions_supabase_truth.sql`. Equivalent behavior is implemented in Python (`app.transactions.building_assets`); `update_building_total_area` and `copy_asset_to_history_before_update` are used from the backend for direct API calls.

This document compares **Supabase** (original DB, queried via MCP) with the **local migrations** so you can see what is missing on either side.

---

## 1. Triggers: Supabase vs migrations

### On Supabase only (in migrations but NOT on Supabase)

| Trigger | Table | Notes |
|--------|--------|--------|
| **trigger_auto_update_building_total_area** | assets | Our migrations create it (calls `auto_update_building_total_area`). **Supabase does not have this trigger.** On Supabase, building total area is updated only when RPCs (`save_assets_bulk_transactional`, `delete_asset_transactional`, `update_buildings_bulk_with_distribution_flags`, etc.) explicitly call `update_building_total_area`. |

### On Supabase only (on Supabase but NOT in consolidated migration)

| Trigger | Table | Notes |
|--------|--------|--------|
| **trigger_copy_asset_to_history** | assets | Supabase has this (calls `copy_asset_to_history` with no args). The **consolidated migration** (`20260101000000`) does **not** create it; we rely on RPCs calling `copy_asset_to_history_before_update(p_asset_id)` instead. So direct `UPDATE assets` on Supabase would copy to history via trigger; in our migration path it would not (only when RPCs run). |

### Triggers that exist on both

- **assets:** `trigger_auto_set_distribution_flags_on_change`, `trigger_normalize_asset_boolean_fields`, `trigger_reset_export_flags_on_change`, `trigger_update_asset_business_total_area`, `update_assets_updated_at`
- **assets_history:** `trigger_normalize_assets_history_boolean_fields`
- **asset_types:** `update_asset_types_updated_at`
- **field_configurations:** `trigger_update_field_configurations_updated_at`
- **managers:** `trigger_update_managers_updated_at`
- **operators:** `trigger_update_operators_updated_at`
- **system_configuration:** `trigger_update_system_configuration_updated_at`
- **validation_rules:** `validation_rules_updated_at`

### Possibly missing on Supabase

- **update_users_updated_at** on table **users**: Present in our migrations; not listed in the Supabase trigger list (so it may be missing there).
- **trigger_set_data_from_automation_false_on_asset_change** on **assets**: In our migrations; not in the Supabase trigger list (may be missing).
- **trigger_update_*_updated_at** on **tax_regions_mailing_list** / **mailing_list**: In later migrations; not checked on Supabase.

---

## 2. Functions: missing on Supabase

The backend calls this RPC; it **does not exist** on Supabase:

| Function | Used by | Notes |
|----------|--------|--------|
| **get_record_change_history** | `AuditService.get_record_change_history` (rest_operations, audit router) | Returns change history for the audit UI. **Supabase has no such function** (verified via MCP `execute_sql`). You need to add it on Supabase or the audit “record change history” feature will fail there. |

All other backend-used functions (e.g. `update_building_total_area`, `copy_asset_to_history_before_update`, `save_assets_bulk_transactional`, `delete_asset_transactional`, `get_assets_by_ids`, `log_audit_entry`, `log_audit_for_asset`, `log_audit_for_building`, `log_change_entry`, `get_tables_fields_types`, etc.) **exist** on Supabase.

---

## 3. Summary and recommendations

1. **trigger_auto_update_building_total_area**  
   - **Migrations:** present. **Supabase:** missing.  
   - So on Supabase, total area is only updated when your app/RPCs call `update_building_total_area`. If you want the same behavior as migrations (recalc on every asset change), add this trigger on Supabase. If you are moving logic to Python, you may instead call `update_building_total_area` from the backend after asset save/delete and leave this trigger off.

2. **trigger_copy_asset_to_history**  
   - **Supabase:** present. **Consolidated migrations:** not created.  
   - So on Supabase, any direct `UPDATE assets` copies to history via trigger. In the migration path, only RPCs that call `copy_asset_to_history_before_update` do the copy. If you want parity with Supabase for ad‑hoc updates, add this trigger in a migration; otherwise keep current “RPC-only” copy behavior.

3. **get_record_change_history**  
   - **Backend:** used. **Supabase:** function does not exist.  
   - Add this function (and any dependent types) on Supabase from your migrations, or the audit “record change history” API will error against Supabase.

4. **users / updated_at and other triggers**  
   - Confirm on Supabase whether you want `update_users_updated_at` and `trigger_set_data_from_automation_false_on_asset_change` (and mailing list triggers if you use that table) and add them if needed.

---

*Generated from MCP Supabase `execute_sql` and `list_tables` plus local migration grep. Supabase was the original DB.*
