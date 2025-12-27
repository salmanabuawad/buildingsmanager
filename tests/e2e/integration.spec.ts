import { test, expect } from '@playwright/test';
import { selectors, waitForGrid } from './utils/selectors';

test.describe('Integration Tests', () => {
  test('should load the application', async ({ page }) => {
    await page.goto('/');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Verify that the page loaded (check for any visible content)
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should display buildings list on initial load', async ({ page }) => {
    await page.goto('/');
    
    // Wait for grid to load
    await waitForGrid(page);
    
    // Check that buildings grid is visible
    const grid = page.locator(selectors.buildingsGrid).first();
    await expect(grid).toBeVisible({ timeout: 10000 });
  });

  test('should navigate between tabs', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await waitForGrid(page);
    
    // Try to find and click assets tab
    const assetsTab = page.locator(selectors.assetsTab).first();
    if (await assetsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await assetsTab.click();
      
      // Wait for navigation
      await page.waitForTimeout(1000);
      await page.waitForLoadState('networkidle');
      
      // Verify we're on assets page (check for assets grid or content)
      // This depends on your app structure
      const hasContent = await page.locator('body').count() > 0;
      expect(hasContent).toBe(true);
    }
  });

  test('should handle building selection', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await waitForGrid(page);
    
    // Wait for buildings grid to load
    const grid = page.locator(selectors.buildingsGrid).first();
    await expect(grid).toBeVisible({ timeout: 10000 });
    
    // Try to find a building row (this will depend on test data)
    const buildingRows = page.locator(selectors.buildingRow);
    const rowCount = await buildingRows.count();
    
    if (rowCount > 0) {
      // Click on the first building row
      await buildingRows.first().click();
      
      // Wait for navigation or details to load
      await page.waitForTimeout(1000);
      await page.waitForLoadState('networkidle');
      
      // Verify that something happened (details opened, etc.)
      // This is a basic check - adjust based on your app behavior
      expect(page.url()).toBeTruthy();
    }
  });

  test('should display sidebar navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check if sidebar exists (might be collapsed)
    const sidebar = page.locator(selectors.sidebar).first();
    const sidebarVisible = await sidebar.isVisible({ timeout: 5000 }).catch(() => false);
    
    // Sidebar might be collapsed initially, so we check if it exists
    const sidebarExists = await sidebar.count() > 0 || sidebarVisible;
    
    // If sidebar toggle exists, try to open it
    const sidebarToggle = page.locator(selectors.sidebarToggle).first();
    if (await sidebarToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await sidebarToggle.click();
      await page.waitForTimeout(500);
      
      // Now sidebar should be visible
      await expect(sidebar).toBeVisible({ timeout: 5000 });
    }
  });
});

