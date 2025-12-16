# Transactional Save - Practical Examples

## Example 1: Simple Single Asset Save

```typescript
import { api } from './lib/api';

async function saveAsset() {
  const assetData = {
    asset_id: 12345,
    building_number: 100,
    main_asset_type: 15,
    asset_size: 75.5,
    sub_asset_type_1: 3,
    sub_asset_size_1: 25.0,
    measurement_date: '15/12/2024'
  };

  const result = await api.assets.saveTransactional(
    assetData,
    'manual_update',
    'New measurement entered by user'
  );

  if (result.success) {
    console.log('✓ Asset saved successfully:', result.asset_id);
    // Continue with your logic
    showSuccessMessage('Asset saved successfully!');
  } else {
    console.error('✗ Save failed:', result.error);
    // Show error to user
    showErrorMessage(result.error);
  }
}
```

## Example 2: Bulk Asset Save

```typescript
import { api } from './lib/api';

async function saveManyAssets(assets: any[]) {
  const result = await api.assets.saveBulkTransactional(
    assets,
    'manual_update',
    null, // no before data
    null, // no after data
    'Bulk update from data entry form'
  );

  if (result.success) {
    console.log(`✓ Saved ${result.count} assets`);
    console.log('✓ Action ID:', result.action_id);
    console.log('✓ Affected assets:', result.affected_asset_ids);

    showSuccessMessage(`Successfully saved ${result.count} assets`);
    refreshGrid();
  } else {
    console.error('✗ Bulk save failed:', result.error);

    if (result.validationErrors && result.validationErrors.length > 0) {
      console.error('Validation errors:');
      result.validationErrors.forEach(err => console.error('  -', err));

      showErrorMessage(
        'Some assets have validation errors:\n' +
        result.validationErrors.join('\n')
      );
    } else {
      showErrorMessage('Bulk save failed: ' + result.error);
    }
  }
}
```

## Example 3: Error Handling with User Feedback

```typescript
import { api } from './lib/api';

async function saveAssetWithFeedback(assetData: any) {
  try {
    const result = await api.assets.saveTransactional(
      assetData,
      'manual_update'
    );

    if (!result.success) {
      // Categorize error for better user feedback
      if (result.error?.includes('Validation failed')) {
        // Validation error
        showToast({
          type: 'error',
          title: 'Validation Error',
          message: 'Please check your data and try again',
          details: result.error
        });
      } else if (result.error?.includes('rolled back')) {
        // Transaction rollback
        showToast({
          type: 'error',
          title: 'Save Failed',
          message: 'An error occurred. No changes were made.',
          details: result.error
        });
      } else {
        // Other error
        showToast({
          type: 'error',
          title: 'Error',
          message: result.error || 'An unexpected error occurred'
        });
      }
      return false;
    }

    // Success
    showToast({
      type: 'success',
      title: 'Saved',
      message: `Asset ${result.asset_id} saved successfully`
    });
    return true;

  } catch (err) {
    // Network or other unexpected error
    console.error('Unexpected error:', err);
    showToast({
      type: 'error',
      title: 'Error',
      message: 'Failed to connect to server'
    });
    return false;
  }
}
```

## Example 4: Using with React Component

```typescript
import React, { useState } from 'react';
import { api } from '../lib/api';

function AssetForm() {
  const [asset, setAsset] = useState({ /* initial state */ });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    const result = await api.assets.saveTransactional(
      asset,
      'manual_update',
      'Form submission'
    );

    setSaving(false);

    if (result.success) {
      alert('Asset saved successfully!');
      // Reset form or navigate away
    } else {
      setError(result.error || 'Save failed');
    }
  };

  return (
    <div>
      {/* Form fields */}

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? 'Saving...' : 'Save Asset'}
      </button>
    </div>
  );
}
```

## Example 5: Bulk Save with Progress Tracking

```typescript
import { api } from './lib/api';

async function bulkSaveWithProgress(assets: any[]) {
  console.log(`Starting bulk save of ${assets.length} assets...`);

  // Show loading indicator
  showLoadingModal('Saving assets...');

  const startTime = Date.now();

  const result = await api.assets.saveBulkTransactional(
    assets,
    'file_import',
    null,
    null,
    `Bulk import of ${assets.length} assets`
  );

  const duration = Date.now() - startTime;

  // Hide loading indicator
  hideLoadingModal();

  if (result.success) {
    console.log(`✓ Completed in ${duration}ms`);
    console.log(`✓ Saved ${result.count} assets`);
    console.log(`✓ Action ID: ${result.action_id}`);

    showSuccessModal({
      title: 'Import Successful',
      message: `Successfully imported ${result.count} assets in ${(duration / 1000).toFixed(2)}s`,
      details: [
        `Action ID: ${result.action_id}`,
        `Assets: ${result.affected_asset_ids?.length || 0}`,
        `Buildings affected: ${result.affected_buildings?.length || 0}`
      ]
    });

    return true;
  } else {
    console.error(`✗ Failed after ${duration}ms`);
    console.error('Error:', result.error);

    if (result.validationErrors) {
      showErrorModal({
        title: 'Validation Failed',
        message: 'Some assets have validation errors:',
        errors: result.validationErrors
      });
    } else {
      showErrorModal({
        title: 'Import Failed',
        message: result.error || 'An error occurred during import',
        details: 'All changes have been rolled back. No data was saved.'
      });
    }

    return false;
  }
}
```

## Example 6: Retry Logic

