# Deep Diff: Save Flow in Asset Details vs Assets List

## 1. Data Source & Structure

### Asset Details
- **dirtyAssets**: `Map<number, Partial<Asset>>` — key is `asset_id` (number)
- **Source for merge**: `allMeasurements` — array of rows for ONE asset (latest + history)
- **Asset lookup**: `allMeasurements.find(a => a.asset_id === dbId)` — gets first match (latest is typically first)
- **Scope**: Single asset, multiple measurements (history); user edits the latest row only

### Assets List
- **dirtyAssets**: `Map<string, Partial<Asset>>` — key is `String(asset_id)`
- **Source for merge**: `assets` — filtered list from `api.assets.getAll(buildingNumber)` (optionally by tax_region)
- **Asset lookup**: `assets.find(a => String(a.asset_id) === String(assetId))`
- **Scope**: Multiple assets in one building; user can edit many rows

---

## 2. Payload Construction

### Asset Details (existing asset update)
```javascript
for (const [dbId, changes] of dirtyAssets.entries()) {
  const asset = allMeasurements.find(a => a.asset_id === dbId);
  assetsToUpdate.push({ ...asset, ...changes });
}
// NO normalization of main_asset_type
// NO explicit tax_region from tab
// NO distribution detection
```

### Assets List
```javascript
for (const [assetId, changes] of dirtyAssets.entries()) {
  const asset = assets.find(a => String(a.asset_id) === String(assetId));
  let updatedData = { ...asset, ...changes };
  
  // NORMALIZE main_asset_type to asset_types.name
  if (changes.main_asset_type !== undefined && assetTypes?.length && updatedData.main_asset_type) {
    const found = assetTypes.find(...) || assetTypes.find(...);
    if (found) updatedData = { ...updatedData, main_asset_type: String(found.name).trim() };
  }
  
  // EXPLICIT tax_region when single tab
  const taxRegionToSend = taxRegionValue != null && !isNaN(taxRegionValue) 
    ? taxRegionValue 
    : (updatedData.tax_region ?? asset.tax_region);
  if (taxRegionToSend != null) toPush.tax_region = taxRegionToSend;
  
  assetsToSave.push({ ...updatedData, asset_id: assetId, building_number: buildingNumberValue, tax_region });
}
```

**Difference**: Asset Details does NOT normalize main_asset_type or enforce tax_region from tab. Asset Details relies on the grid/cell storing the exact value.

---

## 3. Action Type (critical for distribution flag)

### Asset Details
- **Always** `'manual_update'`
- No distribution detection logic
- Never passes `business_distribution` or `residence_distribution`

### Assets List
- **Conditional**: `manual_update` | `business_distribution` | `residence_distribution`
- Distribution detection:
  1. `business_distribution_area` in changes **and** newArea > 0 → distribution
  2. `main_asset_type` changed to 199 (residence composite) → residence distribution
  3. (removed) Building flags fallback
- **Mixed batch**: If ANY asset has `main_asset_type` or `asset_size` in changes, we use `manual_update` (not distribution), so type-change assets get their flags via `set_distribution_flags_for_asset_type_change`. One distribution asset in the middle must not cause the whole batch to skip flag logic.
- When actionType is distribution → `p_set_distribution_flags_on_type_or_size_change: false` in API → DB skips type-change flag logic

---

## 4. API Call Signature

### Asset Details
```javascript
api.assets.saveBulkTransactional(
  assetsToUpdate,
  'manual_update',        // ALWAYS
  undefined,              // beforeData
  undefined,              // afterData
  undefined,              // description
  isBusinessContext
);
```

### Assets List
```javascript
api.assets.saveBulkTransactional(
  assetsToSave,
  actionType,             // 'manual_update' | 'business_distribution' | 'residence_distribution'
  undefined,              // beforeData
  afterData,              // set for distribution (overload_ratio, building)
  description,            // set for distribution
  isBusinessContext
);
```

---

## 5. isBusinessContext

### Asset Details
- Derived from asset type (business_residence === 'עסקים')
- Uses `validationTaxRegion` / tab context

### Assets List
- `isBusinessContext = !isResidentTaxRegion`
- Based on tab type (resident tax region vs business)

---

## 6. Mixed Batch: Type Change vs Distribution

When saving multiple assets, the batch gets a single `actionType`:
- `manual_update` → `p_set_distribution_flags_on_type_or_size_change: true` → DB runs `set_distribution_flags_for_asset_type_change` for each asset with type/size change
- `business_distribution` / `residence_distribution` → `p_set_distribution_flags_on_type_or_size_change: false` → DB skips that logic, clears building flag after save

**Problem**: Asset A (type change), Asset B (distribution allocation), Asset C (type change) — if we use distribution because of B, A and C would not get their flags.

**Fix**: If ANY asset has `main_asset_type` or `asset_size` in changes, use `manual_update` for the whole batch. Type-change assets always get their flags. Trade-off: we won't clear the building flag for that save (acceptable; type changes often require distribution anyway).

---

## 7. onCellValueChanged: main_asset_type + business_distribution_area

### Both (identical logic)
When user changes main_asset_type to non_accountable:
- Set `updatedAsset.business_distribution_area = 0`
- Store in dirtyAssets: `{ main_asset_type: newValue, business_distribution_area: 0 }`

### Assets List fix
- Distribution detection now requires `business_distribution_area > 0` (actual allocation)
- Clearing to 0 (type change to non_accountable) no longer triggers `isDistributionSave`

---

## 8. API Layer (validateAndSaveBulkAssets) — SAME for both

1. Fetch existing assets from DB by asset_id
2. Merge: `mergedAsset = { ...existingAsset, ...cleanAsset }`
3. Ensure `main_asset_type` in rest for updates (fallback to existing)
4. `sanitizeAssetInput(rest)` → `assetsForDatabase`
5. `p_set_distribution_flags_on_type_or_size_change: !isDistributionAction`
6. Call `save_assets_bulk_transactional`

---

## 9. Post-Save: Building Refresh

### Asset Details
```javascript
if (shouldRefreshBuildingFlags && asset && asset.building_number) {
  const updatedBuilding = await api.buildings.getOne(asset.building_number);
  setBuilding(updatedBuilding);
}
```
- Triggers when `main_asset_type` or `asset_size` in changes

### Assets List
```javascript
if (shouldRefreshBuildingFlags && buildingNumber) {
  const [updatedBuilding, assets] = await Promise.all([
    api.buildings.getOne(buildingNumber),
    api.assets.getAll(buildingNumber)
  ]);
  setBuilding(updatedBuilding);
  // ... update assets state
}
```
- Same condition: `main_asset_type` or `asset_size` in changes
- Also refreshes assets list

---

## 10. Key Differences Summary

| Aspect | Asset Details | Assets List |
|--------|---------------|-------------|
| actionType | Always `manual_update` | Can be distribution |
| main_asset_type normalize | No | Yes (to asset_types.name) |
| tax_region from tab | No (uses asset.tax_region) | Yes when single tab |
| business_distribution_area=0 | N/A (no dist detection) | Was triggering distribution; now fixed |
| Asset source | allMeasurements (latest row) | assets (filtered by building) |
| dirtyAssets key type | number | string |
| Number of assets | Typically 1 | 1 to many |

---

## 11. Recommendation: Align Asset Details with Assets List

To make Asset Details as robust as Assets List for type-change flag:

1. **Add main_asset_type normalization** in Asset Details when building assetsToUpdate (match Assets List)
2. **Explicit tax_region** from validationTaxRegion when building payload (match Assets List)

This ensures both paths send identical payload structure to the API.
