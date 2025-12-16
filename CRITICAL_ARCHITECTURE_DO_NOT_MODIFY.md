# 🚨 CRITICAL ARCHITECTURE - DO NOT MODIFY 🚨

## ⚠️ MANDATORY READING FOR ALL DEVELOPERS AND CODE GENERATORS ⚠️

This document describes **CRITICAL SYSTEM ARCHITECTURE** that ensures data integrity and consistency. These patterns MUST NOT be modified, bypassed, or "improved" without explicit authorization.

**Violating these principles will result in data corruption and system inconsistency.**

---

## 1. VALIDATION-FIRST ARCHITECTURE

### ✅ MANDATORY RULE: Validation BEFORE Save

**ALL save operations MUST run validation BEFORE attempting to save to the database.**

### ❌ FORBIDDEN PATTERNS

```typescript
// ❌ NEVER DO THIS - Direct database save without validation
await supabase.from('assets').insert(assetData);
await supabase.from('assets').update(assetData);

// ❌ NEVER DO THIS - Save first, validate later
const asset = await api.assets.create(assetData);
await validateAsset(asset); // TOO LATE!

// ❌ NEVER DO THIS - Optional validation
if (shouldValidate) {  // Validation is NOT optional!
  await validateAsset(assetData);
}
await api.assets.create(assetData);

// ❌ NEVER DO THIS - Bypassing validation
await supabase.from('assets').insert(assetData); // Skip validation

// ❌ NEVER DO THIS - Ignoring validation results
const validation = await validateAsset(assetData);
// Proceed anyway regardless of validation result
await api.assets.create(assetData);
```

### ✅ REQUIRED PATTERNS

```typescript
// ✅ ALWAYS DO THIS - Use transactional save (validation is enforced)
const result = await api.assets.saveTransactional(assetData, 'manual_update');
if (!result.success) {
  // Handle validation or save error
  console.error(result.error);
  return;
}

// ✅ ALWAYS DO THIS - Bulk transactional save
const result = await api.assets.saveBulkTransactional(assetsArray, 'manual_update');
if (!result.success) {
  // Handle validation or save error
  if (result.validationErrors) {
    console.error('Validation errors:', result.validationErrors);
  }
  return;
}

// ✅ ACCEPTABLE - Pre-validation for UI feedback (but still use transactional save)
const validation = await validateAsset(assetData, 'assets');
if (!validation.valid) {
  showErrorToUser(validation.error);
  return; // Stop before save
}
// Still use transactional save (validation will run again in DB)
const result = await api.assets.saveTransactional(assetData, 'manual_update');
```

---

## 2. TRANSACTIONAL INTEGRITY

### ✅ MANDATORY RULE: All Post-Save Actions in ONE Transaction

**ALL operations related to a save MUST happen in a SINGLE database transaction:**

1. Asset save (INSERT/UPDATE)
2. Building total area update
3. Distribution flags update
4. Audit log creation

**If ANY step fails, ALL steps must roll back.**

### ❌ FORBIDDEN PATTERNS

```typescript
// ❌ NEVER DO THIS - Separate non-transactional operations
await supabase.from('assets').insert(assetData);
// Problem: If the next line fails, asset is already saved!
await supabase.rpc('update_building_total_area', { p_building_number: 100 });
// Problem: If this fails, asset and area are saved but flags are not!
await supabase.rpc('set_distribution_flags', { p_building_number: 100 });

// ❌ NEVER DO THIS - Try/catch around individual operations
try {
  await supabase.from('assets').insert(assetData);
} catch (err) {
  console.error('Asset save failed');
}
try {
  await supabase.rpc('update_building_total_area', { ... });
} catch (err) {
  console.error('Area update failed'); // Asset is already saved!
}

// ❌ NEVER DO THIS - Manual "rollback" logic
const asset = await supabase.from('assets').insert(assetData);
try {
  await supabase.rpc('update_building_total_area', { ... });
} catch (err) {
  // Trying to manually undo - WRONG APPROACH
  await supabase.from('assets').delete().eq('asset_id', asset.asset_id);
}

// ❌ NEVER DO THIS - Skipping post-save actions
await supabase.from('assets').insert(assetData);
// Done! (But building totals are wrong, flags are wrong, no audit!)

// ❌ NEVER DO THIS - "Fire and forget" post-save actions
await supabase.from('assets').insert(assetData);
supabase.rpc('update_building_total_area', { ... }); // No await - might fail silently!
```

### ✅ REQUIRED PATTERNS

```typescript
// ✅ ALWAYS DO THIS - Single transactional save
const result = await api.assets.saveTransactional(assetData, 'manual_update');
// All post-save actions are handled automatically in ONE transaction

// ✅ ALWAYS DO THIS - Bulk transactional save
const result = await api.assets.saveBulkTransactional(assetsArray, 'manual_update');
// All assets and all post-save actions in ONE transaction

// ✅ ALWAYS CHECK SUCCESS
if (!result.success) {
  // Everything was rolled back, no partial data exists
  console.error('Save failed and rolled back:', result.error);
  return;
}
// If we get here, EVERYTHING succeeded atomically
```

---

