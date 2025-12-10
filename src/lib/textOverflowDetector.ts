/**
 * Utility to detect text overflow and add fade class to cells and headers
 */

/**
 * Check if an element's text overflows its container
 */
function isTextOverflowing(element: HTMLElement): boolean {
  return element.scrollWidth > element.clientWidth;
}

/**
 * Add fade class to cells and headers that have overflowing text
 */
export function detectAndApplyTextOverflow(gridApi: any) {
  if (!gridApi) return;

  try {
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      try {
        // Check all header cells
        const headerCells = document.querySelectorAll('.ag-header-cell-label');
        headerCells.forEach((headerCell) => {
          try {
            const element = headerCell as HTMLElement;
            if (element && isTextOverflowing(element)) {
              headerCell.classList.add('text-overflow');
            } else {
              headerCell.classList.remove('text-overflow');
            }
          } catch (e) {
            // Silently ignore errors on individual cells
          }
        });

        // Check all data cells
        const cells = document.querySelectorAll('.ag-cell');
        cells.forEach((cell) => {
          try {
            const element = cell as HTMLElement;
            if (element && isTextOverflowing(element)) {
              cell.classList.add('text-overflow');
            } else {
              cell.classList.remove('text-overflow');
            }
          } catch (e) {
            // Silently ignore errors on individual cells
          }
        });
      } catch (e) {
        // Silently ignore errors during DOM manipulation
      }
    });
  } catch (e) {
    // Silently ignore errors
  }
}

/**
 * Set up mutation observer to detect overflow changes
 */
export function setupTextOverflowObserver(gridApi: any) {
  if (!gridApi) return null;

  try {
    const observer = new MutationObserver(() => {
      try {
        detectAndApplyTextOverflow(gridApi);
      } catch (e) {
        // Silently ignore errors in observer callback
      }
    });

    // Observe the grid container for changes
    const gridContainer = document.querySelector('.ag-theme-alpine');
    if (gridContainer) {
      try {
        observer.observe(gridContainer, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['style', 'class']
        });
      } catch (e) {
        // Silently ignore observer setup errors
      }
    }

    // Also check on column resize
    try {
      gridApi.addEventListener('columnResized', () => {
        setTimeout(() => {
          try {
            detectAndApplyTextOverflow(gridApi);
          } catch (e) {
            // Silently ignore errors
          }
        }, 100);
      });
    } catch (e) {
      // Silently ignore event listener errors
    }

    // Check on data changes
    try {
      gridApi.addEventListener('modelUpdated', () => {
        setTimeout(() => {
          try {
            detectAndApplyTextOverflow(gridApi);
          } catch (e) {
            // Silently ignore errors
          }
        }, 100);
      });
    } catch (e) {
      // Silently ignore event listener errors
    }

    return observer;
  } catch (e) {
    // Silently ignore observer setup errors
    return null;
  }
}

