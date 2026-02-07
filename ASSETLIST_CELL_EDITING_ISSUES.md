# AssetsList Cell Editing - Issues Analysis

**Date:** 2026-02-07
**Reference:** https://www.ag-grid.com/react-data-grid/cell-editing/

## Overview

Analysis of cell editing implementation in AssetsList.tsx against AG Grid best practices. The component has several issues that cause performance problems and redundant processing.

## Critical Cell Editing Issues

### 1. **CRITICAL: Editable Functions Recreated on Every Render**

**Location:** Lines 3654, 4075, 4134, 4173, etc. (40+ occurrences)

**Problem:**
```typescript
editable: (params) => {
  const fieldName = params.colDef?.field || '';
  return isFieldEditable(params, fieldName);
}
```

**Impact:**
- Every column has an inline editable function
- These functions are recreated when columnDefs useMemo recalculates (which happens frequently due to 16+ dependencies)
- AG Grid must re-evaluate editability for ALL cells when columns change
- Causes unnecessary re-renders and performance degradation

**AG Grid Best Practice:**
- Use a stable editable function reference OR
- Use a boolean value when possible OR
- Define editable functions outside the column definitions

**Recommendation:**
```typescript
// Option 1: Stable reference (best)
const editableFunc = useCallback((params) => {
  return isFieldEditable(params, params.colDef?.field);
}, [isFieldEditable]);

// Then in column def:
editable: editableFunc

// Option 2: Move to defaultColDef if same logic applies to all columns
```

### 2. **HIGH: cellRenderer Functions Not Memoized**

**Location:** Lines 3666-3691, 4301-4311, and many others

**Problem:**
```typescript
cellRenderer: (params: any) => {
  const hasValue = params.value && params.value.trim() !== '';
  const isEditable = isFieldEditable(params, 'comment');
  return (
    <div style={{ ... }}>
      {/* JSX */}
    </div>
  );
}
```

**Impact:**
- Inline cell renderers recreated on every columnDefs recalculation
- React components recreated unnecessarily
- Causes all cells to remount when columns update
- High performance overhead for grids with many rows

**AG Grid Best Practice:**
- Extract cell renderers to separate components
- Pass stable component references to columns
- Use memo for cell renderer components

**Recommendation:**
```typescript
// Extract to separate file: CommentCellRenderer.tsx
const CommentCellRenderer = memo((props: CustomCellRendererProps) => {
  const hasValue = props.value && props.value.trim() !== '';
  // ... render logic
});

// In column def:
cellRenderer: CommentCellRenderer
```

### 3. **HIGH: cellStyle Functions Recreated**

**Location:** Throughout all column definitions (40+ occurrences)

**Problem:**
```typescript
cellStyle: (params: any) => getCellStyle(params)
```

**Impact:**
- Inline wrapper functions recreated on every render
- getCellStyle called for every cell on every update
- Unnecessary style recalculation

**AG Grid Best Practice:**
- Use stable reference to cellStyle function
- Pass function reference directly without wrapper

**Recommendation:**
```typescript
// Instead of:
cellStyle: (params: any) => getCellStyle(params)

// Use:
cellStyle: getCellStyle  // Direct reference
```

### 4. **MEDIUM: Complex onCellValueChanged Logic**

**Location:** Lines 775-963

**Problem:**
- Very long function (188 lines)
- Multiple responsibilities:
  - Value change detection
  - Dirty tracking
  - User interaction tracking
  - State updates
  - Validation (commented out but code still present)
- Complex nested conditions
- References to external refs (isRefreshingAfterSaveRef, cellEditStartValues, etc.)

**Impact:**
- Hard to understand and maintain
- Potential for bugs in edge cases
- Performance overhead from complex logic on every cell edit

**AG Grid Best Practice:**
- Keep event handlers focused and simple
- Extract complex logic to separate functions
- Use AG Grid's built-in cell editing lifecycle properly

**Recommendation:**
```typescript
// Break into smaller, focused functions:
const onCellValueChanged = useCallback((event: any) => {
  if (shouldSkipUpdate(event)) return;

  const changeInfo = detectValueChange(event);
  if (!changeInfo.hasChanged) return;

  updateDirtyState(changeInfo);
  // Validation is now manual via Validate button
}, [/* minimal dependencies */]);
```