## 3. DATABASE FUNCTIONS - DO NOT BYPASS

### ✅ MANDATORY RULE: Use Designated Save Functions

**The following database functions are the ONLY approved way to save assets:**

- `save_asset_transactional` - Single asset save
- `save_assets_bulk_transactional` - Bulk asset save

**These functions are called by:**
- `api.assets.saveTransactional()`
- `api.assets.saveBulkTransactional()`
- `api.auditLog.bulkUpdateAssets()` (internally uses transactional save)

### ❌ FORBIDDEN PATTERNS

```typescript
// ❌ NEVER DO THIS - Direct table insert
await supabase.from('assets').insert({ ... });

// ❌ NEVER DO THIS - Direct table update
await supabase.from('assets').update({ ... }).eq('asset_id', 123);

// ❌ NEVER DO THIS - Raw SQL insert
await supabase.rpc('execute_sql', {
  query: 'INSERT INTO assets VALUES (...)'
});

// ❌ NEVER DO THIS - Using old non-transactional functions
await supabase.rpc('bulk_update_assets_with_audit', { ... }); // Deprecated!

// ❌ NEVER DO THIS - Creating new "simplified" save functions
async function quickSave(assetData) {
  // This bypasses validation and transactions!
  return await supabase.from('assets').insert(assetData);
}

// ❌ NEVER DO THIS - "Optimizing" by skipping steps
// "We don't need audit logs for this"
// "We don't need to update totals right now"
// "We can update flags later"
// NO! ALL steps are mandatory!
```

### ✅ REQUIRED PATTERNS

```typescript
// ✅ ALWAYS DO THIS - Use api.assets.saveTransactional
const result = await api.assets.saveTransactional(assetData, 'manual_update');

// ✅ ALWAYS DO THIS - Use api.assets.saveBulkTransactional
const result = await api.assets.saveBulkTransactional(assetsArray, 'manual_update');

// ✅ ALWAYS DO THIS - Use api.auditLog.bulkUpdateAssets (uses transactional internally)
const result = await api.auditLog.bulkUpdateAssets(
  assetsArray,
  'transfer_area',
  beforeData,
  afterData,
  'Description'
);
```

---

## 4. ERROR HANDLING

### ✅ MANDATORY RULE: Never Ignore Validation or Transaction Errors

### ❌ FORBIDDEN PATTERNS

```typescript
// ❌ NEVER DO THIS - Ignoring errors
try {
  await api.assets.saveTransactional(assetData, 'manual_update');
} catch (err) {
  // Ignore error
}

// ❌ NEVER DO THIS - Not checking success flag
const result = await api.assets.saveTransactional(assetData, 'manual_update');
// Continue regardless of result.success

// ❌ NEVER DO THIS - Assuming success
const result = await api.assets.saveTransactional(assetData, 'manual_update');
const assetId = result.asset_id; // Might be undefined if failed!
doSomethingWith(assetId);

// ❌ NEVER DO THIS - Catching and continuing
try {
  await api.assets.saveTransactional(assetData, 'manual_update');
} catch (err) {
  console.log('Failed but continuing anyway');
  // Continue with rest of code as if save succeeded
}
```

### ✅ REQUIRED PATTERNS

```typescript
// ✅ ALWAYS DO THIS - Check success flag
const result = await api.assets.saveTransactional(assetData, 'manual_update');
if (!result.success) {
  handleError(result.error);
  return; // Stop execution
}
// Only proceed if successful

// ✅ ALWAYS DO THIS - Handle validation errors specifically
const result = await api.assets.saveBulkTransactional(assetsArray, 'manual_update');
if (!result.success) {
  if (result.validationErrors) {
    showValidationErrors(result.validationErrors);
  } else {
    showGeneralError(result.error);
  }
  return;
}

// ✅ ALWAYS DO THIS - Proper try/catch with checks
try {
  const result = await api.assets.saveTransactional(assetData, 'manual_update');
  if (!result.success) {
    throw new Error(result.error);
  }
  // Success path
} catch (err) {
  // Handle error appropriately
  notifyUser('Save failed');
  logError(err);
  return; // Don't continue
}
```

---

## 5. MIGRATION CONSTRAINTS

### ✅ MANDATORY RULE: Do Not Modify Transactional Functions

**The following migration files and functions are CRITICAL and must NOT be modified:**

**Migration:** `supabase/migrations/add_transactional_save_functions.sql`

**Functions:**
- `save_asset_transactional`
- `save_assets_bulk_transactional`
- `update_building_total_area`
- `set_distribution_flags_for_asset_type_change`
- `log_audit_for_asset`
- `copy_asset_to_history_before_update`

### ❌ FORBIDDEN MODIFICATIONS

