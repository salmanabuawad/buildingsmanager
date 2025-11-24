# Asset Type Validation Pseudocode

## Function: validateAssetTypeComplete

```
FUNCTION validateAssetTypeComplete(
    buildingNumber: number,
    assetTypeName: string,
    assetSize: number,
    assetData?: any
) RETURNS ValidationResult

BEGIN
    // ============================================
    // STEP 1: TAX REGION VALIDATION
    // ============================================
    taxRegionResult = validateAssetTypeForBuildingTaxRegion(buildingNumber, assetTypeName)
    IF taxRegionResult.valid == false THEN
        RETURN taxRegionResult  // Early exit if tax region invalid
    END IF

    // Fetch building data
    building = GET building FROM buildings WHERE building_number = buildingNumber
    IF building NOT FOUND THEN
        RETURN { valid: false, error: "Building not found" }
    END IF

    // Fetch asset type data
    assetType = GET asset_type FROM asset_types WHERE name = assetTypeName
    IF assetType NOT FOUND THEN
        RETURN { valid: false, error: "Asset type not found" }
    END IF

    // ============================================
    // STEP 2: ASSET AREA VALIDATION
    // ============================================
    // Check if asset size is within min/max range (if defined in asset_types table)
    IF assetSize != null AND assetSize > 0 THEN
        minSize = assetType.min_size
        maxSize = assetType.max_size
        
        IF minSize != null AND assetSize < minSize THEN
            RETURN { 
                valid: false, 
                error: "Asset size ({assetSize}) is below minimum ({minSize}) for type {assetTypeName}" 
            }
        END IF
        
        IF maxSize != null AND assetSize > maxSize THEN
            RETURN { 
                valid: false, 
                error: "Asset size ({assetSize}) exceeds maximum ({maxSize}) for type {assetTypeName}" 
            }
        END IF
    END IF

    // ============================================
    // STEP 3: PENTHOUSE VALIDATION
    // ============================================
    IF assetType.penthouse != null AND assetType.penthouse != '' THEN
        requiredPenthouse = assetType.penthouse.toLowerCase()
        assetPenthouse = assetData?.penthouse
        
        IF requiredPenthouse == 'כן' OR requiredPenthouse == 'yes' THEN
            IF assetPenthouse != 'כן' AND assetPenthouse != 'yes' THEN
                RETURN { 
                    valid: false, 
                    error: "Asset type {assetTypeName} requires penthouse, but asset is not marked as penthouse" 
                }
            END IF
        ELSE IF requiredPenthouse == 'לא' OR requiredPenthouse == 'no' THEN
            IF assetPenthouse == 'כן' OR assetPenthouse == 'yes' THEN
                RETURN { 
                    valid: false, 
                    error: "Asset type {assetTypeName} is not valid for penthouse, but asset is marked as penthouse" 
                }
            END IF
        END IF
    END IF

    // ============================================
    // STEP 4: BUILDING BOOLEAN VALUES VALIDATION
    // ============================================
    
    // Step 4a: Elevator requirement
    IF assetType.elevator != null AND assetType.elevator != '' THEN
        requiredElevator = assetType.elevator.toLowerCase()
        buildingHasElevator = building.has_elevator OR building.elevator == 'כן' OR building.elevator == 'yes'
        
        IF requiredElevator == 'כן' OR requiredElevator == 'yes' THEN
            IF buildingHasElevator == false THEN
                RETURN { 
                    valid: false, 
                    error: "Asset type {assetTypeName} requires elevator, but building has no elevator" 
                }
            END IF
        ELSE IF requiredElevator == 'לא' OR requiredElevator == 'no' THEN
            IF buildingHasElevator == true THEN
                RETURN { 
                    valid: false, 
                    error: "Asset type {assetTypeName} is for buildings without elevator, but building has elevator" 
                }
            END IF
        END IF
    END IF

    // Step 4b: Single/Double Family requirement
    IF assetType.single_double_family != null AND assetType.single_double_family != '' THEN
        requiredValue = assetType.single_double_family.toLowerCase()
        buildingValue = building.single_double_family?.toLowerCase()
        
        IF requiredValue == 'כן' OR requiredValue == 'yes' THEN
            IF buildingValue != 'כן' AND buildingValue != 'yes' THEN
                RETURN { 
                    valid: false, 
                    error: "Asset type {assetTypeName} requires single/double family, but building is not marked as such" 
                }
            END IF
        END IF
    END IF

    // Step 4c: Condo requirement
    IF assetType.condo != null AND assetType.condo != '' THEN
        requiredValue = assetType.condo.toLowerCase()
        buildingValue = building.condo?.toLowerCase()
        
        IF requiredValue == 'כן' OR requiredValue == 'yes' THEN
            IF buildingValue != 'כן' AND buildingValue != 'yes' THEN
                RETURN { 
                    valid: false, 
                    error: "Asset type {assetTypeName} requires condo, but building is not marked as such" 
                }
            END IF
        END IF
    END IF

    // Step 4d: Townhouses requirement
    IF assetType.townhouses != null AND assetType.townhouses != '' THEN
        requiredValue = assetType.townhouses.toLowerCase()
        buildingValue = building.townhouses?.toLowerCase()
        
        IF requiredValue == 'כן' OR requiredValue == 'yes' THEN
            IF buildingValue != 'כן' AND buildingValue != 'yes' THEN
                RETURN { 
                    valid: false, 
                    error: "Asset type {assetTypeName} requires townhouses, but building is not marked as such" 
                }
            END IF
        END IF
    END IF

    // Step 4e: Basement requirement
    IF assetType.basement != null AND assetType.basement != '' THEN
        requiredValue = assetType.basement.toLowerCase()
        buildingValue = building.basement?.toLowerCase()
        
        IF requiredValue == 'כן' OR requiredValue == 'yes' THEN
            IF buildingValue != 'כן' AND buildingValue != 'yes' THEN
                RETURN { 
                    valid: false, 
                    error: "Asset type {assetTypeName} requires basement, but building is not marked as such" 
                }
            END IF
        END IF
    END IF

    // All validations passed
    RETURN { valid: true }
END FUNCTION
```

