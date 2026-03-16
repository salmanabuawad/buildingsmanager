/**
 * Common selectors for E2E tests.
 * Centralised here to make tests maintainable.
 */

export const selectors = {
  // ── Auth ─────────────────────────────────────────────────────────────────
  usernameInput: '#username',
  passwordInput: '#password',
  loginSubmit: 'button[type="submit"]',
  loginError: '[class*="bg-red-50"]',
  otpToggle: 'button:has-text("התחבר עם קוד מהמייל")',
  otpInput: '#otp',
  backToPasswordToggle: 'button:has-text("התחבר עם שם משתמש וסיסמה")',

  // ── Navigation ────────────────────────────────────────────────────────────
  sidebar: '[data-testid="sidebar"]',
  sidebarToggle: 'button[aria-label*="menu"], button[aria-label*="Menu"]',

  // ── Tabs ──────────────────────────────────────────────────────────────────
  buildingsTab: 'text=מבנים',
  assetsTab: 'text=נכסים',

  // ── AG Grid shared ────────────────────────────────────────────────────────
  agGrid: '.ag-theme-alpine',
  agRow: '.ag-row',
  agLoadingOverlay: '.ag-overlay-loading-center',
  agNoRowsOverlay: '.ag-overlay-no-rows-center',
  agHeaderCell: '.ag-header-cell',

  // ── Buildings ─────────────────────────────────────────────────────────────
  buildingsList: '[data-testid="buildings-list"]',
  buildingsGrid: '.ag-theme-alpine',
  buildingRow: '.ag-row',

  // ── Assets ────────────────────────────────────────────────────────────────
  assetsList: '[data-testid="assets-list"]',
  assetsGrid: '.ag-theme-alpine',
  assetRow: '.ag-row',

  // ── Asset Search ──────────────────────────────────────────────────────────
  searchResultsHeading: 'h2',

  // ── Import ────────────────────────────────────────────────────────────────
  importBuildingsButton: 'text=ייבוא מבנים',
  importAssetsButton: 'text=ייבוא מלא',
  fileInput: 'input[type="file"]',
  uploadButton: 'button:has-text("העלאה"), button:has-text("Upload")',

  // ── Generic buttons ───────────────────────────────────────────────────────
  saveButton: 'button:has-text("שמירה"), button:has-text("Save")',
  cancelButton: 'button:has-text("ביטול"), button:has-text("Cancel")',
  deleteButton: 'button:has-text("מחיקה"), button:has-text("Delete")',

  // ── Distribution ──────────────────────────────────────────────────────────
  distributeBusinessButton: 'button:has-text("חלוקת שטח עסקי משותף"), button:has-text("Distribute business shared area")',
  distributeResidenceButton: 'button:has-text("חלוקת שטח מגורים משותף"), button:has-text("Distribute residence shared area")',

  // ── Modals ────────────────────────────────────────────────────────────────
  modal: '[role="dialog"], .modal',
  modalClose: 'button[aria-label*="close"], button:has-text("×")',

  // ── Loading ───────────────────────────────────────────────────────────────
  loader: '.loading, [data-testid="loader"]',

  // ── Helpers ───────────────────────────────────────────────────────────────
  taxRegionTab: (region: string) => `text=${region}`,
  buildingSelectButton: (buildingNumber: number) => `button:has-text("${buildingNumber}")`,
  gridCell: (rowIndex: number, colId: string) =>
    `.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="${colId}"]`,
} as const;

import { Page } from '@playwright/test';

/**
 * Wait for at least one AG Grid to appear and for its loading overlay to clear.
 */
export async function waitForGrid(page: Page, timeout = 30_000): Promise<void> {
  await page.waitForSelector('.ag-theme-alpine', { timeout });
  await page
    .waitForFunction(() => !document.querySelector('.ag-overlay-loading-center'), { timeout })
    .catch(() => {/* overlay may never appear — that is fine */});
  await page.waitForLoadState('networkidle');
}

/**
 * Wait for a selector, returning null instead of throwing if it never appears.
 */
export async function waitForElement(
  page: Page,
  selector: string,
  options?: { timeout?: number; visible?: boolean },
) {
  const { timeout = 30_000, visible = true } = options ?? {};
  return page
    .waitForSelector(selector, { state: visible ? 'visible' : 'attached', timeout })
    .catch(() => null);
}
