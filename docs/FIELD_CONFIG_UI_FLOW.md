# Field Configuration UI Flow

How field configurations are loaded and applied to grids.

## 1. Load trigger (App.tsx)

```
Login → isAuthenticated=true
  → useEffect runs: loadFieldConfigurations() from fieldConfigUtils
  → On success: bumpFieldConfigVersion() (FieldConfigContext)
```

- **fieldConfigUtils**: Fetches from Supabase `field_configurations` table
- **bumpVersion**: Increments `configVersion` so grids re-read from cache

## 2. Cache (fieldConfigUtils.ts)

- **fieldConfigCache**: Map with keys `grid_name:field_name` and `field_name`
- **loadFieldConfigurations(gridName?)**: Uses `api.fieldConfigurations.getAll()` (origin pattern) → api uses Supabase when cache empty
- **isFieldConfigCacheLoaded()**: Sync check if cache is ready
- **getFieldConfigCache()**: Sync access to cache (for useFieldConfig)

## 3. Hook (useFieldConfig.ts)

Used by grids: `const [configuredColumnDefs, loading] = useFieldConfig(columnDefs, gridName)`

**Flow:**
1. Subscribes to `configVersion` (re-run when App bumps after load)
2. Subscribes to `subscribeFontSize` (re-run when font size changes)
3. **useEffect [gridName, configVersion]**:
   - If cache loaded → filter by gridName, setFieldConfigs, setLoading(false)
   - Else → loadFieldConfigurations(gridName), setFieldConfigs, setLoading(false)
4. **useMemo** produces configuredColumnDefs:
   - For each colDef: `fieldName = colDef.field || colDef.colId`
   - Lookup: `fieldConfigs.get(\`${gridName}:${fieldName}\`)` or `fieldConfigs.get(fieldName)`
   - If found: apply width, headerName, visibility, column_order, pinning
   - If not: return original with resizable:false

**Special:** `buildings-list` + `address` → maps to `building_address` in DB

## 4. Grid components

| Component | gridName | Waits for loading? |
|-----------|----------|--------------------|
| BuildingsList | buildings-list | Yes (spinner) |
| AssetsList | assets-list | Yes (spinner) |
| InspectionTasksManager | inspection-tasks-manager | Yes (spinner) |
| AddressList | address-list | No |
| AssetTypes | asset-types | No |
| AssetDataEntry | asset-data-entry | No |
| ... | ... | ... |

**Grid key:** `key={buildings-grid-${configVersion}-${fontSize}}` (BuildingsList, AssetsList, InspectionTasksManager)
- Forces AG Grid remount when config or font changes

## 5. Column lookup

- **colDef** must have `field` or `colId` matching DB `field_name`
- **DB**: `field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, visible, column_order, pinned, pin_side)`
- **Example**: BuildingsList `field: 'building_number'` → lookup `buildings-list:building_number`

## 6. Debug checklist

If grids don't show config:

1. **Supabase**: Table `field_configurations` exists? RLS allows SELECT?
2. **Console**: `[fieldConfigUtils] Loaded N field configs` in dev?
3. **Console**: `[useFieldConfig] buildings-list: X/Y cols have field config` in dev?
4. **grid_name**: Must match exactly (e.g. `buildings-list`, not `buildings_list`)
5. **field_name**: Must match colDef.field or colDef.colId exactly
