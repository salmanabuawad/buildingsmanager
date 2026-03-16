import { test, expect } from '@playwright/test';
import { login, TEST_PASSWORD } from './utils/auth';
import { waitForGrid } from './utils/selectors';

/**
 * Optional env vars:
 *   TEST_ASSET_FROM   - lower bound for asset search range (default: 1)
 *   TEST_ASSET_TO     - upper bound for asset search range (default: 9999999999)
 */
const FROM_ID = process.env.TEST_ASSET_FROM || '1';
const TO_ID = process.env.TEST_ASSET_TO || '9999999999';

test.describe('Asset Search', () => {
  test.skip(!TEST_PASSWORD, 'TEST_PASSWORD env var required');

  async function openAssetSearch(page: import('@playwright/test').Page) {
    await login(page);
    await waitForGrid(page);

    // Navigate to Asset Search tab
    const searchTab = page
      .locator('button, [role="tab"]')
      .filter({ hasText: /חיפוש נכסים|asset search/i })
      .first();

    const tabVisible = await searchTab.isVisible({ timeout: 8000 }).catch(() => false);
    if (!tabVisible) {
      // Try clicking through a menu
      const menu = page.locator('button').filter({ hasText: /נכסים|assets/i }).first();
      if (await menu.isVisible({ timeout: 3000 }).catch(() => false)) {
        await menu.click();
        await page.waitForTimeout(500);
      }
    }

    const tab = page
      .locator('button, [role="tab"]')
      .filter({ hasText: /חיפוש נכסים|asset search/i })
      .first();

    await tab.click();
    await page.waitForLoadState('networkidle');
  }

  // ── Search form visibility ────────────────────────────────────────────────

  test('asset search tab renders search form inputs', async ({ page }) => {
    await openAssetSearch(page);

    const inputs = page.locator('input[type="number"]');
    const count = await inputs.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('search button is disabled when inputs are empty', async ({ page }) => {
    await openAssetSearch(page);

    // Clear both inputs
    const inputs = page.locator('input[type="number"]');
    for (let i = 0; i < await inputs.count(); i++) {
      await inputs.nth(i).fill('');
    }

    const submitBtn = page.locator('button[type="submit"]').first();
    await expect(submitBtn).toBeDisabled();
  });

  test('search button is enabled when both inputs are filled', async ({ page }) => {
    await openAssetSearch(page);

    const inputs = page.locator('input[type="number"]');
    await inputs.first().fill('1');
    await inputs.last().fill('100');

    const submitBtn = page.locator('button[type="submit"]').first();
    await expect(submitBtn).toBeEnabled();
  });

  // ── Search execution ─────────────────────────────────────────────────────

  test('submitting search shows results section', async ({ page }) => {
    await openAssetSearch(page);

    const inputs = page.locator('input[type="number"]');
    await inputs.first().fill(FROM_ID);
    await inputs.last().fill(TO_ID);

    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // Results heading must appear regardless of row count
    const heading = page.locator('h2').filter({ hasText: /results|תוצאות/i }).first();
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });

  test('search results show row count in heading', async ({ page }) => {
    await openAssetSearch(page);

    const inputs = page.locator('input[type="number"]');
    await inputs.first().fill(FROM_ID);
    await inputs.last().fill(TO_ID);

    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // Heading should contain a parenthesised count, e.g. "Search Results (42)"
    const heading = page.locator('h2').filter({ hasText: /\(\d+\)/ }).first();
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });

  test('results with data render AG Grid', async ({ page }) => {
    await openAssetSearch(page);

    const inputs = page.locator('input[type="number"]');
    await inputs.first().fill(FROM_ID);
    await inputs.last().fill(TO_ID);

    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    const heading = page.locator('h2').filter({ hasText: /\(\d+\)/ }).first();
    await heading.waitFor({ timeout: 15_000 });

    const headingText = await heading.textContent() ?? '';
    const match = headingText.match(/\((\d+)\)/);
    const resultCount = match ? parseInt(match[1], 10) : 0;

    if (resultCount > 0) {
      const grid = page.locator('.ag-theme-alpine').last();
      await expect(grid).toBeVisible({ timeout: 10_000 });

      const rows = grid.locator('.ag-row');
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThan(0);
    }
  });

  test('results with data render View Details button in each row', async ({ page }) => {
    await openAssetSearch(page);

    const inputs = page.locator('input[type="number"]');
    await inputs.first().fill(FROM_ID);
    await inputs.last().fill(TO_ID);

    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    const heading = page.locator('h2').filter({ hasText: /\(\d+\)/ }).first();
    await heading.waitFor({ timeout: 15_000 });

    const headingText = await heading.textContent() ?? '';
    const match = headingText.match(/\((\d+)\)/);
    const resultCount = match ? parseInt(match[1], 10) : 0;

    if (resultCount > 0) {
      const viewDetailsBtn = page
        .locator('button')
        .filter({ hasText: /View Details|פרטים|צפה/i })
        .first();
      await expect(viewDetailsBtn).toBeVisible({ timeout: 10_000 });
    }
  });

  test('no results shows empty-state message', async ({ page }) => {
    await openAssetSearch(page);

    // Use an impossible range (negative-looking large numbers won't work with
    // the HTML number input min, so use a very narrow specific range that is
    // unlikely to have assets)
    const inputs = page.locator('input[type="number"]');
    await inputs.first().fill('1');
    await inputs.last().fill('1');

    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // Either the count is (0) or an empty-state icon/message appears
    const heading = page.locator('h2').filter({ hasText: /\(0\)/ }).first();
    const emptyMsg = page.locator('text=/No assets found|לא נמצאו נכסים/i').first();

    const headingVisible = await heading.isVisible({ timeout: 10_000 }).catch(() => false);
    const emptyVisible = await emptyMsg.isVisible({ timeout: 3000 }).catch(() => false);

    expect(headingVisible || emptyVisible).toBe(true);
  });

  // ── Reset ────────────────────────────────────────────────────────────────

  test('reset button clears results and inputs', async ({ page }) => {
    await openAssetSearch(page);

    const inputs = page.locator('input[type="number"]');
    await inputs.first().fill(FROM_ID);
    await inputs.last().fill(TO_ID);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // Wait for results to appear
    await page.locator('h2').filter({ hasText: /results|תוצאות/i }).first().waitFor({ timeout: 15_000 });

    // Click Reset
    const resetBtn = page.locator('button').filter({ hasText: /Reset|איפוס/i }).first();
    await resetBtn.click();

    // Results section should be gone
    const resultsSection = page.locator('h2').filter({ hasText: /results|תוצאות/i }).first();
    await expect(resultsSection).not.toBeVisible({ timeout: 5000 });

    // Inputs should be empty
    const fromVal = await inputs.first().inputValue();
    const toVal = await inputs.last().inputValue();
    expect(fromVal).toBe('');
    expect(toVal).toBe('');
  });

  // ── AG Grid column headers ────────────────────────────────────────────────

  test('results grid contains expected column headers', async ({ page }) => {
    await openAssetSearch(page);

    const inputs = page.locator('input[type="number"]');
    await inputs.first().fill(FROM_ID);
    await inputs.last().fill(TO_ID);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    const heading = page.locator('h2').filter({ hasText: /\(\d+\)/ }).first();
    await heading.waitFor({ timeout: 15_000 });
    const headingText = await heading.textContent() ?? '';
    const match = headingText.match(/\((\d+)\)/);

    if (match && parseInt(match[1], 10) > 0) {
      const grid = page.locator('.ag-theme-alpine').last();
      await expect(grid).toBeVisible();

      // Check for at least some column headers
      const headers = grid.locator('.ag-header-cell');
      const headerCount = await headers.count();
      expect(headerCount).toBeGreaterThanOrEqual(3);
    }
  });
});
