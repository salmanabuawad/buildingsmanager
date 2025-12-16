# Architecture Quick Reference

## 🚨 CRITICAL RULE: Always Validate Before Save, Always Use Transactions

### ✅ DO THIS (Required Pattern)

```typescript
// Single asset save
const result = await api.assets.saveTransactional(assetData, 'manual_update');
if (!result.success) {
  console.error('Save failed:', result.error);
  return;
}

// Bulk asset save
const result = await api.assets.saveBulkTransactional(assetsArray, 'manual_update');
if (!result.success) {
  console.error('Save failed:', result.error);
  if (result.validationErrors) {
    console.error('Validation errors:', result.validationErrors);
  }
  return;
}

// Asset delete (transactional with distribution flag handling)
const result = await api.assets.delete(assetId);
// Distribution flags automatically set
```

### ❌ NEVER DO THIS (Forbidden Patterns)

```typescript
// ❌ Direct database operations
await supabase.from('assets').insert(assetData);
await supabase.from('assets').update(assetData);
await supabase.from('assets').delete().eq('asset_id', assetId);

// ❌ Separate non-transactional operations
await supabase.from('assets').insert(assetData);
await supabase.rpc('update_building_total_area', { ... }); // Too late!

// ❌ Delete without updating distribution flags
await supabase.from('assets').delete().eq('asset_id', assetId);
// Distribution flags NOT set!

// ❌ Skipping validation
await api.assets.create(assetData); // No validation enforcement!

// ❌ Not checking result
const result = await api.assets.saveTransactional(assetData);
// Continue without checking result.success
```

---

## What These Functions Do

**Single Save Transaction Includes:**
1. ✅ Validation check (rejects if failed)
2. ✅ Asset save (INSERT or UPDATE)
3. ✅ Building total area update
4. ✅ Distribution flags update
5. ✅ Audit log creation

**Single Delete Transaction Includes:**
1. ✅ Asset data retrieval (for audit)
2. ✅ Copy to history
3. ✅ Asset deletion
4. ✅ Building total area update
5. ✅ Distribution flags set to true (business/residence as applicable)
6. ✅ Audit log creation

**If ANY step fails → EVERYTHING rolls back**

---

## Key Files

### Code
- `src/lib/api.ts` - Contains `validateAndSaveAsset()` and `validateAndSaveBulkAssets()`
- `src/lib/validation.ts` - Validation rules and logic

### Database
- `supabase/migrations/20251216103948_add_transactional_save_functions.sql`
  - `save_asset_transactional()` function
  - `save_assets_bulk_transactional()` function
- `supabase/migrations/add_transactional_delete_function.sql`
  - `delete_asset_transactional()` function

### Documentation
- `CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md` - **READ THIS FIRST**
- `TRANSACTIONAL_SAVE_GUIDE.md` - Complete usage guide
- `TRANSACTIONAL_SAVE_EXAMPLES.md` - Code examples
- `VALIDATION_AND_TRANSACTION_SUMMARY.md` - Technical overview

---

## API Reference

### `api.assets.saveTransactional(assetData, actionType?, description?)`

**Parameters:**
- `assetData` - Asset data object
- `actionType` - Action type (default: 'manual_update')
- `description` - Optional description

**Returns:**
```typescript
{
  success: boolean;
  asset_id: number;
  error?: string;
}
```

### `api.assets.saveBulkTransactional(assetsArray, actionType?, beforeData?, afterData?, description?)`

**Parameters:**
- `assetsArray` - Array of asset data objects
- `actionType` - Action type (default: 'manual_update')
- `beforeData` - Before state (optional)
- `afterData` - After state (optional)
- `description` - Optional description

**Returns:**
```typescript
{
  success: boolean;
  action_id?: number;
  affected_asset_ids?: number[];
  count?: number;
  error?: string;
  validationErrors?: string[];
}
```

---

## Action Types

- `'manual_update'` - Manual data entry or editing
- `'transfer_area'` - Area transfer operation
- `'distribute_area'` - Area distribution operation
- `'file_import'` - Bulk import from file
- `'data_correction'` - Data correction operation
- `'api_sync'` - API synchronization

---

## Checklist Before Committing

- [ ] Using `api.assets.saveTransactional()` or `api.assets.saveBulkTransactional()`?
- [ ] NOT using direct `supabase.from('assets').insert/update()`?
- [ ] Checking `result.success` before proceeding?
- [ ] Handling validation errors?
- [ ] NOT catching and ignoring errors?

---

## When in Doubt

1. Read `CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md`
2. Use the patterns in `TRANSACTIONAL_SAVE_EXAMPLES.md`
3. Always use transactional save functions
4. Always check success flag
5. Never bypass validation
6. Never use direct database operations for assets

---

**If you're about to modify save logic: STOP and read the critical architecture document first.**
