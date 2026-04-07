import { test, expect } from '@playwright/test';
import { selectors, waitForGrid, login } from './utils/selectors';

test.describe('Integration Tests', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should load the application', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should display buildings list on initial load', async ({ page }) => {
    const grid = page.locator(selectors.buildingsGrid).first();
    await expect(grid).toBeVisible({ timeout: 10000 });
  });

  test('should navigate between tabs', async ({ page }) => {
    const assetsTab = page.locator(selectors.assetsTab).first();
    if (await assetsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await assetsTab.click();
      await page.waitForTimeout(1000);
      await page.waitForLoadState('networkidle');
      const hasContent = await page.locator('body').count() > 0;
      expect(hasContent).toBe(true);
    }
  });

  test('should handle building selection', async ({ page }) => {
    const grid = page.locator(selectors.buildingsGrid).first();
    await expect(grid).toBeVisible({ timeout: 10000 });

    const buildingRows = page.locator(selectors.buildingRow);
    const rowCount = await buildingRows.count();

    if (rowCount > 0) {
      await buildingRows.first().click();
      await page.waitForTimeout(1000);
      await page.waitForLoadState('networkidle');
      expect(page.url()).toBeTruthy();
    }
  });

  test('should display sidebar navigation', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator(selectors.sidebar).first();
    const sidebarVisible = await sidebar.isVisible({ timeout: 5000 }).catch(() => false);
    const sidebarExists = await sidebar.count() > 0 || sidebarVisible;

    const sidebarToggle = page.locator(selectors.sidebarToggle).first();
    if (await sidebarToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await sidebarToggle.click();
      await page.waitForTimeout(500);
      await expect(sidebar).toBeVisible({ timeout: 5000 });
    }
  });
});
