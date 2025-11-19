# Comprehensive Asset Type Validation Implementation

## Overview
Implemented a comprehensive 3-step validation system for asset types when creating new measurements. The validation now checks tax region, elevator requirements, and size ranges before saving data.

## Validation Rules

### Step 1: Tax Region Match
- Validates that the asset type exists in the building's tax region
- Supports comma-separated tax regions in buildings (e.g., "10,40")
- Error message: `סוג הנכס "XXX" (אזור מס YY) לא קיים באזור המס של הבניין (ZZ)`

### Step 2: Elevator Requirement Match
- Checks if the asset type's elevator requirement matches the building's elevator status
- Only applies when asset type has an explicit elevator requirement
- Error message: `סוג הנכס "XXX" דורש/לא דורש מעלית, אבל בבניין יש/אין מעלית`

### Step 3: Size Range Validation
- Verifies the asset size falls within the min/max range defined for that asset type
- Only applies when size constraints are defined in asset_types table
- Error messages:
  - Min: `גודל הנכס (XX) קטן מהמינימום המותר לסוג "YYY" (ZZ)`
  - Max: `גודל הנכס (XX) גדול מהמקסימום המותר לסוג "YYY" (ZZ)`

## Implementation Details

### New Functions in validation.ts

1. **validateAssetTypeComplete()**
   - Performs all 3 validation steps
   - Parameters: buildingNumber, assetTypeName, assetSize
   - Returns: ValidationResult with detailed error messages

2. **Asset Validators Extended**
   - `validateMainAssetTypeComplete()` - validates main asset type
   - `validateSubAssetTypeComplete()` - validates sub-asset types

### Updated Components

#### AssetDataEntry.tsx

1. **handleAddNewMeasurement()**
   - Now validates all asset data before saving a new measurement
   - Validates main asset type and all 6 sub-asset types
   - Validates size ranges, elevator requirements, and tax regions
   - Shows clear error messages if validation fails

2. **handleSaveAll()**
   - Updated to use complete validation for all save operations
   - Prevents saving invalid data

3. **onCellValueChanged()**
   - Real-time validation as user edits cells
   - Immediate feedback with error indicators

## Sample Data Coverage

Generated comprehensive sample data that covers:
- 8 buildings with different tax regions (10, 20, 30, 32, 40)
- Buildings with and without elevators
- 22 unique assets with various asset types
- 34 total measurement records (including historical measurements)
- Assets with 1-6 sub-assets demonstrating full validation
- Size ranges from 35 m² to 185 m²
- Multiple measurement dates showing history tracking

### Building Configuration
- Building 1001: Tax region 10, WITH elevator (types 211, 212, 213)
- Building 1002: Tax region 10, WITHOUT elevator (types 214, 215)
- Building 1003: Tax region 20, WITH elevator (types 221, 222, 223)
- Building 1004: Tax region 20, WITHOUT elevator (types 224, 225)
- Building 1005: Tax region 30, WITH elevator (types 231, 232, 233)
- Building 1006: Tax region 30, WITHOUT elevator (types 234, 235)
- Building 1007: Tax region 32 (types 241, 242)
- Building 1008: Tax region 40 (types 316, 317, 318, 390, 397)

## Usage

When creating a new measurement:
1. Click "מדידה חדשה" button on an existing asset
2. Enter the measurement date
3. System validates:
   - Building exists
   - Asset type matches building's tax region
   - Asset type's elevator requirement matches building
   - Asset size is within the allowed range for that type
   - All sub-asset types follow the same rules
4. If validation passes, measurement is saved
5. If validation fails, clear error message is displayed

## Error Handling

All validation errors are displayed in Hebrew with clear, user-friendly messages that explain:
- What failed (tax region, elevator, size)
- Expected value vs actual value
- Which asset type caused the issue
