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
  cachedData?: { assetTypes?: any[]; building?: any }; // Cached data to avoid database queries
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
    options?: { onProgress?: (progress: AssetValidationProgress) => void; taxRegion?: string; cachedData?: { assetTypes?: any[]; building?: any } }
  ): Promise<AssetValidationResult> {
    const assetIdentifier = `נכס ${asset.asset_id}${asset.building_number ? ` (מבנה ${asset.building_number})` : ''}`;
    
    // Log validation parameters for debugging (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.log('[AssetValidationHandler.validateSingleAsset] Parameters:', {
        assetId: asset.asset_id,
        buildingNumber: asset.building_number,
        taxRegion: options?.taxRegion || 'NOT PROVIDED (will use building tax_region)',
        mainAssetType: asset.main_asset_type
      });
    }
    
    return await this.validateAssetInternal(asset, assetIdentifier, options?.onProgress, options?.taxRegion, options?.cachedData);
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

        return await this.validateAssetInternal(
          asset,
          assetIdentifier,
          undefined,
          options?.taxRegion,
          cachedData,
          options?.validationRules
        );
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
    const assetIdToBuildings = new Map<string | number, Set<number>>();
    assets.forEach((asset, index) => {
      const assetId = asset.asset_id;
      if (!assetId) return;
      
      const assetIdKey = typeof assetId === 'string' ? assetId : String(assetId);
      const buildingNum = typeof asset.building_number === 'string' 
        ? parseInt(asset.building_number, 10) 
        : asset.building_number;
      
      if (!assetIdToBuildings.has(assetIdKey)) {
        assetIdToBuildings.set(assetIdKey, new Set());
      }
      assetIdToBuildings.get(assetIdKey)!.add(buildingNum);
    });

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

        const result = await this.validateAssetInternal(asset, assetIdentifier, undefined, options?.taxRegion);
        
        // Check if this asset_id appears with different building_numbers in the import batch
        if (asset.asset_id) {
          const assetIdKey = typeof asset.asset_id === 'string' ? asset.asset_id : String(asset.asset_id);
          const buildingsForAssetId = assetIdToBuildings.get(assetIdKey);
          if (buildingsForAssetId && buildingsForAssetId.size > 1) {
            const buildingNums = Array.from(buildingsForAssetId).join(', ');
            result.errors.push(`מזהה נכס ${asset.asset_id} מופיע במספר מבנים שונים בקובץ הייבוא: ${buildingNums}. נכס יכול להיות קשור למבנה אחד בלבד.`);
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
    cachedData?: { assetTypes?: any[]; building?: any },
    validationRules?: any[]
  ): Promise<AssetValidationResult> {
    // Log validation parameters for debugging (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.log('[AssetValidationHandler.validateAssetInternal] Parameters:', {
        assetId: asset.asset_id,
        buildingNumber: asset.building_number,
        taxRegion: taxRegion || 'NOT PROVIDED (will use building tax_region)',
        mainAssetType: asset.main_asset_type,
        assetIdentifier: assetIdentifier
      });
    }
    
    const allErrors: string[] = [];
    const passedRules: string[] = [];
    let matchedAssetTypeRecord: string | undefined;
    const seenErrors = new Set<string>();

    // Validation names for progress tracking
    const validationNames: string[] = [];
    const validations: Promise<ValidationResult>[] = [];

    // Synchronous validations (run in parallel)
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

    validationNames.push('אימות גודל נכסי משנה');
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
        ]
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
    validationNames.push('אימות מספר מבנה');
    validations.push(assetValidators.validateBuildingNumber(asset.building_number, validationRules, cachedData));

    validationNames.push('אימות מבנה קיים במערכת');
    validations.push(assetValidators.validateBuildingExists(asset.building_number, validationRules, cachedData));

    validationNames.push('אימות מזהה נכס');
    validations.push(assetValidators.validateAssetId(String(asset.asset_id), validationRules, cachedData));

    validationNames.push('אימות מזהה נכס ייחודי במערכת');
    validations.push(assetValidators.validateAssetIdUnique(asset.asset_id, asset.id, validationRules, cachedData, asset.building_number));

    validationNames.push('אימות נכס לא קיים במבנה אחר');
    validations.push(assetValidators.validateAssetIdNotInOtherBuilding(asset.asset_id, asset.building_number));

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
}
