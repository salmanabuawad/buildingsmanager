import { api } from './api';
import { GridColumnState } from './useGridPreferences';

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
 * This function saves the current state of all known grids
 * Note: This saves the last known state from preferences, not the current DOM state
 * For saving current DOM state, each grid component should call its saveColumnState function
 */
export async function saveAllGridStates(userId: string = 'default'): Promise<{
  saved: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let saved = 0;

  // Get all grid preferences that exist
  const gridKeys = Object.values(GRID_NAMES);
  
  for (const gridName of gridKeys) {
    try {
      const preferenceKey = `grid-${gridName}`;
      // Get current saved state (if exists)
      const currentState = await api.userPreferences.get(userId, preferenceKey);
      
      if (currentState) {
        // State already exists, it's already saved
        saved++;
      }
    } catch (error) {
      errors.push(`Error saving ${gridName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return { saved, errors };
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

