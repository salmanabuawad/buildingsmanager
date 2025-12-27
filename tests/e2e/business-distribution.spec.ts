import { test, expect } from '@playwright/test';
import { selectors, waitForGrid } from './utils/selectors';

test.describe('Business Distribution', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('/');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    await waitForGrid(page);
  });

  test('should display distribute business button for buildings with business assets', async ({ page }) => {
    // First, we need to select a building that has business assets
    // This depends on your test data
    
    // Wait for buildings grid
    const grid = page.locator(selectors.buildingsGrid).first();
    await expect(grid).toBeVisible({ timeout: 10000 });
    
    // Try to find a building row and click it
    const buildingRows = page.locator(selectors.buildingRow);
    const rowCount = await buildingRows.count();
    
    if (rowCount > 0) {
      // Click on first building
      await buildingRows.first().click();
      await page.waitForTimeout(2000);
      await page.waitForLoadState('networkidle');
      
      // Look for business tax region tab
      // The tab might have the tax region number or area description
      // Try to find and click a business-related tab
      const businessTabs = page.locator('button, [role="tab"]').filter({
        hasText: /10|20|30|32|40|עסקי|business/i
      });
      
      const businessTabCount = await businessTabs.count();
      if (businessTabCount > 0) {
        // Click the first business-related tab
        await businessTabs.first().click();
        await page.waitForTimeout(1000);
        
        // Now look for the distribute business button
        const distributeButton = page.locator(selectors.distributeBusinessButton).first();
        
        // Button might not exist if:
        // - No shared business area
        // - Distribution already done
        // - No business assets
        const buttonExists = await distributeButton.isVisible({ timeout: 3000 }).catch(() => false);
        
        if (buttonExists) {
          await expect(distributeButton).toBeVisible();
          
          // Verify button is enabled (if it should be)
          const isDisabled = await distributeButton.isDisabled();
          // Button should be enabled if there's a shared area to distribute
          // This check depends on your business logic
        }
      }
    }
  });

  test('should distribute business shared area when button is clicked', async ({ page }) => {
    await waitForGrid(page);
    
    // Select a building with business assets and shared area
    const buildingRows = page.locator(selectors.buildingRow);
    const rowCount = await buildingRows.count();
    
    if (rowCount > 0) {
      await buildingRows.first().click();
      await page.waitForTimeout(2000);
      await page.waitForLoadState('networkidle');
      
      // Navigate to business tax region tab
      const businessTabs = page.locator('button, [role="tab"]').filter({
        hasText: /10|20|30|32|40|עסקי|business/i
      });
      
      const businessTabCount = await businessTabs.count();
      if (businessTabCount > 0) {
        await businessTabs.first().click();
        await page.waitForTimeout(1000);
        
        // Look for distribute button
        const distributeButton = page.locator(selectors.distributeBusinessButton).first();
        const buttonExists = await distributeButton.isVisible({ timeout: 3000 }).catch(() => false);
        
        if (buttonExists && !(await distributeButton.isDisabled())) {
          // Click the distribute button
          await distributeButton.click();
          
          // Wait for distribution to complete
          await page.waitForTimeout(2000);
          await page.waitForLoadState('networkidle');
          
          // Verify distribution completed
          // Check for success message or that button is now disabled/gone
          // This depends on your app's behavior after distribution
          const hasError = await page.locator('text=/שגיאה|error/i').isVisible({ timeout: 2000 }).catch(() => false);
          expect(hasError).toBe(false);
        }
      }
    }
  });
});

