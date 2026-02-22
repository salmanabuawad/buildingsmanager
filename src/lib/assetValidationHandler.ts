import { Asset } from './api';
import { assetValidators, inputValidators, ValidationResult } from './validation';

export interface AssetValidationProgress {
  current: number;
  total: number;
  currentAsset?: string;
  currentStep?: string;
}

export interface AssetValidationResult {
  assetId: string | number;
  assetIdentifier: string; // For display (e.g., "נכס 100501 (מבנה 1005)")
  valid: boolean;
  errors: string[];
  passed: string[];
  matchedAssetTypeRecord?: string;
}

export interface BatchValidationResult {
  results: AssetValidationResult[];
  total: number;
  valid: number;
  invalid: number;
  progress?: AssetValidationProgress;
}

export type ValidationMode = 'single' | 'building' | 'all' | 'import';

export interface ValidationOptions {
  mode: ValidationMode;
  onProgress?: (progress: AssetValidationProgress) => void;
  validateOnlyLatest?: boolean; // For building mode: validate only latest record per asset_id
  taxRegion?: string; // Optional tax region that will OVERRIDE building tax region for validation (from tab header)
  cachedData?: { assetTypes?: any[]; building?: any; asset?: any }; // Cached data to avoid database queries
}

/**
 * Unified validation handler for assets
 * Supports single asset, building assets, all assets, and import validation
 */
export class AssetValidationHandler {
  /**
   * Validate a single asset
   */
  static async validateSingleAsset(
    asset: Asset,
    options?: { onProgress?: (progress: AssetValidationProgress) => void; taxRegion?: string; cachedData?: { assetTypes?: any[]; building?: any; asset?: any } }
  ): Promise<AssetValidationResult> {
    const assetIdentifier = `נכס ${asset.asset_id}${asset.building_number ? ` (מבנה ${asset.building_number})` : ''}`;
    
    // Log validation parameters for debugging (disabled to reduce console noise)
    // Uncomment below and adjust frequency if needed for debugging
    // if (process.env.NODE_ENV === 'development' && Math.random() < 0.001) { // Log only 0.1% of validations
    // }
    
    // Include asset in cachedData so validation can access asset.tax_region
    const cachedDataWithAsset = {
      ...(options?.cachedData || {}),
      asset: asset
    };
    
    return await this.validateAssetInternal(asset, assetIdentifier, options?.onProgress, options?.taxRegion, cachedDataWithAsset);
  }

