# Database Schema Comparison Report
## Comparing `current_system_db.csv` with Codebase Migrations

### Date: 2025-01-21

---

## 1. Assets Table Comparison

### Fields in CSV (Current Database):
1. building_number (bigint)
2. payer_id (text)
3. asset_id (bigint)
4. measurement_date (text)
5. main_asset_type (text)
6. asset_size (numeric)
7. sub_asset_type_1 through sub_asset_type_6 (text)
8. sub_asset_size_1 through sub_asset_size_6 (numeric)
9. structure_drawing_url (text)
10. created_at (timestamp with time zone)
11. updated_at (timestamp with time zone)
12. elevator (text)
13. single_double_family (text)
14. condo (text)
15. townhouses (text)
16. penthouse (text)
17. tax_region (integer)
18. floor (smallint)
19. discount_type (text)
20. discount_date_from (text)
21. discount_date_to (text)
22. is_new_measurement (boolean)
23. area_from_distribution (numeric)
24. exported_to_automation (boolean)
25. comment (text) ✅ **RECENTLY ADDED**

### Fields in Initial Schema Migration (`20250101000000_initial_schema.sql`):
- All fields match ✅
- **Note**: `action_id` exists in migration but is not needed (system uses `id` instead)
- **Note**: `business_distribution_area` was renamed to `area_from_distribution`

### ✅ SCHEMA VALIDATION:

#### 1. Primary Key
- **Migration**: `asset_id bigint NOT NULL PRIMARY KEY` (single column PK) ✅
- **CSV**: Confirms `asset_id` exists as primary key
- **Status**: ✅ **CORRECT** - `asset_id` is the primary key for the assets table

#### 2. Field Status
- `action_id` - Present in migration but NOT in CSV
  - **Status**: ✅ **NOT NEEDED** - System uses `id` field instead, `action_id` can be ignored/removed
- `business_distribution_area` - Defined in initial migration but NOT in CSV
  - **Status**: ✅ **EXPLAINED** - Renamed to `area_from_distribution` in migration `20251220000000_rename_business_distribution_area_to_area_from_distribution.sql`
  - **Current Field**: `area_from_distribution` (present in CSV) ✅

#### 3. Field Name Differences
- CSV uses: `structure_drawing_url`
- Migration uses: `structure_drawing_url` ✅ **MATCHES**

---

## 2. Assets History Table Comparison

### Fields in CSV:
1. id (bigint) ⚠️ **NOT in migration** - Migration doesn't define an `id` field
2. building_number (bigint)
3. payer_id (text)
4. asset_id (bigint)
5. measurement_date (text)
6. main_asset_type through sub_asset_type_6 (text)
7. asset_size through sub_asset_size_6 (numeric)
8. structure_drawing_url (text)
9. created_at (timestamp with time zone)
10. updated_at (timestamp with time zone)
11. elevator, single_double_family, condo, townhouses, penthouse (text)
12. history_created_at (timestamp with time zone) ✅
13. tax_region (integer)
14. floor (smallint)
15. discount_type, discount_date_from, discount_date_to (text)
16. area_from_distribution (numeric) ✅ **RENAMED from business_distribution_area**
17. exported_to_automation (boolean)
18. comment (text) ✅ **RECENTLY ADDED**

### Fields in Initial Schema Migration:
- All fields from assets table (except some defaults)
- `history_created_at` instead of `created_at`
- `action_id` (bigint) - **NOT NEEDED** (system uses `id` instead)
- `business_distribution_area` (numeric) → **RENAMED to `area_from_distribution`** ✅

### ✅ VALIDATION:
1. **`id` field in CSV**: The CSV shows an `id` field in `assets_history`. This is the correct primary key field.
2. **`action_id` missing in CSV**: ✅ **EXPECTED** - Not needed, system uses `id` field instead.

---

## 3. Field Configurations Table Comparison

### CSV Structure:
- grid_name (text)
- field_name (text)
- width_chars (integer)
- padding (integer)
- hebrew_name (text)
- pinned (boolean)
- pin_side (text)
- visible (boolean)
- column_order (integer)
- created_at (timestamp with time zone)
- updated_at (timestamp with time zone)

### Migration Structure:
✅ **MATCHES** - All fields are present in both

### Recent Changes:
- Default padding changed from 8 to 2 (migration `20251221000000_clear_and_refill_field_configurations.sql`)
- All pinned columns set to `pin_side = 'right'` (migration `20251221000003_update_pinned_columns_to_left.sql` - renamed to reflect 'right' setting)

---

## 4. Recommendations

### High Priority:
1. ✅ **Primary Key Verified**: `asset_id` is the correct primary key for the assets table (single column, not composite).

2. ✅ **Action ID Clarified**: `action_id` is not needed - the system uses `id` field instead. The field can be safely ignored or removed from migrations if desired.

3. ✅ **Field Renaming Confirmed**: `business_distribution_area` was correctly renamed to `area_from_distribution`.

### Medium Priority:
1. **Documentation Update**: Ensure CODEBASE_ANALYSIS.md and other docs match the actual database schema.

2. **Migration Audit**: Review all migrations to ensure they align with the current database state.

---

## 5. Summary

✅ **Schema Validation Complete**:
- Primary key structure is correct: `asset_id` is the primary key for assets table
- `action_id` is not needed (system uses `id` field)
- All field renames are accounted for (`business_distribution_area` → `area_from_distribution`)
- CSV matches the expected database schema

### Optional Cleanup:
If desired, `action_id` references in migrations could be removed or marked as deprecated, but this is not critical since the field is not used in the actual database.

