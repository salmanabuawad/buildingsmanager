import { api } from './api';
import { GridColumnState } from './useGridPreferences';
import { gridRegistry } from './gridRegistry';

/**
 * Known grid names in the system
 */
export const GRID_NAMES = {
  BUILDINGS_LIST: 'buildings-list',
  ASSETS_LIST: 'assets-list',
  ASSET_TYPES: 'asset-types',
  VALIDATION_RULES: 'validation-rules',
  ADDRESS_LIST: 'address-list',
  ADMIN_PDF_MANAGER: 'admin-pdf-manager',
  ASSET_DATA_ENTRY: 'asset-data-entry',
  ASSETS_FILE_IMPORT: 'assets-file-import',
  TRANSFER_AREAS: 'transfer-areas',
  ASSET_DETAILS_MAIN: 'asset-details-main',
  ASSET_DETAILS_HISTORY: 'asset-details-history',
} as const;

/**
 * Save all grid states to user preferences
 * This function saves the current state of all registered grids
 * It calls each grid's save function to save the current DOM state
 */
export async function saveAllGridStates(userId: string = 'default'): Promise<{
  saved: number;
  errors: string[];
}> {
  // Save all currently registered grids (those that are mounted and visible)
  const result = await gridRegistry.saveAll();
  return result;
}

/**
 * Get all saved grid states
 */
export async function getAllGridStates(userId: string = 'default'): Promise<Record<string, GridColumnState[]>> {
  const states: Record<string, GridColumnState[]> = {};
  const gridKeys = Object.values(GRID_NAMES);

  for (const gridName of gridKeys) {
    try {
      const preferenceKey = `grid-${gridName}`;
      const state = await api.userPreferences.get(userId, preferenceKey);
      if (state && Array.isArray(state)) {
        states[gridName] = state;
      }
    } catch (error) {
      console.error(`Error loading grid state for ${gridName}:`, error);
    }
  }

  return states;
}

/**
 * Clear all grid states
 * This clears all preferences that start with "grid-" to handle both static and dynamic grid names
 */
export async function clearAllGridStates(userId: string = 'default'): Promise<void> {
  try {
    // Get all user preferences
    const { data, error } = await api.userPreferences.getAll(userId);
    
    if (error) {
      throw error;
    }
    
    if (!data) {
      return;
    }
    
    // Filter to only grid preferences (those starting with "grid-")
    const gridPreferences = data.filter((pref: any) => 
      pref.preference_key && pref.preference_key.startsWith('grid-')
    );
    
    // Delete each grid preference
    for (const pref of gridPreferences) {
      try {
        await api.userPreferences.delete(userId, pref.preference_key);
      } catch (error) {
        console.error(`Error clearing grid state for ${pref.preference_key}:`, error);
      }
    }
  } catch (error) {
    console.error('Error getting user preferences for clearing:', error);
    throw error;
  }
}

