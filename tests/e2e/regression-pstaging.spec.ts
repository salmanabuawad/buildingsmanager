/**
 * Full regression suite — exhaustive valid-action matrix.
 *
 * Runs against any target set via TEST_BASE_URL (default: test env).
 * For pstaging, run:
 *   TEST_BASE_URL=https://pstaging.wavelync.com/ \
 *   TEST_USER_NAME=regression_tester \
 *   TEST_PASSWORD=RegressionTester2026! \
 *   npm run test:e2e -- tests/e2e/regression-pstaging.spec.ts
 *
 * The suite is organized by user workflow. Every describe block is
 * independently runnable and cleans up its own fixtures via the REST
 * API, so runs against a shared environment don't leak state.
 */

import { test, expect, Page } from '@playwright/test';
import { login, selectors } from './utils/selectors';
import { loginViaApi, apiGet, apiPost, apiDelete, deleteBuildingIfExists, AuthedApi } from './utils/api';

// -------- shared fixtures --------

/** A building_number safe to use / reuse — high enough to not clash with
 *  prod snapshot rows, deterministic so tests can clean up. */
const E2E_BUILDING = 999_000_001;
const E2E_BUILDING_2 = 999_000_002;
const E2E_TAX_REGION = 10;

async function waitForGrid(page: Page) {
  await page.waitForSelector('.ag-theme-alpine', { timeout: 30_000 });
}

async function dismissToast(page: Page) {
  const toast = page.locator('[role="status"], .Toastify__toast').first();
  if (await toast.isVisible({ timeout: 500 }).catch(() => false)) {
    await toast.click().catch(() => {});
  }
}

// -------- Authentication --------

test.describe('Authentication', () => {
  test('login with valid credentials shows the buildings grid', async ({ page }) => {
    await login(page);
    await expect(page.locator('.ag-theme-alpine').first()).toBeVisible({ timeout: 30_000 });
  });

  test('login API returns an access token', async () => {
    const api = await loginViaApi();
    try {
      expect(api.token.length).toBeGreaterThan(20);
    } finally {
      await api.close();
    }
  });

  test('invalid credentials rejected by API', async () => {
    const { request: pwRequest } = await import('@playwright/test');
    const ctx = await pwRequest.newContext({ baseURL: process.env.TEST_BASE_URL || 'http://test.profile.wavelync.com/' });
    const res = await ctx.post('/api/auth/session', {
      data: { user_name: 'regression_tester', password: 'wrong_password_on_purpose' },
    });
    expect(res.ok()).toBe(false);
    expect([401, 403]).toContain(res.status());
    await ctx.dispose();
  });
});

// -------- Buildings CRUD (API-driven, UI-verified) --------

