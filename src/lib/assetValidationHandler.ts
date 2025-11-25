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
    options?: { onProgress?: (progress: AssetValidationProgress) => void; taxRegion?: string }
  ): Promise<AssetValidationResult> {
    const assetIdentifier = `נכס ${asset.asset_id}${asset.building_number ? ` (מבנה ${asset.building_number})` : ''}`;
    
    // Log validation parameters for debugging
    console.log('[AssetValidationHandler.validateSingleAsset] Parameters:', {
      assetId: asset.asset_id,
      buildingNumber: asset.building_number,
      taxRegion: options?.taxRegion || 'NOT PROVIDED (will use building tax_region)',
      mainAssetType: asset.main_asset_type
    });
    
    return await this.validateAssetInternal(asset, assetIdentifier, options?.onProgress, options?.taxRegion);
  }

  /**
   * Validate all assets for a building
   */
  static async validateBuildingAssets(
    assets: Asset[],
    buildingNumber: number,
    options?: ValidationOptions
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

    for (let i = 0; i < assetsToValidate.length; i++) {
      const asset = assetsToValidate[i];
      const assetIdentifier = `נכס ${asset.asset_id}${asset.building_number ? ` (מבנה ${asset.building_number})` : ''}`;

      if (options?.onProgress) {
        options.onProgress({
          current: i + 1,
          total,
          currentAsset: assetIdentifier,
          currentStep: `בודק נכס ${i + 1} מתוך ${total}...`
        });
      }

      // Log validation parameters for debugging
      console.log('[AssetValidationHandler.validateBuildingAssets] Parameters:', {
        assetId: asset.asset_id,
        buildingNumber: buildingNumber,
        taxRegion: options?.taxRegion || 'NOT PROVIDED (will use building tax_region)',
        mainAssetType: asset.main_asset_type,
        assetIndex: i + 1,
        totalAssets: assetsToValidate.length
      });

      const result = await this.validateAssetInternal(asset, assetIdentifier, undefined, options?.taxRegion);
      results.push(result);
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

    for (let i = 0; i < assetsToValidate.length; i++) {
      const asset = assetsToValidate[i];
      const assetIdentifier = `נכס ${asset.asset_id}${asset.building_number ? ` (מבנה ${asset.building_number})` : ''}`;

      if (options?.onProgress) {
        options.onProgress({
          current: i + 1,
          total,
          currentAsset: assetIdentifier,
          currentStep: `בודק נכס ${i + 1} מתוך ${total}...`
        });
      }

      const result = await this.validateAssetInternal(asset, assetIdentifier);
      results.push(result);
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

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
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
      results.push(result);
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
    taxRegion?: string
  ): Promise<AssetValidationResult> {
    // Log validation parameters for debugging
    console.log('[AssetValidationHandler.validateAssetInternal] Parameters:', {
      assetId: asset.asset_id,
      buildingNumber: asset.building_number,
      taxRegion: taxRegion || 'NOT PROVIDED (will use building tax_region)',
      mainAssetType: asset.main_asset_type,
      assetIdentifier: assetIdentifier
    });
    
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
    validationNames.push('אימות מספר מבנה');
    validations.push(assetValidators.validateBuildingNumber(asset.building_number));

    validationNames.push('אימות מזהה נכס');
    validations.push(assetValidators.validateAssetId(String(asset.asset_id)));

    validationNames.push('אימות נכס לא קיים במבנה אחר');
    validations.push(assetValidators.validateAssetIdNotInOtherBuilding(asset.asset_id, asset.building_number));

    validationNames.push('אימות קוד משלם');
    validations.push(assetValidators.validatePayerId(asset.payer_id));

    validationNames.push('אימות סוג נכס ראשי');
    validations.push(assetValidators.validateAssetType(asset.main_asset_type, 'main_asset_type', taxRegion));

    validationNames.push('אימות סוג נכס ראשי מלא');
    validations.push(
      (async () => {
        console.log('[AssetValidationHandler] Calling validateMainAssetTypeComplete with taxRegion:', taxRegion || 'NOT PROVIDED', {
          buildingNumber: asset.building_number,
          mainAssetType: asset.main_asset_type,
          assetSize: asset.asset_size
        });
        return await assetValidators.validateMainAssetTypeComplete(
          asset.building_number,
          asset.main_asset_type,
          asset.asset_size || 0,
          asset,
          taxRegion
        );
      })()
    );

    validationNames.push('אימות נכסי משנה לסוגים 199/299');
    validations.push(
      (async () => {
        console.log('[AssetValidationHandler] Calling validateSubAssetsFor199Or299 with taxRegion:', taxRegion || 'NOT PROVIDED');
        return await assetValidators.validateSubAssetsFor199Or299(
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
          taxRegion
        );
      })()
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

        console.log(`[AssetValidationHandler] Calling validateSubAssetTypeComplete for sub asset ${idx + 1} with taxRegion:`, taxRegion || 'NOT PROVIDED', {
          buildingNumber: asset.building_number,
          subAssetType: subAssetTypes[idx],
          subAssetSize: subAssetSizes[idx]
        });
        const result = await assetValidators.validateSubAssetTypeComplete(
          asset.building_number,
          subAssetTypes[idx],
          subAssetSizes[idx],
          taxRegion // Pass taxRegion to override building tax region for sub asset validation
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
