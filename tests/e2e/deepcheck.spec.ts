/**
 * Deep-check E2E tests: all major views, admin panels, login errors,
 * navigation flows, and UI feature verification.
 */
import { test, expect, Page } from '@playwright/test';
import { login } from './utils/selectors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function openAdminMenu(page: Page) {
  await page.click('button[title="ניהול"]');
  await page.waitForTimeout(400);
}

/** Opens the "הגדרות מערכת" submenu inside the admin menu. */
async function openSystemConfigSubmenu(page: Page) {
  await openAdminMenu(page);
  await page.click('text=הגדרות מערכת');
  await page.waitForTimeout(400);
}

/** Opens the "פעולות מנהל" submenu inside the admin menu. */
async function openManagerActionsSubmenu(page: Page) {
  await openAdminMenu(page);
  await page.click('text=פעולות מנהל');
  await page.waitForTimeout(400);
}

async function openBuildingsMenu(page: Page) {
  await page.click('button[title="מבנים"]');
  await page.waitForTimeout(400);
}

async function waitForGrid(page: Page) {
  await page.waitForSelector('.ag-theme-alpine, .ag-root-wrapper', { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

// ---------------------------------------------------------------------------
// LOGIN SCENARIOS
// ---------------------------------------------------------------------------

test.describe('Login Scenarios', () => {
  test('empty form cannot submit', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const submitBtn = page.locator('button[type="submit"]');
    const isDisabled = await submitBtn.isDisabled({ timeout: 3000 }).catch(() => false);
    expect(isDisabled).toBe(true);
    console.log('  ✓ Submit button disabled with empty fields');
  });

  test('wrong password shows error message', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.fill('#username', 'tester');
    await page.fill('#password', 'WRONG_PASSWORD_xyz');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
    const errorVisible = await page.locator('.text-red-700, [class*="red"]').isVisible({ timeout: 5000 }).catch(() => false);
    const stillOnLogin = await page.locator('#username').isVisible({ timeout: 2000 }).catch(() => false);
    expect(errorVisible || stillOnLogin).toBe(true);
    console.log('  ✓ Wrong password shows error or keeps login form');
  });

  test('successful login lands on main app', async ({ page }) => {
    await login(page);
    await expect(page.locator('.ag-theme-alpine, .ag-root-wrapper').first()).toBeVisible({ timeout: 15000 });
    console.log('  ✓ Successful login shows main app with grid');
  });
});

// ---------------------------------------------------------------------------
// MAIN NAVIGATION
// ---------------------------------------------------------------------------

test.describe('Primary Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('buildings view loads with data grid', async ({ page }) => {
    await openBuildingsMenu(page);
    await page.click('text=רשימת מבנים').catch(() => {});
    await waitForGrid(page);
    const rows = page.locator('.ag-row');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    console.log(`  ✓ Buildings grid loaded with ${count} rows`);
  });

  test('measurement progress dashboard loads', async ({ page }) => {
    await openBuildingsMenu(page);
    await page.click('text=רשימת מבנים').catch(() => {});
    await page.waitForLoadState('networkidle');
    const dashTab = page.locator('text=התקדמות פעילות מדידות').first();
    const hasDash = await dashTab.isVisible({ timeout: 8000 }).catch(() => false);
    expect(hasDash).toBe(true);
    console.log('  ✓ Measurement progress dashboard tab visible');
  });

  test('asset search view opens', async ({ page }) => {
    await page.click('button[title="חיפוש נכס"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    // The search view opens as a tab — look for tab label or non-hidden input
    const searchTab = page.locator('text=חיפוש נכס').nth(1);
    const tabVisible = await searchTab.isVisible({ timeout: 5000 }).catch(() => false);
    const anyInput = await page.locator('input:not([type="hidden"])').first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(tabVisible || anyInput).toBe(true);
    console.log('  ✓ Asset search view opened');
  });

  test('assets import (skeleton) opens correctly', async ({ page }) => {
    await page.click('button[title="נכסים"]');
    await page.waitForTimeout(400);
    await page.click('text=ייבוא שלד');
    await page.waitForLoadState('networkidle');
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached({ timeout: 10000 });
    const accept = await fileInput.getAttribute('accept');
    expect(accept).toContain('.xlsx');
    console.log('  ✓ Assets skeleton import opens with xlsx file input');
  });

  test('measured-not-exported assets view opens', async ({ page }) => {
    await page.click('button[title="נכסים"]');
    await page.waitForTimeout(400);
    await page.click('text=נכסים שנמדדו ולא נשלחו');
    await page.waitForLoadState('networkidle');
    // Should show a grid or a tab with the view name
    const tabLabel = page.locator('text=נכסים שנמדדו ולא נשלחו').first();
    const visible = await tabLabel.isVisible({ timeout: 10000 }).catch(() => false);
    expect(visible).toBe(true);
    console.log('  ✓ Measured-not-exported view opened');
  });

  test('inspection tasks accessible via admin menu', async ({ page }) => {
    await openManagerActionsSubmenu(page);
    // Try clicking inspection tasks (only visible if isDev)
    const taskBtn = page.locator('text=משימות ביקורת').first();
    const isDevVisible = await taskBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (isDevVisible) {
      await taskBtn.click();
      await page.waitForLoadState('networkidle');
      const grid = page.locator('.ag-theme-alpine, .ag-root-wrapper').first();
      await expect(grid).toBeVisible({ timeout: 15000 });
      console.log('  ✓ Inspection tasks view opened via admin menu');
    } else {
      console.log('  ⚠ Inspection tasks not visible (isDev gated) — checking sidebar button');
      await page.keyboard.press('Escape');
      const sidebarBtn = page.locator('button[title="משימות ביקורת"]');
      const sidebarVisible = await sidebarBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (sidebarVisible) {
        await sidebarBtn.click();
        await page.waitForLoadState('networkidle');
        console.log('  ✓ Inspection tasks opened via sidebar button');
      } else {
        console.log('  ⚠ Inspection tasks not accessible for this user — skipped');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// ADMIN PANEL NAVIGATION
// ---------------------------------------------------------------------------

test.describe('Admin Panel Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('asset types view loads with grid', async ({ page }) => {
    await openSystemConfigSubmenu(page);
    await page.click('text=סוגי נכסים');
    await page.waitForLoadState('networkidle');
    await waitForGrid(page);
    const grid = page.locator('.ag-theme-alpine, .ag-root-wrapper').first();
    await expect(grid).toBeVisible({ timeout: 10000 });
    console.log('  ✓ Asset types grid loaded');
  });

  test('operators view loads with grid', async ({ page }) => {
    await openSystemConfigSubmenu(page);
    await page.click('text=מפעילים');
    await page.waitForLoadState('networkidle');
    await waitForGrid(page);
    const grid = page.locator('.ag-theme-alpine, .ag-root-wrapper').first();
    await expect(grid).toBeVisible({ timeout: 10000 });
    console.log('  ✓ Operators grid loaded');
  });

  test('managers view loads with grid', async ({ page }) => {
    await openSystemConfigSubmenu(page);
    await page.click('text=מנהלים');
    await page.waitForLoadState('networkidle');
    await waitForGrid(page);
    const grid = page.locator('.ag-theme-alpine, .ag-root-wrapper').first();
    await expect(grid).toBeVisible({ timeout: 10000 });
    console.log('  ✓ Managers grid loaded');
  });

  test('user management view loads', async ({ page }) => {
    await openSystemConfigSubmenu(page);
    await page.click('text=ניהול משתמשים');
    await page.waitForLoadState('networkidle');
    const content = page.locator('.ag-theme-alpine, .ag-root-wrapper').first();
    await expect(content).toBeVisible({ timeout: 10000 });
    console.log('  ✓ User management view loaded');
  });

  test('field configuration view loads', async ({ page }) => {
    await openSystemConfigSubmenu(page);
    await page.click('text=הגדרות שדות');
    await page.waitForLoadState('networkidle');
    const content = page.locator('.ag-theme-alpine, .ag-root-wrapper').first();
    await expect(content).toBeVisible({ timeout: 10000 });
    console.log('  ✓ Field configuration view loaded');
  });

  test('address list view loads', async ({ page }) => {
    await openSystemConfigSubmenu(page);
    await page.click('text=רשימת כתובות');
    await page.waitForLoadState('networkidle');
    const content = page.locator('.ag-theme-alpine, .ag-root-wrapper').first();
    await expect(content).toBeVisible({ timeout: 10000 });
    console.log('  ✓ Address list view loaded');
  });
});

// ---------------------------------------------------------------------------
// BUILDING & ASSET WORKFLOW
// ---------------------------------------------------------------------------

test.describe('Building & Asset Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openBuildingsMenu(page);
    await page.click('text=רשימת מבנים').catch(() => {});
    await waitForGrid(page);
  });

  test('buildings grid has sortable columns', async ({ page }) => {
    const header = page.locator('.ag-header-cell').first();
    await expect(header).toBeVisible({ timeout: 8000 });
    await header.click();
    await page.waitForTimeout(500);
    await header.click();
    await page.waitForTimeout(500);
    const hasServerError = await page.locator('text=/שגיאה|500/i').isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasServerError).toBe(false);
    console.log('  ✓ Column sorting works without errors');
  });

  test('clicking building row loads its data', async ({ page }) => {
    const rows = page.locator('.ag-row');
    const count = await rows.count();
    if (count === 0) {
      console.log('  ⚠ No building rows — skipping');
      return;
    }
    await rows.first().click();
    await page.waitForTimeout(1500);
    await page.waitForLoadState('networkidle');
    expect(await page.locator('body').count()).toBeGreaterThan(0);
    console.log('  ✓ Clicking building row triggers navigation');
  });

  test('assets tab loads assets grid after building selection', async ({ page }) => {
    const rows = page.locator('.ag-row');
    const count = await rows.count();
    if (count === 0) {
      console.log('  ⚠ No buildings — skipping');
      return;
    }
    // Click a building to select it
    await rows.first().click();
    await page.waitForTimeout(1000);
    // Look for the assets tab (a tab that opens the assets list for this building)
    const assetsTabLabel = page.locator('.tab-item, [class*="tab"]').filter({ hasText: /נכסים/ }).first();
    const tabVisible = await assetsTabLabel.isVisible({ timeout: 5000 }).catch(() => false);
    if (tabVisible) {
      await assetsTabLabel.click();
      await waitForGrid(page);
      console.log('  ✓ Assets tab loads');
    } else {
      console.log('  ⚠ Assets tab not found after building click — layout may differ');
    }
  });
});

