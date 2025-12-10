/**
 * Global registry for grid save functions
 * Allows grids to register their save functions so they can be called when "Save All Grid States" is clicked
 */

type GridSaveFunction = () => Promise<void> | void;

class GridRegistry {
  private saveFunctions: Map<string, GridSaveFunction> = new Map();

  /**
   * Register a grid's save function
   * @param gridName - Unique identifier for the grid
   * @param saveFunction - Function to call to save the grid's current state
   */
  register(gridName: string, saveFunction: GridSaveFunction) {
    this.saveFunctions.set(gridName, saveFunction);
  }

  /**
   * Unregister a grid's save function
   * @param gridName - Unique identifier for the grid
   */
  unregister(gridName: string) {
    this.saveFunctions.delete(gridName);
  }

  /**
   * Get all registered grid names
   */
  getRegisteredGrids(): string[] {
    return Array.from(this.saveFunctions.keys());
  }

  /**
   * Save all registered grids
   */
  async saveAll(): Promise<{ saved: number; errors: string[] }> {
    const errors: string[] = [];
    let saved = 0;

    for (const [gridName, saveFunction] of this.saveFunctions.entries()) {
      try {
        await saveFunction();
        saved++;
      } catch (error) {
        errors.push(`${gridName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { saved, errors };
  }

  /**
   * Save a specific grid by name
   */
  async saveGrid(gridName: string): Promise<void> {
    const saveFunction = this.saveFunctions.get(gridName);
    if (saveFunction) {
      await saveFunction();
    }
  }
}

// Export singleton instance
export const gridRegistry = new GridRegistry();