  /**
   * Validate all assets for a building
   */
  static async validateBuildingAssets(
    assets: Asset[],
    buildingNumber: number,
    options?: ValidationOptions & { validationRules?: any[] }
  ): Promise<BatchValidationResult> {
    // If validateOnlyLatest is true, group by asset_id and take only the latest
    let assetsToValidate = assets;
    if (options?.validateOnlyLatest) {
      const assetsByAssetId = new Map<string | number, Asset[]>();
      for (const asset of assets) {
        const assetIdKey = asset.asset_id;
        if (!assetsByAssetId.has(assetIdKey)) {
          assetsByAssetId.set(assetIdKey, []);
        }
        assetsByAssetId.get(assetIdKey)!.push(asset);
      }

      // Sort each group by measurement_date (newest first) and take the first
      assetsToValidate = Array.from(assetsByAssetId.values()).map(group => {
        const parseDate = (dateStr: string) => {
          const parts = dateStr.split('/');
          if (parts.length === 3) {
            return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
          }
          return new Date(dateStr);
        };
        group.sort((a, b) => {
          const dateA = parseDate(a.measurement_date);
          const dateB = parseDate(b.measurement_date);
          const dateDiff = dateB.getTime() - dateA.getTime();
          if (dateDiff !== 0) return dateDiff;
          return (b.id as number) - (a.id as number);
        });
        return group[0];
      });
    }

    const results: AssetValidationResult[] = [];
    const total = assetsToValidate.length;

    // Pre-fetch all building data and asset types if not cached
    let cachedData = options?.cachedData || {};
    if (!cachedData.building) {
      try {
        const { api } = await import('./api');
        cachedData.building = await api.buildings.getOne(buildingNumber);
      } catch (error) {
        console.error('Failed to fetch building data:', error);
      }
    }

    // Process assets in parallel batches to improve performance
    const BATCH_SIZE = 10; // Process 10 assets at a time
    for (let batchStart = 0; batchStart < assetsToValidate.length; batchStart += BATCH_SIZE) {
      const batch = assetsToValidate.slice(batchStart, batchStart + BATCH_SIZE);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (asset, batchIndex) => {
        const i = batchStart + batchIndex;
        const assetIdentifier = `נכס ${asset.asset_id}${asset.building_number ? ` (מבנה ${asset.building_number})` : ''}`;

        if (options?.onProgress) {
          options.onProgress({
            current: i + 1,
            total,
            currentAsset: assetIdentifier,
            currentStep: `בודק נכס ${i + 1} מתוך ${total}...`
          });
        }

        // Include asset in cachedData so validation can access asset.tax_region
        const cachedDataWithAsset = {
          ...(cachedData || {}),
          asset: asset
        };
        
        return await this.validateAssetInternal(
          asset,
          assetIdentifier,
          undefined,
          options?.taxRegion,
          cachedDataWithAsset,
          options?.validationRules
        );
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    // Building-level parking validations: only assets whose main type or any subtype has use_for_parking_shared_area
    const building = cachedData?.building;
    let assetTypes = cachedData?.assetTypes;
    if (!assetTypes?.length && building) {
      try {
        const { api } = await import('./api');
        assetTypes = await api.assetTypes.getAll();
      } catch {
        assetTypes = [];
      }
    }
    const typeNameToParking = new Map<string, boolean>();
    for (const at of assetTypes || []) {
      const name = String(at?.name ?? '').trim();
      if (name) typeNameToParking.set(name, at.use_for_parking_shared_area === true);
      const num = parseInt(name, 10);
      if (!isNaN(num)) typeNameToParking.set(String(num), at.use_for_parking_shared_area === true);
    }
    const isParkingEligible = (a: Asset) => {
      const main = String(a.main_asset_type ?? '').trim();
      if (main && typeNameToParking.get(main)) return true;
      const subs = [
        a.sub_asset_type_1, a.sub_asset_type_2, a.sub_asset_type_3,
        a.sub_asset_type_4, a.sub_asset_type_5, a.sub_asset_type_6
      ];
      for (const s of subs) {
        const t = String(s ?? '').trim();
        if (t && typeNameToParking.get(t)) return true;
      }
      return false;
    };
    const parkingEligibleIds = new Set<string | number>();
    let assetsSharedParkingSum = 0;
    let assetsParkingUnitsSum = 0;
    for (const asset of assetsToValidate) {
      if (!isParkingEligible(asset)) continue;
      parkingEligibleIds.add(asset.asset_id);
      const v = (asset as any).shared_parking_area;
      if (v != null && v !== '') assetsSharedParkingSum += Number(v) || 0;
      const u = (asset as any).number_of_parking_units;
      if (u != null && u !== '') assetsParkingUnitsSum += Number(u) || 0;
    }

    // Parking-eligible assets: number_of_parking_units must be a positive integer
    const parkingUnitsErr = 'בנכס עם סוג/תת-סוג שימוש לחניה, מספר יחידות חניה חייב להיות מספר שלם גדול מ-0';
    for (let i = 0; i < results.length; i++) {
      if (!parkingEligibleIds.has(assetsToValidate[i].asset_id)) continue;
      const u = (assetsToValidate[i] as any).number_of_parking_units;
      const num = u != null && u !== '' ? Number(u) : NaN;
      if (num === undefined || num === null || Number.isNaN(num) || !Number.isInteger(num) || num < 1) {
        if (!results[i].errors.includes(parkingUnitsErr)) results[i].errors.push(parkingUnitsErr);
        results[i].valid = false;
      }
    }

    const tolerance = 0.01;

    // Only validate building shared_parking_area when sum of assets' shared parking area is > 0
    const validateBuildingSharedParkingArea = assetsSharedParkingSum > 0;

    const buildingSharedParking = building?.shared_parking_area != null && building?.shared_parking_area !== ''
      ? Number(building.shared_parking_area)
      : null;
    const buildingParkingUnits = building?.number_of_parking_units != null && building?.number_of_parking_units !== ''
      ? Number(building.number_of_parking_units)
      : null;

    // When building has parking data: sum of assets' number_of_parking_units must equal building.number_of_parking_units
    if (buildingParkingUnits != null && !isNaN(buildingParkingUnits)) {
      if (assetsParkingUnitsSum !== buildingParkingUnits) {
        const err = `סכום מספר יחידות חניה בנכסים (${assetsParkingUnitsSum}) אינו שווה למספר יחידות חניה במבנה (${buildingParkingUnits})`;
        for (let i = 0; i < results.length; i++) {
          if (parkingEligibleIds.has(assetsToValidate[i].asset_id)) {
            if (!results[i].errors.includes(err)) results[i].errors.push(err);
            results[i].valid = false;
          }
        }
      }
    }

    // When sum of assets' shared parking area > 0: sum must equal building.shared_parking_area
    if (validateBuildingSharedParkingArea && buildingSharedParking != null && !isNaN(buildingSharedParking)) {
      if (buildingSharedParking === 0) {
        for (let i = 0; i < results.length; i++) {
          if (!parkingEligibleIds.has(assetsToValidate[i].asset_id)) continue;
          const v = (assetsToValidate[i] as any).shared_parking_area;
          const assetVal = (v != null && v !== '') ? Number(v) : 0;
          if (assetVal !== 0 && !isNaN(assetVal)) {
            const err = `שטח חניה משותף במבנה הוא 0 – שטח חניה משותף בנכס חייב להיות 0`;
            if (!results[i].errors.includes(err)) results[i].errors.push(err);
            results[i].valid = false;
          }
        }
      } else if (Math.abs(assetsSharedParkingSum - buildingSharedParking) > tolerance) {
        const err = `סכום שטח חניה משותף בנכסים (${assetsSharedParkingSum}) אינו שווה לשטח חניה משותף במבנה (${buildingSharedParking})`;
        for (let i = 0; i < results.length; i++) {
          if (parkingEligibleIds.has(assetsToValidate[i].asset_id)) {
            if (!results[i].errors.includes(err)) results[i].errors.push(err);
            results[i].valid = false;
          }
        }
      }
    }

    // Each asset's shared_parking_area must not exceed the building's shared_parking_area (only when assets have shared parking area)
    if (validateBuildingSharedParkingArea && buildingSharedParking != null && !isNaN(buildingSharedParking)) {
      for (let i = 0; i < results.length; i++) {
        if (!parkingEligibleIds.has(assetsToValidate[i].asset_id)) continue;
        const v = (assetsToValidate[i] as any).shared_parking_area;
        const assetVal = (v != null && v !== '') ? Number(v) : 0;
        if (!isNaN(assetVal) && assetVal > buildingSharedParking) {
          const err = `שטח חניה משותף בנכס (${assetVal}) גדול משטח חניה משותף במבנה (${buildingSharedParking})`;
          if (!results[i].errors.includes(err)) results[i].errors.push(err);
          results[i].valid = false;
        }
      }
    }

    const valid = results.filter(r => r.valid).length;
    const invalid = results.filter(r => !r.valid).length;

    return {
      results,
      total,
      valid,
      invalid
    };
  }

  /**
   * Validate all assets in the system
   * @param taxRegion Optional tax region that will override building tax region for validation
   */
  static async validateAllAssets(
    assets: Asset[],
    options?: ValidationOptions
  ): Promise<BatchValidationResult> {
    // Group by asset_id and take only the latest if validateOnlyLatest is true
    let assetsToValidate = assets;
    if (options?.validateOnlyLatest) {
      const assetsByAssetId = new Map<string | number, Asset[]>();
      for (const asset of assets) {
        const assetIdKey = asset.asset_id;
        if (!assetsByAssetId.has(assetIdKey)) {
          assetsByAssetId.set(assetIdKey, []);
        }
        assetsByAssetId.get(assetIdKey)!.push(asset);
      }

      assetsToValidate = Array.from(assetsByAssetId.values()).map(group => {
        const parseDate = (dateStr: string) => {
          const parts = dateStr.split('/');
          if (parts.length === 3) {
            return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
          }
          return new Date(dateStr);
        };
        group.sort((a, b) => {
          const dateA = parseDate(a.measurement_date);
          const dateB = parseDate(b.measurement_date);
          const dateDiff = dateB.getTime() - dateA.getTime();
          if (dateDiff !== 0) return dateDiff;
          return (b.id as number) - (a.id as number);
        });
        return group[0];
      });
    }

    const results: AssetValidationResult[] = [];
    const total = assetsToValidate.length;

    // Process assets in parallel batches to improve performance
    const BATCH_SIZE = 10; // Process 10 assets at a time
    for (let batchStart = 0; batchStart < assetsToValidate.length; batchStart += BATCH_SIZE) {
      const batch = assetsToValidate.slice(batchStart, batchStart + BATCH_SIZE);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (asset, batchIndex) => {
        const i = batchStart + batchIndex;
        const assetIdentifier = `נכס ${asset.asset_id}${asset.building_number ? ` (מבנה ${asset.building_number})` : ''}`;

        if (options?.onProgress) {
          options.onProgress({
            current: i + 1,
            total,
            currentAsset: assetIdentifier,
            currentStep: `בודק נכס ${i + 1} מתוך ${total}...`
          });
        }

        return await this.validateAssetInternal(asset, assetIdentifier);
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    const valid = results.filter(r => r.valid).length;
    const invalid = results.filter(r => !r.valid).length;

    return {
      results,
      total,
      valid,
      invalid
    };
  }

  /**
   * Validate assets from import
   * @param taxRegion Optional tax region that will override building tax region for validation
   */
  static async validateImportAssets(
    assets: Asset[],
    options?: ValidationOptions
  ): Promise<BatchValidationResult> {
    const results: AssetValidationResult[] = [];
    const total = assets.length;

    // First, check for duplicate asset_ids with different building_numbers within the import batch
    // An asset_id can only belong to one building
    const assetIdToBuildings = new Map<string | number, Set<number>>();
    const assetIdToRowIndices = new Map<string | number, number[]>();
    
    assets.forEach((asset, index) => {
      const assetId = asset.asset_id;
      if (!assetId) return;
      
      const assetIdKey = typeof assetId === 'string' ? assetId : String(assetId);
      const buildingNum = typeof asset.building_number === 'string' 
        ? parseInt(asset.building_number, 10) 
        : asset.building_number;
      
      if (!assetIdToBuildings.has(assetIdKey)) {
        assetIdToBuildings.set(assetIdKey, new Set());
        assetIdToRowIndices.set(assetIdKey, []);
      }
      assetIdToBuildings.get(assetIdKey)!.add(buildingNum);
      assetIdToRowIndices.get(assetIdKey)!.push(index + 1); // 1-based row number
    });

    // Pre-fetch buildings for all unique building numbers to optimize performance
    const buildingNumbers = new Set<number>();
    assets.forEach(asset => {
      if (asset.building_number) {
        const buildingNum = typeof asset.building_number === 'string' 
          ? parseInt(asset.building_number, 10) 
          : asset.building_number;
        if (!isNaN(buildingNum)) {
          buildingNumbers.add(buildingNum);
        }
      }
    });

    // Fetch all buildings in parallel
    const { api } = await import('./api');
    const buildingsMap = new Map<number, any>();
    await Promise.all(
      Array.from(buildingNumbers).map(async (buildingNum) => {
        try {
          const building = await api.buildings.getOne(buildingNum);
          buildingsMap.set(buildingNum, building);
        } catch (error) {
          console.warn(`Failed to fetch building ${buildingNum}:`, error);
        }
      })
    );

    // Process assets in parallel batches to improve performance
    const BATCH_SIZE = 10; // Process 10 assets at a time
    for (let batchStart = 0; batchStart < assets.length; batchStart += BATCH_SIZE) {
      const batch = assets.slice(batchStart, batchStart + BATCH_SIZE);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (asset, batchIndex) => {
        const i = batchStart + batchIndex;
        const assetIdentifier = `שורה ${i + 1} (נכס ${asset.asset_id})`;

        if (options?.onProgress) {
          options.onProgress({
            current: i + 1,
            total,
            currentAsset: assetIdentifier,
            currentStep: `בודק שורה ${i + 1} מתוך ${total}...`
          });
        }

        // Get building for this asset
        const buildingNum = typeof asset.building_number === 'string' 
          ? parseInt(asset.building_number, 10) 
          : asset.building_number;
        const building = buildingNum && !isNaN(buildingNum) 
          ? buildingsMap.get(buildingNum) 
          : null;

        // Include asset and building in cachedData for validation
        const cachedDataWithAssetAndBuilding = {
          ...(options?.cachedData || {}),
          asset: asset,
          building: building || options?.cachedData?.building
        };

        const result = await this.validateAssetInternal(
          asset, 
          assetIdentifier, 
          undefined, 
          options?.taxRegion,
          cachedDataWithAssetAndBuilding,
          options?.validationRules
        );
        
        // Check if this asset_id appears with different building_numbers in the import batch
        // An asset can only belong to one building
        if (asset.asset_id) {
          const assetIdKey = typeof asset.asset_id === 'string' ? asset.asset_id : String(asset.asset_id);
          const buildingsForAssetId = assetIdToBuildings.get(assetIdKey);
          if (buildingsForAssetId && buildingsForAssetId.size > 1) {
            const buildingNums = Array.from(buildingsForAssetId).sort((a, b) => a - b).join(', ');
            const rowIndices = assetIdToRowIndices.get(assetIdKey) || [];
            const rowNums = rowIndices.join(', ');
            result.errors.push(`מזהה נכס ${asset.asset_id} מופיע במספר מבנים שונים בקובץ הייבוא (שורות: ${rowNums}, מבנים: ${buildingNums}). נכס יכול להיות קשור למבנה אחד בלבד.`);
            result.valid = false;
          }
        }
        
        return result;
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    const valid = results.filter(r => r.valid).length;
    const invalid = results.filter(r => !r.valid).length;

    return {
      results,
      total,
      valid,
      invalid
    };
  }

  /**
   * Internal method to validate a single asset
   * @param taxRegion Optional tax region that will OVERRIDE building tax region for validation
   *                  If specified, validation will use this tax region instead of the building's tax_region field
   */
  private static async validateAssetInternal(
    asset: Asset,
    assetIdentifier: string,
    onProgress?: (progress: AssetValidationProgress) => void,
    taxRegion?: string,
    cachedData?: { assetTypes?: any[]; building?: any; asset?: any },
    validationRules?: any[]
  ): Promise<AssetValidationResult> {
    // Log validation parameters for debugging (disabled to reduce console noise)
    // Uncomment below and adjust frequency if needed for debugging
    // if (process.env.NODE_ENV === 'development' && Math.random() < 0.001) { // Log only 0.1% of validations
    // }
    
    // Skip validation if main_asset_type is not set
    if (!asset.main_asset_type || String(asset.main_asset_type).trim() === '') {
      if (process.env.NODE_ENV === 'development') {
      }
      return {
        assetId: asset.asset_id,
        assetIdentifier,
        valid: true,
        errors: [],
        passed: ['סוג נכס ראשי לא מוגדר - דילוג על אימות']
      };
    }
    
    // Skip validation for asset type 990
    if (asset.main_asset_type && (String(asset.main_asset_type).trim() === '990' || parseInt(String(asset.main_asset_type).trim(), 10) === 990)) {
      if (process.env.NODE_ENV === 'development') {
      }
      return {
        assetId: asset.asset_id,
        assetIdentifier,
        valid: true,
        errors: [],
        passed: ['נכס מסוג 990 - דילוג על אימות']
      };
    }
    
    // Check if asset type is non_accountable_for_total_area - skip all validation if true
    if (asset.main_asset_type) {
      let assetTypes = cachedData?.assetTypes;
      if (!assetTypes || assetTypes.length === 0) {
        // Use cached asset types from validation (synchronous, no API call)
        try {
          const { getAssetTypes } = await import('./validation');
          assetTypes = getAssetTypes();
        } catch (error) {
          // Fallback to API if cache not available
          try {
            const { api } = await import('./api');
            assetTypes = await api.assetTypes.getAll();
          } catch (apiError) {
            console.error('[AssetValidationHandler] Failed to fetch asset types:', apiError);
          }
        }
      }
      
      if (assetTypes && assetTypes.length > 0) {
        const assetTypeNameStr = String(asset.main_asset_type).trim();
        // Try multiple matching strategies
        let assetType = assetTypes.find(at => {
          const atNameStr = String(at.name).trim();
          return atNameStr === assetTypeNameStr;
        });
        
        // If not found, try numeric comparison
        if (!assetType) {
          const assetTypeNum = parseInt(assetTypeNameStr, 10);
          if (!isNaN(assetTypeNum)) {
            assetType = assetTypes.find(at => {
              const atNameNum = parseInt(String(at.name).trim(), 10);
              return !isNaN(atNameNum) && atNameNum === assetTypeNum;
            });
          }
        }
        
        if (assetType && assetType.non_accountable_for_total_area === true) {
          // Asset type is non_accountable_for_total_area - skip all validation
          if (process.env.NODE_ENV === 'development') {
          }
          return {
            assetId: asset.asset_id,
            assetIdentifier,
            valid: true,
            errors: [],
            passed: ['נכס לא נספר - דילוג על אימות']
          };
        }
      }
    }
    
    const allErrors: string[] = [];
    const passedRules: string[] = [];
    let matchedAssetTypeRecord: string | undefined;
    const seenErrors = new Set<string>();

    // Validation names for progress tracking
    const validationNames: string[] = [];
    const validations: Promise<ValidationResult>[] = [];

    // Note: main_asset_type validation is already handled above with early return
    // No need to validate it again here

    validationNames.push('אימות סוגי נכס מורכבים');
    validations.push(
      assetValidators.validateOnlyComplexTypesCanHaveSubAssets(asset.main_asset_type, [
        asset.sub_asset_type_1,
        asset.sub_asset_type_2,
        asset.sub_asset_type_3,
        asset.sub_asset_type_4,
        asset.sub_asset_type_5,
        asset.sub_asset_type_6
      ])
    );

    validationNames.push('אימות נכסי משנה לסוגים מורכבים');
    validations.push(
      assetValidators.validateComplexTypesMustHaveSubAssets(asset.main_asset_type, [
        asset.sub_asset_type_1,
        asset.sub_asset_type_2,
        asset.sub_asset_type_3,
        asset.sub_asset_type_4,
        asset.sub_asset_type_5,
        asset.sub_asset_type_6
      ])
    );

    // Validate sub-asset sizes match main asset size (required for 199 and 299)
    const isComplexType = asset.main_asset_type === '199' || asset.main_asset_type === '299';
    if (isComplexType) {
      validationNames.push('אימות חלוקת שטח - גודל נכס ראשי חייב להיות שווה לסכום נכסי משנה');
    } else {
      validationNames.push('אימות גודל נכסי משנה');
    }
    validations.push(
      assetValidators.validateSubAssetSizeMatchesMain(
        asset.asset_size,
        [
          asset.sub_asset_type_1,
          asset.sub_asset_type_2,
          asset.sub_asset_type_3,
          asset.sub_asset_type_4,
          asset.sub_asset_type_5,
          asset.sub_asset_type_6
        ],
        [
          asset.sub_asset_size_1,
          asset.sub_asset_size_2,
          asset.sub_asset_size_3,
          asset.sub_asset_size_4,
          asset.sub_asset_size_5,
          asset.sub_asset_size_6
        ],
        asset.main_asset_type
      )
    );

    validationNames.push('אימות גודל נכס משנה דורש סוג');
    validations.push(
      assetValidators.validateSubAssetSizeRequiresType(
        [
          asset.sub_asset_type_1,
          asset.sub_asset_type_2,
          asset.sub_asset_type_3,
          asset.sub_asset_type_4,
          asset.sub_asset_type_5,
          asset.sub_asset_type_6
        ],
        [
          asset.sub_asset_size_1,
          asset.sub_asset_size_2,
          asset.sub_asset_size_3,
          asset.sub_asset_size_4,
          asset.sub_asset_size_5,
          asset.sub_asset_size_6
        ]
      )
    );

    validationNames.push('אימות סוג נכס דורש גודל');
    validations.push(
      assetValidators.validateAssetTypeRequiresSize(
        asset.main_asset_type,
        asset.asset_size,
        [
          asset.sub_asset_type_1,
          asset.sub_asset_type_2,
          asset.sub_asset_type_3,
          asset.sub_asset_type_4,
          asset.sub_asset_type_5,
          asset.sub_asset_type_6
        ],
        [
          asset.sub_asset_size_1,
          asset.sub_asset_size_2,
          asset.sub_asset_size_3,
          asset.sub_asset_size_4,
          asset.sub_asset_size_5,
          asset.sub_asset_size_6
        ]
      )
    );

    validationNames.push('אימות סדר נכסי משנה');
    validations.push(
      assetValidators.validateSubAssetOrder([
        asset.sub_asset_type_1,
        asset.sub_asset_type_2,
        asset.sub_asset_type_3,
        asset.sub_asset_type_4,
        asset.sub_asset_type_5,
        asset.sub_asset_type_6
      ])
    );

    // Add minimum sub-assets validation if main type is 199 or 299
    const shouldValidateSubAssets = asset.main_asset_type === '199' || asset.main_asset_type === '299';
    if (shouldValidateSubAssets) {
      validationNames.push('מינימום נכסי משנה');
      validations.push(
        assetValidators.validateMinimumSubAssets([
          asset.sub_asset_type_1,
          asset.sub_asset_type_2,
          asset.sub_asset_type_3,
          asset.sub_asset_type_4,
          asset.sub_asset_type_5,
          asset.sub_asset_type_6
        ])
      );
    }

    // Run synchronous validations in parallel
    const syncResults = await Promise.all(validations);
    syncResults.forEach((result, idx) => {
      if (result.valid) {
        passedRules.push(validationNames[idx]);
      } else if (result.error) {
        if (!seenErrors.has(result.error)) {
          allErrors.push(result.error);
          seenErrors.add(result.error);
        }
      }
    });

    // Clear validations array for DB-dependent validations
    validations.length = 0;
    validationNames.length = 0;

    // DB-dependent validations (run in parallel)
    // Pass validation rules and cached data to avoid database queries
    validationNames.push('אימות מזהה מבנה');
    validations.push(assetValidators.validateBuildingNumber(asset.building_number, validationRules, cachedData));

    validationNames.push('אימות מבנה קיים במערכת');
    validations.push(assetValidators.validateBuildingExists(asset.building_number, validationRules, cachedData));

    validationNames.push('אימות מזהה נכס');
    validations.push(assetValidators.validateAssetId(String(asset.asset_id), validationRules, cachedData));

    validationNames.push('אימות מזהה נכס ייחודי במערכת');
    validations.push(assetValidators.validateAssetIdUnique(asset.asset_id, asset.id, validationRules, cachedData, asset.building_number));

    validationNames.push('אימות קוד משלם');
    validations.push(assetValidators.validatePayerId(asset.payer_id, validationRules, cachedData));

    validationNames.push('אימות סוג נכס ראשי');
    validations.push(assetValidators.validateAssetType(asset.main_asset_type, 'main_asset_type', taxRegion, validationRules, cachedData));

    validationNames.push('אימות סוג נכס ראשי מלא');
    validations.push(
      assetValidators.validateMainAssetTypeComplete(
        asset.building_number,
        asset.main_asset_type,
        asset.asset_size || 0,
        asset,
        taxRegion,
        cachedData
      )
    );

    validationNames.push('אימות נכסי משנה לסוגים 199/299');
    validations.push(
      assetValidators.validateSubAssetsFor199Or299(
        asset.building_number,
        asset.main_asset_type,
        asset.asset_size,
        [
          asset.sub_asset_type_1,
          asset.sub_asset_type_2,
          asset.sub_asset_type_3,
          asset.sub_asset_type_4,
          asset.sub_asset_type_5,
          asset.sub_asset_type_6
        ],
        [
          asset.sub_asset_size_1,
          asset.sub_asset_size_2,
          asset.sub_asset_size_3,
          asset.sub_asset_size_4,
          asset.sub_asset_size_5,
          asset.sub_asset_size_6
        ],
        taxRegion,
        cachedData
      )
    );

    // NEW: Validate that asset.tax_region is within building.tax_region
    validationNames.push('אימות אזור מס נכס בתוך אזורי מס המבנה');
    validations.push(
      this.validateAssetTaxRegionInBuildingTaxRegions(
        asset,
        taxRegion,
        cachedData
      )
    );

    // Run DB validations sequentially for progress tracking
    const totalSteps = validations.length;
    for (let i = 0; i < validations.length; i++) {
      if (onProgress) {
        onProgress({
          current: i + 1,
          total: totalSteps,
          currentStep: `בודק שלב ${i + 1} מתוך ${totalSteps}...`
        });
      }

      const result = await validations[i];
      if (result.valid) {
        passedRules.push(validationNames[i]);
        // Check if this is the main asset type complete validation and it has matched record info
        if (result.matchedAssetTypeRecord && validationNames[i] === 'אימות סוג נכס ראשי מלא') {
          matchedAssetTypeRecord = result.matchedAssetTypeRecord;
        }
      } else if (result.error) {
        if (!seenErrors.has(result.error)) {
          allErrors.push(result.error);
          seenErrors.add(result.error);
        }
      }
    }

    // Validate sub asset types individually (only if they exist)
    const subAssetTypes = [
      asset.sub_asset_type_1,
      asset.sub_asset_type_2,
      asset.sub_asset_type_3,
      asset.sub_asset_type_4,
      asset.sub_asset_type_5,
      asset.sub_asset_type_6
    ];
    const subAssetSizes = [
      asset.sub_asset_size_1,
      asset.sub_asset_size_2,
      asset.sub_asset_size_3,
      asset.sub_asset_size_4,
      asset.sub_asset_size_5,
      asset.sub_asset_size_6
    ];

    // Validate sub-assets sequentially for progress tracking
    for (let idx = 0; idx < subAssetTypes.length; idx++) {
      if (subAssetTypes[idx]) {
        if (onProgress) {
          onProgress({
            current: totalSteps + idx + 1,
            total: totalSteps + subAssetTypes.filter(t => t).length,
            currentStep: `בודק נכס משנה ${idx + 1}...`
          });
        }

        const result = await assetValidators.validateSubAssetTypeComplete(
          asset.building_number,
          subAssetTypes[idx],
          subAssetSizes[idx],
          taxRegion, // Pass taxRegion to override building tax region for sub asset validation
          cachedData,
          asset // Pass main asset data so penthouse validation can check main asset's penthouse value
        );

        if (!result.valid && result.error) {
          const errorMsg = `נכס משנה ${idx + 1}: ${result.error}`;
          if (!seenErrors.has(errorMsg)) {
            allErrors.push(errorMsg);
            seenErrors.add(errorMsg);
          }
        } else if (result.valid) {
          passedRules.push(`אימות נכס משנה ${idx + 1}`);
        }
      }
    }

    return {
      assetId: asset.asset_id,
      assetIdentifier,
      valid: allErrors.length === 0,
      errors: allErrors,
      passed: passedRules,
      matchedAssetTypeRecord
    };
  }

  /**
   * Validate that asset.tax_region is within building.tax_region
   * and matches the tab tax region if provided
   */
  private static async validateAssetTaxRegionInBuildingTaxRegions(
    asset: Asset,
    taxRegion?: string,
    cachedData?: { assetTypes?: any[]; building?: any; asset?: any }
  ): Promise<ValidationResult> {
    try {
      // If asset doesn't have tax_region, skip this validation
      if (asset.tax_region == null) {
        return { valid: true };
      }

      const assetTaxRegion = Number(asset.tax_region);
      if (isNaN(assetTaxRegion)) {
        return { valid: false, error: `אזור מס נכס ${asset.tax_region} אינו תקין` };
      }

      // Get building tax regions
      let building = cachedData?.building;
      if (!building && asset.building_number) {
        const { api } = await import('./api');
        building = await api.buildings.getOne(asset.building_number);
      }

      if (!building) {
        // If building not found, skip this validation (other validations will catch building issues)
        return { valid: true };
      }

      // Parse building tax regions (comma-separated string)
      let buildingTaxRegions: number[] = [];
      if (building.tax_region) {
        buildingTaxRegions = String(building.tax_region)
          .split(',')
          .map(r => parseInt(r.trim()))
          .filter(r => !isNaN(r));
      }

      // Check if asset.tax_region is within building.tax_region
      if (buildingTaxRegions.length > 0 && !buildingTaxRegions.includes(assetTaxRegion)) {
        const buildingRegionsStr = buildingTaxRegions.join(', ');
        return {
          valid: false,
          error: `אזור מס נכס (${assetTaxRegion}) אינו בתוך אזורי מס המבנה (${buildingRegionsStr})`
        };
      }

      // If in a specific tax region tab, also check that asset.tax_region matches the tab tax region
      if (taxRegion && taxRegion.trim() !== '') {
        const tabTaxRegion = parseInt(taxRegion.trim());
        if (!isNaN(tabTaxRegion) && assetTaxRegion !== tabTaxRegion) {
          return {
            valid: false,
            error: `אזור מס נכס (${assetTaxRegion}) אינו תואם לאזור מס הכרטיסייה (${tabTaxRegion})`
          };
        }
      }

      return { valid: true };
    } catch (error) {
      console.error('Error validating asset tax region in building tax regions:', error);
      return { valid: false, error: 'שגיאה באימות אזור מס נכס' };
    }
  }
}