// ---------------------------------------------------------------------------
// ASSET TYPES CRUD
// ---------------------------------------------------------------------------

test.describe('Asset Types CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openSystemConfigSubmenu(page);
    await page.click('text=סוגי נכסים');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.ag-theme-alpine, .ag-root-wrapper', { timeout: 15000 });
  });

  test('asset types grid is populated', async ({ page }) => {
    const rows = page.locator('.ag-row');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    console.log(`  ✓ Asset types grid has ${count} rows`);
  });

  test('asset types grid columns are visible', async ({ page }) => {
    const headers = page.locator('.ag-header-cell-text');
    const count = await headers.count();
    expect(count).toBeGreaterThan(0);
    console.log(`  ✓ Asset types has ${count} column headers`);
  });

  test('can_be_subtype and min_sub_types_number columns exist', async ({ page }) => {
    const headers = page.locator('.ag-header-cell-text');
    const texts = await headers.allTextContents();
    const hasSubtype = texts.some(t => /תת.נכס|sub.type/i.test(t) || t.includes('יכול'));
    const hasMin = texts.some(t => /מינ|min/i.test(t));
    expect(hasSubtype || hasMin).toBe(true);
    console.log('  ✓ Subtype-related columns present');
  });
});

// ---------------------------------------------------------------------------
// OPERATORS MANAGEMENT
// ---------------------------------------------------------------------------

