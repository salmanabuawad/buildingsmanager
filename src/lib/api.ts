import { supabase } from './supabase';
import i18n from '../i18n/i18n';
import { sanitizeText, sanitizeNumber, sanitizeInteger, sanitizeDate } from './sanitize';
import { parseDateFromDDMMYYYY } from './dateUtils';

/**
 * ============================================================================
 * 🚨 CRITICAL: TRANSACTIONAL SAVE ARCHITECTURE - DO NOT MODIFY 🚨
 * ============================================================================
 *
 * This file implements validation-first, transactional-save architecture.
 *
 * MANDATORY RULES:
 * 1. ALL asset saves MUST use transactional functions:
 *    - api.assets.saveTransactional() for single saves
 *    - api.assets.saveBulkTransactional() for bulk saves
 *
 * 2. NEVER use direct database operations:
 *    ❌ supabase.from('assets').insert()
 *    ❌ supabase.from('assets').update()
 *
 * 3. Validation is MANDATORY and enforced at database level
 *
 * 4. All post-save actions happen in ONE transaction:
 *    - Asset save
 *    - Building total area update
 *    - Distribution flags update
 *    - Audit log creation
 *
 * 5. ALWAYS check result.success before proceeding
 *
 * See: CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md for complete documentation
 * ============================================================================
 */

/**
 * Get the current user name from Supabase auth
 * Returns 'default' if no user is logged in
 */
async function getCurrentUserName(): Promise<string> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return 'default';
    }
    // Try to get user email or id
    return user.email || user.id || 'default';
  } catch (error) {
    console.warn('Error getting current user:', error);
    return 'default';
  }
}

/**
 * Get current user information (name, email, id)
 */
async function getCurrentUserInfo(): Promise<{ user_name: string; user_email?: string; user_id?: string }> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return { user_name: 'default' };
    }
    return {
      user_name: user.email || user.id || 'default',
      user_email: user.email || undefined,
      user_id: user.id || undefined
    };
  } catch (error) {
    console.warn('Error getting current user info:', error);
    return { user_name: 'default' };
  }
}

/**
 * Helper function to determine if an asset is business or residence
 * Returns 'business', 'residence', or null if cannot determine
 */
async function getAssetBusinessResidenceType(asset: Partial<Asset>): Promise<'business' | 'residence' | null> {
  if (!asset.main_asset_type) {
    return null;
  }
  
  try {
    const mainAssetTypeStr = String(asset.main_asset_type).trim();
    
    // First try string lookup
    const { data: assetTypeData, error } = await supabase
      .from('asset_types')
      .select('name, business_residence')
      .eq('name', mainAssetTypeStr)
      .maybeSingle();
    
    let foundAssetType = assetTypeData;
    
    // If not found, try numeric lookup
    if (!foundAssetType) {
      const mainAssetTypeNum = parseInt(mainAssetTypeStr, 10);
      if (!isNaN(mainAssetTypeNum)) {
        const { data: allAssetTypes } = await supabase
          .from('asset_types')
          .select('name, business_residence');
        
        if (allAssetTypes) {
          foundAssetType = allAssetTypes.find(at => {
            const atNameStr = String(at.name || '').trim();
            const atNameNum = parseInt(atNameStr, 10);
            return !isNaN(atNameNum) && atNameNum === mainAssetTypeNum;
          });
        }
      }
    }
    
    if (error || !foundAssetType) {
      return null;
    }
    
    if (foundAssetType.business_residence === 'עסקים') {
      return 'business';
    } else if (foundAssetType.business_residence === 'מגורים') {
      return 'residence';
    }
    
    return null;
  } catch (err) {
    console.warn('Error determining asset business/residence type:', err);
    return null;
  }
}

/**
 * Reset distribution flags for a building based on asset changes
 */
async function resetDistributionFlagsIfNeeded(
  buildingNumber: number,
  assetType: 'business' | 'residence' | null,
  changeType: 'create' | 'update' | 'delete',
  assetSizeChanged?: boolean,
  assetTypeChanged?: boolean
): Promise<void> {
  if (!buildingNumber) return;

  try {
    // Get current building data to check if flags need to be reset and if shared area is > 0
    const { data: building, error: buildingError } = await supabase
      .from('buildings')
      .select('need_business_distribution, need_residence_distribution, business_shared_area, residence_shared_area')
      .eq('building_number', buildingNumber)
      .maybeSingle();

    if (buildingError || !building) {
      return;
    }

    const updates: Partial<Building> = {};

    // For residence: set need_residence_distribution to true on create, delete, or type change
    // BUT only if building has residence_shared_area > 0
    // (true = needs distribution, false = already distributed)
    if (assetType === 'residence' && (changeType === 'create' || changeType === 'delete' || assetTypeChanged)) {
      const residenceSharedArea = building.residence_shared_area ?? 0;
      if (residenceSharedArea > 0) {
        updates.need_residence_distribution = true;
        console.log(`[resetDistributionFlagsIfNeeded] Setting need_residence_distribution=true for building ${buildingNumber} (residence asset, ${changeType})`);
      } else {
        console.log(`[resetDistributionFlagsIfNeeded] Skipping need_residence_distribution for building ${buildingNumber} (residence_shared_area is ${residenceSharedArea})`);
      }
    }

    // For business: set need_business_distribution to true on create, delete, asset_size change, or type change
    // BUT only if building has business_shared_area > 0
    // (true = needs distribution, false = already distributed)
    if (assetType === 'business') {
      if (changeType === 'create' || changeType === 'delete' || assetSizeChanged || assetTypeChanged) {
        const businessSharedArea = building.business_shared_area ?? 0;
        if (businessSharedArea > 0) {
          updates.need_business_distribution = true;
          console.log(`[resetDistributionFlagsIfNeeded] Setting need_business_distribution=true for building ${buildingNumber} (business asset, ${changeType}${assetSizeChanged ? ', size changed' : ''}${assetTypeChanged ? ', type changed' : ''})`);
        } else {
          console.log(`[resetDistributionFlagsIfNeeded] Skipping need_business_distribution for building ${buildingNumber} (business_shared_area is ${businessSharedArea})`);
        }
      }
    }

    // If asset type is null/unknown, don't set any flags (log a warning)
    if (!assetType && (changeType === 'create' || changeType === 'delete' || assetSizeChanged || assetTypeChanged)) {
      console.warn(`[resetDistributionFlagsIfNeeded] Could not determine asset type for building ${buildingNumber}, skipping flag update`);
    }

    // Check if flags should be turned off when no relevant assets exist
    // After setting flags to true, we should check if there are actually eligible assets
    if (changeType === 'delete' || changeType === 'update') {
      // Get all assets for this building
      const { data: allAssets, error: assetsError } = await supabase
        .from('assets')
        .select('main_asset_type')
        .eq('building_number', buildingNumber);

      if (!assetsError && allAssets && allAssets.length > 0) {
        // Get all asset types to check their properties
        const { data: allAssetTypes, error: typesError } = await supabase
          .from('asset_types')
          .select('name, business_residence, non_accountable_for_distribution');

        if (!typesError && allAssetTypes) {
          // Create a map for quick lookup
          const assetTypeMap = new Map(
            allAssetTypes.map((at: any) => [String(at.name).trim(), at])
          );

          // Check for business distribution: turn off if no business assets eligible for distribution
          if (building.need_business_distribution && building.business_shared_area && building.business_shared_area > 0) {
            const hasEligibleBusinessAssets = allAssets.some((asset: any) => {
              if (!asset.main_asset_type) return false;
              const mainTypeStr = String(asset.main_asset_type).trim();
              const assetType = assetTypeMap.get(mainTypeStr);
              
              // Also try numeric lookup if string lookup fails
              let foundType = assetType;
              if (!foundType) {
                const mainTypeNum = parseInt(mainTypeStr, 10);
                if (!isNaN(mainTypeNum)) {
                  for (const [key, value] of assetTypeMap.entries()) {
                    const keyNum = parseInt(key, 10);
                    if (!isNaN(keyNum) && keyNum === mainTypeNum) {
                      foundType = value;
                      break;
                    }
                  }
                }
              }
              
              return foundType && 
                     foundType.business_residence === 'עסקים' && 
                     foundType.non_accountable_for_distribution !== true;
            });

            if (!hasEligibleBusinessAssets) {
              updates.need_business_distribution = false;
              console.log(`[resetDistributionFlagsIfNeeded] Turning off need_business_distribution for building ${buildingNumber} (no eligible business assets)`);
            }
          }

          // Check for residence distribution: turn off if no residence assets eligible for distribution
          if (building.need_residence_distribution && building.residence_shared_area && building.residence_shared_area > 0) {
            const hasEligibleResidenceAssets = allAssets.some((asset: any) => {
              if (!asset.main_asset_type) return false;
              const mainTypeStr = String(asset.main_asset_type).trim();
              const assetType = assetTypeMap.get(mainTypeStr);
              
              // Also try numeric lookup if string lookup fails
              let foundType = assetType;
              if (!foundType) {
                const mainTypeNum = parseInt(mainTypeStr, 10);
                if (!isNaN(mainTypeNum)) {
                  for (const [key, value] of assetTypeMap.entries()) {
                    const keyNum = parseInt(key, 10);
                    if (!isNaN(keyNum) && keyNum === mainTypeNum) {
                      foundType = value;
                      break;
                    }
                  }
                }
              }
              
              return foundType && 
                     foundType.business_residence === 'מגורים' && 
                     foundType.non_accountable_for_distribution !== true;
            });

            if (!hasEligibleResidenceAssets) {
              updates.need_residence_distribution = false;
              console.log(`[resetDistributionFlagsIfNeeded] Turning off need_residence_distribution for building ${buildingNumber} (no eligible residence assets)`);
            }
          }
        }
      } else if (!assetsError && (!allAssets || allAssets.length === 0)) {
        // No assets at all - turn off both flags
        if (building.need_business_distribution) {
          updates.need_business_distribution = false;
          console.log(`[resetDistributionFlagsIfNeeded] Turning off need_business_distribution for building ${buildingNumber} (no assets)`);
        }
        if (building.need_residence_distribution) {
          updates.need_residence_distribution = false;
          console.log(`[resetDistributionFlagsIfNeeded] Turning off need_residence_distribution for building ${buildingNumber} (no assets)`);
        }
      }
    }

    // Update building if flags need to be reset (use direct supabase call to avoid circular reference)
    if (Object.keys(updates).length > 0) {
      await supabase
        .from('buildings')
        .update(updates)
        .eq('building_number', buildingNumber);
    }
  } catch (err) {
    console.warn('Error resetting distribution flags:', err);
    // Don't throw - this is a side effect that shouldn't fail the main operation
  }
}

/**
 * Log a change entry asynchronously (fire and forget)
 * This function doesn't wait for the logging to complete
 */
function logChangeAsync(
  tableName: string,
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  recordId: string,
  beforeData?: any,
  afterData?: any,
  changedFields?: string[]
): void {
  // Call asynchronously without blocking
  (async () => {
    try {
      const userInfo = await getCurrentUserInfo();
      
      // Call the RPC function asynchronously (don't await)
      // Function now uses user_id FK - pass auth_user_id (p_user_id)
      const { error } = await supabase.rpc('log_change_entry', {
        p_table_name: tableName,
        p_operation: operation,
        p_record_id: recordId,
        p_user_id: userInfo.user_id || null, // auth_user_id (UUID as text)
        p_before_data: beforeData ? JSON.parse(JSON.stringify(beforeData)) : null,
        p_after_data: afterData ? JSON.parse(JSON.stringify(afterData)) : null,
        p_changed_fields: changedFields || null
      });
      
      if (error && process.env.NODE_ENV === 'development') {
        console.warn('[logChangeAsync] Failed to log change:', error);
      }
    } catch (error) {
      // Silently fail - logging should not break the main operation
      if (process.env.NODE_ENV === 'development') {
        console.warn('[logChangeAsync] Error preparing change log:', error);
      }
    }
  })();
}

/**
 * Calculate changed fields between two objects
 */
function calculateChangedFields(before: any, after: any): string[] {
  if (!before || !after) return [];
  
  const changed: string[] = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  
  for (const key of allKeys) {
    const beforeVal = before[key];
    const afterVal = after[key];
    
    // Handle null/undefined comparison
    if (beforeVal !== afterVal && 
        !(beforeVal == null && afterVal == null) &&
        JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
      changed.push(key);
    }
  }
  
  return changed;
}

export interface Building {
  building_number: number;
  tax_region?: string;
  residence_shared_area?: number;
  business_shared_area?: number;
  elevator?: string;
  area_for_control?: number;
  created_at: string;
  total_building_area?: number;
  single_double_family?: string;
  condo?: string;
  townhouses?: string;
  need_residence_distribution?: boolean;
  need_business_distribution?: boolean;
  building_address?: number; // Street code from address_list table
  overload_ratio?: number; // אחוז העמסה - Overload ratio percentage
  gosh?: number; // גוש (Block number)
  helka?: number; // חלקה (Parcel number)
  building_number_in_street?: number; // מספר בניין (Building number in street)
  _tempId?: string; // Hidden field to identify new buildings before saving
  _isNew?: boolean; // Hidden field to mark new buildings
}

export interface Asset {
  building_number: number;
  payer_id?: string;
  asset_id: number; // Primary key (was id field previously)
  measurement_date: string;
  main_asset_type?: string;
  asset_size: number;
  sub_asset_type_1?: string;
  sub_asset_size_1: number;
  sub_asset_type_2?: string;
  sub_asset_size_2: number;
  sub_asset_type_3?: string;
  sub_asset_size_3: number;
  sub_asset_type_4?: string;
  sub_asset_size_4: number;
  sub_asset_type_5?: string;
  sub_asset_size_5: number;
  sub_asset_type_6?: string;
  sub_asset_size_6: number;
  structure_drawing_url?: string;
  created_at: string;
  updated_at: string;
  elevator?: string;
  single_double_family?: string;
  condo?: string;
  townhouses?: string;
  penthouse?: string;
  tax_region?: number; // Tax region code (אזור מס) - matches asset_types.tax_region
  is_latest?: boolean; // Flag from assets_with_history view: true for assets table, false for assets_history
  history_created_at?: string; // Only present for assets_history records
  is_new_measurement?: boolean; // Flag to mark as new measurement - when true, UPDATE will move old record to history
  floor?: number; // קומה (Floor number)
  discount_type?: string; // סוג הנחה (Discount type)
  discount_date_from?: string; // תאריך הנחה מ (Discount date from)
  discount_date_to?: string; // תאריך הנחה עד (Discount date to)
  area_from_distribution?: number; // Area distributed to this asset from shared area distribution (business or residence, depending on asset type)
  business_total_area?: number; // Total business area for this asset = asset_size + area_from_distribution (only for business assets, 0 for non-business assets)
  exported_to_automation?: boolean; // Flag indicating if asset has been exported to automation system (default: false)
  export_to_automation_at?: string; // Date when asset was exported to automation system (DD/MM/YYYY format)
  data_from_automation?: boolean; // Flag indicating if this asset row originated from automation import
  comment?: string; // User comment/notes about the asset (הערה על הנכס)
}

export interface AssetFile {
  id: number;
  asset_id: number;
  file_url: string;
  file_name?: string;
  file_size?: number;
  file_type?: string;
  uploaded_at: string;
  uploaded_by?: string;
  measurement_date?: string | null; // Measurement date this file belongs to (NULL = belongs to all measurements)
}

export interface AssetMeasurement {
  id: string;
  asset_id: string;
  measurement_date: string;
  asset_area: number;
  storage_area: number;
  pergola_area: number;
  balcony_area: number;
  garden_area?: number;
  total_area: number;
  notes?: string;
  drawing_file_url?: string;
  created_at: string;
  created_by?: string;
}

export interface AssetType {
  id: number;
  name: string;
  description?: string;
  tax_region?: number;
  area_description_for_tab?: string; // תיאור אזור לתצוגה בלשונית
  elevator?: string;
  single_double_family?: string;
  penthouse?: string;
  condo?: string;
  townhouses?: string;
  business_residence?: string;
  active?: string;
  non_accountable_for_total_area?: boolean; // לא נספר בחישוב שטח מבנה
  non_accountable_for_distribution?: boolean; // לא נספר בפיזור
  not_accountable_for_statistics?: boolean; // לא נספר בסטטיסטיקה
  use_shared_area?: boolean; // שימוש בשטח משותף
  min_size?: number;
  max_size?: number;
  created_at: string;
  updated_at: string;
}

export interface AddressList {
  street_code: number;
  street_description: string;
  created_at: string;
  updated_at: string;
}