## Validation Order Summary

1. **Tax Region** - Check if asset type exists in building's tax region
2. **Asset Area** - Check if asset size is within min_size/max_size range (if defined)
3. **Penthouse** - Check if asset penthouse status matches asset type requirement
4. **Building Boolean Values** - Check building properties in order:
   - Elevator
   - Single/Double Family
   - Condo
   - Townhouses
   - Basement

## Database Trigger (Data Integrity Only)

```
FUNCTION validate_asset_before_insert() RETURNS trigger
BEGIN
    // Data Integrity Checks Only (No Business Logic)
    
    // Check required fields
    IF asset_id IS NULL OR asset_id <= 0 THEN
        RAISE ERROR "Asset ID is required and must be positive"
    END IF
    
    IF building_number IS NULL OR building_number <= 0 THEN
        RAISE ERROR "Building number is required and must be positive"
    END IF
    
    IF measurement_date IS NULL OR measurement_date == '' THEN
        RAISE ERROR "Measurement date is required"
    END IF
    
    // Check foreign key integrity
    IF building NOT EXISTS WHERE building_number = NEW.building_number THEN
        RAISE ERROR "Building does not exist"
    END IF
    
    IF main_asset_type != '' AND asset_type NOT EXISTS WHERE name = NEW.main_asset_type THEN
        RAISE ERROR "Asset type does not exist"
    END IF
    
    // Check positive numbers
    IF asset_size IS NOT NULL AND asset_size <= 0 THEN
        RAISE ERROR "Asset size must be positive"
    END IF
    
    // Similar checks for sub-asset types and sizes...
    
    RETURN NEW
END FUNCTION
```