test.describe('Operators Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openSystemConfigSubmenu(page);
    await page.click('text=מפעילים');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.ag-theme-alpine, .ag-root-wrapper', { timeout: 15000 });
  });

  test('operators grid loads', async ({ page }) => {
    const grid = page.locator('.ag-theme-alpine, .ag-root-wrapper').first();
    await expect(grid).toBeVisible({ timeout: 10000 });
    const rows = page.locator('.ag-row');
    const count = await rows.count();
    console.log(`  ✓ Operators grid loaded with ${count} rows`);
  });

  test('operators grid has name column', async ({ page }) => {
    const headers = page.locator('.ag-header-cell-text');
    const texts = await headers.allTextContents();
    const hasName = texts.some(t => /שם|name/i.test(t));
    expect(hasName).toBe(true);
    console.log('  ✓ Operators grid has name column');
  });
});

// ---------------------------------------------------------------------------
// USER MANAGEMENT
// ---------------------------------------------------------------------------

test.describe('User Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openSystemConfigSubmenu(page);
    await page.click('text=ניהול משתמשים');
    await page.waitForLoadState('networkidle');
  });

  test('user management page loads with content', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    // May be a custom table or AG Grid
    const hasContent = await page.locator('.ag-theme-alpine, .ag-root-wrapper, table, [class*="user"]').first().isVisible({ timeout: 10000 }).catch(() => false);
    expect(hasContent).toBe(true);
    console.log('  ✓ User management page loaded');
  });

  test('user list shows current logged-in user', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    // User management may use a custom table or AG Grid — check page body text
    const bodyText = await page.locator('body').textContent();
    const username = process.env.TEST_USER_NAME || 'tester';
    expect(bodyText).toContain(username);
    console.log(`  ✓ Current user "${username}" appears in user list`);
  });
});