export interface FieldConfiguration {
  grid_name: string;
  field_name: string;
  width_chars: number;
  padding: number;
  hebrew_name?: string;
  pinned: boolean;
  pin_side?: 'left' | 'right' | null;
  visible: boolean;
  column_order?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ValidationRule {
  id: string;
  rule_key: string;
  rule_type: string;
  field_name: string;
  entity_type: string;
  value_numeric?: number;
  value_text?: string;
  enabled: boolean;
  error_message?: string;
  description?: string;
  compare_table?: string;
  compare_field?: string;
  join_field?: string;
  comparison_operator?: string;
  created_at: string;
  updated_at: string;
}


export interface ChangeLog {
  log_id: number;
  table_name: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  record_id?: string;
  user_name: string;
  user_email?: string;
  user_id?: string;
  before_data?: any; // JSONB
  after_data?: any; // JSONB
  changed_fields?: string[]; // Array of field names that changed (for UPDATE)
  ip_address?: string;
  user_agent?: string;
  session_id?: string;
  created_at: string;
}

export interface DistributionAudit {
  id: number;
  building_number: number;
  action_type: 'distribution' | 'transfer' | 'business_distribution' | 'residence_distribution' | 'distribute_shared' | 'transfer_area';
  before_data?: any; // JSONB containing assets and other data
  after_data?: any; // JSONB containing assets and other data
  overload_ratio?: number;
  shared_area_size?: number;
  description?: string;
  user_id?: number;
  tax_region?: string; // Tax region for filtering (business or residence)
  entity_type?: string; // Entity type (e.g., 'bulk_asset')
  entity_id?: string; // Entity ID (e.g., building number as string)
  created_at: string;
  action_id?: number; // Alias for id
  user_name?: string; // User name
}

// Type alias for backward compatibility
export type AuditLog = DistributionAudit;


/**
 * Sanitizes asset data before sending to the server
 */
export function sanitizeAssetInput(input: any): any {
  // Default measurement_date to today if not provided or invalid
  let measurementDate = input.measurement_date != null ? sanitizeDate(input.measurement_date) : '';
  if (!measurementDate || measurementDate === '') {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    measurementDate = `${day}/${month}/${year}`;
  }
  
  const sanitized: any = {
    building_number: input.building_number != null ? sanitizeInteger(input.building_number) : undefined,
    payer_id: input.payer_id != null && input.payer_id !== '' ? sanitizeText(input.payer_id) : undefined,
    asset_id: input.asset_id != null ? sanitizeInteger(input.asset_id) : undefined,
    measurement_date: measurementDate, // Always include measurement_date
    main_asset_type: input.main_asset_type != null ? sanitizeText(input.main_asset_type) : undefined,
    asset_size: input.asset_size != null ? sanitizeNumber(input.asset_size) : undefined,
    tax_region: input.tax_region != null ? sanitizeInteger(input.tax_region) : undefined,
    sub_asset_type_1: input.sub_asset_type_1 != null ? sanitizeText(input.sub_asset_type_1) : undefined,
    sub_asset_size_1: input.sub_asset_size_1 != null ? sanitizeNumber(input.sub_asset_size_1) : undefined,
    sub_asset_type_2: input.sub_asset_type_2 != null ? sanitizeText(input.sub_asset_type_2) : undefined,
    sub_asset_size_2: input.sub_asset_size_2 != null ? sanitizeNumber(input.sub_asset_size_2) : undefined,
    sub_asset_type_3: input.sub_asset_type_3 != null ? sanitizeText(input.sub_asset_type_3) : undefined,
    sub_asset_size_3: input.sub_asset_size_3 != null ? sanitizeNumber(input.sub_asset_size_3) : undefined,
    sub_asset_type_4: input.sub_asset_type_4 != null ? sanitizeText(input.sub_asset_type_4) : undefined,
    sub_asset_size_4: input.sub_asset_size_4 != null ? sanitizeNumber(input.sub_asset_size_4) : undefined,
    sub_asset_type_5: input.sub_asset_type_5 != null ? sanitizeText(input.sub_asset_type_5) : undefined,
    sub_asset_size_5: input.sub_asset_size_5 != null ? sanitizeNumber(input.sub_asset_size_5) : undefined,
    sub_asset_type_6: input.sub_asset_type_6 != null ? sanitizeText(input.sub_asset_type_6) : undefined,
    sub_asset_size_6: input.sub_asset_size_6 != null ? sanitizeNumber(input.sub_asset_size_6) : undefined,
    elevator: input.elevator != null ? sanitizeText(input.elevator) : undefined,
    single_double_family: input.single_double_family != null ? sanitizeText(input.single_double_family) : undefined,
    condo: input.condo != null ? sanitizeText(input.condo) : undefined,
    townhouses: input.townhouses != null ? sanitizeText(input.townhouses) : undefined,
    penthouse: input.penthouse != null ? sanitizeText(input.penthouse) : undefined,
    structure_drawing_url: input.structure_drawing_url != null ? sanitizeText(input.structure_drawing_url) : undefined,
    floor: input.floor != null ? sanitizeInteger(input.floor) : undefined,
    discount_type: input.discount_type != null ? sanitizeText(input.discount_type) : undefined,
    discount_date_from: input.discount_date_from != null ? sanitizeDate(input.discount_date_from) : undefined,
    discount_date_to: input.discount_date_to != null ? sanitizeDate(input.discount_date_to) : undefined,
    area_from_distribution: input.area_from_distribution != null ? sanitizeNumber(input.area_from_distribution) : undefined,
    exported_to_automation: input.exported_to_automation != null ? (input.exported_to_automation === true || input.exported_to_automation === 'true') : undefined,
    export_to_automation_at: input.export_to_automation_at != null ? sanitizeDate(input.export_to_automation_at) : undefined,
    comment: input.comment != null ? sanitizeText(input.comment) : undefined,
  };
  
  // Remove undefined values to avoid sending them to the database
  // But always keep measurement_date even if it's somehow undefined (shouldn't happen)
  Object.keys(sanitized).forEach(key => {
    if (key !== 'measurement_date' && sanitized[key] === undefined) {
      delete sanitized[key];
    }
  });
  
  // Ensure measurement_date is always present
  if (!sanitized.measurement_date) {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    sanitized.measurement_date = `${day}/${month}/${year}`;
  }
  
  return sanitized;
}

/**
 * Sanitizes building data before sending to the server
 */
function sanitizeBuildingInput(input: any): any {
  const sanitized: any = {};
  
  if (input.building_number != null) {
    sanitized.building_number = sanitizeInteger(input.building_number);
  }
  if (input.tax_region != null && input.tax_region !== '') {
    sanitized.tax_region = sanitizeText(input.tax_region);
  }
  if (input.residence_shared_area != null) {
    sanitized.residence_shared_area = sanitizeNumber(input.residence_shared_area);
  }
  // Database column is 'business_shared_area' (matching the interface)
  if (input.business_shared_area != null) {
    sanitized.business_shared_area = sanitizeNumber(input.business_shared_area);
  }
  // Database column is 'area_for_control' (matching the interface)
  if (input.area_for_control != null) {
    sanitized.area_for_control = sanitizeNumber(input.area_for_control);
  }
  if (input.total_building_area != null) {
    sanitized.total_building_area = sanitizeNumber(input.total_building_area);
  }
  // Handle elevator: if explicitly set to null, include it; otherwise only if it has a value
  if ('elevator' in input) {
    if (input.elevator === null || input.elevator === '') {
      sanitized.elevator = null;
    } else {
      sanitized.elevator = sanitizeText(input.elevator);
    }
  }
  // Handle checkbox fields: if explicitly set to null, include it; otherwise only if it has a value
  if ('single_double_family' in input) {
    if (input.single_double_family === null || input.single_double_family === '') {
      sanitized.single_double_family = null;
    } else {
      sanitized.single_double_family = sanitizeText(input.single_double_family);
    }
  }
  if ('condo' in input) {
    if (input.condo === null || input.condo === '') {
      sanitized.condo = null;
    } else {
      sanitized.condo = sanitizeText(input.condo);
    }
  }
  if ('townhouses' in input) {
    if (input.townhouses === null || input.townhouses === '') {
      sanitized.townhouses = null;
    } else {
      sanitized.townhouses = sanitizeText(input.townhouses);
    }
  }
  // Handle building_address: street code from address_list table
  if ('building_address' in input) {
    if (input.building_address === null || input.building_address === '' || input.building_address === undefined) {
      sanitized.building_address = null;
    } else {
      const code = sanitizeInteger(input.building_address);
      // Only set if it's a valid positive number, otherwise set to null
      if (code && code > 0) {
        sanitized.building_address = code;
      } else {
        sanitized.building_address = null;
      }
    }
  }
  // Handle overload_ratio: numeric field for overload percentage
  if (input.overload_ratio != null) {
    sanitized.overload_ratio = sanitizeNumber(input.overload_ratio);
  }
  // Handle gosh: גוש (Block number)
  if (input.gosh != null && input.gosh !== '') {
    sanitized.gosh = sanitizeInteger(input.gosh);
  } else if ('gosh' in input && (input.gosh === null || input.gosh === '')) {
    sanitized.gosh = null;
  }
  // Handle helka: חלקה (Parcel number)
  if (input.helka != null && input.helka !== '') {
    sanitized.helka = sanitizeInteger(input.helka);
  } else if ('helka' in input && (input.helka === null || input.helka === '')) {
    sanitized.helka = null;
  }
  // Handle building_number_in_street: מספר בניין (Building number in street)
  if (input.building_number_in_street != null && input.building_number_in_street !== '') {
    sanitized.building_number_in_street = sanitizeInteger(input.building_number_in_street);
  } else if ('building_number_in_street' in input && (input.building_number_in_street === null || input.building_number_in_street === '')) {
    sanitized.building_number_in_street = null;
  }
  // Handle boolean distribution flags
  if ('need_residence_distribution' in input) {
    sanitized.need_residence_distribution = input.need_residence_distribution === true || input.need_residence_distribution === 'true';
  }
  if ('need_business_distribution' in input) {
    sanitized.need_business_distribution = input.need_business_distribution === true || input.need_business_distribution === 'true';
  }
  
  return sanitized;
}

/**
 * Validate and save a single asset with transactional post-save actions
 * ENFORCES: Validation must pass before save
 * GUARANTEES: All operations (save + post-save actions) in ONE transaction
 * NOTE: Uses bulk transactional function for consistency
 */
async function validateAndSaveAsset(
  assetData: any,
  actionType: string = 'manual_update',
  description?: string
): Promise<{ success: boolean; asset_id: number; error?: string }> {
  // Use bulk transactional function for consistency - wrap single asset in array
  const result = await validateAndSaveBulkAssets(
    [assetData],
    actionType,
    null, // beforeData
    null, // afterData
    description,
    undefined // isBusinessContext - not available in single asset save context
  );

  if (result.success) {
    return {
      success: true,
      asset_id: assetData.asset_id
    };
  } else {
    // Combine validation errors and general error message
    const errorMessages: string[] = [];
    if (result.validationErrors && result.validationErrors.length > 0) {
      errorMessages.push(...result.validationErrors);
    }
    if (result.error) {
      errorMessages.push(result.error);
    }
    if (errorMessages.length === 0) {
      errorMessages.push('Unknown error during save');
    }
    
    return {
      success: false,
      asset_id: assetData.asset_id,
      error: errorMessages.join('; ')
    };
  }
}

/**
 * Validate and save multiple assets with transactional post-save actions
 * ENFORCES: Validation must pass for ALL assets before save
 * GUARANTEES: All operations (saves + post-save actions) in ONE transaction
 */
async function validateAndSaveBulkAssets(
  assetsData: any[],
  actionType: string = 'manual_update',
  beforeData?: any,
  afterData?: any,
  description?: string,
  isBusinessContext?: boolean
): Promise<{ success: boolean; affected_asset_ids?: number[]; count?: number; error?: string; validationErrors?: string[] }> {
  const { AssetValidationHandler } = await import('./assetValidationHandler');
  const userInfo = await getCurrentUserInfo();

  // STEP 0: Load existing asset data and merge with changes for validation
  // This ensures validation runs on complete data, not just partial changes
  const assetIds = assetsData
    .map(a => a.asset_id)
    .filter(id => id != null)
    .map(id => Number(id))
    .filter(id => !isNaN(id));
  
  // Load existing assets from database if we have asset_ids
  let existingAssetsMap = new Map<number, any>();
  if (assetIds.length > 0) {
    const { data: existingAssets, error: fetchError } = await supabase
      .from('assets')
      .select('*')
      .in('asset_id', assetIds);
    
    if (!fetchError && existingAssets) {
      existingAssets.forEach(asset => {
        existingAssetsMap.set(Number(asset.asset_id), asset);
      });
    }
  }
  
  // STEP 0b: Prepare assets for validation - merge existing data with changes
  // Remove only AG Grid internal fields and ensure basic type conversions for validation
  const preparedAssetsData = assetsData.map((asset: any) => {
    // Remove AG Grid internal fields (same as single save - no extra sanitization)
    const { _isNew, _isDirty, _validationErrors, _isMasterRow, ...cleanAsset } = asset as any;
    
    // Merge with existing asset data if it exists (for validation - needs complete data)
    const assetId = cleanAsset.asset_id != null ? Number(cleanAsset.asset_id) : null;
    const existingAsset = assetId != null && !isNaN(assetId) ? existingAssetsMap.get(assetId) : null;
    
    // Merge: existing data first, then overlay changes (changes take precedence)
    const mergedAsset = existingAsset ? { ...existingAsset, ...cleanAsset } : cleanAsset;
    
    // Ensure numeric fields are numbers (not strings) for validation
    // This is minimal type conversion - same as what database expects
    if (mergedAsset.asset_size != null) {
      const size = Number(mergedAsset.asset_size);
      mergedAsset.asset_size = isNaN(size) ? undefined : size;
    }
    if (mergedAsset.building_number != null) {
      const num = Number(mergedAsset.building_number);
      mergedAsset.building_number = isNaN(num) ? undefined : num;
    }
    if (mergedAsset.asset_id != null) {
      const id = Number(mergedAsset.asset_id);
      mergedAsset.asset_id = isNaN(id) ? undefined : id;
    }
    // Convert sub-asset sizes to numbers
    for (let i = 1; i <= 6; i++) {
      const sizeKey = `sub_asset_size_${i}` as keyof typeof mergedAsset;
      if (mergedAsset[sizeKey] != null) {
        const size = Number(mergedAsset[sizeKey]);
        (mergedAsset as any)[sizeKey] = isNaN(size) ? undefined : size;
      }
    }
    
    // Preserve 'id' temporarily for validation (will be removed before sending to DB)
    return mergedAsset;
  });

  // STEP 1: Validate ALL assets (same as single save)
  const validationResults = await Promise.all(
    preparedAssetsData.map(asset => AssetValidationHandler.validateSingleAsset(asset))
  );

  // Check if ALL assets are valid
  const allValid = validationResults.every(result => result.valid);
  const validationErrors = validationResults
    .filter(result => !result.valid)
    .map((result, index) => {
      const assetId = preparedAssetsData[index]?.asset_id || `Asset ${index + 1}`;
      const buildingNumber = preparedAssetsData[index]?.building_number;
      const assetIdentifier = buildingNumber 
        ? `נכס ${assetId} (מבנה ${buildingNumber})` 
        : `נכס ${assetId}`;
      const errors = result.errors?.length > 0 
        ? result.errors.join('; ') 
        : 'Validation failed';
      return `${assetIdentifier}: ${errors}`;
    });

  // STEP 2: Remove 'id' field before sending to database (same as single save - no extra transformation)
  const assetsForDatabase = preparedAssetsData.map(asset => {
    const { id, ...assetWithoutId } = asset as any;
    return assetWithoutId;
  });
  
  // STEP 3: Call transactional bulk save function (rejects if any validation failed)
  try {
    const { data, error } = await supabase.rpc('save_assets_bulk_transactional', {
      p_assets_data: assetsForDatabase,
      p_validation_passed: allValid,
      p_validation_errors: validationErrors.length > 0 ? validationErrors.join('; ') : null,
      p_action_type: actionType,
      p_user_id: userInfo.user_id || null,
      p_before_data: beforeData || null,
      p_after_data: afterData || null,
      p_description: description || null,
      p_is_business_context: isBusinessContext !== undefined ? isBusinessContext : null
    });

    if (error) {
      return {
        success: false,
        error: error.message,
        validationErrors: validationErrors.length > 0 ? validationErrors : undefined
      };
    }

    return {
      success: true,
      affected_asset_ids: data.affected_asset_ids,
      count: data.count
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Unknown error during bulk save',
      validationErrors: validationErrors.length > 0 ? validationErrors : undefined
    };
  }
}

export const api = {
  buildings: {
    getAll: async (): Promise<Building[]> => {
      const { data, error } = await supabase
        .from('buildings')
        .select('*')
        .order('building_number');

      if (error) throw error;

      return data || [];
    },
    getOne: async (buildingNumber: number): Promise<Building> => {
      const { data, error } = await supabase
        .from('buildings')
        .select('*')
        .eq('building_number', buildingNumber)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Building not found');

      return data;
    },
    getAvailableTaxRegions: async (buildingNumber: number): Promise<string | null> => {
      // Get all assets for this building
      const assets = await api.assets.getAll(buildingNumber);
      
      if (!assets || assets.length === 0) {
        return null;
      }

      // Get all unique tax regions directly from assets' tax_region field
      const taxRegions = new Set<number>();
      for (const asset of assets) {
        if (asset.tax_region != null) {
          const taxRegionNum = typeof asset.tax_region === 'string' 
            ? parseInt(asset.tax_region, 10) 
            : asset.tax_region;
          if (!isNaN(taxRegionNum)) {
            taxRegions.add(taxRegionNum);
          }
        }
      }

      // Convert to sorted array and join with comma
      if (taxRegions.size === 0) {
        return null;
      }

      const sortedTaxRegions = Array.from(taxRegions).sort((a, b) => a - b);
      return sortedTaxRegions.join(',');
    },
    create: async (input: Omit<Building, 'created_at'>): Promise<Building> => {
      const sanitizedInput = sanitizeBuildingInput(input);
      // Remove undefined values to prevent Supabase errors
      const cleanedInput = Object.fromEntries(
        Object.entries(sanitizedInput).filter(([_, v]) => v !== undefined)
      );
      
      // New buildings always start with distribution flags set to false (no distribution needed by default)
      // Flags will be set to true automatically when shared areas are set via update_buildings_bulk_with_distribution_flags
      // Explicitly set to false to ensure they're never true on creation, even if passed in input
      cleanedInput.need_residence_distribution = false;
      cleanedInput.need_business_distribution = false;
      
      const { data, error } = await supabase
        .from('buildings')
        .insert(cleanedInput)
        .select()
        .single();

      if (error) {
        throw error;
      }
      
      
      // Log change entry asynchronously
      logChangeAsync(
        'buildings',
        'INSERT',
        String(data.building_number),
        undefined,
        data
      );
      
      return data;
    },
    update: async (buildingNumber: number, input: Partial<Building>): Promise<Building> => {
      // Get the current building data before update (for change log)
      let beforeData: Building | null = null;
      try {
        beforeData = await api.buildings.getOne(buildingNumber);
      } catch (err) {
        // If building doesn't exist, that's fine - we'll still try to update
        if (process.env.NODE_ENV === 'development') {
          console.warn('[api.buildings.update] Could not fetch before data:', err);
        }
      }
      
      const sanitizedInput = sanitizeBuildingInput(input);
      // Remove undefined values to prevent Supabase errors
      const cleanedInput = Object.fromEntries(
        Object.entries(sanitizedInput).filter(([_, v]) => v !== undefined)
      );
      
      // Remove read-only fields that shouldn't be updated directly
      delete (cleanedInput as any).created_at;
      // Don't allow updating building_number (primary key)
      delete (cleanedInput as any).building_number;
      
      // If no fields to update, return the existing building
      if (Object.keys(cleanedInput).length === 0) {
        return api.buildings.getOne(buildingNumber);
      }
      
      // Use bulk database function to update building - it will automatically set distribution flags
      // when shared areas change. Always use bulk function, even for single building updates.
      const buildingsData = [{
        building_number: buildingNumber,
        updates: cleanedInput
      }];
      
      const { data: functionResult, error: rpcError } = await supabase.rpc('update_buildings_bulk_with_distribution_flags', {
        p_buildings_data: buildingsData
      });

      let data: Building | null = null;
      let error: any = null;

      if (rpcError) {
        // If RPC fails, fall back to direct update (for backwards compatibility)
        const fallbackResult = await supabase
          .from('buildings')
          .update(cleanedInput)
          .eq('building_number', buildingNumber)
          .select()
          .single();
        
        data = fallbackResult.data;
        error = fallbackResult.error;
      } else {
        // Bulk function returns {success, count, buildings: [...]}
        // Extract the first (and only) building from the result
        const result = functionResult as { success: boolean; buildings: Building[]; count: number };
        if (result && result.buildings && result.buildings.length > 0) {
          data = result.buildings[0];
        } else {
          error = { message: 'No building data returned from bulk update function' };
        }
      }

      if (error) {
        // Log the error details for debugging - serialize the error object properly
        const errorInfo = {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          buildingNumber,
          cleanedInputKeys: Object.keys(cleanedInput),
          cleanedInput,
          inputKeys: Object.keys(input || {}),
          sanitizedInputKeys: Object.keys(sanitizedInput || {})
        };
        
        console.error('[api.buildings.update] Update error:', errorInfo);
        console.error('[api.buildings.update] Full error object:', error);
        console.error('[api.buildings.update] Cleaned input being sent:', cleanedInput);
        
        // Handle foreign key constraint violation for building_address
        if (error.code === '23503' && (error.message?.includes('fk_buildings_building_address') || error.details?.includes('address_list'))) {
          const streetCode = cleanedInput.building_address;
          throw new Error(`סמל רחוב ${streetCode} לא קיים בטבלת הכתובות. יש לבחור כתובת תקינה מהרשימה.`);
        }
        
        // Handle 400 Bad Request errors - provide more context
        if (error.code === 'PGRST116' || error.code === '400' || error.message?.includes('400') || error.message?.includes('Bad Request')) {
          const errorMsg = error.message || 'Bad Request';
          const details = error.details ? ` (${error.details})` : '';
          const hint = error.hint ? ` - ${error.hint}` : '';
          const fullError = `שגיאה בעדכון מבנה: ${errorMsg}${details}${hint}`;
          console.error('[api.buildings.update] Bad Request details:', fullError);
          throw new Error(fullError);
        }
        
        // For any other error, throw with more context
        const errorMessage = error.message || 'Unknown error';
        const errorDetails = error.details ? ` (${error.details})` : '';
        const errorHint = error.hint ? ` - ${error.hint}` : '';
        throw new Error(`שגיאה בעדכון מבנה: ${errorMessage}${errorDetails}${errorHint}`);
      }
      
      if (!data) {
        throw new Error('Failed to update building: No data returned');
      }
      
      
      // Log change entry asynchronously
      if (beforeData) {
        const changedFields = calculateChangedFields(beforeData, data);
        logChangeAsync(
          'buildings',
          'UPDATE',
          String(buildingNumber),
          beforeData,
          data,
          changedFields
        );
      } else {
        logChangeAsync(
          'buildings',
          'UPDATE',
          String(buildingNumber),
          undefined,
          data
        );
      }
      
      return data;
    },
    updateBulk: async (
      buildingsData: Array<{ building_number: number; updates: Partial<Building> }>
    ): Promise<{ success: boolean; count: number; buildings?: Building[]; error?: string }> => {
      if (!buildingsData || buildingsData.length === 0) {
        return { success: true, count: 0, buildings: [] };
      }

      const payload = buildingsData
        .filter(b => b && b.building_number != null)
        .map(b => ({
          building_number: b.building_number,
          updates: Object.fromEntries(
            Object.entries(sanitizeBuildingInput(b.updates || {})).filter(([_, v]) => v !== undefined)
          )
        }))
        .filter(b => b.updates && Object.keys(b.updates).length > 0);

      if (payload.length === 0) {
        return { success: true, count: 0, buildings: [] };
      }

      const { data: functionResult, error: rpcError } = await supabase.rpc('update_buildings_bulk_with_distribution_flags', {
        p_buildings_data: payload as any
      });

      if (rpcError) {
        return { success: false, count: 0, error: rpcError.message };
      }

      const result = functionResult as { success: boolean; buildings: any[]; count: number };
      return {
        success: result?.success === true,
        count: Number(result?.count || 0),
        buildings: (result?.buildings || []) as Building[]
      };
    },
    createBulk: async (inputs: Omit<Building, 'created_at'>[]): Promise<{ success: boolean; count: number; buildings?: Building[]; error?: string }> => {
      if (!inputs || inputs.length === 0) {
        return { success: true, count: 0, buildings: [] };
      }

      const prepared = inputs.map(input => {
        const sanitizedInput = sanitizeBuildingInput(input as any);
        const cleanedInput: any = Object.fromEntries(
          Object.entries(sanitizedInput).filter(([_, v]) => v !== undefined)
        );

        // Enforce defaults on creation
        cleanedInput.need_residence_distribution = false;
        cleanedInput.need_business_distribution = false;

        return cleanedInput;
      });

      const { data, error } = await supabase
        .from('buildings')
        .insert(prepared)
        .select('*');

      if (error) {
        return { success: false, count: 0, error: error.message };
      }

      // Log changes asynchronously (one per created building)
      try {
        (data || []).forEach((b: any) => {
          logChangeAsync(
            'buildings',
            'INSERT',
            String(b.building_number),
            undefined,
            b
          );
        });
      } catch (err) {
        console.warn('[api.buildings.createBulk] Failed to log changes:', err);
      }

      return { success: true, count: data?.length || prepared.length, buildings: data || [] };
    },
    delete: async (buildingNumber: number): Promise<{ message: string }> => {
      // Get building data before deletion (for change log)
      let beforeData: Building | null = null;
      try {
        beforeData = await api.buildings.getOne(buildingNumber);
      } catch (err) {
        // If building doesn't exist, that's fine
        if (process.env.NODE_ENV === 'development') {
          console.warn('[api.buildings.delete] Could not fetch before data:', err);
        }
      }

      
      const { error } = await supabase
        .from('buildings')
        .delete()
        .eq('building_number', buildingNumber);

      if (error) throw error;

      // Log change entry asynchronously
      if (beforeData) {
        logChangeAsync(
          'buildings',
          'DELETE',
          String(buildingNumber),
          beforeData,
          undefined
        );
      }

      return { message: 'Building deleted successfully' };
    },
    // Distribution flag management API
    markBusinessDistributionNeeded: async (buildingNumber: number): Promise<void> => {
      const { error } = await supabase
        .from('buildings')
        .update({ need_business_distribution: true })
        .eq('building_number', buildingNumber);
      
      if (error) {
        console.error('[api.buildings.markBusinessDistributionNeeded] Failed:', error);
        throw error;
      }
      console.log(`[api.buildings.markBusinessDistributionNeeded] Marked building ${buildingNumber} as needing business distribution`);
    },
    markBusinessDistributionDone: async (buildingNumber: number): Promise<void> => {
      const { error } = await supabase
        .from('buildings')
        .update({ need_business_distribution: false })
        .eq('building_number', buildingNumber);
      
      if (error) {
        console.error('[api.buildings.markBusinessDistributionDone] Failed:', error);
        throw error;
      }
      console.log(`[api.buildings.markBusinessDistributionDone] Marked building ${buildingNumber} as having completed business distribution`);
    },
    markResidenceDistributionNeeded: async (buildingNumber: number): Promise<void> => {
      console.log(`[api.buildings.markResidenceDistributionNeeded] Attempting to update building ${buildingNumber}...`);
      const { data, error } = await supabase
        .from('buildings')
        .update({ need_residence_distribution: true })
        .eq('building_number', buildingNumber)
        .select('building_number, need_residence_distribution');
      
      if (error) {
        console.error('[api.buildings.markResidenceDistributionNeeded] Failed:', error);
        throw error;
      }
      
      if (data && data.length > 0) {
        console.log(`[api.buildings.markResidenceDistributionNeeded] ✓ Successfully updated building ${buildingNumber}:`, data[0]);
      } else {
        console.warn(`[api.buildings.markResidenceDistributionNeeded] ⚠ No rows updated for building ${buildingNumber} - building may not exist`);
      }
    },
    markResidenceDistributionDone: async (buildingNumber: number): Promise<void> => {
      const { error } = await supabase
        .from('buildings')
        .update({ need_residence_distribution: false })
        .eq('building_number', buildingNumber);
      
      if (error) {
        console.error('[api.buildings.markResidenceDistributionDone] Failed:', error);
        throw error;
      }
      console.log(`[api.buildings.markResidenceDistributionDone] Marked building ${buildingNumber} as having completed residence distribution`);
    },
    getDistributionStatus: async (buildingNumber: number): Promise<{ business: boolean | null; residence: boolean | null }> => {
      const { data, error } = await supabase
        .from('buildings')
        .select('need_business_distribution, need_residence_distribution')
        .eq('building_number', buildingNumber)
        .maybeSingle();
      
      if (error) {
        console.error('[api.buildings.getDistributionStatus] Failed:', error);
        throw error;
      }
      
      if (!data) {
        throw new Error('Building not found');
      }
      
      return {
        business: data.need_business_distribution,
        residence: data.need_residence_distribution
      };
    },
  },
  assets: {
    getAll: async (buildingNumber?: number): Promise<Asset[]> => {
      let query = supabase
        .from('assets')
        .select('*')
        .order('asset_id');

      if (buildingNumber) {
        query = query.eq('building_number', buildingNumber);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      const parseDate = (dateStr: string) => {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        }
        return new Date(dateStr);
      };

      const sortedData = (data || []).sort((a, b) => {
        if (a.asset_id !== b.asset_id) {
          return a.asset_id - b.asset_id;
        }
        return parseDate(b.measurement_date).getTime() - parseDate(a.measurement_date).getTime();
      });

      return sortedData;
    },
    getLatestOnly: async (buildingNumber?: number): Promise<Asset[]> => {
      let query = supabase
        .from('assets')
        .select('*')
        .order('asset_id');

      if (buildingNumber) {
        query = query.eq('building_number', buildingNumber);
      }

      const { data, error } = await query;

      if (error) throw error;

      const parseDate = (dateStr: string) => {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        }
        return new Date(dateStr);
      };

      const sortedData = (data || []).sort((a, b) => {
        if (a.asset_id !== b.asset_id) {
          return a.asset_id - b.asset_id;
        }
        return parseDate(b.measurement_date).getTime() - parseDate(a.measurement_date).getTime();
      });

      const latestMap = new Map<string, Asset>();
      for (const asset of sortedData) {
        if (!latestMap.has(asset.asset_id)) {
          latestMap.set(asset.asset_id, asset);
        }
      }

      return Array.from(latestMap.values());
    },
    getAllByAssetId: async (assetId: string, buildingNumber?: number): Promise<Asset[]> => {
      let query = supabase
        .from('assets')
        .select('*')
        .eq('asset_id', assetId);

      if (buildingNumber) {
        query = query.eq('building_number', buildingNumber);
      }

      const { data, error } = await query;

      if (error) throw error;

      const parseDate = (dateStr: string) => {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        }
        return new Date(dateStr);
      };

      return (data || []).sort((a, b) =>
        parseDate(b.measurement_date).getTime() - parseDate(a.measurement_date).getTime()
      );
    },
    getHistoryByAssetId: async (assetId: string | number): Promise<Asset[]> => {
      const { data, error } = await supabase
        .from('assets_history')
        .select('*')
        .eq('asset_id', assetId)
        .order('history_created_at', { ascending: false });

      if (error) {
        // If table doesn't exist or RLS blocks it, return empty array
        if (error.code === '42P01' || error.code === '42501') {
          return [];
        }
        throw error;
      }

      const parseDate = (dateStr: string) => {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        }
        return new Date(dateStr);
      };

