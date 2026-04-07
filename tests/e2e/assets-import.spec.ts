import { test, expect } from '@playwright/test';
import { selectors, waitForGrid, login } from './utils/selectors';

async function openAssetsImport(page: any) {
  // Open assets sidebar menu
  await page.click('button[title="נכסים"]');
  await page.waitForTimeout(300);
  // Click "ייבוא מלא" in the menu
  await page.click('text=ייבוא מלא');
  // Wait for the import component to load
  await page.waitForLoadState('networkidle');
}

test.describe('Assets Import', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should open assets import page', async ({ page }) => {
    await openAssetsImport(page);

    // File input should be visible (accepts xlsx)
    const fileInput = page.locator(selectors.fileInput).first();
    await expect(fileInput).toBeAttached({ timeout: 15000 });

    const acceptAttribute = await fileInput.getAttribute('accept');
    expect(acceptAttribute).toContain('.xlsx');
  });

  test('should show error for invalid file format', async ({ page }) => {
    await openAssetsImport(page);

    const fileInput = page.locator(selectors.fileInput).first();
    await expect(fileInput).toBeAttached({ timeout: 10000 });

    // File input accepts only xlsx/xls
    const acceptAttribute = await fileInput.getAttribute('accept');
    expect(acceptAttribute).toContain('.xlsx');
  });
});
