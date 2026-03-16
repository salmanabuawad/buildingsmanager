import { Page, expect } from '@playwright/test';

export const TEST_USER = process.env.TEST_USER || 'admin';
export const TEST_PASSWORD = process.env.TEST_PASSWORD || '';

/**
 * Log in via the login form.
 * Waits for the main dashboard to appear (AG Grid becomes visible).
 */
export async function login(
  page: Page,
  username = TEST_USER,
  password = TEST_PASSWORD,
): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const usernameInput = page.locator('#username');
  const isLoginPage = await usernameInput.isVisible({ timeout: 5000 }).catch(() => false);

  if (!isLoginPage) {
    // Already authenticated in this browser context
    return;
  }

  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');

  // Wait for dashboard — AG Grid is the first sign of successful auth
  await page.waitForSelector('.ag-theme-alpine', { timeout: 20000 });
  await page.waitForLoadState('networkidle');
}

/**
 * Assert that the login page is visible.
 */
export async function expectLoginPage(page: Page): Promise<void> {
  await expect(page.locator('#username')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#password')).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toBeVisible();
}

/**
 * Assert that the user is logged in (dashboard is shown, no login form).
 */
export async function expectDashboard(page: Page): Promise<void> {
  await expect(page.locator('#username')).not.toBeVisible({ timeout: 5000 });
  await expect(page.locator('.ag-theme-alpine')).toBeVisible({ timeout: 15000 });
}
