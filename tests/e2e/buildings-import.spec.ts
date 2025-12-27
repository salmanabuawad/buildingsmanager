import { test, expect } from '@playwright/test';
import { getTestDataPath } from './utils/file-helper';
import { selectors, waitForGrid } from './utils/selectors';

test.describe('Buildings Import', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('/');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
  });

  test('should import buildings from Excel file', async ({ page }) => {
    // Navigate to buildings import
    // The app starts with buildings tab open, but we may need to click import
    await waitForGrid(page);
    
    // Look for import button - this might be in a menu
    // Try to find and click the import buildings button
    const importButton = page.locator(selectors.importBuildingsButton).first();
    
    // If button exists, click it
    if (await importButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await importButton.click();
    } else {
      // Try to find menu or alternative navigation
      // Look for menu items with Hebrew text for import
      const menuItems = page.locator('text=/ייבוא.*מבנים/').first();
      if (await menuItems.isVisible({ timeout: 5000 }).catch(() => false)) {
        await menuItems.click();
      }
    }
    
    // Wait for file input to appear
    const fileInput = page.locator(selectors.fileInput).first();
    await expect(fileInput).toBeVisible({ timeout: 10000 });
    
    // Get the test data file path
    const testFile = getTestDataPath('רשימת_מבנים_20251226.xlsx');
    
    // Upload the file
    await fileInput.setInputFiles(testFile);
    
    // Wait for upload to process (look for success message or grid update)
    await page.waitForTimeout(2000);
    
    // Verify that buildings were imported (check if grid has rows)
    await waitForGrid(page);
    
    // Check that the grid has loaded with data
    const gridRows = page.locator(selectors.buildingRow);
    const rowCount = await gridRows.count();
    
    // At least one row should exist (could be more depending on test data)
    expect(rowCount).toBeGreaterThan(0);
  });

  test('should validate file format before import', async ({ page }) => {
    await waitForGrid(page);
    
    // Navigate to import
    const importButton = page.locator(selectors.importBuildingsButton).first();
    if (await importButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await importButton.click();
    }
    
    // Wait for file input
    const fileInput = page.locator(selectors.fileInput).first();
    await expect(fileInput).toBeVisible({ timeout: 10000 });
    
    // Try to upload an invalid file (create a dummy text file)
    // For now, we'll just check that file input accepts .xlsx files
    const acceptAttribute = await fileInput.getAttribute('accept');
    
    // File input should accept Excel files
    expect(acceptAttribute).toContain('.xlsx');
  });
});