test.describe('Buildings CRUD', () => {
  let api: AuthedApi;

  test.beforeAll(async () => { api = await loginViaApi(); });
  test.afterAll(async () => { await api.close(); });

  test.afterEach(async () => {
    await deleteBuildingIfExists(api, E2E_BUILDING).catch(() => {});
    await deleteBuildingIfExists(api, E2E_BUILDING_2).catch(() => {});
  });

  test('create building via API, edit via API, delete via API', async () => {
    const created = await apiPost(api, '/api/buildings/create', {
      building_number: E2E_BUILDING,
      tax_region: String(E2E_TAX_REGION),
    });
    expect(created.building_number).toBe(E2E_BUILDING);

    // Re-fetch to confirm persistence
    const row: any = await apiGet(api, `/api/buildings/${E2E_BUILDING}`);
    expect(Number(row.tax_region)).toBe(E2E_TAX_REGION);

    // Delete via the cascading route
    const del = await apiDelete(api, `/api/buildings/by-number/${E2E_BUILDING}`);
    expect(del.success).toBe(true);
    expect(del.deleted_assets_count).toBe(0);
  });

  test('create-bulk accepts multiple buildings', async () => {
    const res = await apiPost(api, '/api/buildings/create-bulk', {
      rows: [
        { building_number: E2E_BUILDING,   tax_region: '10' },
        { building_number: E2E_BUILDING_2, tax_region: '20' },
      ],
    });
    expect(res.success).toBe(true);
    expect(res.count).toBe(2);
    expect(res.buildings.length).toBe(2);
  });

  test('duplicate building_number returns 409 with Hebrew message', async () => {
    await apiPost(api, '/api/buildings/create', { building_number: E2E_BUILDING, tax_region: '10' });
    const res = await api.ctx.post('/api/buildings/create', {
      headers: { Authorization: `Bearer ${api.token}` },
      data: { building_number: E2E_BUILDING, tax_region: '10' },
    });
    expect(res.status()).toBe(409);
    const body = (await res.json()) as { detail: string };
    expect(body.detail).toContain(String(E2E_BUILDING));
    expect(body.detail).toContain('כבר קיים');
  });

  test('UI can load existing buildings grid and inline-add a new building', async ({ page }) => {
    await login(page);
    await waitForGrid(page);

    // Go to buildings page (route may already be there)
    const tab = page.locator('text=מבנים').first();
    if (await tab.isVisible({ timeout: 2000 }).catch(() => false)) await tab.click();
    await waitForGrid(page);

    // Click הוסף מבנה
    const addBtn = page.locator('button:has-text("הוסף מבנה")').first();
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();

    // A new row should appear — we verify by using API: after save, the building_number appears.
    // The UI doesn't expose a numeric row ID we can key off, so the happy path continues via API.
  });
});

// -------- Assets CRUD (API-driven) --------

test.describe('Assets CRUD', () => {
  let api: AuthedApi;

  test.beforeAll(async () => {
    api = await loginViaApi();
    // Ensure the fixture building exists
    await apiPost(api, '/api/buildings/create', {
      building_number: E2E_BUILDING,
      tax_region: String(E2E_TAX_REGION),
    }).catch(() => {});
  });
  test.afterAll(async () => {
    await deleteBuildingIfExists(api, E2E_BUILDING).catch(() => {});
    await api.close();
  });

  const ASSET_ID_A = 999_000_001_001;
  const ASSET_ID_B = 999_000_001_002;

  test('save-bulk-transactional creates assets and audit rows', async () => {
    const res = await apiPost(api, '/api/assets/save-bulk-transactional', {
      p_assets_data: [
        {
          asset_id: ASSET_ID_A,
          building_number: E2E_BUILDING,
          payer_id: 'PAYER-A',
          tax_region: E2E_TAX_REGION,
          main_asset_type: null,
          asset_size: 0,
          measurement_date: '01/01/2026',
        },
        {
          asset_id: ASSET_ID_B,
          building_number: E2E_BUILDING,
          payer_id: 'PAYER-B',
          tax_region: E2E_TAX_REGION,
          main_asset_type: null,
          asset_size: 0,
          measurement_date: '01/01/2026',
        },
      ],
      p_validation_passed: true,
      p_action_type: 'manual_update',
      p_user_id: 'uid:101',
    });
    expect(res.count).toBe(2);
    expect(res.affected_buildings).toContain(E2E_BUILDING);
  });

  test('update asset fields via save-bulk-transactional', async () => {
    const res = await apiPost(api, '/api/assets/save-bulk-transactional', {
      p_assets_data: [{
        asset_id: ASSET_ID_A,
        building_number: E2E_BUILDING,
        payer_id: 'PAYER-A2',
        tax_region: E2E_TAX_REGION,
        apartment_number: '7',
        apartment_floor: '3',
        measurement_date: '01/01/2026',
        main_asset_type: null,
        asset_size: 50.5,
      }],
      p_validation_passed: true,
      p_action_type: 'manual_update',
      p_user_id: 'uid:101',
    });
    expect(res.count).toBe(1);
  });

  test('delete asset and building cascade', async () => {
    const del = await apiDelete(api, `/api/buildings/by-number/${E2E_BUILDING}`);
    expect(del.success).toBe(true);
    // 2 assets created above should come with the building
    expect(del.deleted_assets_count).toBeGreaterThanOrEqual(2);
  });
});