      return (data || []).sort((a, b) =>
        parseDate(b.measurement_date).getTime() - parseDate(a.measurement_date).getTime()
      );
    },
    getAssetWithHistory: async (assetId: string | number, buildingNumber?: number): Promise<Asset[]> => {
      try {
        // First record: fetch from assets table (latest measurement)
        let masterQuery = supabase
          .from('assets')
          .select('*')
          .eq('asset_id', assetId);

        if (buildingNumber) {
          masterQuery = masterQuery.eq('building_number', buildingNumber);
        }

        const { data: masterData, error: masterError } = await masterQuery.maybeSingle();

        if (masterError && masterError.code !== 'PGRST116') {
          throw masterError;
        }

        // Other records: fetch from assets_history table
        let historyQuery = supabase
          .from('assets_history')
          .select('*')
          .eq('asset_id', assetId);

        if (buildingNumber) {
          historyQuery = historyQuery.eq('building_number', buildingNumber);
        }

        // Sort by history_created_at (database insertion date) descending, then by measurement_date as fallback
        const { data: historyData, error: historyError } = await historyQuery
          .order('history_created_at', { ascending: false, nullsFirst: false })
          .order('measurement_date', { ascending: false });

        if (historyError) {
          // If history table doesn't exist or RLS blocks it, return only master
          if (historyError.code === '42P01' || historyError.code === '42501' || historyError.code === 'PGRST205') {
            return masterData ? [{ ...masterData, is_latest: true }] : [];
          }
          throw historyError;
        }

        // Sort history records by history_created_at (database insertion date) descending
        // If history_created_at is null, use created_at or id as fallback
        const sortedHistory = (historyData || []).map(h => ({ ...h, is_latest: false }))
          .sort((a, b) => {
            // Primary sort: history_created_at (database insertion date)
            const aDate = a.history_created_at || a.created_at || a.id;
            const bDate = b.history_created_at || b.created_at || b.id;
            
            if (aDate && bDate) {
              const aTime = new Date(aDate).getTime();
              const bTime = new Date(bDate).getTime();
              return bTime - aTime; // Descending (newest first)
            }
            
            // Fallback: if one has date and other doesn't, put the one with date first
            if (aDate && !bDate) return -1;
            if (!aDate && bDate) return 1;
            
            // Final fallback: sort by measurement_date
            const parseDate = (dateStr: string) => {
              if (!dateStr) return 0;
              const parts = dateStr.split('/');
              if (parts.length === 3) {
                return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
              }
              return new Date(dateStr).getTime();
            };
            
            return parseDate(b.measurement_date) - parseDate(a.measurement_date);
          });

        // Combine: first record from assets table, then all history records
        const allRecords: Asset[] = [];
        
        if (masterData) {
          // First record: from assets table (marked as latest)
          allRecords.push({ ...masterData, is_latest: true });
        } else {
          // If no master data found, log a warning but don't throw
          // This can happen if the asset was just created or if there's a query issue
          console.warn('[getAssetWithHistory] No master data found for asset_id:', assetId, 'building_number:', buildingNumber);
        }
        
        // Other records: from assets_history table
        allRecords.push(...sortedHistory);

        // Ensure we always return at least an empty array (not null/undefined)
        return allRecords.length > 0 ? allRecords : [];
      } catch (err: any) {
        throw err;
      }
    },
    getAssetWithHistoryFallback: async (assetId: string | number, buildingNumber?: number): Promise<Asset[]> => {
      // Fallback method using separate queries (old implementation)
      let masterQuery = supabase
        .from('assets')
        .select('*')
        .eq('asset_id', assetId);

      if (buildingNumber) {
        masterQuery = masterQuery.eq('building_number', buildingNumber);
      }

      const { data: masterData, error: masterError } = await masterQuery.maybeSingle();

      if (masterError && masterError.code !== 'PGRST116') {
        throw masterError;
      }

      // Fetch detail records from assets_history table
      const { data: historyData, error: historyError } = await supabase
        .from('assets_history')
        .select('*')
        .eq('asset_id', assetId)
        .order('history_created_at', { ascending: false });

      if (historyError) {
        // If table doesn't exist or RLS blocks it, return only master
        if (historyError.code === '42P01' || historyError.code === '42501') {
          return masterData ? [{ ...masterData, is_latest: true }] : [];
        }
        throw historyError;
      }

      const parseDate = (dateStr: string) => {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        }
        return new Date(dateStr);
      };

      // Sort history records by measurement_date (newest first)
      const sortedHistory = (historyData || []).map(h => ({ ...h, is_latest: false }))
        .sort((a, b) => parseDate(b.measurement_date).getTime() - parseDate(a.measurement_date).getTime());

      // Combine master (with is_latest=true) and history (with is_latest=false)
      const allRecords = masterData 
        ? [{ ...masterData, is_latest: true }, ...sortedHistory]
        : sortedHistory;

      return allRecords;
    },
    getAllAssetsWithHistory: async (buildingNumber: number): Promise<Asset[]> => {
      // Call PostgreSQL function to get both master and details in one database call
      const { data, error } = await supabase.rpc('get_assets_with_history', {
        p_building_number: buildingNumber
      });

      if (error) {
        // Fallback to separate queries if function doesn't exist
        // PGRST202 = function not found in schema cache
        if (error.code === '42883' || error.code === 'PGRST202' || error.message.includes('function') || error.message.includes('does not exist') || error.message.includes('Could not find the function')) {
          
          // Fallback: Fetch all master records from assets table for the building
          const { data: masterAssets, error: masterError } = await supabase
            .from('assets')
            .select('*')
            .eq('building_number', buildingNumber)
            .order('asset_id');

          if (masterError) {
            throw masterError;
          }

          if (!masterAssets || masterAssets.length === 0) {
            return [];
          }

          // Get all asset_ids to fetch their history
          const assetIds = masterAssets.map(a => a.asset_id);

          // Fetch all history records for these asset_ids in one query
          const { data: allHistoryData, error: historyError } = await supabase
            .from('assets_history')
            .select('*')
            .in('asset_id', assetIds)
            .order('history_created_at', { ascending: false });

          if (historyError) {
            // If table doesn't exist or RLS blocks it, return only master records
            if (historyError.code === '42P01' || historyError.code === '42501') {
              return masterAssets;
            }
            throw historyError;
          }

          // Group history records by asset_id
          const historyByAssetId = new Map<number, Asset[]>();
          (allHistoryData || []).forEach(record => {
            const assetId = record.asset_id;
            if (!historyByAssetId.has(assetId)) {
              historyByAssetId.set(assetId, []);
            }
            historyByAssetId.get(assetId)!.push(record);
          });

          // Sort history records by measurement_date for each asset
          const parseDate = (dateStr: string) => {
            const parts = dateStr.split('/');
            if (parts.length === 3) {
              return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
            }
            return new Date(dateStr);
          };

          // Combine master records with their history
          const result: Asset[] = [];
          masterAssets.forEach(master => {
            // Add master record
            result.push(master);
            
            // Add history records for this asset
            const history = historyByAssetId.get(master.asset_id) || [];
            const sortedHistory = history.sort((a, b) =>
              parseDate(b.measurement_date).getTime() - parseDate(a.measurement_date).getTime()
            );
            result.push(...sortedHistory);
          });

          return result;
        }
        throw error;
      }

      // Parse the JSON response
      const masterAssets: Asset[] = data?.master || [];
      const historyAssets: Asset[] = data?.details || [];

      // Sort history records by measurement_date
      const parseDate = (dateStr: string) => {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        }
        return new Date(dateStr);
      };

      // Group history records by asset_id
      const historyByAssetId = new Map<number, Asset[]>();
      historyAssets.forEach(record => {
        const assetId = record.asset_id;
        if (!historyByAssetId.has(assetId)) {
          historyByAssetId.set(assetId, []);
        }
        historyByAssetId.get(assetId)!.push(record);
      });

      // Sort each asset's history by measurement_date
      historyByAssetId.forEach((history, assetId) => {
        historyByAssetId.set(assetId, history.sort((a, b) =>
          parseDate(b.measurement_date).getTime() - parseDate(a.measurement_date).getTime()
        ));
      });

      // Combine master records with their history
      const result: Asset[] = [];
      masterAssets.forEach(master => {
        // Add master record
        result.push(master);
        
        // Add history records for this asset
        const history = historyByAssetId.get(master.asset_id) || [];
        result.push(...history);
      });

      return result;
    },
    // Fallback method if database function doesn't exist
    getAllAssetsWithHistoryFallback: async (buildingNumber: number): Promise<Asset[]> => {
      // Fetch all master records from assets table for the building
      const { data: masterAssets, error: masterError } = await supabase
        .from('assets')
        .select('*')
        .eq('building_number', buildingNumber)
        .order('asset_id');

      if (masterError) {
        throw masterError;
      }

      if (!masterAssets || masterAssets.length === 0) {
        return [];
      }

      // Get all asset_ids to fetch their history
      const assetIds = masterAssets.map(a => a.asset_id);

      // Fetch all history records for these asset_ids in one query
      const { data: allHistoryData, error: historyError } = await supabase
        .from('assets_history')
        .select('*')
        .in('asset_id', assetIds)
        .order('history_created_at', { ascending: false });

      if (historyError) {
        // If table doesn't exist or RLS blocks it, return only master records
        if (historyError.code === '42P01' || historyError.code === '42501') {
          return masterAssets;
        }
        throw historyError;
      }

      // Group history records by asset_id
      const historyByAssetId = new Map<number, Asset[]>();
      (allHistoryData || []).forEach(record => {
        const assetId = record.asset_id;
        if (!historyByAssetId.has(assetId)) {
          historyByAssetId.set(assetId, []);
        }
        historyByAssetId.get(assetId)!.push(record);
      });

      // Sort history records by measurement_date for each asset
      const parseDate = (dateStr: string) => {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        }
        return new Date(dateStr);
      };

      // Combine master records with their history
      const result: Asset[] = [];
      masterAssets.forEach(master => {
        // Add master record
        result.push(master);
        
        // Add history records for this asset
        const history = historyByAssetId.get(master.asset_id) || [];
        const sortedHistory = history.sort((a, b) =>
          parseDate(b.measurement_date).getTime() - parseDate(a.measurement_date).getTime()
        );
        result.push(...sortedHistory);
      });

      return result;
    },
    getOne: async (id: string): Promise<Asset> => {
      // Log warning if this is called - it should rarely be needed since getAll should be used
      if (process.env.NODE_ENV === 'development') {
        console.warn('[api.assets.getOne] Individual asset fetch detected. This should be avoided - use getAll() instead. Asset ID:', id, new Error().stack);
      }
      
      const { data, error } = await supabase
        .from('assets')
        .select('*')
        .eq('asset_id', id)
        .maybeSingle();

      if (error) {
        // Handle PGRST116 error (0 rows) as "not found"
        if (error.code === 'PGRST116') {
          throw new Error('Asset not found');
        }
        throw error;
      }
      if (!data) throw new Error('Asset not found');
      return data;
    },
    create: async (input: Omit<Asset, 'id' | 'created_at'>, skipAudit?: boolean): Promise<Asset> => {
      const sanitizedInput = sanitizeAssetInput(input);
      
      // Check if an asset with the same asset_id already exists
      if (sanitizedInput.asset_id != null) {
        const { data: existingAsset, error: checkError } = await supabase
          .from('assets')
          .select('*')
          .eq('asset_id', sanitizedInput.asset_id)
          .maybeSingle();

        if (checkError && checkError.code !== 'PGRST116') {
          throw new Error(`שגיאה בבדיקת נכס קיים: ${checkError.message}`);
        }

        // If asset exists, delete it (transaction-based: copy to history) and create a new entry
        // Only copy to history, do NOT create audit entry (audit entries are only for transfer/distribute)
        if (existingAsset) {
          // Copy to history before deletion (transaction-based, replaces trigger)
          // Do NOT create audit entry - audit entries are only created by bulk operations
          try {
            await supabase.rpc('copy_asset_to_history_before_update', {
              p_asset_id: sanitizedInput.asset_id
            });
          } catch (historyError) {
            console.warn('Failed to copy asset to history before asset replacement:', historyError);
            // Continue with deletion even if history copy fails
          }
          
          // Delete the existing asset from assets table
          const { error: deleteError } = await supabase
            .from('assets')
            .delete()
            .eq('asset_id', sanitizedInput.asset_id);

          if (deleteError) {
            throw new Error(`שגיאה במחיקת נכס קיים: ${deleteError.message}`);
          }

          // Insert new asset with new measurement data
          const { data: newAsset, error: insertError } = await supabase
            .from('assets')
            .insert(sanitizedInput)
            .select()
            .single();

          if (insertError) {
            throw new Error(`שגיאה ביצירת נכס חדש: ${insertError.message}`);
          }
          
          // Update building total area (transaction-based, replaces trigger)
          try {
            await supabase.rpc('update_building_total_area', {
              p_building_number: newAsset.building_number
            });
          } catch (areaError) {
            console.warn('Failed to update building total area after asset replacement:', areaError);
            // Don't fail the operation if area update fails
          }

          // Reset distribution flags if needed (replacement = delete + create)
          // Check both old and new asset types to determine which flags to reset
          if (newAsset.building_number) {
            const oldAssetType = await getAssetBusinessResidenceType(existingAsset);
            const newAssetType = await getAssetBusinessResidenceType(newAsset);
            
            // NOTE: Distribution flags are set by save_asset_transactional function, not here
            // Flags are part of the save transaction and cannot be set separately
            
            // Also check if asset type has non_accountable_for_distribution = true (NOT non_accountable_for_total_area)
            // This should reset distribution flags when changing TO or FROM a type with non_accountable_for_distribution = true
            if (newAsset.main_asset_type) {
              try {
                // Handle string/numeric comparison for asset type lookup
                const oldMainTypeStr = String(existingAsset.main_asset_type || '').trim();
                const newMainTypeStr = String(newAsset.main_asset_type).trim();
                
                const { data: oldTypeData } = await supabase
                  .from('asset_types')
                  .select('name, business_residence, non_accountable_for_distribution')
                  .eq('name', oldMainTypeStr)
                  .maybeSingle();
                
                const { data: newTypeDataInitial } = await supabase
                  .from('asset_types')
                  .select('name, business_residence, non_accountable_for_distribution')
                  .eq('name', newMainTypeStr)
                  .maybeSingle();
                
                // Try numeric comparison if string lookup failed
                let newTypeData = newTypeDataInitial;
                if (!newTypeData && newMainTypeStr) {
                  const newMainTypeNum = parseInt(newMainTypeStr, 10);
                  if (!isNaN(newMainTypeNum)) {
                    const { data: allAssetTypes } = await supabase
                      .from('asset_types')
                      .select('name, business_residence, non_accountable_for_distribution');
                    
                    if (allAssetTypes) {
                      newTypeData = allAssetTypes.find(at => {
                        const atNameStr = String(at.name || '').trim();
                        const atNameNum = parseInt(atNameStr, 10);
                        return !isNaN(atNameNum) && atNameNum === newMainTypeNum;
                      });
                    }
                  }
                }
                
                const oldIsNonAccountableForDistribution = oldTypeData?.non_accountable_for_distribution === true;
                const newIsNonAccountableForDistribution = newTypeData?.non_accountable_for_distribution === true;
                
                // If changing TO or FROM a type with non_accountable_for_distribution = true, reset distribution flags
                // NOTE: We check non_accountable_for_distribution (NOT non_accountable_for_total_area) for distribution flags
                if (oldIsNonAccountableForDistribution || newIsNonAccountableForDistribution) {
                  // Determine which type to use for business_residence:
                  // - If changing TO a type with non_accountable_for_distribution = true, use that type's business_residence
                  // - If changing FROM a type with non_accountable_for_distribution = true, use the NEW type's business_residence
                  const typeToUse = newIsNonAccountableForDistribution ? newTypeData : (newTypeData || oldTypeData);
                  
                  // NOTE: Distribution flags are set by save_asset_transactional function, not here
                  // Flags are part of the save transaction and cannot be set separately
                  console.log(`[api.assets.create] Distribution flags will be set by save_asset_transactional for building ${newAsset.building_number}`);
                }
              } catch (err) {
                console.error('[api.assets.create] Failed to check non_accountable_for_distribution (NOT non_accountable_for_total_area) during replacement:', err);
              }
            }
          }

          // Do NOT create audit entry - audit entries are only created by bulk operations
          // Regular asset creation/replacement should not create audit entries

          return newAsset;
        }
      }

      // If no existing asset, proceed with normal insert
      const { data, error } = await supabase
        .from('assets')
        .insert(sanitizedInput)
        .select()
        .single();

      if (error) {
        let errorMessage = error.message || 'Failed to create asset';

        // Handle constraint violations
        if (error.code === '23505') {
          if (error.message.includes('assets_pkey') || error.message.includes('primary key')) {
            errorMessage = 'נכס עם זיהוי זה כבר קיים עם תאריך מדידה זה. כל שילוב של מזהה נכס ותאריך מדידה חייב להיות ייחודי.';
          } else {
            errorMessage = 'נכס עם מספר זיהוי זה כבר קיים במערכת. אנא בדוק את מספר הנכס ומספר המבנה.';
          }
        } else if (error.code === '23514') {
          if (error.message.includes('check_sub_asset_type_') && error.message.includes('not_composite')) {
            const match = error.message.match(/check_sub_asset_type_(\d+)_not_composite/);
            const subAssetNum = match ? match[1] : '';
            errorMessage = i18n.t('subAssetTypeCompositeError', { subAssetNum });
          } else if (error.message.includes('check_minimum_two_sub_assets')) {
            errorMessage = 'נכסים מסוג 199 או 299 חייבים לכלול לפחות 2 נכסי משנה עם ערכים.';
          } else if (error.message.includes('check_numeric_asset_id')) {
            errorMessage = 'זיהוי נכס חייב להיות מספר תקין.';
          } else if (error.message.includes('check_numeric_payer_id')) {
            errorMessage = 'מספר משלם חייב להיות מספר תקין.';
          }
        } else if (error.code === '23503') {
          // Foreign key constraint violation
          if (error.message.includes('fk_assets_buildings') || 
              error.message.includes('building_number') ||
              (error.details && error.details.includes('buildings')) ||
              (error.details && error.details.includes('Key is not present in table "buildings"'))) {
            errorMessage = `מבנה ${input.building_number} לא קיים במערכת. יש ליצור את המבנה לפני יצירת נכסים.`;
            // Don't append technical details for user-friendly messages
            throw new Error(errorMessage);
          } else {
            errorMessage = `שגיאת אימות נתונים: ${error.details || error.message}`;
          }
        }

        const details = error.details ? ` (${error.details})` : '';
        const hint = error.hint ? ` - ${error.hint}` : '';

        throw new Error(`${errorMessage}${details}${hint}`);
      }
      
      // Update building total area (transaction-based, replaces trigger)
      try {
        await supabase.rpc('update_building_total_area', {
          p_building_number: data.building_number
        });
      } catch (areaError) {
        console.warn('Failed to update building total area after asset creation:', areaError);
        // Don't fail the operation if area update fails
      }
      
      // NOTE: Distribution flags are set by save_asset_transactional function, not here
      // Flags are part of the save transaction and cannot be set separately
      if (data.building_number) {
        console.log(`[api.assets.create] Distribution flags are handled by save_asset_transactional function for building ${data.building_number}`);
      }
      
      // Log audit entry ONLY for transfer_area or distribute_shared actions
      // Regular asset creation should NOT create audit entries
      // Skip audit logging if skipAudit is true (for bulk operations)
      if (skipAudit !== true) {
        // Only create audit entry if this is part of a transfer or distribute operation
        // Regular manual updates should not create audit entries
        // Audit entries are only created by bulk operations (bulkTransferAreas, bulkUpdateAssets)
        // Individual asset operations are handled by those bulk functions
      }
      
      return data;
    },
    update: async (id: string | number, input: Partial<Asset>, actionType?: 'manual_update' | 'import_file' | 'transfer_area' | 'distribute_shared', skipAudit: boolean = false): Promise<Asset> => {
      console.log('[api.assets.update] ⚡ UPDATE CALLED:', { id, idType: typeof id, actionType, skipAudit, hasInput: !!input });

      // Get asset ID as number
      const assetIdNum = typeof id === 'string' ? parseInt(id, 10) : id;
      console.log('[api.assets.update] Parsed assetIdNum:', assetIdNum, 'isNaN:', isNaN(assetIdNum));

      // Preserve is_new_measurement flag before sanitization (sanitizeAssetInput doesn't handle it)
      const isNewMeasurement = input.is_new_measurement;

      // Get the current asset data before update (for change log)
      let beforeData: Asset | null = null;
      try {
        const { data: assetData } = await supabase
          .from('assets')
          .select('*')
          .eq('asset_id', assetIdNum)
          .maybeSingle();
        beforeData = assetData || null;
        console.log('[api.assets.update] beforeData fetch result:', { hasBeforeData: !!beforeData, assetId: assetIdNum });
      } catch (err) {
        // If asset doesn't exist, that's fine - we'll still try to update
        console.error('[api.assets.update] ERROR fetching before data:', err);
      }
      
      // Sanitize the input data first (no need to fetch existing asset - we can update directly)
      const sanitizedInput = sanitizeAssetInput(input);
      
      // Remove fields that shouldn't be updated
      // No id field to delete - asset_id is now the primary key
      delete (sanitizedInput as any).created_at;
      
      // Only include is_new_measurement if explicitly provided (for "save as new measurement")
      // For regular updates, omit it entirely to avoid errors if column doesn't exist
      // If column exists and is false, omitting it keeps it false (PostgreSQL behavior)
      if (isNewMeasurement !== undefined) {
        (sanitizedInput as any).is_new_measurement = isNewMeasurement;
        console.log('[api.assets.update] Setting is_new_measurement flag:', isNewMeasurement, 'for asset_id:', id);
      } else {
        delete (sanitizedInput as any).is_new_measurement;
      }
      
      // Log what we're about to update (for debugging)
      if (isNewMeasurement === true) {
        console.log('[api.assets.update] About to update with is_new_measurement=true. Sanitized input:', {
          asset_id: id,
          is_new_measurement: sanitizedInput.is_new_measurement,
          hasFlag: 'is_new_measurement' in sanitizedInput
        });
      }

      // If is_new_measurement is true, copy old asset to history BEFORE update
      // This replaces the trigger_reset_new_measurement_flag and trigger_copy_asset_to_history
      if (isNewMeasurement === true) {
        try {
          await supabase.rpc('copy_asset_to_history_before_update', {
            p_asset_id: assetIdNum
          });
          // Reset the flag after copying to history (replaces trigger_reset_new_measurement_flag behavior)
          // We'll set it to false in the update below
          (sanitizedInput as any).is_new_measurement = false;
        } catch (historyError) {
          console.warn('Failed to copy asset to history before update:', historyError);
          // Continue with update even if history copy fails
          // Still reset the flag
          (sanitizedInput as any).is_new_measurement = false;
        }
      } else if (isNewMeasurement === false) {
        // Explicitly set to false if provided
        (sanitizedInput as any).is_new_measurement = false;
      }
      
      // Perform the UPDATE
      const { data: updatedAsset, error: updateError } = await supabase
        .from('assets')
        .update({ ...sanitizedInput, updated_at: new Date().toISOString() })
        .eq('asset_id', id)
        .select()
        .single();

      if (updateError) {
        // Handle "not found" error (PGRST116 = 0 rows updated)
        if (updateError.code === 'PGRST116') {
          throw new Error('Asset not found');
        }
        
        let errorMessage = updateError.message || 'Failed to update asset';

        if (updateError.code === '23514') {
          if (updateError.message.includes('check_sub_asset_type_') && updateError.message.includes('not_composite')) {
            const match = updateError.message.match(/check_sub_asset_type_(\d+)_not_composite/);
            const subAssetNum = match ? match[1] : '';
            errorMessage = i18n.t('subAssetTypeCompositeError', { subAssetNum });
          } else if (updateError.message.includes('check_minimum_two_sub_assets')) {
            errorMessage = 'נכסים מסוג 199 או 299 חייבים לכלול לפחות 2 נכסי משנה עם ערכים.';
          } else if (updateError.message.includes('check_numeric_asset_id')) {
            errorMessage = 'זיהוי נכס חייב להיות מספר תקין.';
          } else if (updateError.message.includes('check_numeric_payer_id')) {
            errorMessage = 'מספר משלם חייב להיות מספר תקין.';
          }
        } else if (updateError.code === '23503') {
          // Foreign key constraint violation
          if (updateError.message.includes('fk_assets_buildings') || 
              updateError.message.includes('building_number') ||
              (updateError.details && updateError.details.includes('buildings')) ||
              (updateError.details && updateError.details.includes('Key is not present in table "buildings"'))) {
            errorMessage = `מבנה ${input.building_number} לא קיים במערכת. יש ליצור את המבנה לפני עדכון נכסים.`;
            // Don't append technical details for user-friendly messages
            throw new Error(errorMessage);
          } else {
            errorMessage = `שגיאת אימות נתונים: ${updateError.details || updateError.message}`;
          }
        } else if (updateError.code === '23505') {
          if (updateError.message.includes('assets_asset_id_unique') || updateError.message.includes('asset_id')) {
            errorMessage = `נכס עם מספר זיהוי ${sanitizedInput.asset_id} כבר קיים במערכת.`;
          }
        }

        const details = updateError.details && !errorMessage.includes('Sub-Asset Type') && !errorMessage.includes('נכס משנה') ? ` (${updateError.details})` : '';
        const hint = updateError.hint && !errorMessage.includes('Sub-Asset Type') && !errorMessage.includes('נכס משנה') ? ` - ${updateError.hint}` : '';

        // Always include full error information
        const fullErrorMessage = `${errorMessage}${details}${hint}`;
        throw new Error(fullErrorMessage);
      }

      // Update building total area (transaction-based, replaces trigger)
      try {
        await supabase.rpc('update_building_total_area', {
          p_building_number: updatedAsset.building_number
        });
      } catch (areaError) {
        console.warn('Failed to update building total area after asset update:', areaError);
        // Don't fail the operation if area update fails
      }

      // NOTE: Distribution flags are NOT set here - they are only set within transactional save functions
      // (save_asset_transactional, save_assets_bulk_transactional, delete_asset_transactional)
      // This ensures flags are always part of the save transaction and cannot be set separately
      console.log('[api.assets.update] Distribution flags are handled by transactional save functions, not set directly from API');

      // Log audit entry ONLY for transfer_area or distribute_shared actions
      // Regular asset updates should NOT create audit entries
      // Skip audit logging if skipAudit is true (for bulk operations)
      // Only create audit entry if actionType is explicitly transfer_area or distribute_shared
      if (!skipAudit && (actionType === 'transfer_area' || actionType === 'distribute_shared')) {
        const userInfo = await getCurrentUserInfo();
        try {
          await supabase.rpc('log_audit_for_asset', {
            p_asset_id: assetIdNum,
            p_operation: 'UPDATE',
            p_user_id: userInfo.user_id || null, // auth_user_id (UUID as text)
            p_action_type: actionType,
            p_copy_to_history: isNewMeasurement === true, // Copy to history if new measurement
            p_description: isNewMeasurement === true ? 'Asset updated (new measurement)' : 'Asset updated'
          });
        } catch (auditError) {
          console.warn('Failed to log audit entry for asset update:', auditError);
          // Don't fail the operation if audit logging fails
        }
      }

      // Log change entry asynchronously
      if (beforeData) {
        const changedFields = calculateChangedFields(beforeData, updatedAsset);
        logChangeAsync(
          'assets',
          'UPDATE',
          String(assetIdNum),
          beforeData,
          updatedAsset,
          changedFields
        );
      } else {
        logChangeAsync(
          'assets',
          'UPDATE',
          String(assetIdNum),
          undefined,
          updatedAsset
        );
      }

      return updatedAsset;
    },
    delete: async (id: number | string): Promise<{ message: string }> => {
      const assetIdNum = typeof id === 'string' ? parseInt(id, 10) : id;

      const userInfo = await getCurrentUserInfo();

      const { data, error } = await supabase.rpc('delete_asset_transactional', {
        p_asset_id: assetIdNum,
        p_user_id: userInfo.user_id || null,
        p_description: 'Asset deleted'
      });

      if (error) {
        console.error('[api.assets.delete] Transaction failed:', error);
        throw error;
      }

      console.log('[api.assets.delete] Asset deleted successfully in transaction:', data);

      return { message: 'Asset deleted successfully' };
    },
    deleteBulkTransactional: async (ids: Array<number | string>, description?: string): Promise<{ success: boolean; count: number; error?: string }> => {
      const assetIds = (ids || [])
        .map(id => (typeof id === 'string' ? parseInt(id, 10) : id))
        .filter(id => id != null && !isNaN(Number(id))) as number[];

      if (assetIds.length === 0) {
        return { success: true, count: 0 };
      }

      const userInfo = await getCurrentUserInfo();

      const { data, error } = await supabase.rpc('delete_assets_bulk_transactional', {
        p_asset_ids: assetIds,
        p_user_id: userInfo.user_id || null,
        p_description: description || 'Bulk asset delete'
      });

      if (error) {
        return { success: false, count: 0, error: error.message };
      }

      return {
        success: data?.success === true,
        count: Number(data?.count || 0)
      };
    },
    saveTransactional: async (
      assetData: any,
      actionType: string = 'manual_update',
      description?: string
    ): Promise<{ success: boolean; asset_id: number; error?: string }> => {
      return validateAndSaveAsset(assetData, actionType, description);
    },
    saveBulkTransactional: async (
      assetsData: any[],
      actionType: string = 'manual_update',
      beforeData?: any,
      afterData?: any,
      description?: string,
      isBusinessContext?: boolean
    ): Promise<{ success: boolean; action_id?: number; affected_asset_ids?: number[]; count?: number; error?: string; validationErrors?: string[] }> => {
      return validateAndSaveBulkAssets(assetsData, actionType, beforeData, afterData, description, isBusinessContext);
    },
    getExportToAutomationCount: async (): Promise<{ success: boolean; count: number; error?: string }> => {
      try {
        // Count assets that still need export:
        // - exported_to_automation is null/false AND
        // - data_from_automation is null/false (exclude rows imported from automation until edited in app)
        const { count, error: countError } = await supabase
          .from('assets')
          .select('asset_id', { count: 'exact', head: true })
          .or('exported_to_automation.is.null,exported_to_automation.eq.false')
          .or('data_from_automation.is.null,data_from_automation.eq.false');

        if (countError) {
          console.error('[api.assets.getExportToAutomationCount] Error counting assets:', countError);
          return { success: false, count: 0, error: countError.message };
        }

        return { success: true, count: count || 0 };
      } catch (error: any) {
        console.error('[api.assets.getExportToAutomationCount] Unexpected error:', error);
        return { success: false, count: 0, error: error.message || 'Unknown error' };
      }
    },
    exportToAutomation: async (): Promise<{ success: boolean; count: number; assetIds: number[]; error?: string }> => {
      try {
        // Fetch all assets that still need export:
        // - exported_to_automation is null/false AND
        // - data_from_automation is null/false
        const { data: assetsToExport, error: fetchError } = await supabase
          .from('assets')
          .select('*')
          .or('exported_to_automation.is.null,exported_to_automation.eq.false')
          .or('data_from_automation.is.null,data_from_automation.eq.false')
          .order('asset_id');

        if (fetchError) {
          console.error('[api.assets.exportToAutomation] Error fetching assets:', fetchError);
          return { success: false, count: 0, assetIds: [], error: fetchError.message };
        }

        if (!assetsToExport || assetsToExport.length === 0) {
          return { success: true, count: 0, assetIds: [] };
        }

        // Get asset IDs for marking as exported
        const assetIds = assetsToExport.map(a => a.asset_id);

        // Format current date to DD/MM/YYYY
        const today = new Date();
        const exportDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

        // Mark all assets as exported with export date
        const { error: updateError } = await supabase
          .from('assets')
          .update({ 
            exported_to_automation: true,
            export_to_automation_at: exportDate
          })
          .in('asset_id', assetIds);

        if (updateError) {
          console.error('[api.assets.exportToAutomation] Error marking assets as exported:', updateError);
          return { success: false, count: 0, assetIds: [], error: updateError.message };
        }

        // Update latest export date in memory cache
        const { setLatestExportDate } = await import('./validation');
        setLatestExportDate(exportDate);

        return { success: true, count: assetsToExport.length, assetIds };
      } catch (error: any) {
        console.error('[api.assets.exportToAutomation] Unexpected error:', error);
        return { success: false, count: 0, assetIds: [], error: error.message || 'Unknown error' };
      }
    },
    resetExportToAutomation: async (): Promise<{ success: boolean; count: number; error?: string }> => {
      try {
        // First, get all exported assets with their export dates
        const { data: exportedAssets, error: fetchError } = await supabase
          .from('assets')
          .select('asset_id, export_to_automation_at')
          .eq('exported_to_automation', true)
          .not('export_to_automation_at', 'is', null);

        if (fetchError) {
          console.error('[api.assets.resetExportToAutomation] Error fetching exported assets:', fetchError);
          return { success: false, count: 0, error: fetchError.message };
        }

        // If no exported assets found, return success with 0 count
        if (!exportedAssets || exportedAssets.length === 0) {
          return { success: true, count: 0 };
        }

        // Find the latest export date by parsing DD/MM/YYYY dates
        // Find latest export date
        let latestDate: Date | null = null;
        let latestDateStr: string | null = null;

        for (const asset of exportedAssets) {
          if (asset.export_to_automation_at) {
            const parsedDate = parseDateFromDDMMYYYY(asset.export_to_automation_at);
            if (parsedDate && (!latestDate || parsedDate > latestDate)) {
              latestDate = parsedDate;
              latestDateStr = asset.export_to_automation_at;
            }
          }
        }

        // If no valid date found, return error
        if (!latestDateStr) {
          return { success: false, count: 0, error: 'לא נמצא תאריך ייצוא תקף' };
        }

        // Filter assets that have the latest export date
        const assetIdsToReset = exportedAssets
          .filter(asset => asset.export_to_automation_at === latestDateStr)
          .map(asset => asset.asset_id);

        if (assetIdsToReset.length === 0) {
          return { success: true, count: 0 };
        }

        // Reset exported_to_automation flag and clear export date only for assets with latest date
        const { error: updateError, count } = await supabase
          .from('assets')
          .update({ 
            exported_to_automation: false,
            export_to_automation_at: null
          })
          .in('asset_id', assetIdsToReset)
          .select('asset_id', { count: 'exact', head: true });

        if (updateError) {
          console.error('[api.assets.resetExportToAutomation] Error resetting export flag:', updateError);
          return { success: false, count: 0, error: updateError.message };
        }

        // After reset, refresh the latest export date in memory (it will be the next latest date or null)
        // Fetch remaining exported assets to find the next latest date
        const { data: remainingExportedAssets, error: remainingFetchError } = await supabase
          .from('assets')
          .select('export_to_automation_at')
          .eq('exported_to_automation', true)
          .not('export_to_automation_at', 'is', null);

        if (!remainingFetchError && remainingExportedAssets && remainingExportedAssets.length > 0) {
          // Find the next latest export date
          let nextLatestDate: Date | null = null;
          let nextLatestDateStr: string | null = null;

          for (const asset of remainingExportedAssets) {
            if (asset.export_to_automation_at) {
              const parsedDate = parseDateFromDDMMYYYY(asset.export_to_automation_at);
              if (parsedDate && (!nextLatestDate || parsedDate > nextLatestDate)) {
                nextLatestDate = parsedDate;
                nextLatestDateStr = asset.export_to_automation_at;
              }
            }
          }

          // Update cache with next latest date
          const { setLatestExportDate } = await import('./validation');
          setLatestExportDate(nextLatestDateStr);
        } else {
          // No more exported assets, clear cache
          const { setLatestExportDate } = await import('./validation');
          setLatestExportDate(null);
        }

        return { success: true, count: count || assetIdsToReset.length };
      } catch (error: any) {
        console.error('[api.assets.resetExportToAutomation] Unexpected error:', error);
        return { success: false, count: 0, error: error.message || 'Unknown error' };
      }
    },
    getLatestExportDate: async (): Promise<{ success: boolean; date: string | null; error?: string }> => {
      try {
        // Get all exported assets with their export dates
        const { data: exportedAssets, error: fetchError } = await supabase
          .from('assets')
          .select('export_to_automation_at')
          .eq('exported_to_automation', true)
          .not('export_to_automation_at', 'is', null);

        if (fetchError) {
          console.error('[api.assets.getLatestExportDate] Error fetching exported assets:', fetchError);
          return { success: false, date: null, error: fetchError.message };
        }

        // If no exported assets found, return null date
        if (!exportedAssets || exportedAssets.length === 0) {
          return { success: true, date: null };
        }

        // Find the latest export date by parsing DD/MM/YYYY dates
        let latestDate: Date | null = null;
        let latestDateStr: string | null = null;

        for (const asset of exportedAssets) {
          if (asset.export_to_automation_at) {
            const parsedDate = parseDateFromDDMMYYYY(asset.export_to_automation_at);
            if (parsedDate && (!latestDate || parsedDate > latestDate)) {
              latestDate = parsedDate;
              latestDateStr = asset.export_to_automation_at;
            }
          }
        }

        // Cache the latest export date in memory
        const { setLatestExportDate } = await import('./validation');
        setLatestExportDate(latestDateStr);

        return { success: true, date: latestDateStr };
      } catch (error: any) {
        console.error('[api.assets.getLatestExportDate] Unexpected error:', error);
        return { success: false, date: null, error: error.message || 'Unknown error' };
      }
    },
    files: {
      getAll: async (assetId: number): Promise<AssetFile[]> => {
        const { data, error } = await supabase
          .from('asset_files')
          .select('*')
          .eq('asset_id', assetId)
          .order('uploaded_at', { ascending: false });

        if (error) throw error;
        return data || [];
      },
      add: async (assetId: number, fileUrl: string, fileName?: string, fileSize?: number, fileType?: string, measurementDate?: string | null): Promise<AssetFile> => {
        const userInfo = await getCurrentUserInfo();
        const { data, error } = await supabase
          .from('asset_files')
          .insert({
            asset_id: assetId,
            file_url: fileUrl,
            file_name: fileName,
            file_size: fileSize,
            file_type: fileType,
            uploaded_by: userInfo.user_name,
            measurement_date: measurementDate !== undefined ? measurementDate : null
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      },
      clone: async (assetId: number, sourceMeasurementDate: string | null, targetMeasurementDate: string): Promise<AssetFile[]> => {
        // Get all files for the source measurement (or shared files if sourceMeasurementDate is null)
        let query = supabase
          .from('asset_files')
          .select('*')
          .eq('asset_id', assetId);
        
        // If sourceMeasurementDate is provided, get files for that measurement OR shared files
        if (sourceMeasurementDate !== null) {
          query = query.or(`measurement_date.eq.${sourceMeasurementDate},measurement_date.is.null`);
        } else {
          // If null, get only shared files
          query = query.is('measurement_date', null);
        }
        
        query = query.order('uploaded_at', { ascending: false });
        
        const { data: sourceFiles, error: fetchError } = await query;
        
        if (fetchError || !sourceFiles || sourceFiles.length === 0) {
          return [];
        }
        
        const clonedFiles: AssetFile[] = [];
        
        // Clone each file
        for (const file of sourceFiles) {
          try {
            // Extract file path from URL
            const urlParts = file.file_url.split('/');
            const fileName = urlParts[urlParts.length - 1].split('?')[0];
            const filePath = file.file_url.includes(`${assetId}/`) 
              ? file.file_url.substring(file.file_url.indexOf(`${assetId}/`))
              : `${assetId}/${fileName}`;
            
            // Download the file from storage
            const { data: fileData, error: downloadError } = await supabase.storage
              .from('structure-drawings')
              .download(filePath);
            
            if (downloadError || !fileData) {
              console.error(`Error downloading file ${filePath}:`, downloadError);
              continue;
            }
            
            // Create new file path with timestamp to avoid conflicts
            const timestamp = Date.now();
            const fileExt = fileName.split('.').pop() || 'bin';
            const newFileName = `${timestamp}.${fileExt}`;
            const newFilePath = `${assetId}/${newFileName}`;
            
            // Upload to new path
            const { error: uploadError } = await supabase.storage
              .from('structure-drawings')
              .upload(newFilePath, fileData);
            
            if (uploadError) {
              console.error(`Error uploading cloned file:`, uploadError);
              continue;
            }
            
            // Get public URL for new file
            const { data: { publicUrl } } = supabase.storage
              .from('structure-drawings')
              .getPublicUrl(newFilePath);
            
            // Create new file record with target measurement_date
            const userInfo = await getCurrentUserInfo();
            const { data: clonedFile, error: insertError } = await supabase
              .from('asset_files')
              .insert({
                asset_id: assetId,
                file_url: publicUrl,
                file_name: file.file_name,
                file_size: file.file_size,
                file_type: file.file_type,
                uploaded_by: userInfo.user_name,
                measurement_date: targetMeasurementDate
              })
              .select()
              .single();
            
            if (insertError || !clonedFile) {
              console.error(`Error creating cloned file record:`, insertError);
              continue;
            }
            
            clonedFiles.push(clonedFile);
          } catch (err) {
            console.error(`Error cloning file ${file.id}:`, err);
          }
        }
        
        return clonedFiles;
      },
      delete: async (fileIds: number[]): Promise<{ success: boolean; error?: string }> => {
        const { error } = await supabase
          .from('asset_files')
          .delete()
          .in('id', fileIds);

        if (error) {
          return { success: false, error: error.message };
        }
        return { success: true };
      },
      deleteByUrl: async (fileUrl: string): Promise<{ success: boolean; error?: string }> => {
        // Extract file path from URL to delete from storage
        const urlParts = fileUrl.split('/');
        const fileName = urlParts[urlParts.length - 1].split('?')[0];
        
        // Delete from storage
        const { error: storageError } = await supabase.storage
          .from('structure-drawings')
          .remove([fileName]);

        if (storageError) {
          console.warn('Error deleting file from storage:', storageError);
        }

        // Delete from database
        const { error } = await supabase
          .from('asset_files')
          .delete()
          .eq('file_url', fileUrl);

        if (error) {
          return { success: false, error: error.message };
        }
        return { success: true };
      }
    },
  },
  measurements: {
    getAll: async (assetId: string): Promise<AssetMeasurement[]> => {
      const { data, error } = await supabase
        .from('asset_measurements')
        .select('*')
        .eq('asset_id', assetId);

      if (error) throw error;

      const parseDate = (dateStr: string) => {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        }
        return new Date(dateStr);
      };

      return (data || []).sort((a, b) =>
        parseDate(b.measurement_date).getTime() - parseDate(a.measurement_date).getTime()
      );
    },
    getOne: async (id: string): Promise<AssetMeasurement> => {
      const { data, error } = await supabase
        .from('asset_measurements')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Measurement not found');
      return data;
    },
    create: async (input: Omit<AssetMeasurement, 'id' | 'created_at' | 'total_area'>): Promise<AssetMeasurement> => {
      const { data, error } = await supabase
        .from('asset_measurements')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    update: async (id: string, input: Partial<AssetMeasurement>): Promise<AssetMeasurement> => {
      const { data, error } = await supabase
        .from('asset_measurements')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    delete: async (id: string): Promise<{ message: string }> => {
      const { error } = await supabase
        .from('asset_measurements')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { message: 'Measurement deleted successfully' };
    },
  },
  assetTypes: {
    getAll: async (): Promise<AssetType[]> => {
      // Try to get from in-memory cache first (loaded on app startup)
      try {
        const { getAssetTypes } = await import('./validation');
        const inMemoryTypes = getAssetTypes();
        if (inMemoryTypes && inMemoryTypes.length > 0) {
          // Return a copy to avoid mutations
          return [...inMemoryTypes];
        }
      } catch (err) {
        // If validation module not available, fall back to database
        console.warn('[api.assetTypes.getAll] Could not access in-memory cache, falling back to database');
      }

      // Fallback to database query if cache is not available
      // Explicitly select all fields including business_residence and use_shared_area to ensure they're included
      const { data, error } = await supabase
        .from('asset_types')
        .select('id, name, description, tax_region, elevator, single_double_family, penthouse, condo, townhouses, business_residence, min_size, max_size, active, non_accountable_for_total_area, non_accountable_for_distribution, not_accountable_for_statistics, use_shared_area, area_description_for_tab, created_at, updated_at')
        .order('name');

      if (error) throw error;
      
      // Map asset_type to id if the column was renamed
      const mappedData = (data || []).map((item: any) => {
        if (item.asset_type !== undefined && item.id === undefined) {
          return { ...item, id: item.asset_type };
        }
        return item;
      });
      
      // Debug: Log statistics about asset types
      if (mappedData.length > 0) {
        const withBusinessResidence = mappedData.filter((at: any) => at.business_residence != null);
        const withNonAccountableForTotalArea = mappedData.filter((at: any) => at.non_accountable_for_total_area === true);
        const withNonAccountableForDistribution = mappedData.filter((at: any) => at.non_accountable_for_distribution === true);
        
        console.log(`[api.assetTypes.getAll] Loaded ${mappedData.length} asset types. Statistics:`, {
          withBusinessResidence: withBusinessResidence.length,
          withNonAccountableForTotalArea: withNonAccountableForTotalArea.length,
          withNonAccountableForDistribution: withNonAccountableForDistribution.length
        });
      }
      
      return mappedData;
    },
    getOne: async (id: number): Promise<AssetType> => {
      // Try to get from in-memory cache first
      try {
        const { getAssetTypes } = await import('./validation');
        const inMemoryTypes = getAssetTypes();
        const found = inMemoryTypes.find((at: any) => {
          const atId = at.id ?? at.asset_type;
          return atId === id;
        });
        if (found) {
          return found as AssetType;
        }
      } catch (err) {
        // If validation module not available, fall back to database
        console.warn('[api.assetTypes.getOne] Could not access in-memory cache, falling back to database');
      }

      // Fallback to database query if not found in cache
      // Try id first, then asset_type as fallback
      let { data, error } = await supabase
        .from('asset_types')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      // If id column doesn't exist, try asset_type
      if (error && error.code === '42703') {
        const result = await supabase
          .from('asset_types')
          .select('*')
          .eq('asset_type', id)
          .maybeSingle();
        data = result.data;
        error = result.error;
        
        // Map asset_type to id
        if (data && data.asset_type !== undefined) {
          data = { ...data, id: data.asset_type };
        }
      }

      if (error) throw error;
      if (!data) throw new Error('Asset type not found');
      return data;
    },
    getByName: async (name: string): Promise<AssetType[]> => {
      // Try to get from in-memory cache first
      try {
        const { getAssetTypesByName } = await import('./validation');
        const inMemoryTypes = getAssetTypesByName(name);
        if (inMemoryTypes && inMemoryTypes.length > 0) {
          // Return a copy to avoid mutations
          return [...inMemoryTypes];
        }
      } catch (err) {
        // If validation module not available, fall back to database
        console.warn('[api.assetTypes.getByName] Could not access in-memory cache, falling back to database');
      }

      // Fallback to database query if not found in cache
      const { data, error } = await supabase
        .from('asset_types')
        .select('*')
        .eq('name', name);

      if (error) throw error;
      
      // Map asset_type to id if the column was renamed
      const mappedData = (data || []).map((item: any) => {
        if (item.asset_type !== undefined && item.id === undefined) {
          return { ...item, id: item.asset_type };
        }
        return item;
      });
      
      return mappedData;
    },
    formatWithDescription: (code: string | number | undefined | null, assetTypes: AssetType[]): string => {
      if (!code) return '';
      const codeStr = String(code);
      const assetType = assetTypes.find(at => at.name === codeStr);
      if (assetType && assetType.description) {
        return `${code} - ${assetType.description}`;
      }
      return String(code);
    },
    create: async (input: Omit<AssetType, 'id' | 'created_at' | 'updated_at'>): Promise<AssetType> => {
      const { data, error } = await supabase
        .from('asset_types')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      
      // Refresh in-memory cache after create
      try {
        const { refreshAssetTypesCache } = await import('./validation');
        await refreshAssetTypesCache();
      } catch (err) {
        console.warn('[api.assetTypes.create] Failed to refresh cache:', err);
      }
      
      // If non_accountable_for_distribution is true, reset distribution flags for affected buildings
      if (input.non_accountable_for_distribution === true && data.name) {
        try {
          console.log('[api.assetTypes.create] Asset type has non_accountable_for_distribution=true, resetting flags for affected buildings:', {
            assetTypeName: data.name,
            business_residence: data.business_residence
          });
          
          // Find all buildings with assets of this type
          const { data: affectedAssets } = await supabase
            .from('assets')
            .select('building_number')
            .eq('main_asset_type', data.name)
            .not('building_number', 'is', null);
          
          if (affectedAssets && affectedAssets.length > 0) {
            const buildingNumbers = [...new Set(affectedAssets.map(a => a.building_number))];
            console.log(`[api.assetTypes.create] Found ${buildingNumbers.length} affected building(s):`, buildingNumbers);
            
            // Get the asset type's business_residence to determine which flag to set
            const isBusiness = data.business_residence === 'עסקים';
            const isResidence = data.business_residence === 'מגורים';
            
            // NOTE: Distribution flags should be set when assets using this type are saved/updated
            // via transactional save functions, not when asset types are created/updated
            // Flags are part of asset save transactions and cannot be set separately
            console.log(`[api.assetTypes.create] Distribution flags will be set by transactional save functions when assets using this type are saved`);
          } else {
            console.log('[api.assetTypes.create] No affected buildings found for asset type:', data.name);
          }
        } catch (err) {
          // Don't fail the create operation if flag reset fails
          console.error('[api.assetTypes.create] Failed to reset distribution flags:', err);
        }
      }
      
      // Log change entry asynchronously
      logChangeAsync(
        'asset_types',
        'INSERT',
        String(data.id),
        undefined,
        data
      );
      
      return data;
    },
    createBulk: async (inputs: Omit<AssetType, 'id' | 'created_at' | 'updated_at'>[]): Promise<{ success: boolean; count: number; rows?: AssetType[]; error?: string }> => {
      if (!inputs || inputs.length === 0) {
        return { success: true, count: 0, rows: [] };
      }

      const { data, error } = await supabase
        .from('asset_types')
        .insert(inputs)
        .select('*');

      if (error) {
        return { success: false, count: 0, error: error.message };
      }

      // Refresh in-memory cache ONCE after bulk create
      try {
        const { refreshAssetTypesCache } = await import('./validation');
        await refreshAssetTypesCache();
      } catch (err) {
        console.warn('[api.assetTypes.createBulk] Failed to refresh cache:', err);
      }

      // Log change entries asynchronously
      try {
        (data || []).forEach((row: any) => {
          logChangeAsync(
            'asset_types',
            'INSERT',
            String(row.id ?? row.asset_type ?? row.name),
            undefined,
            row
          );
        });
      } catch (err) {
        console.warn('[api.assetTypes.createBulk] Failed to log changes:', err);
      }

      return { success: true, count: data?.length || inputs.length, rows: data || [] };
    },
    update: async (id: number, input: Partial<AssetType>): Promise<AssetType> => {
      // Get the current asset type data before update (for change log)
      let beforeData: AssetType | null = null;
      try {
        beforeData = await api.assetTypes.getOne(id);
      } catch (err) {
        // If asset type doesn't exist, that's fine - we'll still try to update
        if (process.env.NODE_ENV === 'development') {
          console.warn('[api.assetTypes.update] Could not fetch before data:', err);
        }
      }
      
      // Clean input: convert empty strings to null/undefined for numeric fields
      const cleanedInput: any = { ...input };
      
      // Handle numeric fields: convert empty strings to null
      if ('tax_region' in cleanedInput && cleanedInput.tax_region === '') {
        cleanedInput.tax_region = null;
      } else if ('tax_region' in cleanedInput && typeof cleanedInput.tax_region === 'string') {
        const parsed = parseInt(cleanedInput.tax_region);
        cleanedInput.tax_region = isNaN(parsed) ? null : parsed;
      }
      
      if ('min_size' in cleanedInput && cleanedInput.min_size === '') {
        cleanedInput.min_size = null;
      } else if ('min_size' in cleanedInput && typeof cleanedInput.min_size === 'string') {
        const parsed = parseFloat(cleanedInput.min_size);
        cleanedInput.min_size = isNaN(parsed) ? null : parsed;
      }
      
      if ('max_size' in cleanedInput && cleanedInput.max_size === '') {
        cleanedInput.max_size = null;
      } else if ('max_size' in cleanedInput && typeof cleanedInput.max_size === 'string') {
        const parsed = parseFloat(cleanedInput.max_size);
        cleanedInput.max_size = isNaN(parsed) ? null : parsed;
      }
      
      // Remove undefined values to prevent Supabase errors
      const finalInput = Object.fromEntries(
        Object.entries(cleanedInput).filter(([_, v]) => v !== undefined)
      );
      
      // Use database function to update asset type and reset distribution flags in a transaction
      // This ensures atomicity - either both operations succeed or both fail
      let data: AssetType;
      
      try {
        const { data: result, error: rpcError } = await supabase.rpc('update_asset_type_with_distribution_reset', {
          p_id: id,
          p_updates: finalInput
        });
        
        if (rpcError) {
          // Fallback to regular update if function doesn't exist
          if (rpcError.code === '42883' || rpcError.code === 'PGRST202' || rpcError.message?.includes('function') || rpcError.message?.includes('does not exist')) {
            console.warn('[api.assetTypes.update] Database function not found, falling back to regular update');
            
            // Try id first, then asset_type as fallback
            let { data: updateData, error } = await supabase
              .from('asset_types')
              .update(finalInput)
              .eq('id', id)
              .select()
              .single();

            // If id column doesn't exist, try asset_type
            if (error && error.code === '42703') {
              const result = await supabase
                .from('asset_types')
                .update(finalInput)
                .eq('asset_type', id)
                .select()
                .single();
              updateData = result.data;
              error = result.error;
              
              // Map asset_type to id
              if (updateData && updateData.asset_type !== undefined) {
                updateData = { ...updateData, id: updateData.asset_type };
              }
            }

            if (error) throw error;
            data = updateData;
            
            // Manually reset flags if needed (fallback behavior)
            // Check if non_accountable_for_distribution changed
            if (beforeData && beforeData.name) {
              const oldValue = beforeData.non_accountable_for_distribution === true;
              const newValue = 'non_accountable_for_distribution' in input 
                ? (input.non_accountable_for_distribution === true || input.non_accountable_for_distribution === 'true')
                : oldValue;
              
              if (oldValue !== newValue) {
                console.log('[api.assetTypes.update] non_accountable_for_distribution changed, resetting flags for affected buildings:', {
                  assetTypeName: beforeData.name,
                  oldValue,
                  newValue
                });
                
                const { data: affectedAssets } = await supabase
                  .from('assets')
                  .select('building_number')
                  .eq('main_asset_type', beforeData.name)
                  .not('building_number', 'is', null);
                
                if (affectedAssets && affectedAssets.length > 0) {
                  const buildingNumbers = [...new Set(affectedAssets.map(a => a.building_number))];
                  console.log(`[api.assetTypes.update] Found ${buildingNumbers.length} affected building(s):`, buildingNumbers);
                  
                  // Get the asset type's business_residence to determine which flag to set
                  const isBusiness = beforeData.business_residence === 'עסקים';
                  const isResidence = beforeData.business_residence === 'מגורים';
                  
                  // NOTE: Distribution flags should be set when assets using this type are saved/updated
                  // via transactional save functions, not when asset types are created/updated
                  // Flags are part of asset save transactions and cannot be set separately
                  console.log(`[api.assetTypes.update] Distribution flags will be set by transactional save functions when assets using this type are saved`);
                } else {
                  console.log('[api.assetTypes.update] No affected buildings found for asset type:', beforeData.name);
                }
              }
            }
          } else {
            throw rpcError;
          }
        } else {
          // Function succeeded - extract the updated data
          const afterData = result?.after_data;
          if (afterData) {
            // Map asset_type to id if needed
            if (afterData.asset_type !== undefined && afterData.id === undefined) {
              afterData.id = afterData.asset_type;
            }
            data = afterData as AssetType;
            
            // Log if distribution flags were reset
            if (result?.affected_buildings && Array.isArray(result.affected_buildings) && result.affected_buildings.length > 0) {
              console.log(`[api.assetTypes.update] Database function updated asset type and set distribution flags to true for ${result.affected_buildings.length} building(s):`, result.affected_buildings);
            } else if (beforeData && 'non_accountable_for_distribution' in input) {
              // Check if non_accountable_for_distribution changed but no buildings were affected
              const oldValue = beforeData.non_accountable_for_distribution === true;
              const newValue = input.non_accountable_for_distribution === true;
              if (oldValue !== newValue) {
                console.log('[api.assetTypes.update] non_accountable_for_distribution changed but no affected buildings found (database function may have handled it)');
              }
            }
          } else {
            throw new Error('Database function returned no data');
          }
        }
      } catch (err) {
        // If RPC fails completely, fall back to regular update
        console.warn('[api.assetTypes.update] RPC failed, using fallback:', err);
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('asset_types')
          .update(finalInput)
          .eq('id', id)
          .select()
          .single();
        
        if (fallbackError) throw fallbackError;
        data = fallbackData;
      }
      
      // Refresh in-memory cache after update
      try {
        const { refreshAssetTypesCache } = await import('./validation');
        await refreshAssetTypesCache();
      } catch (err) {
        console.warn('[api.assetTypes.update] Failed to refresh cache:', err);
      }

      // Log change entry asynchronously
      if (beforeData && data) {
        const changedFields = calculateChangedFields(beforeData, data);
        logChangeAsync(
          'asset_types',
          'UPDATE',
          String(id),
          beforeData,
          data,
          changedFields
        );
      } else if (data) {
        logChangeAsync(
          'asset_types',
          'UPDATE',
          String(id),
          undefined,
          data
        );
      }

      return data;
    },
    updateBulkWithDistributionReset: async (
      updates: Array<{ id: number; updates: Partial<AssetType> }>
    ): Promise<{ success: boolean; count: number; affected_buildings?: number[]; error?: string }> => {
      if (!updates || updates.length === 0) {
        return { success: true, count: 0, affected_buildings: [] };
      }

      const payload = updates
        .filter(u => u && u.id != null)
        .map(u => ({
          id: u.id,
          updates: Object.fromEntries(Object.entries(u.updates || {}).filter(([_, v]) => v !== undefined))
        }));

      if (payload.length === 0) {
        return { success: true, count: 0, affected_buildings: [] };
      }

      const { data, error } = await supabase.rpc('update_asset_types_bulk_with_distribution_reset', {
        p_asset_types_data: payload as any
      });

      if (error) {
        return { success: false, count: 0, error: error.message };
      }

      // Refresh in-memory cache ONCE after bulk update
      try {
        const { refreshAssetTypesCache } = await import('./validation');
        await refreshAssetTypesCache();
      } catch (err) {
        console.warn('[api.assetTypes.updateBulkWithDistributionReset] Failed to refresh cache:', err);
      }

      return {
        success: data?.success === true,
        count: Number(data?.count || 0),
        affected_buildings: (data?.affected_buildings || []) as number[]
      };
    },
    delete: async (id: number): Promise<{ message: string }> => {
      // Get asset type data before deletion (for change log)
      let beforeData: AssetType | null = null;
      try {
        beforeData = await api.assetTypes.getOne(id);
      } catch (err) {
        // If asset type doesn't exist, that's fine
        if (process.env.NODE_ENV === 'development') {
          console.warn('[api.assetTypes.delete] Could not fetch before data:', err);
        }
      }
      
      // Try id first, then asset_type as fallback
      let { error } = await supabase
        .from('asset_types')
        .delete()
        .eq('id', id);

      // If id column doesn't exist, try asset_type
      if (error && error.code === '42703') {
        const result = await supabase
          .from('asset_types')
          .delete()
          .eq('asset_type', id);
        error = result.error;
      }

      if (error) throw error;
      
      // Refresh in-memory cache after delete
      try {
        const { refreshAssetTypesCache } = await import('./validation');
        await refreshAssetTypesCache();
      } catch (err) {
        console.warn('[api.assetTypes.delete] Failed to refresh cache:', err);
      }
      
      // Log change entry asynchronously
      if (beforeData) {
        logChangeAsync(
          'asset_types',
          'DELETE',
          String(id),
          beforeData,
          undefined
        );
      }
      
      return { message: 'Asset type deleted successfully' };
    },
    deleteBulk: async (ids: number[]): Promise<{ success: boolean; count: number }> => {
      const numericIds = (ids || []).map(Number).filter(n => !isNaN(n));
      if (numericIds.length === 0) {
        return { success: true, count: 0 };
      }

      // Prefer deleting by id, fallback to asset_type if schema differs
      let error: any = null;
      let count: number | null = null;

      const byId = await supabase
        .from('asset_types')
        .delete()
        .in('id', numericIds)
        .select('id', { count: 'exact', head: true });

      error = byId.error;
      count = byId.count ?? null;

      if (error && error.code === '42703') {
        const byLegacy = await supabase
          .from('asset_types')
          .delete()
          .in('asset_type', numericIds)
          .select('asset_type', { count: 'exact', head: true });
        error = byLegacy.error;
        count = byLegacy.count ?? null;
      }

      if (error) throw error;

      // Refresh in-memory cache ONCE after bulk delete
      try {
        const { refreshAssetTypesCache } = await import('./validation');
        await refreshAssetTypesCache();
      } catch (err) {
        console.warn('[api.assetTypes.deleteBulk] Failed to refresh cache:', err);
      }

      return { success: true, count: count || 0 };
    },
  },
  addressList: {
    getAll: async (): Promise<AddressList[]> => {
      const { data, error } = await supabase
        .from('address_list')
        .select('*')
        .order('street_code', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    getOne: async (streetCode: number): Promise<AddressList> => {
      const { data, error } = await supabase
        .from('address_list')
        .select('*')
        .eq('street_code', streetCode)
        .single();

      if (error) throw error;
      return data;
    },
    create: async (input: Partial<AddressList>): Promise<AddressList> => {
      const { data, error } = await supabase
        .from('address_list')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    update: async (streetCode: number, input: Partial<AddressList>): Promise<AddressList> => {
      const { data, error } = await supabase
        .from('address_list')
        .update(input)
        .eq('street_code', streetCode)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    upsertBulk: async (inputs: Partial<AddressList>[]): Promise<{ success: boolean; count: number; rows?: AddressList[] }> => {
      if (!inputs || inputs.length === 0) {
        return { success: true, count: 0, rows: [] };
      }

      const { data, error } = await supabase
        .from('address_list')
        .upsert(inputs, { onConflict: 'street_code' })
        .select('*');

      if (error) throw error;
      return { success: true, count: data?.length || inputs.length, rows: data || [] };
    },
    delete: async (streetCode: number): Promise<{ message: string }> => {
      const { error } = await supabase
        .from('address_list')
        .delete()
        .eq('street_code', streetCode);

      if (error) throw error;
      return { message: 'Address deleted successfully' };
    },
    deleteBulk: async (streetCodes: number[]): Promise<{ success: boolean; count: number }> => {
      const codes = (streetCodes || []).map(Number).filter(n => !isNaN(n));
      if (codes.length === 0) {
        return { success: true, count: 0 };
      }

      const { error, count } = await supabase
        .from('address_list')
        .delete()
        .in('street_code', codes)
        .select('street_code', { count: 'exact', head: true });

      if (error) throw error;
      return { success: true, count: count || 0 };
    },
  },
  validationRules: {
    getAll: async (entityType?: string): Promise<ValidationRule[]> => {
      let query = supabase
        .from('validation_rules')
        .select('*')
        .order('entity_type')
        .order('field_name');

      if (entityType) {
        query = query.eq('entity_type', entityType);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    },
    getEnabled: async (entityType?: string): Promise<ValidationRule[]> => {
      let query = supabase
        .from('validation_rules')
        .select('*')
        .eq('enabled', true)
        .order('entity_type')
        .order('field_name');

      if (entityType) {
        query = query.eq('entity_type', entityType);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    },
    getOne: async (id: string): Promise<ValidationRule> => {
      const { data, error } = await supabase
        .from('validation_rules')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Validation rule not found');
      return data;
    },
    getByKey: async (ruleKey: string): Promise<ValidationRule> => {
      const { data, error } = await supabase
        .from('validation_rules')
        .select('*')
        .eq('rule_key', ruleKey)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Validation rule not found');
      return data;
    },
    create: async (input: Omit<ValidationRule, 'id' | 'created_at' | 'updated_at'>): Promise<ValidationRule> => {
      const { data, error } = await supabase
        .from('validation_rules')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    update: async (id: string, input: Partial<ValidationRule>): Promise<ValidationRule> => {
      const { data, error } = await supabase
        .from('validation_rules')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    delete: async (id: string): Promise<{ message: string }> => {
      const { error } = await supabase
        .from('validation_rules')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { message: 'Validation rule deleted successfully' };
    },
  },
  deleteBuilding: async (buildingNumber: number): Promise<{ message: string }> => {
    return api.buildings.delete(buildingNumber);
  },
  deleteAssetsByBuilding: async (buildingNumber: number): Promise<{ message: string }> => {
    // Get all assets for this building first (including main_asset_type to determine flags)
    const { data: assets, error: fetchError } = await supabase
      .from('assets')
      .select('asset_id, main_asset_type')
      .eq('building_number', buildingNumber);

    if (fetchError) throw fetchError;

    const assetIds = assets?.map(a => a.asset_id) || [];

    // NOTE: For bulk deletion, we should use delete_asset_transactional for each asset
    // to ensure flags are set as part of the transaction. This function should be
    // refactored to use transactional delete, or a bulk transactional delete function
    // should be created that handles flags as part of the transaction.

    // Delete all existing history records for all assets in this building
    if (assetIds.length > 0) {
      const { error: historyError1 } = await supabase
        .from('assets_history')
        .delete()
        .in('asset_id', assetIds);

      if (historyError1) {
        console.warn('Error deleting existing history from assets_history:', historyError1);
        // Continue with asset deletion even if history deletion fails
      }
    }

    // Delete from assets table
    // Note: The trigger will run BEFORE DELETE and create new history entries
    const { error } = await supabase
      .from('assets')
      .delete()
      .eq('building_number', buildingNumber);

    if (error) throw error;

    // Update building total area (transaction-based, replaces trigger)
    try {
      await supabase.rpc('update_building_total_area', {
        p_building_number: buildingNumber
      });
    } catch (areaError) {
      console.warn('Failed to update building total area after bulk asset deletion:', areaError);
      // Don't fail the operation if area update fails
    }

    // NOTE: Distribution flags are NOT set here - they are set by delete_asset_transactional
    // when individual assets are deleted. For bulk deletion, flags should be set by
    // using the transactional delete function for each asset, or by a bulk transactional delete function.
    // This ensures flags are always part of the delete transaction and cannot be set separately.
    console.log('[api.deleteAssetsByBuilding] Distribution flags should be set by transactional delete functions, not directly from API');

    // Delete from assets_history again to remove entries created by the trigger
    if (assetIds.length > 0) {
      const { error: historyError2 } = await supabase
        .from('assets_history')
        .delete()
        .in('asset_id', assetIds);

      if (historyError2) {
        console.warn('Error deleting trigger-created history from assets_history:', historyError2);
        // Don't throw - assets are already deleted, this is just cleanup
      }
    }

    return { message: 'Assets deleted successfully' };
  },
  fieldConfigurations: {
    getAll: async (gridName?: string): Promise<FieldConfiguration[]> => {
      // Try to get from in-memory cache first (loaded on app startup)
      try {
        const { getFieldConfigCache, isFieldConfigCacheLoaded } = await import('./fieldConfigUtils');
        if (isFieldConfigCacheLoaded()) {
          const cache = getFieldConfigCache();
          if (cache && cache.size > 0) {
            // Convert Map to array
            const allConfigs: FieldConfiguration[] = [];
            const seen = new Set<string>();
            
            cache.forEach((config) => {
              // Only add each config once (avoid duplicates from composite key and field_name key)
              const uniqueKey = `${config.grid_name}:${config.field_name}`;
              if (!seen.has(uniqueKey)) {
                seen.add(uniqueKey);
                allConfigs.push(config);
              }
            });
            
            // Filter by gridName if specified
            const filtered = gridName 
              ? allConfigs.filter(config => config.grid_name === gridName)
              : allConfigs;
            
            // Sort: by grid_name, then by column_order, then by field_name
            filtered.sort((a, b) => {
              if (a.grid_name !== b.grid_name) {
                return a.grid_name.localeCompare(b.grid_name);
              }
              if (a.column_order !== undefined && b.column_order !== undefined) {
                return a.column_order - b.column_order;
              }
              if (a.column_order !== undefined) return -1;
              if (b.column_order !== undefined) return 1;
              return a.field_name.localeCompare(b.field_name);
            });
            
            // Return a copy to avoid mutations
            return [...filtered];
          }
        }
      } catch (err) {
        // If fieldConfigUtils module not available, fall back to database
        console.warn('[api.fieldConfigurations.getAll] Could not access in-memory cache, falling back to database');
      }

      // Fallback to database query if cache is not available
      let query = supabase
        .from('field_configurations')
        .select('*');
      
      if (gridName) {
        query = query.eq('grid_name', gridName);
      }
      
      const { data, error } = await query
        .order('grid_name')
        .order('column_order', { ascending: true, nullsFirst: false })
        .order('field_name');

      if (error) throw error;
      return data || [];
    },
    getOne: async (gridName: string, fieldName: string): Promise<FieldConfiguration | null> => {
      const { data, error } = await supabase
        .from('field_configurations')
        .select('*')
        .eq('grid_name', gridName)
        .eq('field_name', fieldName)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    create: async (input: Omit<FieldConfiguration, 'created_at' | 'updated_at'>): Promise<FieldConfiguration> => {
      const { data, error } = await supabase
        .from('field_configurations')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    update: async (gridName: string, fieldName: string, input: Partial<Omit<FieldConfiguration, 'grid_name' | 'field_name' | 'created_at' | 'updated_at'>>): Promise<FieldConfiguration> => {
      const { data, error } = await supabase
        .from('field_configurations')
        .update(input)
        .eq('grid_name', gridName)
        .eq('field_name', fieldName)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    upsert: async (input: Omit<FieldConfiguration, 'created_at' | 'updated_at'>): Promise<FieldConfiguration> => {
      const { data, error } = await supabase
        .from('field_configurations')
        .upsert(input, { onConflict: 'grid_name,field_name' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    upsertBulk: async (inputs: Omit<FieldConfiguration, 'created_at' | 'updated_at'>[]): Promise<{ success: boolean; count: number; rows?: FieldConfiguration[] }> => {
      if (!inputs || inputs.length === 0) {
        return { success: true, count: 0, rows: [] };
      }

      const { data, error } = await supabase
        .from('field_configurations')
        .upsert(inputs, { onConflict: 'grid_name,field_name' })
        .select('*');

      if (error) throw error;
      return { success: true, count: data?.length || inputs.length, rows: data || [] };
    },
    delete: async (gridName: string, fieldName: string): Promise<{ message: string }> => {
      const { error } = await supabase
        .from('field_configurations')
        .delete()
        .eq('grid_name', gridName)
        .eq('field_name', fieldName);

      if (error) throw error;
      return { message: 'Field configuration deleted successfully' };
    },
  },
  auditLog: {
    bulkTransferAreas: async (
      oldAssets: Asset[],
      newAssets: Partial<Asset>[],
      actionType: 'transfer_area' = 'transfer_area',
      beforeData?: any,
      afterData?: any,
      description?: string,
      userName?: string
    ): Promise<{ affected_asset_ids: number[]; count: number }> => {
      // Prepare assets with is_new_measurement flag set to true
      // This will cause save_assets_bulk_transactional to copy existing assets to history before updating
      const assetsToSave = newAssets.map(asset => {
        const sanitized = sanitizeAssetInput(asset);
        return {
          ...sanitized,
          asset_id: sanitized.asset_id,
          building_number: sanitized.building_number,
          asset_size: sanitized.asset_size || 0,
          sub_asset_size_1: sanitized.sub_asset_size_1 || 0,
          sub_asset_size_2: sanitized.sub_asset_size_2 || 0,
          sub_asset_size_3: sanitized.sub_asset_size_3 || 0,
          sub_asset_size_4: sanitized.sub_asset_size_4 || 0,
          sub_asset_size_5: sanitized.sub_asset_size_5 || 0,
          sub_asset_size_6: sanitized.sub_asset_size_6 || 0,
          is_new_measurement: true, // This flag tells the function to copy to history before updating
        };
      });

      // Prepare before_data from oldAssets for audit logging
      // If beforeData is provided, use it; otherwise construct from oldAssets
      // If neither is available, pass null to let the database function collect it
      const beforeDataForAudit = beforeData || (oldAssets.length > 0 ? {
        assets: oldAssets.map(asset => ({
          asset_id: asset.asset_id,
          building_number: asset.building_number,
          main_asset_type: asset.main_asset_type,
          asset_size: asset.asset_size,
          sub_asset_type_1: asset.sub_asset_type_1,
          sub_asset_size_1: asset.sub_asset_size_1,
          sub_asset_type_2: asset.sub_asset_type_2,
          sub_asset_size_2: asset.sub_asset_size_2,
          sub_asset_type_3: asset.sub_asset_type_3,
          sub_asset_size_3: asset.sub_asset_size_3,
          sub_asset_type_4: asset.sub_asset_type_4,
          sub_asset_size_4: asset.sub_asset_size_4,
          sub_asset_type_5: asset.sub_asset_type_5,
          sub_asset_size_5: asset.sub_asset_size_5,
          sub_asset_type_6: asset.sub_asset_type_6,
          sub_asset_size_6: asset.sub_asset_size_6,
          measurement_date: asset.measurement_date,
        }))
      } : null);

      // Use validateAndSaveBulkAssets which will call save_assets_bulk_transactional
      // This function handles validation, copying to history, and logging to audit table
      const result = await validateAndSaveBulkAssets(
        assetsToSave,
        'transfer_area',
        beforeDataForAudit,
        afterData,
        description || `Transferred areas for ${oldAssets.length} assets as new measurements`
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to transfer areas');
      }

      return {
        affected_asset_ids: result.affected_asset_ids || [],
        count: result.count || 0
      };
    },
    getAll: async (filters?: { limit?: number }): Promise<DistributionAudit[]> => {
      let query = supabase
        .from('audit')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (filters?.limit) {
        query = query.limit(filters.limit);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Parse JSONB if needed and return data
      return (data || []).map((record: any) => {
        let beforeData = record.before_data;
        let afterData = record.after_data;
        
        if (typeof beforeData === 'string') {
          try {
            beforeData = JSON.parse(beforeData);
          } catch (e) {
            console.warn('Failed to parse before_data as JSON:', e);
            beforeData = null;
          }
        }
        
        if (typeof afterData === 'string') {
          try {
            afterData = JSON.parse(afterData);
          } catch (e) {
            console.warn('Failed to parse after_data as JSON:', e);
            afterData = null;
          }
        }
        
        return {
          ...record,
          building_number: record.building_number || (record.entity_id ? parseInt(record.entity_id, 10) : null),
          before_data: beforeData || null,
          after_data: afterData || null,
        };
      });
    },
    getOne: async (id: number): Promise<DistributionAudit> => {
      const { data, error } = await supabase
        .from('audit')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      
      // Parse JSONB if it comes as a string (Supabase should auto-parse, but handle both cases)
      let beforeData = data.before_data;
      let afterData = data.after_data;
      
      if (typeof beforeData === 'string') {
        try {
          beforeData = JSON.parse(beforeData);
        } catch (e) {
          console.warn('Failed to parse before_data as JSON:', e);
          beforeData = null;
        }
      }
      
      if (typeof afterData === 'string') {
        try {
          afterData = JSON.parse(afterData);
        } catch (e) {
          console.warn('Failed to parse after_data as JSON:', e);
          afterData = null;
        }
      }
      
      // Return data with before_data and after_data
      return {
        ...data,
        building_number: data.building_number || (data.entity_id ? parseInt(data.entity_id, 10) : null),
        before_data: beforeData || null,
        after_data: afterData || null,
      };
    },
  },
  distributionAudit: {
    getByBuilding: async (buildingNumber: number, actionType?: 'distribution' | 'transfer' | 'business_distribution' | 'residence_distribution' | 'distribute_shared' | 'transfer_area', taxRegion?: string): Promise<DistributionAudit[]> => {
      // Map legacy enum values for backward compatibility
      // 'distribution' -> 'business_distribution' (default for backward compatibility)
      // 'transfer' -> 'transfer_area'
      // 'distribute_shared' -> query both 'business_distribution' and 'residence_distribution'
      let mappedActionTypes: string[] | undefined = undefined;
      if (actionType === 'distribution' || actionType === 'distribute_shared') {
        // For 'distribution' or 'distribute_shared', query both business and residence distributions
        mappedActionTypes = ['business_distribution', 'residence_distribution'];
      } else if (actionType === 'transfer') {
        mappedActionTypes = ['transfer_area'];
      } else if (actionType === 'business_distribution' || actionType === 'residence_distribution') {
        mappedActionTypes = [actionType];
      } else if (actionType === 'transfer_area') {
        mappedActionTypes = ['transfer_area'];
      }
      
      // Query audit table by entity_type and entity_id
      // Distribution operations use entity_type='bulk_asset' and entity_id=building_number (as text)
      // Transfer operations also use entity_type='bulk_asset' and entity_id=building_number (as text)
      let query = supabase
        .from('audit')
        .select('*')
        .eq('entity_type', 'bulk_asset')
        .eq('entity_id', String(buildingNumber))
        .order('created_at', { ascending: false });
      
      if (mappedActionTypes && mappedActionTypes.length > 0) {
        if (mappedActionTypes.length === 1) {
          query = query.eq('action_type', mappedActionTypes[0]);
        } else {
          query = query.in('action_type', mappedActionTypes);
        }
      }
      
      // taxRegion parameter is kept for backward compatibility but no longer used
      // Filtering is now done by action_type ('distribute_shared' or 'transfer_area')
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Extract data with before_data and after_data
      return (data || []).map((record: any) => ({
        ...record,
        before_data: record.before_data || null,
        after_data: record.after_data || null,
      }));
    },
    // saveCurrentState is deprecated - distribution operations are now logged
    // automatically through save_assets_bulk_transactional which calls log_audit_entry
    // This function is kept for backward compatibility but is no longer used
    saveCurrentState: async (
      buildingNumber: number,
      actionType: 'distribution' | 'transfer' | 'business_distribution' | 'residence_distribution',
      affectedAssetsAfter: Asset[],
      sharedAreaSize?: number,
      overloadRatio?: number | null
    ): Promise<void> => {
      console.warn('saveCurrentState is deprecated - distribution operations are now logged automatically');
      // This function is no longer used - distribution operations are logged
      // automatically through save_assets_bulk_transactional
    },
    getOne: async (id: number): Promise<DistributionAudit> => {
      const { data, error } = await supabase
        .from('audit')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      
      // Parse JSONB if it comes as a string (Supabase should auto-parse, but handle both cases)
      let beforeData = data.before_data;
      let afterData = data.after_data;
      
      if (typeof beforeData === 'string') {
        try {
          beforeData = JSON.parse(beforeData);
        } catch (e) {
          console.warn('Failed to parse before_data as JSON:', e);
          beforeData = null;
        }
      }
      
      if (typeof afterData === 'string') {
        try {
          afterData = JSON.parse(afterData);
        } catch (e) {
          console.warn('Failed to parse after_data as JSON:', e);
          afterData = null;
        }
      }
      
      // Return data with before_data and after_data
      return {
        ...data,
        building_number: data.building_number || (data.entity_id ? parseInt(data.entity_id, 10) : null),
        before_data: beforeData || null,
        after_data: afterData || null,
      };
    },
    getByDateRange: async (
      buildingNumber: number,
      startDate: string,
      endDate: string,
      actionType?: 'distribution' | 'transfer'
    ): Promise<DistributionAudit[]> => {
      let query = supabase
        .from('audit')
        .select('*')
        .eq('building_number', buildingNumber)
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });
      
      if (actionType) {
        query = query.eq('action_type', actionType);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Extract data with before_data and after_data
      return (data || []).map((record: any) => ({
        ...record,
        before_data: record.before_data || null,
        after_data: record.after_data || null,
      }));
    },
  },
  changeLog: {
    getAll: async (filters?: {
      table_name?: string;
      record_id?: string;
      user_name?: string;
      operation?: 'INSERT' | 'UPDATE' | 'DELETE';
      start_date?: string;
      end_date?: string;
      limit?: number;
      offset?: number;
    }): Promise<ChangeLog[]> => {
      let query = supabase
        .from('change_log')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters) {
        if (filters.table_name) {
          query = query.eq('table_name', filters.table_name);
        }
        if (filters.record_id) {
          query = query.eq('record_id', filters.record_id);
        }
        if (filters.user_name) {
          query = query.eq('user_name', filters.user_name);
        }
        if (filters.operation) {
          query = query.eq('operation', filters.operation);
        }
        if (filters.start_date) {
          query = query.gte('created_at', filters.start_date);
        }
        if (filters.end_date) {
          query = query.lte('created_at', filters.end_date);
        }
        if (filters.limit) {
          query = query.limit(filters.limit);
        }
        if (filters.offset) {
          query = query.range(filters.offset, filters.offset + (filters.limit || 100) - 1);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    getOne: async (logId: number): Promise<ChangeLog> => {
      const { data, error } = await supabase
        .from('change_log')
        .select('*')
        .eq('log_id', logId)
        .single();
      
      if (error) throw error;
      return data;
    },
    getByTable: async (tableName: string, recordId?: string, limit: number = 100): Promise<ChangeLog[]> => {
      let query = supabase
        .from('change_log')
        .select('*')
        .eq('table_name', tableName)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (recordId) {
        query = query.eq('record_id', recordId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    getByUser: async (userName: string, tableName?: string, limit: number = 100): Promise<ChangeLog[]> => {
      let query = supabase
        .from('change_log')
        .select('*')
        .eq('user_name', userName)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (tableName) {
        query = query.eq('table_name', tableName);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    getRecordHistory: async (tableName: string, recordId: string, limit: number = 50): Promise<ChangeLog[]> => {
      const { data, error } = await supabase.rpc('get_record_change_history', {
        p_table_name: tableName,
        p_record_id: recordId,
        p_limit: limit
      });
      
      if (error) throw error;
      return data || [];
    },
  },
  schema: {
    getTablesFieldsTypes: async (): Promise<Array<{ table_name: string; field_name: string; field_type: string }>> => {
      const { data, error } = await supabase.rpc('get_tables_fields_types');
      
      if (error) {
        console.error('Error fetching schema:', error);
        throw new Error(`Failed to fetch database schema: ${error.message}`);
      }
      
      return data || [];
    },
  },
  users: {
    getAll: async (): Promise<Array<{
      user_id: number;
      auth_user_id: string | null;
      user_name: string;
      user_email: string | null;
      user_role: 'admin' | 'user';
      active: boolean;
      created_at: string;
      updated_at: string;
    }>> => {
      const { data, error } = await supabase
        .from('users')
        .select('user_id, auth_user_id, user_name, user_email, user_role, active, created_at, updated_at')
        .order('user_name');
      
      if (error) {
        console.error('Error fetching users:', error);
        throw new Error(`Failed to fetch users: ${error.message}`);
      }
      
      return data || [];
    },
    update: async (userId: number, updates: {
      user_role?: 'admin' | 'user';
      active?: boolean;
      user_name?: string;
      user_email?: string;
    }): Promise<void> => {
      const { error } = await supabase
        .from('users')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
      
      if (error) {
        console.error('Error updating user:', error);
        throw new Error(`Failed to update user: ${error.message}`);
      }
    },
    create: async (userData: {
      user_name: string;
      user_email: string;
      password: string;
      user_role?: 'admin' | 'user';
    }): Promise<{
      user_id: number;
      auth_user_id: string | null;
    }> => {
      // First create user in Supabase Auth
      let authUserId: string | null = null;
      
      try {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: userData.user_email,
          password: userData.password,
          options: {
            data: {
              user_name: userData.user_name
            }
          }
        });

        if (authError) {
          throw new Error(`Failed to create auth user: ${authError.message}`);
        }

        authUserId = authData.user?.id || null;
      } catch (err) {
        // If auth creation fails, we can still create the user in the database
        // but without auth_user_id
        console.warn('Could not create Supabase Auth user:', err);
      }

      // Then create user in database
      const { data, error } = await supabase
        .from('users')
        .insert({
          user_name: userData.user_name,
          user_email: userData.user_email,
          auth_user_id: authUserId,
          user_role: userData.user_role || 'user',
          active: true,
        })
        .select('user_id, auth_user_id')
        .single();

      if (error) {
        console.error('Error creating user:', error);
        throw new Error(`Failed to create user: ${error.message}`);
      }

      return {
        user_id: data.user_id,
        auth_user_id: data.auth_user_id,
      };
    },
    delete: async (userId: number): Promise<void> => {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('user_id', userId);

      if (error) {
        console.error('Error deleting user:', error);
        throw new Error(`Failed to delete user: ${error.message}`);
      }
    },
  },
};