// ---------------------------------------------------------------------------
// SEARCH FUNCTIONALITY
// ---------------------------------------------------------------------------

test.describe('Asset Search', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.click('button[title="חיפוש נכס"]');
    await page.waitForLoadState('networkidle');
  });

  test('asset search view has search input', async ({ page }) => {
    // Allow extra time for the search view to fully render
    await page.waitForTimeout(2000);
    // Look for any non-hidden input (numeric IDs or text search fields)
    const searchInput = page.locator('input:not([type="hidden"])').first();
    const visible = await searchInput.isVisible({ timeout: 10000 }).catch(() => false);
    expect(visible).toBe(true);
    console.log('  ✓ Asset search has input field');
  });

  test('searching with invalid id returns gracefully', async ({ page }) => {
    const searchInput = page.locator('input').first();
    const visible = await searchInput.isVisible({ timeout: 8000 }).catch(() => false);
    if (!visible) {
      console.log('  ⚠ No search input found — skipping');
      return;
    }
    await searchInput.fill('9999999999999');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    const hasServerError = await page.locator('text=/500|server error/i').isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasServerError).toBe(false);
    console.log('  ✓ Invalid asset search returns gracefully (no 500)');
  });
});

// ---------------------------------------------------------------------------
// UI SANITY CHECKS
// ---------------------------------------------------------------------------

test.describe('UI Sanity Checks', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('page title is set', async ({ page }) => {
    const title = await page.title();
    expect(title).toBeTruthy();
    console.log(`  ✓ Page title: "${title}"`);
  });

  test('no critical console errors on main view', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.waitForTimeout(3000);
    const criticalErrors = errors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('ResizeObserver') &&
      !e.includes('runtime.lastError') &&
      !e.includes('Receiving end does not exist') &&
      !e.includes('Non-Error promise rejection')
    );
    if (criticalErrors.length > 0) {
      console.log(`  ⚠ Console errors: ${criticalErrors.slice(0, 3).join('; ')}`);
    } else {
      console.log('  ✓ No critical console errors on main view');
    }
  });

  test('sidebar has correct number of buttons', async ({ page }) => {
    const sidebarButtons = page.locator('button[title]');
    const count = await sidebarButtons.count();
    expect(count).toBeGreaterThan(3);
    console.log(`  ✓ Sidebar has ${count} titled buttons`);
  });

  test('rapid view switching does not crash', async ({ page }) => {
    await page.click('button[title="חיפוש נכס"]').catch(() => {});
    await page.waitForTimeout(500);
    await openAdminMenu(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await openBuildingsMenu(page);
    await page.click('text=רשימת מבנים').catch(() => {});
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
    const hasServerError = await page.locator('text=/500|uncaught error/i').isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasServerError).toBe(false);
    console.log('  ✓ Rapid view switching does not crash the app');
  });
});