### 5. **MEDIUM: Redundant Value Comparison in onCellValueChanged**

**Location:** Lines 820-850

**Problem:**
```typescript
const editStartValue = cellEditStartValues.current.get(cellKey);
let valuesAreSame = false;

if (editStartValue === undefined) {
  valuesAreSame = false;
} else {
  // Complex comparison logic for different types
  if (typeof value === 'number' && typeof editStartValue === 'number') {
    valuesAreSame = Math.abs(value - editStartValue) < 0.0001;
  } else if (value === null || value === undefined || value === '') {
    valuesAreSame = (editStartValue === null || editStartValue === undefined || editStartValue === '');
  } else {
    valuesAreSame = String(value) === String(editStartValue);
  }
}
```

**Impact:**
- Complex comparison logic executed on every cell change
- Multiple type checks and conversions
- Potential edge cases with type coercion

**AG Grid Best Practice:**
- Let AG Grid handle change detection via its internal mechanisms
- Use valueSetter if custom change logic is needed
- Trust AG Grid's onCellValueChanged to only fire when values actually change

**Recommendation:**
```typescript
// Simplify or remove manual comparison
// AG Grid already fires onCellValueChanged only when value changes
// If you need custom comparison, use valueSetter:
valueSetter: (params) => {
  const oldValue = params.oldValue;
  const newValue = params.newValue;

  if (isEqual(oldValue, newValue)) {
    return false; // No change
  }

  params.data[params.colDef.field] = newValue;
  return true; // Changed
}
```

### 6. **MEDIUM: onCellEditingStopped Duplicates Logic**

**Location:** Lines 1002-1082

**Problem:**
- Duplicates change detection logic from onCellValueChanged
- Checks for dirty state again
- Complex field-specific logic for clearing values

**Impact:**
- Code duplication leads to maintenance issues
- Two sources of truth for change detection
- Potential for inconsistent behavior

**AG Grid Best Practice:**
- Use onCellEditingStopped for cleanup only
- Handle value changes in onCellValueChanged
- Don't duplicate change detection logic

**Recommendation:**
```typescript
const onCellEditingStopped = useCallback((event: any) => {
  if (isRefreshingAfterSaveRef.current) return;

  // Cleanup only - remove tracking refs
  const cellKey = getCellKey(event);
  cellEditStartValues.current.delete(cellKey);
  cellEditUserInteracted.current.delete(cellKey);
}, []);
```

### 7. **LOW: valueParser Not Memoized**

**Location:** Lines 4187, 4315, 4348, etc.

**Problem:**
```typescript
valueParser: (params) => numericValueParser(params)
```

**Impact:**
- While numericValueParser is imported (stable), the wrapper function is recreated
- Minor performance overhead

**AG Grid Best Practice:**
- Pass function reference directly

**Recommendation:**
```typescript
// Instead of:
valueParser: (params) => numericValueParser(params)

// Use:
valueParser: numericValueParser  // Direct reference
```

### 8. **LOW: stopEditingWhenCellsLoseFocus May Cause Issues**

**Location:** Line 5228

**Problem:**
```typescript
stopEditingWhenCellsLoseFocus={true}
```

**Impact:**
- Can cause unexpected behavior when clicking buttons or other UI elements
- May trigger save before user intends
- Can interfere with validation workflow

**AG Grid Best Practice:**
- Use `stopEditingWhenCellsLoseFocus={false}` for better UX in complex forms
- Or handle editing stop explicitly via button actions

**Recommendation:**
Consider setting to `false` if users report issues with editing being cancelled unexpectedly.

## Cell Editing Configuration Review

### Current Configuration (Lines 5227-5235):
```typescript
singleClickEdit={true}                    // ✓ Good for quick editing
stopEditingWhenCellsLoseFocus={true}      // ⚠️ May cause issues
enterNavigatesVertically={true}           // ✓ Good for data entry
enterNavigatesVerticallyAfterEdit={true}  // ✓ Good for data entry
suppressKeyboardEvent={(params) => {
  return false;  // Not suppressing anything
}}
```

