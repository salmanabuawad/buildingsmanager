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

  // Use requestAnimationFrame to ensure DOM is ready
  requestAnimationFrame(() => {
    // Check all header cells
    const headerCells = document.querySelectorAll('.ag-header-cell-label');
    headerCells.forEach((headerCell) => {
      const element = headerCell as HTMLElement;
      if (isTextOverflowing(element)) {
        headerCell.classList.add('text-overflow');
      } else {
        headerCell.classList.remove('text-overflow');
      }
    });

    // Check all data cells
    const cells = document.querySelectorAll('.ag-cell');
    cells.forEach((cell) => {
      const element = cell as HTMLElement;
      if (isTextOverflowing(element)) {
        cell.classList.add('text-overflow');
      } else {
        cell.classList.remove('text-overflow');
      }
    });
  });
}

/**
 * Set up mutation observer to detect overflow changes
 */
export function setupTextOverflowObserver(gridApi: any) {
  if (!gridApi) return;

  const observer = new MutationObserver(() => {
    detectAndApplyTextOverflow(gridApi);
  });

  // Observe the grid container for changes
  const gridContainer = document.querySelector('.ag-theme-alpine');
  if (gridContainer) {
    observer.observe(gridContainer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });
  }

  // Also check on column resize
  gridApi.addEventListener('columnResized', () => {
    setTimeout(() => detectAndApplyTextOverflow(gridApi), 100);
  });

  // Check on data changes
  gridApi.addEventListener('modelUpdated', () => {
    setTimeout(() => detectAndApplyTextOverflow(gridApi), 100);
  });

  return observer;
}