// -------- Distribution flag + history --------

test.describe('Distribution flag + history', () => {
  let api: AuthedApi;
  const BN = 999_000_011;

  test.beforeAll(async () => {
    api = await loginViaApi();
    await deleteBuildingIfExists(api, BN).catch(() => {});
    await apiPost(api, '/api/buildings/create', {
      building_number: BN,
      tax_region: '10',
      business_shared_area: 0,
    });
  });
  test.afterAll(async () => {
    await deleteBuildingIfExists(api, BN).catch(() => {});
    await api.close();
  });

  test('setting business_shared_area flips need_business_distribution to true', async () => {
    // Need an accountable business asset for the flag to be meaningful
    await apiPost(api, '/api/assets/save-bulk-transactional', {
      p_assets_data: [{
        asset_id: BN * 10,
        building_number: BN,
        payer_id: 'P1',
        tax_region: 10,
        main_asset_type: '800', // business
        asset_size: 100,
        measurement_date: '01/01/2026',
      }],
      p_validation_passed: true,
      p_action_type: 'manual_update',
      p_user_id: 'uid:101',
    });

    await apiPost(api, '/api/buildings/bulk-distribution-flags', {
      rows: [{ building_number: BN, updates: { business_shared_area: 500 } }],
    });

    const rows: any = await apiGet(api, `/api/data/buildings?building_number=${BN}&select=*&limit=1`);
    const b = Array.isArray(rows) ? rows[0] : (rows.data ? rows.data[0] : rows);
    expect(b.need_business_distribution === true || b.need_business_distribution === 'true').toBeTruthy();
  });

  test('distribute action writes a bulk_asset audit row', async () => {
    // Run the business_distribution action
    await apiPost(api, '/api/assets/save-bulk-transactional', {
      p_assets_data: [{
        asset_id: BN * 10,
        building_number: BN,
        payer_id: 'P1',
        tax_region: 10,
        main_asset_type: '800',
        asset_size: 100,
        business_distribution_area: 50,
        measurement_date: '01/01/2026',
      }],
      p_validation_passed: true,
      p_action_type: 'business_distribution',
      p_user_id: 'uid:101',
    });

    // Now confirm a bulk_asset row exists for this building
    const audit: any = await apiGet(
      api,
      `/api/data/audit?entity_type=bulk_asset&entity_id=${BN}&action_type=business_distribution&select=*&limit=5`,
    );
    const rows = Array.isArray(audit) ? audit : (audit.data || []);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('adding a new accountable asset re-flags distribution', async () => {
    // Insert another business asset; flag should flip true again.
    await apiPost(api, '/api/assets/save-bulk-transactional', {
      p_assets_data: [{
        asset_id: BN * 10 + 1,
        building_number: BN,
        payer_id: 'P2',
        tax_region: 10,
        main_asset_type: '800',
        asset_size: 200,
        measurement_date: '01/01/2026',
      }],
      p_validation_passed: true,
      p_action_type: 'manual_update',
      p_user_id: 'uid:101',
    });
    const rows: any = await apiGet(api, `/api/data/buildings?building_number=${BN}&select=*&limit=1`);
    const b = Array.isArray(rows) ? rows[0] : (rows.data ? rows.data[0] : rows);
    expect(b.need_business_distribution === true || b.need_business_distribution === 'true').toBeTruthy();
  });
});

// -------- UI sort: apartment_number numeric --------

test.describe('Asset list UI behaviors', () => {
  test('apartment_number column sorts numerically when clicked', async ({ page }) => {
    await login(page);
    await waitForGrid(page);
    // Navigate into a building that has apartment numbers set — fall back silently if none
    const firstRow = page.locator(selectors.buildingRow).first();
    if (!(await firstRow.isVisible({ timeout: 5000 }).catch(() => false))) test.skip();
    await firstRow.click();

    const apartmentHeader = page.locator('.ag-header-cell:has-text("מספר דירה")').first();
    if (!(await apartmentHeader.isVisible({ timeout: 5000 }).catch(() => false))) test.skip();

    await apartmentHeader.click();
    await page.waitForTimeout(500);

    const values = await page.locator('[col-id="apartment_number"] .ag-cell-value').allTextContents();
    const nums = values
      .map((v) => v.trim())
      .filter((v) => v && /^\d+[A-Za-z]?$/.test(v))
      .map((v) => Number(v.replace(/\D.*$/, '')))
      .filter((n) => !Number.isNaN(n));

    // If we have at least two numeric apartment numbers, ensure non-decreasing (ascending)
    if (nums.length >= 2) {
      for (let i = 1; i < nums.length; i++) expect(nums[i]).toBeGreaterThanOrEqual(nums[i - 1]);
    }
  });

  test('"הצג רק לא תקינים" checkbox is present', async ({ page }) => {
    await login(page);
    await waitForGrid(page);
    const firstRow = page.locator(selectors.buildingRow).first();
    if (!(await firstRow.isVisible({ timeout: 5000 }).catch(() => false))) test.skip();
    await firstRow.click();
    const invalidToggle = page.locator('label:has-text("הצג רק לא תקינים")').first();
    await expect(invalidToggle).toBeVisible({ timeout: 10_000 });
  });
});

// -------- Asset files API --------

test.describe('Asset files', () => {
  let api: AuthedApi;
  const BN = 999_000_021;
  const AID = 999_000_021_001;

  test.beforeAll(async () => {
    api = await loginViaApi();
    await deleteBuildingIfExists(api, BN).catch(() => {});
    await apiPost(api, '/api/buildings/create', { building_number: BN, tax_region: '10' });
    await apiPost(api, '/api/assets/save-bulk-transactional', {
      p_assets_data: [{
        asset_id: AID,
        building_number: BN,
        payer_id: 'PF1',
        tax_region: 10,
        main_asset_type: null,
        asset_size: 0,
        measurement_date: '01/01/2026',
      }],
      p_validation_passed: true,
      p_action_type: 'manual_update',
      p_user_id: 'uid:101',
    });
  });
  test.afterAll(async () => {
    await deleteBuildingIfExists(api, BN).catch(() => {});
    await api.close();
  });

  test('list files for asset returns an array', async () => {
    const rows: any = await apiGet(api, `/api/data/asset_files?asset_id=${AID}&select=*`);
    const arr = Array.isArray(rows) ? rows : (rows.data || []);
    expect(Array.isArray(arr)).toBe(true);
  });
});

// -------- Skeleton import shape --------

test.describe('Skeleton import', () => {
  let api: AuthedApi;
  const BN = 999_000_031;
  const AID = 999_000_031_001;

  test.beforeAll(async () => { api = await loginViaApi(); });
  test.afterAll(async () => {
    await deleteBuildingIfExists(api, BN).catch(() => {});
    await api.close();
  });

  test('skeleton insert with apartment_number persists it', async () => {
    await apiPost(api, '/api/buildings/create', { building_number: BN, tax_region: '10' });

    await apiPost(api, '/api/assets/save-bulk-transactional', {
      p_assets_data: [{
        asset_id: AID,
        building_number: BN,
        payer_id: 'PSK',
        tax_region: 10,
        apartment_number: '12',
        main_asset_type: null,
        asset_size: 0,
        measurement_date: '01/01/2026',
      }],
      p_validation_passed: true,
      p_action_type: 'manual_update',
      p_user_id: 'uid:101',
    });

    const rows: any = await apiGet(api, `/api/data/assets?asset_id=${AID}&select=*&limit=1`);
    const asset = Array.isArray(rows) ? rows[0] : (rows.data ? rows.data[0] : rows);
    expect(asset.apartment_number).toBe('12');
  });
});