```sql
-- ❌ NEVER DO THIS - Removing validation check
-- Don't remove this check!
IF p_validation_passed = FALSE THEN
  RAISE EXCEPTION 'Validation failed: %', p_validation_errors;
END IF;

-- ❌ NEVER DO THIS - Removing transaction boundary
-- Don't add COMMIT or remove transaction
COMMIT; -- NO!

-- ❌ NEVER DO THIS - Making validation optional
IF p_validation_passed IS NOT NULL AND p_validation_passed = FALSE THEN
  -- This makes validation optional - WRONG!
END IF;

-- ❌ NEVER DO THIS - Skipping post-save actions
-- Don't comment out or remove these calls:
-- PERFORM update_building_total_area(v_building_number);
-- PERFORM set_distribution_flags_for_asset_type_change(...);

-- ❌ NEVER DO THIS - Changing exception handling
EXCEPTION
  WHEN OTHERS THEN
    -- Don't catch and ignore errors
    RETURN jsonb_build_object('success', true); -- WRONG!
```

### ✅ ACCEPTABLE MODIFICATIONS

```sql
-- ✅ ACCEPTABLE - Adding logging
RAISE NOTICE 'Processing asset_id: %', v_asset_id;

-- ✅ ACCEPTABLE - Adding new validations
IF v_asset_size < 0 THEN
  RAISE EXCEPTION 'Asset size cannot be negative';
END IF;

-- ✅ ACCEPTABLE - Improving error messages
RAISE EXCEPTION 'Validation failed: % (Asset ID: %)',
  p_validation_errors, v_asset_id;
```

---

## 6. CODE REVIEW CHECKLIST

**Before committing ANY code that saves assets, verify:**

- [ ] ✅ Uses `api.assets.saveTransactional()` or `api.assets.saveBulkTransactional()`
- [ ] ✅ Does NOT use direct `supabase.from('assets').insert()` or `.update()`
- [ ] ✅ Does NOT bypass validation
- [ ] ✅ Does NOT separate post-save actions from save
- [ ] ✅ Checks `result.success` flag before proceeding
- [ ] ✅ Handles validation errors appropriately
- [ ] ✅ Does NOT catch and ignore errors
- [ ] ✅ Does NOT modify transactional database functions
- [ ] ✅ Does NOT create new non-transactional save methods

---

## 7. CONSEQUENCES OF VIOLATIONS

**Violating these architecture rules will result in:**

1. **Data Corruption**
   - Building total areas incorrect
   - Distribution flags incorrect
   - Inconsistent data across tables

2. **Invalid Data in Database**
   - Negative asset sizes
   - Missing required fields
   - Constraint violations

3. **Partial Saves**
   - Asset saved but totals not updated
   - Flags not set correctly
   - Audit trail incomplete or missing

4. **Impossible to Debug Issues**
   - No clear audit trail
   - No way to identify which operation caused corruption
   - No way to roll back partial changes

5. **Loss of User Trust**
   - Data mysteriously changes
   - Reports show incorrect totals
   - System appears unreliable

---

## 8. TESTING REQUIREMENTS

**Any code that saves assets MUST include tests for:**

1. **Validation Enforcement**
   ```typescript
   // Test that invalid data is rejected
   const invalidAsset = { asset_id: 123, asset_size: -10 };
   const result = await api.assets.saveTransactional(invalidAsset);
   expect(result.success).toBe(false);
   expect(result.error).toContain('Validation failed');
   ```

2. **Transaction Rollback**
   ```typescript
   // Test that failures cause complete rollback
   // (Mock a post-save action to fail)
   // Verify asset is NOT saved in database
   ```

3. **Success Path**
   ```typescript
   // Test that valid data is saved with all post-save actions
   const validAsset = { /* valid data */ };
   const result = await api.assets.saveTransactional(validAsset);
   expect(result.success).toBe(true);
   // Verify asset saved
   // Verify building total updated
   // Verify flags set correctly
   // Verify audit log created
   ```

---

## 9. REFERENCE DOCUMENTATION

For implementation details and examples, see:

1. **TRANSACTIONAL_SAVE_GUIDE.md** - API usage guide
2. **VALIDATION_AND_TRANSACTION_SUMMARY.md** - Technical overview
3. **TRANSACTIONAL_SAVE_EXAMPLES.md** - Code examples
4. **Migration:** `supabase/migrations/add_transactional_save_functions.sql`

---

## 10. AUTHORIZATION REQUIREMENTS

**The following changes require explicit written authorization from system architect:**

- Modifying transactional save functions
- Creating new asset save methods
- Bypassing validation
- Removing post-save actions
- Changing transaction boundaries
- Making validation optional

**No exceptions.**

---

## 🚨 FINAL WARNING 🚨

**This architecture exists to ensure data integrity and system reliability.**

**DO NOT:**
- "Simplify" the code by removing steps
- "Optimize" by skipping validation
- "Speed up" by using direct inserts
- "Fix" by catching and ignoring errors
- "Improve" by making validation optional

**These are NOT improvements. They are BUGS.**

**If you encounter this document and are considering modifying the save architecture:**

**STOP. READ THIS DOCUMENT AGAIN. THEN DON'T DO IT.**

---

## Contact

For questions about this architecture or requests to modify it, contact the system architect.

**Under NO circumstances should this architecture be modified without explicit authorization.**

---

**Document Version:** 1.0
**Last Updated:** 2024-12-16
**Status:** MANDATORY COMPLIANCE REQUIRED
**Enforcement:** ALL DEVELOPERS, ALL CODE GENERATORS, NO EXCEPTIONS
