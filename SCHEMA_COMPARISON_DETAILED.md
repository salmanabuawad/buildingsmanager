# Detailed Schema Comparison Report
## Comparing current_system_db.csv with Migration Files

Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

---

## 1. ASSETS TABLE

### CSV Fields (35 total):
1. building_number (bigint)
2. payer_id (text)
3. asset_id (bigint) - **PRIMARY KEY**
4. measurement_date (text)
5. main_asset_type (text)
6. asset_size (numeric)
7-18. sub_asset_type_1 through sub_asset_type_6, sub_asset_size_1 through sub_asset_size_6 (12 fields)
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
33. area_from_distribution (numeric) ✅ **RENAMED from business_distribution_area**
34. exported_to_automation (boolean)
35. comment (text) ✅ **ADDED in migration 20251221000001**

### Migration Status:

#### ✅ Fields Present in CSV and Expected:
- All 35 fields match expected schema ✅
- `area_from_distribution` correctly renamed from `business_distribution_area` (migration 20251220000000)
- `comment` correctly added (migration 20251221000001)

#### ❌ Fields in Initial Schema but NOT in CSV (Expected Removal):
- `action_id` (bigint) - **Should be removed per migration 20250126000000**
  - Status: ✅ **CORRECTLY REMOVED** (not in CSV, which matches expected state)

#### Summary:
✅ **Assets table matches expected schema**

---

## 2. ASSETS_HISTORY TABLE

### CSV Fields (36 total):
1. id (bigint) ⚠️ **NOT in initial migration schema**
2. building_number (bigint)
3. payer_id (text)
4. asset_id (bigint)
5. measurement_date (text)
6-17. main_asset_type through sub_asset_size_6 (12 fields)
18. structure_drawing_url (text)
19. created_at (timestamp with time zone)
20. updated_at (timestamp with time zone)
21. elevator (text)
22. single_double_family (text)
23. condo (text)
24. townhouses (text)
25. penthouse (text)
26. history_created_at (timestamp with time zone) ✅
27. tax_region (integer)
28. floor (smallint)
29. discount_type (text)
30. discount_date_from (text)
31. discount_date_to (text)
32. area_from_distribution (numeric) ✅ **RENAMED from business_distribution_area**
33. exported_to_automation (boolean)
34. comment (text) ✅ **ADDED in migration 20251221000001**

### Migration Status:

#### ⚠️ Potential Discrepancy:
- **CSV has `id` (bigint)** but initial schema does NOT define it
- Need to check if there's a migration that adds `id` to assets_history
- OR if this is a database-specific addition (e.g., auto-generated row identifier)

#### ✅ Fields Present in CSV and Expected:
- All fields match except for `id`
- `area_from_distribution` correctly renamed
- `comment` correctly added
- `history_created_at` present ✅

#### ❌ Fields in Initial Schema but NOT in CSV (Expected Removal):
- `action_id` (bigint) - **Should be removed per migration 20250126000000**
  - Status: ✅ **CORRECTLY REMOVED** (not in CSV)

#### Summary:
⚠️ **Need to verify if `id` column exists in assets_history table in actual database**

---

## 3. BUILDINGS TABLE

### CSV Fields (18 total):
1. building_number (bigint) - **PRIMARY KEY**
2. total_building_area (numeric(10,2))
3. tax_region (text)
4. elevator (text)
5. single_double_family (text)
6. condo (text)
7. townhouses (text)
8. residence_shared_area (numeric(10,2))
9. business_shared_area (numeric(10,2))
10. area_for_control (numeric)
11. building_address (integer)
12. gosh (bigint)
13. helka (bigint)
14. building_number_in_street (bigint)
15. overload_ratio (numeric(5,2))
16. created_at (timestamp with time zone)
17. need_residence_distribution (boolean)
18. need_business_distribution (boolean)

### Migration Status:

#### ✅ Fields Present:
- All fields match expected schema from initial migration ✅

#### ❌ Fields in Initial Schema but NOT in CSV (Expected Removal):
- `action_id` (bigint) - **Should be removed per migration 20250126000000**
  - Status: ✅ **CORRECTLY REMOVED** (not in CSV)

#### Summary:
✅ **Buildings table matches expected schema**

---

## 4. KEY FINDINGS

### ✅ Correct Implementations:
1. **Assets table**: All fields match, `action_id` removed, `area_from_distribution` renamed, `comment` added
2. **Buildings table**: All fields match, `action_id` removed
3. **Assets_history table**: All fields match except for `id` column

### ⚠️ Potential Issues:
1. **Assets_history `id` column**: CSV shows `id` (bigint) but initial schema does not define it
   - **Possible explanations:**
     - Database added it automatically (unlikely)
     - Migration exists that adds it (need to verify)
     - Export tool added it (needs verification)

### ✅ Field Renames Applied Correctly:
- `business_distribution_area` → `area_from_distribution` ✅ (migration 20251220000000)

### ✅ New Fields Added Correctly:
- `comment` field added to `assets` and `assets_history` ✅ (migration 20251221000001)

### ✅ Fields Removed Correctly:
- `action_id` removed from `assets`, `assets_history`, and `buildings` ✅ (migration 20250126000000)

---

## 5. RECOMMENDATIONS

1. ✅ **Schema is mostly correct** - All major fields match
2. ⚠️ **Verify assets_history.id**: Check actual database to see if `id` column exists
3. ✅ **Migrations appear to be applied correctly**
4. 📝 **Documentation**: Update any documentation that references `business_distribution_area` to use `area_from_distribution`

---

## 6. NEXT STEPS

1. Query actual database to verify `assets_history.id` column
2. If `id` doesn't exist in actual database, update CSV export script
3. If `id` should exist, create migration to add it
4. Verify all migrations have been applied in correct order

