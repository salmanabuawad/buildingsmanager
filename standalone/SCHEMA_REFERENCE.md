# Schema reference (public schema)

Snapshot of **public** schema: tables, triggers, functions. Use for reference when wiring FastAPI or debugging. The actual DDL is applied by running migrations (see README_STANDALONE_POSTGRES.md).

## Extensions (required)

- `uuid-ossp`
- `pgcrypto`

## Enum

- **audit_action_type:** `manual_update`, `import_file`, `transfer_area`, `distribute_shared`, `business_distribution`, `residence_distribution`, `tax_region_change`

## Tables (public)

| Table | Primary key | Notes |
|------|-------------|--------|
| address_list | id | street_code, street_description |
| validation_rules | id | rule_key, rule_type, field_name, entity_type, value_*, enabled |
| buildings | building_number | total_building_area, residence_shared_area, business_shared_area, need_*_distribution, shared_parking_area, number_of_parking_units, net_area, asset_count, ... |
| assets | asset_id | building_number (FK), main_asset_type, asset_size, business_total_area, shared_parking_area, number_of_parking_units, operator_id, use_nature, ... |
| assets_history | (no PK) | history rows for assets |
| field_configurations | (grid_name, field_name) | grid column config |
| users | user_id | auth_user_id, user_name, user_email, user_role, password_hash |
| audit | action_id | user_id, action_type (enum), entity_type, entity_id, before_data, after_data |
| change_log | log_id | table_name, operation, record_id, user_id, before_data, after_data |
| asset_files | id | asset_id (FK), file_url, file_name, file_size, file_type |
| asset_types | id | name, description, tax_region, elevator, condo, ..., use_for_parking_shared_area |
| system_configuration | id | name (unique), value |
| operators | operator_id | name, mail, phone |
| managers | manager_id | name, tax_regions, mail, phone |

## Triggers (public)

| Trigger | Table | Events | Function |
|---------|--------|--------|----------|
| update_asset_types_updated_at | asset_types | UPDATE | update_updated_at_column |
| trigger_auto_set_distribution_flags_on_change | assets | INSERT, UPDATE | auto_set_distribution_flags_on_change |
| trigger_copy_asset_to_history | assets | DELETE, UPDATE | copy_asset_to_history |
| trigger_normalize_asset_boolean_fields | assets | INSERT, UPDATE | normalize_asset_boolean_fields |
| trigger_reset_export_flags_on_change | assets | UPDATE | reset_export_flags_on_change |
| trigger_update_asset_business_total_area | assets | INSERT, UPDATE | update_asset_business_total_area |
| update_assets_updated_at | assets | UPDATE | update_updated_at_column |
| trigger_normalize_assets_history_boolean_fields | assets_history | INSERT | normalize_assets_history_boolean_fields |
| trigger_update_field_configurations_updated_at | field_configurations | UPDATE | update_field_configurations_updated_at |
| trigger_update_managers_updated_at | managers | UPDATE | update_managers_updated_at |
| trigger_update_operators_updated_at | operators | UPDATE | update_operators_updated_at |
| trigger_update_system_configuration_updated_at | system_configuration | UPDATE | update_system_configuration_updated_at |
| validation_rules_updated_at | validation_rules | UPDATE | update_validation_rules_updated_at |

## Functions (public, RPCs and helpers)

- **Auth:** auth_login(p_password, p_user_name) → jsonb
- **Audit:** log_audit_entry, log_audit_for_asset, log_audit_for_building, log_change_entry
- **Assets:** get_assets_by_ids(p_asset_ids), save_asset_transactional, save_assets_bulk_transactional, delete_asset_transactional, delete_assets_bulk_transactional, copy_asset_to_history_before_update, update_asset_type_with_distribution_reset, update_asset_types_bulk_with_distribution_reset, mark_assets_as_exported_to_automation
- **Buildings:** update_building_total_area(p_building_number), update_buildings_bulk_with_distribution_flags
- **Distribution:** set_distribution_flags_for_asset_type_change, bulk_transfer_areas_with_audit, bulk_update_assets_with_audit
- **Helpers:** get_or_create_user_from_auth, get_config_value, get_configuration_by_type, get_tables_fields_types, get_building_stats, get_asset_audit_data, get_building_audit_data, get_active_email_configuration
- **Users:** users_create_internal, users_set_password, users_ensure_defaults
- **Triggers (internal):** update_updated_at_column, normalize_asset_boolean_fields, normalize_assets_history_boolean_fields, copy_asset_to_history, auto_set_distribution_flags_on_change, reset_export_flags_on_change, update_asset_business_total_area, auto_update_building_total_area, update_field_configurations_updated_at, update_managers_updated_at, update_operators_updated_at, update_system_configuration_updated_at, update_validation_rules_updated_at, set_data_from_automation_false_on_asset_change
- **Other:** extract_boolean_from_jsonb, calculate_asset_business_total_area, search_assets_by_range

## RLS

All listed tables have RLS enabled. Policies use roles `anon` and `authenticated`. For standalone, either grant your app user `anon` and `authenticated` (see post_migration_standalone.sql) or disable RLS and rely on FastAPI auth.
