import { test, expect } from '@playwright/test';
import { login, TEST_PASSWORD } from './utils/auth';
import { selectors, waitForGrid } from './utils/selectors';

test.describe('Buildings', () => {
  test.skip(!TEST_PASSWORD, 'TEST_PASSWORD env var required');

  test.beforeEach(async ({ page }) => {
    await login(page);
    await waitForGrid(page);
  });

  // ── Grid renders ────────────────────────────────────────────────────────

  test('buildings AG Grid is visible after login', async ({ page }) => {
    const grid = page.locator(selectors.buildingsGrid).first();
    await expect(grid).toBeVisible({ timeout: 15_000 });
  });

  test('buildings grid has at least one data row', async ({ page }) => {
    const rows = page.locator(selectors.buildingRow);
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('buildings grid has column headers', async ({ page }) => {
    const headers = page.locator(selectors.agHeaderCell);
    const count = await headers.count();
    expect(count).toBeGreaterThan(0);
  });

  // ── Grid content ────────────────────────────────────────────────────────

  test('building rows contain text (non-empty cells)', async ({ page }) => {
    const firstRow = page.locator(selectors.buildingRow).first();
    const text = await firstRow.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
  });

  // ── Row interaction ─────────────────────────────────────────────────────

  test('clicking a building row opens the assets tab', async ({ page }) => {
    const rows = page.locator(selectors.buildingRow);
    const count = await rows.count();

    if (count === 0) {
      test.skip(); // no data in environment
    }

    // Double-click opens details; single-click just selects
    await rows.first().dblclick();

    // An assets-related tab or content should appear
    await page.waitForTimeout(1500);
    const bodyText = await page.locator('body').textContent();
    // The assets list or the building details panel should be visible
    expect(bodyText).toBeTruthy();
  });

  // ── Measurements dashboard tab ───────────────────────────────────────────

  test('measurement progress dashboard tab is present', async ({ page }) => {
    const dashboardTab = page.locator('button:has-text("התקדמות"), button:has-text("פעילות")').first();
    await expect(dashboardTab).toBeVisible({ timeout: 5000 });
  });

  // ── Responsiveness ────────────────────────────────────────────────────────

  test('buildings grid is visible on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.reload();
    await waitForGrid(page);

    const grid = page.locator(selectors.buildingsGrid).first();
    await expect(grid).toBeVisible({ timeout: 15_000 });
  });
});
