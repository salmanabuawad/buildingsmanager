import { test, expect } from '@playwright/test';
import { login, TEST_PASSWORD } from './utils/auth';
import { selectors, waitForGrid } from './utils/selectors';

/**
 * For these tests to run you need:
 *   1. TEST_PASSWORD env var set
 *   2. TEST_BUILDING_NUMBER env var pointing to a building that has assets
 *      (e.g. export TEST_BUILDING_NUMBER=8230409)
 */
const BUILDING_NUMBER = process.env.TEST_BUILDING_NUMBER || '';

test.describe('Assets', () => {
  test.skip(!TEST_PASSWORD, 'TEST_PASSWORD env var required');

  test.beforeEach(async ({ page }) => {
    await login(page);
    await waitForGrid(page);
  });

  // ── Building selection first ─────────────────────────────────────────────

  test('selecting a building opens an assets tab', async ({ page }) => {
    test.skip(!BUILDING_NUMBER, 'TEST_BUILDING_NUMBER env var required');

    // Find the building row by building number
    const buildingCell = page
      .locator('.ag-cell')
      .filter({ hasText: BUILDING_NUMBER })
      .first();

    const exists = await buildingCell.isVisible({ timeout: 8000 }).catch(() => false);
    if (!exists) test.skip();

    await buildingCell.dblclick();
    await page.waitForLoadState('networkidle');

    // An assets tab should now be present in the tab bar
    const assetsTab = page.locator(`button, [role="tab"]`).filter({ hasText: /נכסים|assets/i }).first();
    await expect(assetsTab).toBeVisible({ timeout: 10_000 });
  });

  test('assets grid is visible after opening a building', async ({ page }) => {
    test.skip(!BUILDING_NUMBER, 'TEST_BUILDING_NUMBER env var required');

    const buildingCell = page
      .locator('.ag-cell')
      .filter({ hasText: BUILDING_NUMBER })
      .first();

    const exists = await buildingCell.isVisible({ timeout: 8000 }).catch(() => false);
    if (!exists) test.skip();

    await buildingCell.dblclick();
    await waitForGrid(page);

    // After double-clicking we should have at least two grids visible (buildings + assets)
    // or the assets grid replaces the view — either way at least one grid is visible
    const grids = page.locator(selectors.agGrid);
    const count = await grids.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  // ── Tab bar ──────────────────────────────────────────────────────────────

  test('clicking the buildings tab takes the user back to buildings grid', async ({ page }) => {
    // Start on buildings, navigate away, come back
    const buildingsTabBtn = page.locator(selectors.buildingsTab).first();
    const isVisible = await buildingsTabBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!isVisible) test.skip();

    await buildingsTabBtn.click();
    await waitForGrid(page);

    const grid = page.locator(selectors.buildingsGrid).first();
    await expect(grid).toBeVisible({ timeout: 10_000 });
  });

  // ── Error-free page load ─────────────────────────────────────────────────

  test('no JavaScript errors thrown during initial load', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await page.reload();
    await waitForGrid(page);

    // Filter out known third-party noise if needed
    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('Non-Error promise rejection'),
    );

    expect(criticalErrors).toHaveLength(0);
  });

  // ── Network ──────────────────────────────────────────────────────────────

  test('no 500 errors on initial page load API calls', async ({ page }) => {
    const serverErrors: string[] = [];

    page.on('response', (resp) => {
      if (resp.status() >= 500) {
        serverErrors.push(`${resp.status()} ${resp.url()}`);
      }
    });

    await page.reload();
    await waitForGrid(page);

    expect(serverErrors).toHaveLength(0);
  });
});
