/**
 * Common selectors for E2E tests
 * Centralized selectors to make tests more maintainable
 */

export const selectors = {
  // Navigation
  sidebar: '[data-testid="sidebar"]',
  sidebarToggle: 'button[aria-label*="menu"], button[aria-label*="Menu"]',
  
  // Buildings
  buildingsTab: 'text=מבנים',
  buildingsList: '[data-testid="buildings-list"]',
  buildingsGrid: '.ag-theme-alpine',
  buildingRow: '.ag-row',
  
  // Assets
  assetsTab: 'text=נכסים',
  assetsList: '[data-testid="assets-list"]',
  assetsGrid: '.ag-theme-alpine',
  assetRow: '.ag-row',
  
  // Import
  importBuildingsButton: 'text=ייבוא מבנים',
  importAssetsButton: 'text=ייבוא מלא',
  fileInput: 'input[type="file"]',
  uploadButton: 'button:has-text("העלאה"), button:has-text("Upload")',
  
  // Buttons
  saveButton: 'button:has-text("שמירה"), button:has-text("Save")',
  cancelButton: 'button:has-text("ביטול"), button:has-text("Cancel")',
  deleteButton: 'button:has-text("מחיקה"), button:has-text("Delete")',
  
  // Distribution
  distributeBusinessButton: 'button:has-text("חלוקת שטח עסקי משותף"), button:has-text("Distribute business shared area")',
  distributeResidenceButton: 'button:has-text("חלוקת שטח מגורים משותף"), button:has-text("Distribute residence shared area")',
  
  // Modals
  modal: '[role="dialog"], .modal',
  modalClose: 'button[aria-label*="close"], button:has-text("×")',
  
  // Loading
  loader: '.loading, [data-testid="loader"]',
  
  // Tax region tabs
  taxRegionTab: (region: string) => `text=${region}`,
  
  // Building selection
  buildingSelectButton: (buildingNumber: number) => `button:has-text("${buildingNumber}")`,
  
  // Grid cells
  gridCell: (rowIndex: number, colId: string) => 
    `.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="${colId}"]`,
} as const;

import { Page } from '@playwright/test';

/**
 * Login helper — fills username/password and submits the login form.
 * Reads credentials from env vars TEST_USER_NAME / TEST_PASSWORD.
 */
export async function login(page: Page) {
  const username = process.env.TEST_USER_NAME || 'tester';
  const password = process.env.TEST_PASSWORD || 'tester123';
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // If already logged in (grid visible), skip login
  const alreadyIn = await page.locator('.ag-theme-alpine').isVisible({ timeout: 2000 }).catch(() => false);
  if (alreadyIn) return;
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  await page.waitForSelector('.ag-theme-alpine', { timeout: 30000 });
}

/**
 * Helper to wait for element with retry
 */
export async function waitForElement(
  page: Page,
  selector: string,
  options?: { timeout?: number; visible?: boolean }
) {
  const { timeout = 30000, visible = true } = options || {};
  return page.waitForSelector(selector, { state: visible ? 'visible' : 'attached', timeout });
}

/**
 * Helper to wait for grid to load
 */
export async function waitForGrid(page: Page) {
  await page.waitForSelector('.ag-theme-alpine', { timeout: 30000 });
  await page.waitForLoadState('networkidle');
}