```typescript
import { api } from './lib/api';

async function saveAssetWithRetry(
  assetData: any,
  maxRetries: number = 3
): Promise<boolean> {
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;
    console.log(`Save attempt ${attempt} of ${maxRetries}`);

    const result = await api.assets.saveTransactional(
      assetData,
      'manual_update'
    );

    if (result.success) {
      console.log('✓ Save successful');
      return true;
    }

    // Don't retry validation errors (they won't succeed)
    if (result.error?.includes('Validation failed')) {
      console.error('✗ Validation failed (not retrying)');
      showErrorMessage(result.error);
      return false;
    }

    // Retry transient errors
    if (attempt < maxRetries) {
      console.warn(`✗ Attempt ${attempt} failed, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    } else {
      console.error('✗ All retry attempts failed');
      showErrorMessage('Failed to save after multiple attempts');
      return false;
    }
  }

  return false;
}
```

## Example 7: Batch Processing Large Datasets

```typescript
import { api } from './lib/api';

async function processBatchesSequentially(
  allAssets: any[],
  batchSize: number = 100
) {
  const batches: any[][] = [];

  // Split into batches
  for (let i = 0; i < allAssets.length; i += batchSize) {
    batches.push(allAssets.slice(i, i + batchSize));
  }

  console.log(`Processing ${allAssets.length} assets in ${batches.length} batches`);

  let totalSaved = 0;
  let totalFailed = 0;
  const failedBatches: number[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`Processing batch ${i + 1} of ${batches.length} (${batch.length} assets)`);

    const result = await api.assets.saveBulkTransactional(
      batch,
      'file_import',
      null,
      null,
      `Batch ${i + 1} of ${batches.length}`
    );

    if (result.success) {
      totalSaved += result.count || 0;
      console.log(`✓ Batch ${i + 1} saved: ${result.count} assets`);
    } else {
      totalFailed += batch.length;
      failedBatches.push(i + 1);
      console.error(`✗ Batch ${i + 1} failed:`, result.error);
    }

    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('=== Summary ===');
  console.log(`Total saved: ${totalSaved}`);
  console.log(`Total failed: ${totalFailed}`);
  if (failedBatches.length > 0) {
    console.log(`Failed batches: ${failedBatches.join(', ')}`);
  }

  return {
    totalSaved,
    totalFailed,
    failedBatches
  };
}
```

## Example 8: Integration with AG Grid

```typescript
import { api } from '../lib/api';

function AssetGrid() {
  const onCellValueChanged = async (params: any) => {
    const asset = params.data;

    // Mark as saving
    params.node.setData({ ...asset, _saving: true });

    const result = await api.assets.saveTransactional(
      asset,
      'manual_update',
      `Updated ${params.colDef.field} field`
    );

    if (result.success) {
      // Mark as saved
      params.node.setData({ ...asset, _saving: false, _saved: true });

      // Flash the row green
      params.api.flashCells({
        rowNodes: [params.node],
        flashDelay: 1000
      });
    } else {
      // Mark as error and revert
      params.node.setData({ ...asset, _saving: false, _error: true });

      // Show error
      alert(`Failed to save: ${result.error}`);
    }
  };

  // Grid configuration
  const columnDefs = [
    // ... column definitions
  ];

  const gridOptions = {
    columnDefs,
    onCellValueChanged,
    // ... other options
  };

  return <AgGridReact {...gridOptions} />;
}
```

## Example 9: Validation Check Before Save

```typescript
import { api } from './lib/api';
import { validateAsset } from './lib/validation';

async function saveWithPreValidation(assetData: any) {
  // Pre-validate (UI check)
  const validation = await validateAsset(assetData, 'assets');

  if (!validation.valid) {
    // Show validation errors to user BEFORE attempting save
    showValidationErrors(validation.error);
    return false;
  }

  // Validation passed, proceed with save
  const result = await api.assets.saveTransactional(
    assetData,
    'manual_update'
  );

  if (result.success) {
    showSuccessMessage('Asset saved successfully');
    return true;
  } else {
    // This should rarely happen since we pre-validated
    showErrorMessage(result.error);
    return false;
  }
}
```

## Example 10: Migration from Old Code

### Before (Old Way)
```typescript
// ❌ Old non-transactional way
async function saveAssetOld(assetData: any) {
  try {
    // Create asset
    const asset = await api.assets.create(assetData);

    // Update building total (separate call)
    await supabase.rpc('update_building_total_area', {
      p_building_number: asset.building_number
    });

    // Update flags (separate call)
    await supabase.rpc('set_distribution_flags_for_asset_type_change', {
      p_building_number: asset.building_number,
      p_old_main_asset_type: null,
      p_new_main_asset_type: asset.main_asset_type
    });

    return asset;
  } catch (err) {
    // Problem: Asset might be saved but post-save actions failed!
    console.error('Error:', err);
    throw err;
  }
}
```

### After (New Way)
```typescript
// ✅ New transactional way
async function saveAssetNew(assetData: any) {
  const result = await api.assets.saveTransactional(
    assetData,
    'manual_update'
  );

  if (!result.success) {
    console.error('Save failed:', result.error);
    throw new Error(result.error);
  }

  // Everything succeeded atomically!
  return { asset_id: result.asset_id };
}
```

## Summary

These examples demonstrate:
- ✅ Simple single asset saves
- ✅ Bulk operations
- ✅ Error handling
- ✅ User feedback
- ✅ React integration
- ✅ Progress tracking
- ✅ Retry logic
- ✅ Batch processing
- ✅ AG Grid integration
- ✅ Pre-validation checks
- ✅ Migration from old code

All examples benefit from:
- Automatic validation enforcement
- Transactional integrity
- Automatic rollback on failure
- No partial saves
- Consistent database state
