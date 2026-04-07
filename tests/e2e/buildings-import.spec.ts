import { test, expect } from '@playwright/test';
import { selectors, waitForGrid, login } from './utils/selectors';

async function openBuildingsImport(page: any) {
  // Open buildings sidebar menu
  await page.click('button[title="מבנים"]');
  await page.waitForTimeout(300);
  // Click "ייבוא File" in the menu
  await page.click('text=ייבוא File');
  // Wait for the import component to load
  await page.waitForLoadState('networkidle');
}

test.describe('Buildings Import', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should open buildings import page', async ({ page }) => {
    await openBuildingsImport(page);

    // File input should be visible (accepts csv)
    const fileInput = page.locator(selectors.fileInput).first();
    await expect(fileInput).toBeAttached({ timeout: 10000 });

    const acceptAttribute = await fileInput.getAttribute('accept');
    expect(acceptAttribute).toContain('.csv');
  });

  test('should validate file format before import', async ({ page }) => {
    await openBuildingsImport(page);

    const fileInput = page.locator(selectors.fileInput).first();
    await expect(fileInput).toBeAttached({ timeout: 10000 });

    const acceptAttribute = await fileInput.getAttribute('accept');
    expect(acceptAttribute).toContain('.csv');
  });
});
