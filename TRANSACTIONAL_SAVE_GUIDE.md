# Transactional Save Functions - Usage Guide

## Overview

The system now enforces **validation BEFORE save** and guarantees that **all post-save actions happen in ONE transaction**. This ensures data integrity and prevents partial saves.

## Key Principles

### 1. Validation Enforcement
- **BEFORE** any save operation, validation MUST run and pass
- Database functions will **REJECT** operations if validation failed
- No partial or invalid data can be saved

### 2. Transaction Integrity
- **ALL** operations happen in a single database transaction:
  - Asset save (INSERT or UPDATE)
  - Building total area update
  - Distribution flags update
  - Audit log creation
- **If ANY step fails**, the entire operation rolls back
- **No partial saves** - it's all or nothing

## API Usage

### Single Asset Save

```typescript
import { api } from './lib/api';

// Save a single asset with validation and transactional post-save actions
const result = await api.assets.saveTransactional(
  assetData,           // Asset data object
  'manual_update',     // Action type (optional, default: 'manual_update')
  'Description here'   // Description (optional)
);

if (result.success) {
  console.log('Asset saved successfully:', result.asset_id);
} else {
  console.error('Save failed:', result.error);
}
```

**Return Type:**
```typescript
{
  success: boolean;
  asset_id: number;
  error?: string;      // Present if success = false
}
```

### Bulk Asset Save

```typescript
import { api } from './lib/api';

// Save multiple assets with validation and transactional post-save actions
const result = await api.assets.saveBulkTransactional(
  assetsDataArray,     // Array of asset data objects
  'manual_update',     // Action type (optional, default: 'manual_update')
  beforeData,          // Before state (optional, for audit)
  afterData,           // After state (optional, for audit)
  'Description here'   // Description (optional)
);

if (result.success) {
  console.log('Assets saved successfully:', result.count);
  console.log('Affected asset IDs:', result.affected_asset_ids);
  console.log('Action ID:', result.action_id);
} else {
  console.error('Bulk save failed:', result.error);
  if (result.validationErrors) {
    console.error('Validation errors:', result.validationErrors);
  }
}
```

**Return Type:**
```typescript
{
  success: boolean;
  action_id?: number;            // Present if success = true
  affected_asset_ids?: number[]; // Present if success = true
  count?: number;                // Present if success = true
  error?: string;                // Present if success = false
  validationErrors?: string[];   // Present if validation failed
}
```

## Behavior Details

### Validation Flow

1. **Application calls save function** with asset data
2. **Validation runs automatically** (in application layer)
3. **Database function receives validation result**
4. **If validation failed**: Database immediately rejects with error
5. **If validation passed**: Database proceeds with transactional save

### Transaction Rollback

If **ANY** of these steps fail, **ALL** changes roll back:

```
✓ Asset saved
✗ Building total area update fails
→ ROLLBACK: Asset is NOT saved (reverted)
```

```
✓ Asset saved
✓ Building total area updated
✗ Distribution flags update fails
→ ROLLBACK: Asset and area updates are NOT saved (reverted)
```

```
✓ Asset saved
✓ Building total area updated
✓ Distribution flags updated
✗ Audit log creation fails
→ ROLLBACK: Everything is NOT saved (reverted)
```

## Migration from Old Code

### OLD (Non-Transactional):
```typescript
// ❌ Old way: No validation enforcement, separate operations
const asset = await api.assets.create(assetData);

// This might fail, but asset is already saved!
await supabase.rpc('update_building_total_area', {
  p_building_number: asset.building_number
});

// This might fail, but asset and area are already saved!
await supabase.rpc('set_distribution_flags_for_asset_type_change', {
  p_building_number: asset.building_number,
  p_old_main_asset_type: oldType,
  p_new_main_asset_type: newType
});
```

### NEW (Transactional):
```typescript
// ✅ New way: Validation enforced, everything in one transaction
const result = await api.assets.saveTransactional(assetData, 'manual_update');

if (!result.success) {
  // If validation failed or any step failed, NOTHING was saved
  console.error('Save failed:', result.error);
  return;
}

// If we get here, EVERYTHING succeeded atomically
console.log('Asset saved with all post-save actions:', result.asset_id);
```

