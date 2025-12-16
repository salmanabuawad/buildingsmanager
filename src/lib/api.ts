import { supabase } from './supabase';
import i18n from '../i18n/i18n';
import { sanitizeText, sanitizeNumber, sanitizeInteger, sanitizeDate } from './sanitize';

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
    // Get asset types to check business_residence
    const { data: assetTypes, error } = await supabase
      .from('asset_types')
      .select('name, business_residence')
      .eq('name', asset.main_asset_type)
      .maybeSingle();
    
    if (error || !assetTypes) {
      return null;
    }
    
    if (assetTypes.business_residence === 'עסקים') {
      return 'business';
    } else if (assetTypes.business_residence === 'מגורים') {
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
  assetSizeChanged?: boolean
): Promise<void> {
  if (!buildingNumber) return;
  
  try {
    // Get current building data to check if flags need to be reset
    const { data: building, error: buildingError } = await supabase
      .from('buildings')
      .select('business_shared_area_distributed, residence_shared_area_distributed')
      .eq('building_number', buildingNumber)
      .maybeSingle();
    
    if (buildingError || !building) {
      return;
    }
    
    const updates: Partial<Building> = {};
    
    // For residence: reset on create or delete
    if (assetType === 'residence' && (changeType === 'create' || changeType === 'delete')) {
      if (building.residence_shared_area_distributed === true) {
        updates.residence_shared_area_distributed = false;
      }
    }
    
    // For business: reset on create, delete, or asset_size change
    if (assetType === 'business') {
      if (changeType === 'create' || changeType === 'delete' || assetSizeChanged) {
        if (building.business_shared_area_distributed === true) {
          updates.business_shared_area_distributed = false;
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
  residence_shared_area_distributed?: boolean;
  business_shared_area_distributed?: boolean;
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
  action_id?: number; // References the audit entry that caused this record to be created or updated
  business_distribution_area?: number; // Area distributed to this asset from business shared area distribution
  exported_to_automation?: boolean; // Flag indicating if asset has been exported to automation system (default: false)
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
  shared_area_usage?: string;
  active?: string;
  non_accountable_for_total_area?: boolean; // לא נספר בחישוב שטח מבנה
  non_accountable_for_distribution?: boolean; // לא נספר בפיזור
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

export interface AuditLog {
  action_id: number;
  user_name: string;
  action_type: 'manual_update' | 'import_file' | 'transfer_area' | 'distribute_shared';
  entity_type: 'building' | 'asset' | 'bulk_building' | 'bulk_asset';
  entity_id?: string;
  before_data?: any; // JSONB
  after_data?: any; // JSONB
  description?: string;
  created_at: string;
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
    business_distribution_area: input.business_distribution_area != null ? sanitizeNumber(input.business_distribution_area) : undefined,
    exported_to_automation: input.exported_to_automation != null ? (input.exported_to_automation === true || input.exported_to_automation === 'true') : undefined,
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
  if ('residence_shared_area_distributed' in input) {
    sanitized.residence_shared_area_distributed = input.residence_shared_area_distributed === true || input.residence_shared_area_distributed === 'true';
  }
  if ('business_shared_area_distributed' in input) {
    sanitized.business_shared_area_distributed = input.business_shared_area_distributed === true || input.business_shared_area_distributed === 'true';
  }
  
  return sanitized;
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
      
      // New buildings should start with distribution flags set to false (needs distribution)
      // Even though the schema default is true, we explicitly set to false for new buildings
      cleanedInput.residence_shared_area_distributed = false;
      cleanedInput.business_shared_area_distributed = false;
      
      const { data, error } = await supabase
        .from('buildings')
        .insert(cleanedInput)
        .select()
        .single();

      if (error) {
        throw error;
      }
      
      // Log audit entry (transaction-based, replaces trigger)
      const userInfo = await getCurrentUserInfo();
      try {
        await supabase.rpc('log_audit_for_building', {
          p_building_number: data.building_number,
          p_operation: 'INSERT',
          p_user_id: userInfo.user_id || null, // auth_user_id (UUID as text)
          p_action_type: 'manual_update',
          p_description: 'Building created'
        });
      } catch (auditError) {
        console.warn('Failed to log audit entry for building creation:', auditError);
        // Don't fail the operation if audit logging fails
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
      
      // Reset distribution flags when shared areas change
      if (beforeData) {
        // If residence_shared_area is being changed, reset the distribution flag
        if ('residence_shared_area' in cleanedInput && 
            cleanedInput.residence_shared_area !== beforeData.residence_shared_area) {
          cleanedInput.residence_shared_area_distributed = false;
        }
        // If business_shared_area is being changed, reset the distribution flag
        if ('business_shared_area' in cleanedInput && 
            cleanedInput.business_shared_area !== beforeData.business_shared_area) {
          cleanedInput.business_shared_area_distributed = false;
        }
      }
      
      // Remove read-only fields that shouldn't be updated directly
      delete (cleanedInput as any).action_id;
      delete (cleanedInput as any).created_at;
      // Don't allow updating building_number (primary key)
      delete (cleanedInput as any).building_number;
      
      // If no fields to update, return the existing building
      if (Object.keys(cleanedInput).length === 0) {
        return api.buildings.getOne(buildingNumber);
      }
      
      // Note: buildings table doesn't have updated_at column, so don't include it
      const { data, error } = await supabase
        .from('buildings')
        .update(cleanedInput)
        .eq('building_number', buildingNumber)
        .select()
        .single();

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
      
      // Log audit entry (transaction-based, replaces trigger)
      const userInfo = await getCurrentUserInfo();
      try {
        await supabase.rpc('log_audit_for_building', {
          p_building_number: buildingNumber,
          p_operation: 'UPDATE',
          p_user_id: userInfo.user_id || null, // auth_user_id (UUID as text)
          p_action_type: 'manual_update',
          p_description: 'Building updated'
        });
      } catch (auditError) {
        console.warn('Failed to log audit entry for building update:', auditError);
        // Don't fail the operation if audit logging fails
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

      // Log audit entry BEFORE deletion (transaction-based, replaces trigger)
      const userInfo = await getCurrentUserInfo();
      try {
        await supabase.rpc('log_audit_for_building', {
          p_building_number: buildingNumber,
          p_operation: 'DELETE',
          p_user_id: userInfo.user_id || null, // auth_user_id (UUID as text)
          p_action_type: 'manual_update',
          p_description: 'Building deleted'
        });
      } catch (auditError) {
        console.warn('Failed to log audit entry for building deletion:', auditError);
        // Continue with deletion even if audit logging fails
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
        .update({ business_shared_area_distributed: false })
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
        .update({ business_shared_area_distributed: true })
        .eq('building_number', buildingNumber);
      
      if (error) {
        console.error('[api.buildings.markBusinessDistributionDone] Failed:', error);
        throw error;
      }
      console.log(`[api.buildings.markBusinessDistributionDone] Marked building ${buildingNumber} as having completed business distribution`);
    },
    markResidenceDistributionNeeded: async (buildingNumber: number): Promise<void> => {
      const { error } = await supabase
        .from('buildings')
        .update({ residence_shared_area_distributed: false })
        .eq('building_number', buildingNumber);
      
      if (error) {
        console.error('[api.buildings.markResidenceDistributionNeeded] Failed:', error);
        throw error;
      }
      console.log(`[api.buildings.markResidenceDistributionNeeded] Marked building ${buildingNumber} as needing residence distribution`);
    },
    markResidenceDistributionDone: async (buildingNumber: number): Promise<void> => {
      const { error } = await supabase
        .from('buildings')
        .update({ residence_shared_area_distributed: true })
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
        .select('business_shared_area_distributed, residence_shared_area_distributed')
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
        business: data.business_shared_area_distributed,
        residence: data.residence_shared_area_distributed
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
        // Explicitly include action_id in the select
        let masterQuery = supabase
          .from('assets')
          .select('*, action_id')
          .eq('asset_id', assetId);

        if (buildingNumber) {
          masterQuery = masterQuery.eq('building_number', buildingNumber);
        }

        const { data: masterData, error: masterError } = await masterQuery.maybeSingle();

        if (masterError && masterError.code !== 'PGRST116') {
          throw masterError;
        }

        // Other records: fetch from assets_history table
        // Explicitly include action_id in the select
        let historyQuery = supabase
          .from('assets_history')
          .select('*, action_id')
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
            
            // If types differ or it's a business asset, reset business flag
            if (oldAssetType === 'business' || newAssetType === 'business' || oldAssetType !== newAssetType) {
              await resetDistributionFlagsIfNeeded(newAsset.building_number, 'business', 'delete');
              await resetDistributionFlagsIfNeeded(newAsset.building_number, 'business', 'create');
            }
            
            // If types differ or it's a residence asset, reset residence flag
            if (oldAssetType === 'residence' || newAssetType === 'residence' || oldAssetType !== newAssetType) {
              await resetDistributionFlagsIfNeeded(newAsset.building_number, 'residence', 'delete');
              await resetDistributionFlagsIfNeeded(newAsset.building_number, 'residence', 'create');
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
      // Get asset ID as number
      const assetIdNum = typeof id === 'string' ? parseInt(id, 10) : id;
      
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
      } catch (err) {
        // If asset doesn't exist, that's fine - we'll still try to update
        if (process.env.NODE_ENV === 'development') {
          console.warn('[api.assets.update] Could not fetch before data:', err);
        }
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

      // Reset distribution flags if needed (for business: asset_size change)
      // Also reset if main_asset_type changed to/from a type with non_accountable_for_distribution = true
      // Note: We check this even if skipAudit is true, because distribution flags need to be reset regardless
      if (updatedAsset.building_number && beforeData) {
        const assetSizeChanged = beforeData.asset_size !== updatedAsset.asset_size;
        const oldMainType = String(beforeData.main_asset_type || '').trim();
        const newMainType = String(updatedAsset.main_asset_type || '').trim();
        const mainAssetTypeChanged = oldMainType !== newMainType && oldMainType !== '' && newMainType !== '';
        
        // Check if main_asset_type changed to/from a type with non_accountable_for_distribution = true
        let mainAssetTypeChangedToNonAccountable = false;
        if (mainAssetTypeChanged) {
          try {
            // Fetch all asset types to check - handle both string and numeric comparisons
            const { data: allAssetTypes } = await supabase
              .from('asset_types')
              .select('name, non_accountable_for_distribution');
            
            if (allAssetTypes && allAssetTypes.length > 0) {
              // Find old and new types - handle both string and numeric matching
              const oldTypeData = allAssetTypes.find(at => {
                const atName = String(at.name || '').trim();
                return atName === oldMainType || 
                       (parseInt(atName, 10) === parseInt(oldMainType, 10) && !isNaN(parseInt(atName, 10)) && !isNaN(parseInt(oldMainType, 10)));
              });
              
              const newTypeData = allAssetTypes.find(at => {
                const atName = String(at.name || '').trim();
                return atName === newMainType || 
                       (parseInt(atName, 10) === parseInt(newMainType, 10) && !isNaN(parseInt(atName, 10)) && !isNaN(parseInt(newMainType, 10)));
              });
              
              const oldIsNonAccountable = oldTypeData?.non_accountable_for_distribution === true;
              const newIsNonAccountable = newTypeData?.non_accountable_for_distribution === true;
              
              // If changing from or to a type with non_accountable_for_distribution = true, reset flags
              if (oldIsNonAccountable || newIsNonAccountable) {
                mainAssetTypeChangedToNonAccountable = true;
                console.log('[api.assets.update] main_asset_type changed to/from non_accountable_for_distribution type:', {
                  oldType: oldMainType,
                  oldIsNonAccountable,
                  newType: newMainType,
                  newIsNonAccountable,
                  buildingNumber: updatedAsset.building_number,
                  oldTypeFound: !!oldTypeData,
                  newTypeFound: !!newTypeData
                });
              }
            }
          } catch (err) {
            console.warn('[api.assets.update] Could not check asset types for non_accountable_for_distribution:', err);
          }
        }
        
        // Reset flags if asset size changed OR if main_asset_type changed to/from non_accountable_for_distribution type
        if (assetSizeChanged || mainAssetTypeChangedToNonAccountable) {
          // If main_asset_type changed to/from non_accountable_for_distribution, reset both flags
          if (mainAssetTypeChangedToNonAccountable) {
            try {
              await api.buildings.markBusinessDistributionNeeded(updatedAsset.building_number);
              await api.buildings.markResidenceDistributionNeeded(updatedAsset.building_number);
              console.log(`[api.assets.update] Reset both distribution flags for building ${updatedAsset.building_number} due to main_asset_type change to/from non_accountable_for_distribution type`);
            } catch (err) {
              console.warn(`[api.assets.update] Failed to reset distribution flags:`, err);
            }
          } else if (!skipAudit) {
            // Normal case: only reset based on asset type and size change (but skip if skipAudit is true)
            const assetType = await getAssetBusinessResidenceType(updatedAsset);
            await resetDistributionFlagsIfNeeded(updatedAsset.building_number, assetType, 'update', assetSizeChanged);
          }
        }
      }

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
      
      // Get asset data before deletion (for change log and building number)
      let beforeData: Asset | null = null;
      let buildingNumber: number | null = null;
      try {
        const { data: asset } = await supabase
          .from('assets')
          .select('*')
          .eq('asset_id', assetIdNum)
          .maybeSingle();
        beforeData = asset || null;
        buildingNumber = asset?.building_number || null;
      } catch (err) {
        console.warn('Failed to get asset data before deletion:', err);
      }
      
      // Copy to history BEFORE deletion (transaction-based, replaces trigger)
      // Do NOT create audit entry - audit entries are only created by bulk operations
      // Regular asset deletion should not create audit entries
      try {
        await supabase.rpc('copy_asset_to_history_before_update', {
          p_asset_id: assetIdNum
        });
      } catch (historyError) {
        console.warn('Failed to copy asset to history before deletion:', historyError);
        // Continue with deletion even if history copy fails
      }

      // Delete from assets table
      const { error } = await supabase
        .from('assets')
        .delete()
        .eq('asset_id', assetIdNum);

      if (error) throw error;

      // Update building total area (transaction-based, replaces trigger)
      if (buildingNumber) {
        try {
          await supabase.rpc('update_building_total_area', {
            p_building_number: buildingNumber
          });
        } catch (areaError) {
          console.warn('Failed to update building total area after asset deletion:', areaError);
          // Don't fail the operation if area update fails
        }
      }
      
      // Reset distribution flags if needed (for residence: deleting asset)
      if (buildingNumber && beforeData) {
        const assetType = await getAssetBusinessResidenceType(beforeData);
        await resetDistributionFlagsIfNeeded(buildingNumber, assetType, 'delete');
      }

      // Log change entry asynchronously
      if (beforeData) {
        logChangeAsync(
          'assets',
          'DELETE',
          String(assetIdNum),
          beforeData,
          undefined
        );
      }

      return { message: 'Asset deleted successfully' };
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
      // Explicitly select all fields including business_residence to ensure it's included
      const { data, error } = await supabase
        .from('asset_types')
        .select('id, name, description, tax_region, elevator, single_double_family, penthouse, condo, townhouses, business_residence, shared_area_usage, min_size, max_size, active, non_accountable_for_total_area, non_accountable_for_distribution, area_description_for_tab, created_at, updated_at')
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
            if (beforeData && beforeData.name && 'non_accountable_for_distribution' in input) {
              const oldValue = beforeData.non_accountable_for_distribution === true;
              const newValue = input.non_accountable_for_distribution === true;
              if (oldValue !== newValue) {
                const { data: affectedAssets } = await supabase
                  .from('assets')
                  .select('building_number')
                  .eq('main_asset_type', beforeData.name)
                  .not('building_number', 'is', null);
                
                if (affectedAssets && affectedAssets.length > 0) {
                  const buildingNumbers = [...new Set(affectedAssets.map(a => a.building_number))];
                  for (const buildingNumber of buildingNumbers) {
                    try {
                      // Reset both business and residence distribution flags
                      // because non_accountable_for_distribution affects both distribution types
                      await api.buildings.markBusinessDistributionNeeded(buildingNumber);
                      await api.buildings.markResidenceDistributionNeeded(buildingNumber);
                    } catch (err) {
                      console.warn(`[api.assetTypes.update] Failed to mark building ${buildingNumber}:`, err);
                    }
                  }
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
            if (result?.distribution_flags_reset && result?.affected_buildings) {
              console.log(`[api.assetTypes.update] Updated asset type and reset distribution flags for ${result.affected_buildings.length} building(s) in transaction`);
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
    delete: async (streetCode: number): Promise<{ message: string }> => {
      const { error } = await supabase
        .from('address_list')
        .delete()
        .eq('street_code', streetCode);

      if (error) throw error;
      return { message: 'Address deleted successfully' };
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
    // Get all asset_ids for this building first
    const { data: assets, error: fetchError } = await supabase
      .from('assets')
      .select('asset_id')
      .eq('building_number', buildingNumber);

    if (fetchError) throw fetchError;

    const assetIds = assets?.map(a => a.asset_id) || [];

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
    getAll: async (filters?: {
      user_name?: string;
      action_type?: string;
      entity_type?: string;
      entity_id?: string;
      start_date?: string;
      end_date?: string;
      limit?: number;
      offset?: number;
    }): Promise<AuditLog[]> => {
      let query = supabase
        .from('audit')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters) {
        if (filters.user_name) {
          query = query.eq('user_name', filters.user_name);
        }
        if (filters.action_type) {
          query = query.eq('action_type', filters.action_type);
        }
        if (filters.entity_type) {
          query = query.eq('entity_type', filters.entity_type);
        }
        if (filters.entity_id) {
          query = query.eq('entity_id', filters.entity_id);
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
    getOne: async (actionId: number): Promise<AuditLog> => {
      const { data, error } = await supabase
        .from('audit')
        .select('*')
        .eq('action_id', actionId)
        .single();

      if (error) throw error;
      return data;
    },
    logEntry: async (input: {
      action_type: 'manual_update' | 'import_file' | 'transfer_area' | 'distribute_shared';
      entity_type: 'building' | 'asset' | 'bulk_building' | 'bulk_asset';
      entity_id?: string;
      before_data?: any;
      after_data?: any;
      description?: string;
    }): Promise<{ action_id: number }> => {
      // Get current user from auth context
      const userInfo = await getCurrentUserInfo();
      
      const { data, error } = await supabase
        .rpc('log_audit_entry', {
          p_action_type: input.action_type,
          p_entity_type: input.entity_type,
          p_entity_id: input.entity_id || null,
          p_user_id: userInfo.user_id || null, // auth_user_id (UUID as text)
          p_before_data: input.before_data || null,
          p_after_data: input.after_data || null,
          p_description: input.description || null,
        });

      if (error) throw error;
      return { action_id: Number(data) };
    },
    logBuildingAction: async (
      buildingNumber: number,
      actionType: 'manual_update' | 'import_file' | 'transfer_area' | 'distribute_shared',
      beforeData?: any,
      afterData?: any,
      description?: string,
      userName?: string
    ): Promise<{ action_id: number }> => {
      // Get building data with assets if not provided
      let before = beforeData;
      let after = afterData;

      if (!before && !after) {
        const { data: buildingData } = await supabase
          .rpc('get_building_audit_data', { p_building_number: buildingNumber });
        after = buildingData;
      }

      // Get current user if not provided
      const currentUserName = userName || await getCurrentUserName();

      const result = await api.auditLog.logEntry({
        action_type: actionType,
        entity_type: 'building',
        entity_id: buildingNumber.toString(),
        before_data: before,
        after_data: after,
        description,
      });
      return { action_id: result.action_id };
    },
    logAssetAction: async (
      assetId: number,
      actionType: 'manual_update' | 'import_file' | 'transfer_area' | 'distribute_shared',
      beforeData?: any,
      afterData?: any,
      description?: string,
      userName?: string
    ): Promise<{ action_id: number }> => {
      // Get asset data with building if not provided
      let before = beforeData;
      let after = afterData;

      if (!before && !after) {
        const { data: assetData } = await supabase
          .rpc('get_asset_audit_data', { p_asset_id: assetId });
        after = assetData;
      }

      // Get current user if not provided
      const currentUserName = userName || await getCurrentUserName();

      const result = await api.auditLog.logEntry({
        action_type: actionType,
        entity_type: 'asset',
        entity_id: assetId.toString(),
        before_data: before,
        after_data: after,
        description,
      });
      return { action_id: result.action_id };
    },
    logBulkBuildingAction: async (
      buildingNumbers: number[],
      actionType: 'manual_update' | 'import_file' | 'transfer_area' | 'distribute_shared',
      beforeData?: any,
      afterData?: any,
      description?: string,
      userName?: string
    ): Promise<{ action_id: number }> => {
      // Get current user if not provided
      const currentUserName = userName || await getCurrentUserName();

      const result = await api.auditLog.logEntry({
        action_type: actionType,
        entity_type: 'bulk_building',
        entity_id: buildingNumbers.join(','),
        before_data: beforeData,
        after_data: afterData,
        description,
      });
      return { action_id: result.action_id };
    },
    logBulkAssetAction: async (
      assetIds: number[],
      actionType: 'manual_update' | 'import_file' | 'transfer_area' | 'distribute_shared',
      beforeData?: any,
      afterData?: any,
      description?: string,
      userName?: string
    ): Promise<{ action_id: number }> => {
      // This function is deprecated - use bulk_update_assets_with_audit instead
      // Get current user if not provided
      const currentUserName = userName || await getCurrentUserName();

      const result = await api.auditLog.logEntry({
        action_type: actionType,
        entity_type: 'bulk_asset',
        entity_id: assetIds.join(','),
        before_data: beforeData,
        after_data: afterData,
        description,
      });
      return { action_id: result.action_id };
    },
    bulkUpdateAssets: async (
      assets: Partial<Asset>[],
      actionType: 'manual_update' | 'import_file' | 'transfer_area' | 'distribute_shared',
      beforeData?: any,
      afterData?: any,
      description?: string,
      userName?: string
    ): Promise<{ action_id: number; affected_asset_ids: number[]; count: number }> => {
      const userInfo = await getCurrentUserInfo();
      
      // Convert assets to array (Supabase will convert to JSONB automatically)
      const assetsArray = assets.map(asset => {
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
          business_distribution_area: sanitized.business_distribution_area != null ? sanitized.business_distribution_area : undefined,
        };
      });
      
      const { data, error } = await supabase.rpc('bulk_update_assets_with_audit', {
        p_assets: assetsArray,
        p_action_type: actionType,
        p_user_id: userInfo.user_id || null, // auth_user_id (UUID as text)
        p_before_data: beforeData || null,
        p_after_data: afterData || null,
        p_description: description || null
      });
      
      if (error) throw error;
      
      return {
        action_id: data.action_id,
        affected_asset_ids: data.affected_asset_ids || [],
        count: data.count || 0
      };
    },
    bulkTransferAreas: async (
      oldAssets: Asset[],
      newAssets: Partial<Asset>[],
      actionType: 'transfer_area' = 'transfer_area',
      beforeData?: any,
      afterData?: any,
      description?: string,
      userName?: string
    ): Promise<{ action_id: number; affected_asset_ids: number[]; count: number }> => {
      const userInfo = await getCurrentUserInfo();
      
      // Convert to arrays (Supabase will convert to JSONB automatically)
      const oldAssetsArray = oldAssets.map(asset => ({
        asset_id: asset.asset_id,
        building_number: asset.building_number
      }));
      
      const newAssetsArray = newAssets.map(asset => {
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
        };
      });
      
      const { data, error } = await supabase.rpc('bulk_transfer_areas_with_audit', {
        p_old_assets: oldAssetsArray, // Supabase will convert to JSONB automatically
        p_new_assets: newAssetsArray, // Supabase will convert to JSONB automatically
        p_action_type: actionType,
        p_user_id: userInfo.user_id || null, // auth_user_id (UUID as text)
        p_before_data: beforeData || null,
        p_after_data: afterData || null,
        p_description: description || null
      });
      
      if (error) throw error;
      
      return {
        action_id: data.action_id,
        affected_asset_ids: data.affected_asset_ids || [],
        count: data.count || 0
      };
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
};
