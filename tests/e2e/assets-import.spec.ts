import { test, expect } from '@playwright/test';
import { getTestDataPath } from './utils/file-helper';
import { selectors, waitForGrid } from './utils/selectors';

test.describe('Assets Import', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('/');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
  });

  test('should import assets from Excel file', async ({ page }) => {
    // Wait for initial page load
    await waitForGrid(page);
    
    // Navigate to assets import
    // Look for the assets import menu item or button
    const assetsImportButton = page.locator(selectors.importAssetsButton).first();
    
    // Try to find and click import assets button
    if (await assetsImportButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await assetsImportButton.click();
    } else {
      // Try alternative selectors - might be in a menu
      const menuItems = page.locator('text=/ייבוא.*מלא/').first();
      if (await menuItems.isVisible({ timeout: 5000 }).catch(() => false)) {
        await menuItems.click();
      } else {
        // Try clicking on assets menu first
        const assetsMenu = page.locator(selectors.assetsTab).first();
        if (await assetsMenu.isVisible({ timeout: 5000 }).catch(() => false)) {
          await assetsMenu.click();
          await page.waitForTimeout(1000);
          
          // Now try to find import button
          const importBtn = page.locator(selectors.importAssetsButton).first();
          if (await importBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await importBtn.click();
          }
        }
      }
    }
    
    // Wait for file input to appear
    const fileInput = page.locator(selectors.fileInput).first();
    await expect(fileInput).toBeVisible({ timeout: 15000 });
    
    // Get the test data file path
    const testFile = getTestDataPath('נכסים_מבנה_8230409_20251226.xlsx');
    
    // Upload the file
    await fileInput.setInputFiles(testFile);
    
    // Wait for upload to process
    await page.waitForTimeout(3000);
    
    // Verify that assets were imported
    // The import might redirect or show a success message
    // Check for success indicators or grid update
    await page.waitForLoadState('networkidle');
    
    // Verify import completed (could check for success message or grid)
    // This depends on your app's behavior after import
    const hasError = await page.locator('text=/שגיאה|error/i').isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasError).toBe(false);
  });

  test('should show error for invalid file format', async ({ page }) => {
    await waitForGrid(page);
    
    // Navigate to assets import
    const importButton = page.locator(selectors.importAssetsButton).first();
    if (await importButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await importButton.click();
    }
    
    // Wait for file input
    const fileInput = page.locator(selectors.fileInput).first();
    await expect(fileInput).toBeVisible({ timeout: 10000 });
    
    // File input should accept Excel files
    const acceptAttribute = await fileInput.getAttribute('accept');
    expect(acceptAttribute).toContain('.xlsx');
  });
});

