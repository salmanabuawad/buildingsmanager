# Schema Comparison Report
## Comparing current_system_db.csv with Migration Files

### Summary
This report compares the database schema defined in `current_system_db.csv` with the migration files to identify any discrepancies.

---

## Assets Table Comparison

### Fields in CSV (current_system_db.csv):
1. building_number (bigint)
2. payer_id (text)
3. asset_id (bigint) - **PRIMARY KEY**
4. measurement_date (text)
5. main_asset_type (text)
6. asset_size (numeric)
7-18. sub_asset_type_1 through sub_asset_type_6, sub_asset_size_1 through sub_asset_size_6
19. structure_drawing_url (text)
20. created_at (timestamp with time zone)
21. updated_at (timestamp with time zone)
22. elevator (text)
23. single_double_family (text)
24. condo (text)
25. townhouses (text)
26. penthouse (text)
27. tax_region (integer)
28. floor (smallint)
29. discount_type (text)
30. discount_date_from (text)
31. discount_date_to (text)
32. is_new_measurement (boolean)
33. area_from_distribution (numeric) ✅
34. exported_to_automation (boolean)
35. comment (text) ✅

**Total: 35 fields**

### Fields Expected from Migrations:
Based on migration analysis:

✅ **Match**: area_from_distribution (renamed from business_distribution_area in migration 20251220000000)
✅ **Match**: comment (added in migration 20251221000001)

❌ **Missing in CSV**: action_id (should be removed per migration 20250126000000, but initial schema has it)

---

## Assets History Table Comparison

### Fields in CSV:
1. id (bigint) ⚠️ **Different from code** (code doesn't have id as primary key)
2. building_number (bigint)
3. payer_id (text)
4. asset_id (bigint)
5. measurement_date (text)
... (similar fields to assets)
33. area_from_distribution (numeric) ✅
34. exported_to_automation (boolean)
35. comment (text) ✅

### Expected from Migrations:
- Should have: comment (added in 20251221000001)
- Should have: area_from_distribution (renamed from business_distribution_area)
- Should NOT have: action_id (removed in 20250126000000)
- Should have: history_created_at (timestamp)
- Primary key: No explicit primary key in migrations (composite key implied by asset_id + measurement_date)

---

## Key Findings

### 1. ✅ Assets Table - Area Field
- **CSV**: `area_from_distribution` ✅
- **Migrations**: Renamed from `business_distribution_area` to `area_from_distribution` in migration `20251220000000`
- **Status**: ✅ MATCH

### 2. ✅ Assets Table - Comment Field
- **CSV**: `comment` ✅
- **Migrations**: Added in migration `20251221000001`
- **Status**: ✅ MATCH

### 3. ⚠️ Assets Table - Action ID
- **CSV**: Not present
- **Initial Schema**: Has `action_id` (bigint)
- **Migration 20250126000000**: Should remove `action_id` from assets table
- **Status**: ⚠️ Need to verify if migration was applied correctly

### 4. ⚠️ Assets History Table - ID Field
- **CSV**: Has `id` (bigint) as field
- **Migrations**: Does not explicitly create `id` as primary key
- **Status**: ⚠️ Need to verify actual database structure

---

## Recommendations

1. **Verify action_id removal**: Check if migration `20250126000000_remove_action_id_from_assets_tables.sql` was applied correctly
2. **Verify assets_history structure**: Confirm if `id` column exists and its purpose
3. **Run migrations**: Ensure all migrations up to `20251221000001` (add comment) have been applied
4. **Validate field names**: Ensure `area_from_distribution` exists (not `business_distribution_area`)

---

## Next Steps

1. Query the actual database to verify current structure
2. Compare actual database structure with CSV export
3. Identify any missing migrations
4. Create migration script if discrepancies found