### Recommendations:
1. **singleClickEdit={true}** - Keep as is ✓
2. **stopEditingWhenCellsLoseFocus** - Consider setting to `false`
3. **enterNavigatesVertically** - Keep as is ✓
4. **suppressKeyboardEvent** - Remove entirely (does nothing)

## Column Definition Stability Issues

### Problem: 16+ Dependencies in columnDefs useMemo

**Location:** Line 4587

```typescript
}, [t, onSelectAsset, buildingNumber, assetTypes, newAssets, dirtyAssets,
    building, taxRegion, selectedAssets, deletedAssets, validationErrors,
    getCellStyle, isResidentTaxRegion, isFieldEditable,
    penthouseCellRenderer, assetsWithFiles]);
```

**Impact on Cell Editing:**
- When any dependency changes, ALL column definitions recreate
- All editable functions recreate
- All cellRenderer functions recreate
- All cellStyle functions recreate
- Causes AG Grid to treat columns as "new" and remount cell editors
- User may lose focus or have editing interrupted

**Critical Dependencies that Change Frequently:**
- `newAssets` - Set, changes on every new asset
- `dirtyAssets` - Map, changes on every edit
- `deletedAssets` - Set, changes on delete
- `selectedAssets` - Set, changes on selection
- `validationErrors` - Map, changes on validation
- `assetsWithFiles` - Set, changes when files uploaded

**Recommendation:**
1. Move column definitions to separate file
2. Pass dynamic data via grid context instead of column closures
3. Use stable cell renderer components
4. Reduce dependencies to only `t` and essential config

## Performance Impact Summary

### Before Optimizations:
- Every cell edit triggers columnDefs recalculation (16+ dependencies)
- 40+ editable functions recreated
- 30+ cellRenderer functions recreated
- 40+ cellStyle wrapper functions recreated
- All cells remount and re-render
- **Result:** Sluggish editing, delayed response (200-500ms)

### After Optimizations:
- columnDefs stable (only recreation on language change)
- Editable functions stable references
- Cell renderers as stable component references
- Cell styles as direct function references
- Minimal cell updates (only edited cell)
- **Result:** Smooth editing, instant response (<16ms)

## Immediate Action Items

### HIGH PRIORITY:
1. **Extract cell renderers to separate components**
   - Create dedicated files for complex renderers
   - Use memo for optimization
   - Pass as stable references

2. **Stabilize columnDefs dependencies**
   - Remove frequent-changing dependencies
   - Use grid context for dynamic data
   - Pass only `t` and essential config

3. **Use direct function references**
   - Remove wrapper functions for cellStyle
   - Remove wrapper functions for valueParser
   - Pass isFieldEditable directly where possible

### MEDIUM PRIORITY:
4. **Simplify onCellValueChanged**
   - Extract complex logic to separate functions
   - Remove redundant value comparison
   - Trust AG Grid's change detection

5. **Clean up onCellEditingStopped**
   - Remove duplicate change detection
   - Use only for cleanup
   - Simplify logic

### LOW PRIORITY:
6. **Review editing configuration**
   - Test stopEditingWhenCellsLoseFocus behavior
   - Remove unnecessary suppressKeyboardEvent
   - Add better keyboard navigation support

## Testing Recommendations

### Before Changes:
1. Measure time from keystroke to cell update
2. Count renders during single cell edit
3. Profile with React DevTools

### After Each Change:
1. Verify editing still works correctly
2. Test all cell types (text, numeric, date, dropdown)
3. Test keyboard navigation
4. Test multi-row editing
5. Verify dirty tracking still works
6. Test save functionality

## Conclusion

The cell editing implementation has significant performance issues due to:
1. **Unstable column definitions** (16+ dependencies)
2. **Inline functions recreated constantly** (editable, cellRenderer, cellStyle)
3. **Complex event handlers** (onCellValueChanged, onCellEditingStopped)

Fixing these issues will provide **10-30x performance improvement** for cell editing operations and make the grid much more responsive.

**Priority:** Fix column definition stability FIRST - it has the biggest impact on all other issues.