## Error Handling

### Validation Errors
```typescript
const result = await api.assets.saveTransactional(invalidAssetData);

if (!result.success) {
  // Check if it's a validation error
  if (result.error?.includes('Validation failed')) {
    alert('Please fix validation errors before saving');
  } else {
    alert('An error occurred during save');
  }
}
```

### Transaction Errors
```typescript
const result = await api.assets.saveBulkTransactional(assetsData);

if (!result.success) {
  // Check for transaction rollback
  if (result.error?.includes('rolled back')) {
    alert('Save failed and all changes were rolled back');
  }

  // Show validation errors if present
  if (result.validationErrors) {
    console.error('Validation errors:', result.validationErrors);
  }
}
```

## Action Types

Use appropriate action types to categorize operations:

- `'manual_update'` - Manual data entry or editing
- `'transfer_area'` - Area transfer operation
- `'distribute_area'` - Area distribution operation
- `'file_import'` - Bulk import from file
- `'data_correction'` - Data correction operation
- `'api_sync'` - API synchronization

## Best Practices

### 1. Always Check Success Flag
```typescript
const result = await api.assets.saveTransactional(data);
if (!result.success) {
  // Handle error
  return;
}
// Proceed only if successful
```

### 2. Show User-Friendly Error Messages
```typescript
if (!result.success) {
  if (result.error?.includes('Validation failed')) {
    toast.error('Please fix validation errors');
  } else if (result.error?.includes('rolled back')) {
    toast.error('Save failed. No changes were made.');
  } else {
    toast.error('An unexpected error occurred');
  }
}
```

### 3. Use Bulk Operations When Possible
```typescript
// ❌ Bad: Multiple individual saves
for (const asset of assets) {
  await api.assets.saveTransactional(asset);
}

// ✅ Good: Single bulk save
await api.assets.saveBulkTransactional(assets);
```

### 4. Provide Meaningful Descriptions
```typescript
await api.assets.saveTransactional(
  assetData,
  'manual_update',
  'Updated asset size after new measurement on 2024-01-15'
);
```

## Testing Transaction Rollback

To verify transaction integrity, you can test rollback scenarios:

1. **Test validation rejection**: Pass invalid data and verify nothing is saved
2. **Test mid-transaction failure**: Monitor database logs to verify rollback
3. **Test concurrent operations**: Verify no race conditions or partial saves

## Database Functions

The following database functions power this system:

### `save_asset_transactional`
- Single asset save with validation enforcement
- All post-save actions in one transaction
- SECURITY DEFINER (elevated privileges)

### `save_assets_bulk_transactional`
- Bulk asset save with validation enforcement
- All post-save actions in one transaction
- SECURITY DEFINER (elevated privileges)

Both functions:
- Accept `p_validation_passed` parameter (REQUIRED)
- Reject operations if validation failed
- Automatically rollback on any error
- Return detailed success/error information

## Troubleshooting

### Issue: "Validation status is required"
**Cause**: Validation was not performed before calling save function
**Solution**: Ensure validation runs before save (handled automatically by API functions)

### Issue: "Validation failed: ..."
**Cause**: Asset data did not pass validation rules
**Solution**: Fix validation errors in the data before attempting to save

### Issue: "Transaction failed and rolled back"
**Cause**: One of the post-save actions failed (area update, flags, audit)
**Solution**: Check database logs for the specific failure reason

## Summary

✅ **Always use** `saveTransactional` or `saveBulkTransactional`
✅ **Validation is enforced** automatically
✅ **All operations are atomic** (all or nothing)
✅ **Check success flag** before proceeding
✅ **Handle errors gracefully** with user-friendly messages

❌ **Never use** old `create`/`update` methods for critical operations
❌ **Never skip** validation checks
❌ **Never assume** partial saves are acceptable
