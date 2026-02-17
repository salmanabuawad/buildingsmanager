# Trigger replication (Postgres → Python)

For Azure deployment, Postgres functions and **triggers** are implemented in Python so the same Azure PostgreSQL database (no Supabase) can be used without installing trigger definitions.

## Triggers replicated in `triggers.py`

| Postgres trigger | Table(s) | Python function(s) | When to call |
|------------------|----------|--------------------|--------------|
| `normalize_asset_boolean_fields` | assets | `normalize_asset_boolean_fields(row)` | Before INSERT/UPDATE asset row |
| `update_asset_business_total_area` | assets | `update_asset_business_total_area(row, db)` | Before INSERT/UPDATE asset row |
| `reset_export_flags_on_change` | assets | `reset_export_flags_on_change(old_row, new_row)` | Before UPDATE asset (when data fields changed) |
| `set_data_from_automation_false_on_asset_change` | assets | `set_data_from_automation_false_on_asset_change(old_row, new_row)` | Before UPDATE asset |
| `copy_asset_to_history` | assets | `copy_asset_to_history_before_update(db, asset_id)` / `copy_asset_to_history_on_delete(db, old_row)` | Before UPDATE (explicit copy) / Before DELETE |
| `auto_update_building_total_area` | assets | `update_building_total_area(db, building_number)` | After INSERT/UPDATE/DELETE asset |
| `auto_set_distribution_flags_on_change` | assets | `auto_set_distribution_flags_on_change(db, op, building_number, main_asset_type, old_row, new_row)` | After INSERT/UPDATE asset |
| `update_updated_at_column` | assets, asset_types, field_configurations, operators, system_configuration, validation_rules | `updated_at_now()` | Before UPDATE (set `updated_at` in row) |

## Usage in services

When writing asset/building service code:

1. **Before inserting or updating an asset:**  
   Normalize booleans → compute `business_total_area` → (on update) apply reset export flags and `data_from_automation` → set `updated_at = updated_at_now()`.

2. **Before updating an asset (when copying to history):**  
   Call `copy_asset_to_history_before_update(db, asset_id)`.

3. **Before deleting an asset:**  
   Call `copy_asset_to_history_on_delete(db, old_row)`.

4. **After inserting/updating/deleting an asset:**  
   Call `update_building_total_area(db, building_number)` and, for INSERT/UPDATE, `auto_set_distribution_flags_on_change(...)`.

5. **Before updating any table that has `updated_at`:**  
   Set `updated_at = updated_at_now()` in the row.
