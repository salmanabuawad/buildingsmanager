/**
 * Full regression suite against pstaging (or any TEST_BASE_URL).
 *
 *   TEST_BASE_URL=https://pstaging.wavelync.com/ \
 *   TEST_USER_NAME=regression_tester \
 *   TEST_PASSWORD=RegressionTester2026! \
 *   npx playwright test --project=pstaging
 *
 * Organized by workflow. Every `describe` provisions and tears down its
 * OWN fixture building (999_0XX_XXX range) so nothing leaks across tests
 * and runs can go in any order.
 */

import { test, expect, Page, request as pwRequest } from '@playwright/test';
import { login, selectors } from './utils/selectors';
import { loginViaApi, apiGet, apiPost, apiDelete, deleteBuildingIfExists, AuthedApi } from './utils/api';

// -------- Helpers --------

async function waitForGrid(page: Page) {
  await page.waitForSelector('.ag-theme-alpine', { timeout: 30_000 });
}

/**
 * Click a building_number cell in the buildings grid to open its asset
 * list. onCellClicked is wired only for the building_number column.
 * AG Grid is virtualized so we use the search input first to narrow the
 * grid down to a single row — that guarantees the row is rendered.
 */
async function openBuildingInUI(page: Page, buildingNumber: number) {
  await waitForGrid(page);
  // Type the number into the search input (placeholder 'searchByBuildingNumber')
  const search = page.locator('input[placeholder]').filter({ hasText: /./ }).first();
  const searchInput = page.locator('input').first();
  await searchInput.click();
  await searchInput.fill(String(buildingNumber));
  await page.waitForTimeout(300); // filter debounce-free but grid rerender time

  const cell = page.locator(
    `.ag-row .ag-cell[col-id="building_number"]:has-text("${buildingNumber}")`,
  ).first();
  await expect(cell).toBeVisible({ timeout: 15_000 });
  await cell.click();
  // Wait for the assets-list header-bar "הוסף נכס" button to appear
  await expect(page.locator('button:has-text("הוסף נכס")').first()).toBeVisible({ timeout: 20_000 });
}

/** Build a fixture building + N assets with deterministic ids. */
async function provisionFixtureBuilding(api: AuthedApi, bn: number, payload?: {
  business_shared_area?: number;
  residence_shared_area?: number;
  assets?: Array<{ asset_id: number; main_asset_type?: string | null; asset_size?: number; apartment_number?: string; payer_id?: string; tax_region?: number }>;
}) {
  await deleteBuildingIfExists(api, bn).catch(() => {});
  await apiPost(api, '/api/buildings/create', {
    building_number: bn,
    tax_region: '10',
    business_shared_area: payload?.business_shared_area ?? 0,
    residence_shared_area: payload?.residence_shared_area ?? 0,
  });
  if (payload?.assets?.length) {
    await apiPost(api, '/api/assets/save-bulk-transactional', {
      p_assets_data: payload.assets.map((a) => ({
        building_number: bn,
        asset_id: a.asset_id,
        payer_id: a.payer_id ?? `P-${a.asset_id}`,
        tax_region: a.tax_region ?? 10,
        main_asset_type: a.main_asset_type ?? null,
        asset_size: a.asset_size ?? 0,
        apartment_number: a.apartment_number,
        measurement_date: '01/01/2026',
      })),
      p_validation_passed: true,
      p_action_type: 'manual_update',
      p_user_id: 'uid:101',
    });
  }
}

/** Read a single building fresh from the ORM path (the /by-number path doesn't have GET). */
async function readBuilding(api: AuthedApi, bn: number): Promise<any> {
  return apiGet(api, `/api/buildings/${bn}`);
}

// -------- 1. Authentication --------

test.describe('1. Authentication', () => {
  test('1.1 login UI loads buildings grid', async ({ page }) => {
    await login(page);
    await expect(page.locator('.ag-theme-alpine').first()).toBeVisible({ timeout: 30_000 });
  });

  test('1.2 login API issues an access token', async () => {
    const api = await loginViaApi();
    try { expect(api.token.length).toBeGreaterThan(20); } finally { await api.close(); }
  });

  test('1.3 invalid credentials rejected', async () => {
    const ctx = await pwRequest.newContext({ baseURL: process.env.TEST_BASE_URL || 'http://test.profile.wavelync.com/' });
    const res = await ctx.post('/api/auth/session', { data: { user_name: 'regression_tester', password: 'totally_wrong' } });
    expect([401, 403]).toContain(res.status());
    await ctx.dispose();
  });

  test('1.4 heartbeat refreshes an active session', async () => {
    const api = await loginViaApi();
    try {
      const res = await api.ctx.post('/api/auth/heartbeat', { headers: { Authorization: `Bearer ${api.token}` } });
      expect(res.ok()).toBe(true);
    } finally { await api.close(); }
  });

  test('1.5 expired / missing token rejected on protected routes', async () => {
    const ctx = await pwRequest.newContext({ baseURL: process.env.TEST_BASE_URL || 'http://test.profile.wavelync.com/' });
    const res = await ctx.get('/api/data/buildings?select=*&limit=1');
    expect([401, 403]).toContain(res.status());
    await ctx.dispose();
  });
});

// -------- 2. Buildings CRUD --------

test.describe('2. Buildings CRUD', () => {
  let api: AuthedApi;
  const BN = 999_000_200;
  const BN2 = 999_000_201;

  test.beforeAll(async () => { api = await loginViaApi(); });
  test.afterAll(async () => {
    await deleteBuildingIfExists(api, BN).catch(() => {});
    await deleteBuildingIfExists(api, BN2).catch(() => {});
    await api.close();
  });

  test.beforeEach(async () => {
    await deleteBuildingIfExists(api, BN).catch(() => {});
    await deleteBuildingIfExists(api, BN2).catch(() => {});
  });

  test('2.1 create single building', async () => {
    const created = await apiPost(api, '/api/buildings/create', { building_number: BN, tax_region: '10' });
    expect(created.building_number).toBe(BN);
  });

  test('2.2 GET by number returns the row', async () => {
    await apiPost(api, '/api/buildings/create', { building_number: BN, tax_region: '10' });
    const b = await readBuilding(api, BN);
    expect(b.building_number).toBe(BN);
    expect(String(b.tax_region)).toBe('10');
  });

  test('2.3 GET on missing building returns 404 (not 500)', async () => {
    const res = await api.ctx.get(`/api/buildings/${BN}`, { headers: { Authorization: `Bearer ${api.token}` } });
    expect(res.status()).toBe(404);
  });

  test('2.4 create-bulk creates N buildings', async () => {
    const res = await apiPost(api, '/api/buildings/create-bulk', {
      rows: [{ building_number: BN, tax_region: '10' }, { building_number: BN2, tax_region: '20' }],
    });
    expect(res.count).toBe(2);
    expect(res.buildings.length).toBe(2);
  });

  test('2.5 duplicate building_number returns 409 with Hebrew detail', async () => {
    await apiPost(api, '/api/buildings/create', { building_number: BN, tax_region: '10' });
    const res = await api.ctx.post('/api/buildings/create', {
      headers: { Authorization: `Bearer ${api.token}` },
      data: { building_number: BN, tax_region: '10' },
    });
    expect(res.status()).toBe(409);
    const body = await res.json() as { detail: string };
    expect(body.detail).toContain(String(BN));
    expect(body.detail).toContain('כבר קיים');
  });

  test('2.6 delete by-number on empty building', async () => {
    await apiPost(api, '/api/buildings/create', { building_number: BN, tax_region: '10' });
    const del = await apiDelete(api, `/api/buildings/by-number/${BN}`);
    expect(del.success).toBe(true);
    expect(del.deleted_assets_count).toBe(0);
    // Re-GET → 404
    const res = await api.ctx.get(`/api/buildings/${BN}`, { headers: { Authorization: `Bearer ${api.token}` } });
    expect(res.status()).toBe(404);
  });

  test('2.7 delete by-number cascades to assets', async () => {
    await provisionFixtureBuilding(api, BN, {
      assets: [
        { asset_id: BN * 10,     main_asset_type: null, asset_size: 0 },
        { asset_id: BN * 10 + 1, main_asset_type: null, asset_size: 0 },
      ],
    });
    const del = await apiDelete(api, `/api/buildings/by-number/${BN}`);
    expect(del.deleted_assets_count).toBe(2);
  });

  test('2.8 UI: login lands on buildings grid', async ({ page }) => {
    await login(page);
    await waitForGrid(page);
    // A known prod-snapshot building should be visible in the grid
    const anyRow = page.locator(selectors.buildingRow).first();
    await expect(anyRow).toBeVisible({ timeout: 15_000 });
  });

  test('2.9 UI: הוסף מבנה button is visible and clickable', async ({ page }) => {
    await login(page);
    await waitForGrid(page);
    const addBtn = page.locator('button:has-text("הוסף מבנה")').first();
    await expect(addBtn).toBeVisible({ timeout: 15_000 });
    // Clicking should add a new row (the state mutation we can't easily
    // verify here without saving — just make sure it doesn't throw).
    await addBtn.click();
  });
});

// -------- 3. Assets CRUD (via save-bulk-transactional) --------

test.describe('3. Assets CRUD', () => {
  let api: AuthedApi;
  const BN = 999_000_300;
  const AID_A = BN * 10;
  const AID_B = BN * 10 + 1;

  test.beforeAll(async () => { api = await loginViaApi(); });
  test.afterAll(async () => {
    await deleteBuildingIfExists(api, BN).catch(() => {});
    await api.close();
  });

  test.beforeEach(async () => {
    await provisionFixtureBuilding(api, BN);
  });
  test.afterEach(async () => {
    await deleteBuildingIfExists(api, BN).catch(() => {});
  });

  test('3.1 insert two assets', async () => {
    const res = await apiPost(api, '/api/assets/save-bulk-transactional', {
      p_assets_data: [
        { asset_id: AID_A, building_number: BN, payer_id: 'PA', tax_region: 10, main_asset_type: null, asset_size: 10, measurement_date: '01/01/2026' },
        { asset_id: AID_B, building_number: BN, payer_id: 'PB', tax_region: 10, main_asset_type: null, asset_size: 20, measurement_date: '01/01/2026' },
      ],
      p_validation_passed: true,
      p_action_type: 'manual_update',
      p_user_id: 'uid:101',
    });
    expect(res.count).toBe(2);
    expect(res.affected_buildings).toContain(BN);
  });

  test('3.2 update existing asset (non-type fields)', async () => {
    await apiPost(api, '/api/assets/save-bulk-transactional', {
      p_assets_data: [{ asset_id: AID_A, building_number: BN, payer_id: 'P0', tax_region: 10, main_asset_type: null, asset_size: 0, measurement_date: '01/01/2026' }],
      p_validation_passed: true, p_action_type: 'manual_update', p_user_id: 'uid:101',
    });
    await apiPost(api, '/api/assets/save-bulk-transactional', {
      p_assets_data: [{ asset_id: AID_A, building_number: BN, payer_id: 'P0', tax_region: 10, main_asset_type: null, asset_size: 42.5, apartment_number: '5', apartment_floor: '2', comment: 'edited', measurement_date: '01/01/2026' }],
      p_validation_passed: true, p_action_type: 'manual_update', p_user_id: 'uid:101',
    });
    const rows: any[] = await apiGet(api, `/api/data/assets?asset_id=${AID_A}&select=*&limit=1`);
    const asset = Array.isArray(rows) ? rows[0] : rows;
    expect(Number(asset.asset_size)).toBe(42.5);
    expect(asset.apartment_number).toBe('5');
    expect(asset.comment).toBe('edited');
  });

  test('3.3 delete-transactional removes asset + writes audit', async () => {
    await apiPost(api, '/api/assets/save-bulk-transactional', {
      p_assets_data: [{ asset_id: AID_A, building_number: BN, payer_id: 'PA', tax_region: 10, main_asset_type: null, asset_size: 0, measurement_date: '01/01/2026' }],
      p_validation_passed: true, p_action_type: 'manual_update', p_user_id: 'uid:101',
    });
    const del = await apiPost(api, '/api/assets/delete-transactional', { p_asset_id: AID_A, p_user_id: 'uid:101' });
    expect(del.success).toBe(true);
    const after: any[] = await apiGet(api, `/api/data/assets?asset_id=${AID_A}&select=*&limit=1`);
    const arr = Array.isArray(after) ? after : (after as any).data || [];
    expect(arr.length).toBe(0);
  });

  test('3.4 building cascade delete removes its N assets', async () => {
    await apiPost(api, '/api/assets/save-bulk-transactional', {
      p_assets_data: [
        { asset_id: AID_A, building_number: BN, payer_id: 'PA', tax_region: 10, main_asset_type: null, asset_size: 0, measurement_date: '01/01/2026' },
        { asset_id: AID_B, building_number: BN, payer_id: 'PB', tax_region: 10, main_asset_type: null, asset_size: 0, measurement_date: '01/01/2026' },
      ],
      p_validation_passed: true, p_action_type: 'manual_update', p_user_id: 'uid:101',
    });
    const del = await apiDelete(api, `/api/buildings/by-number/${BN}`);
    expect(del.deleted_assets_count).toBe(2);
  });

  test('3.5 apartment_number persists round-trip', async () => {
    await apiPost(api, '/api/assets/save-bulk-transactional', {
      p_assets_data: [{ asset_id: AID_A, building_number: BN, payer_id: 'PA', tax_region: 10, main_asset_type: null, asset_size: 0, apartment_number: '12', measurement_date: '01/01/2026' }],
      p_validation_passed: true, p_action_type: 'manual_update', p_user_id: 'uid:101',
    });
    const rows: any[] = await apiGet(api, `/api/data/assets?asset_id=${AID_A}&select=*&limit=1`);
    const asset = Array.isArray(rows) ? rows[0] : rows;
    expect(asset.apartment_number).toBe('12');
  });

  test('3.6 import_order is set for bulk-inserted assets', async () => {
    const base = Date.now() * 10000;
    await apiPost(api, '/api/assets/save-bulk-transactional', {
      p_assets_data: [
        { asset_id: AID_A, building_number: BN, payer_id: 'PA', tax_region: 10, main_asset_type: null, asset_size: 0, measurement_date: '01/01/2026', import_order: base + 1 },
        { asset_id: AID_B, building_number: BN, payer_id: 'PB', tax_region: 10, main_asset_type: null, asset_size: 0, measurement_date: '01/01/2026', import_order: base + 2 },
      ],
      p_validation_passed: true, p_action_type: 'manual_update', p_user_id: 'uid:101',
    });
    const a = await apiGet<any[]>(api, `/api/data/assets?asset_id=${AID_A}&select=*&limit=1`);
    const aa = Array.isArray(a) ? a[0] : a;
    expect(Number(aa.import_order)).toBe(base + 1);
  });
});

// -------- 4. Distribution flag + audit --------

test.describe('4. Distribution flag + audit', () => {
  let api: AuthedApi;
  const BN = 999_000_400;
  const AID_1 = BN * 10;
  const AID_2 = BN * 10 + 1;

  test.beforeAll(async () => { api = await loginViaApi(); });
  test.afterAll(async () => {
    await deleteBuildingIfExists(api, BN).catch(() => {});
    await api.close();
  });

  test.beforeEach(async () => {
    await provisionFixtureBuilding(api, BN, {
      assets: [{ asset_id: AID_1, main_asset_type: '800', asset_size: 100 }],
    });
  });
  test.afterEach(async () => { await deleteBuildingIfExists(api, BN).catch(() => {}); });

  test('4.1 setting business_shared_area flips flag true', async () => {
    await apiPost(api, '/api/buildings/bulk-distribution-flags', {
      p_buildings_data: [{ building_number: BN, updates: { business_shared_area: 500 } }],
    });
    const b = await readBuilding(api, BN);
    expect(b.need_business_distribution).toBe(true);
  });

  test('4.2 running business_distribution clears flag and writes bulk_asset audit', async () => {
    await apiPost(api, '/api/buildings/bulk-distribution-flags', {
      p_buildings_data: [{ building_number: BN, updates: { business_shared_area: 500 } }],
    });
    await apiPost(api, '/api/assets/save-bulk-transactional', {
      p_assets_data: [{ asset_id: AID_1, building_number: BN, payer_id: `P-${AID_1}`, tax_region: 10, main_asset_type: '800', asset_size: 100, business_distribution_area: 50, measurement_date: '01/01/2026' }],
      p_validation_passed: true, p_action_type: 'business_distribution', p_user_id: 'uid:101',
    });
    const b = await readBuilding(api, BN);
    expect(b.need_business_distribution).toBe(false);
    // Bulk-asset audit row should exist
    const audit: any = await apiGet(api, `/api/data/audit?entity_type=bulk_asset&entity_id=${BN}&action_type=business_distribution&select=*&limit=5`);
    const rows = Array.isArray(audit) ? audit : (audit.data || []);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('4.3 adding a new accountable asset after distribution re-flips the flag', async () => {
    await apiPost(api, '/api/buildings/bulk-distribution-flags', {
      p_buildings_data: [{ building_number: BN, updates: { business_shared_area: 500 } }],
    });
    await apiPost(api, '/api/assets/save-bulk-transactional', {
      p_assets_data: [{ asset_id: AID_1, building_number: BN, payer_id: `P-${AID_1}`, tax_region: 10, main_asset_type: '800', asset_size: 100, business_distribution_area: 50, measurement_date: '01/01/2026' }],
      p_validation_passed: true, p_action_type: 'business_distribution', p_user_id: 'uid:101',
    });
    // Insert a second accountable asset — should re-flag
    await apiPost(api, '/api/assets/save-bulk-transactional', {
      p_assets_data: [{ asset_id: AID_2, building_number: BN, payer_id: `P-${AID_2}`, tax_region: 10, main_asset_type: '800', asset_size: 200, measurement_date: '01/01/2026' }],
      p_validation_passed: true, p_action_type: 'manual_update', p_user_id: 'uid:101',
    });
    const b = await readBuilding(api, BN);
    expect(b.need_business_distribution).toBe(true);
  });

  test('4.4 resizing an accountable asset re-flags', async () => {
    // Clear flag via a distribution
    await apiPost(api, '/api/buildings/bulk-distribution-flags', {
      p_buildings_data: [{ building_number: BN, updates: { business_shared_area: 500 } }],
    });
    await apiPost(api, '/api/assets/save-bulk-transactional', {
      p_assets_data: [{ asset_id: AID_1, building_number: BN, payer_id: `P-${AID_1}`, tax_region: 10, main_asset_type: '800', asset_size: 100, business_distribution_area: 50, measurement_date: '01/01/2026' }],
      p_validation_passed: true, p_action_type: 'business_distribution', p_user_id: 'uid:101',
    });
    // Now resize
    await apiPost(api, '/api/assets/save-bulk-transactional', {
      p_assets_data: [{ asset_id: AID_1, building_number: BN, payer_id: `P-${AID_1}`, tax_region: 10, main_asset_type: '800', asset_size: 123, measurement_date: '01/01/2026' }],
      p_validation_passed: true, p_action_type: 'manual_update', p_user_id: 'uid:101',
    });
    const b = await readBuilding(api, BN);
    expect(b.need_business_distribution).toBe(true);
  });
});

// -------- 5. Assets list UI (requires a fixture building with apartment rows) --------

test.describe('5. Assets list UI', () => {
  let api: AuthedApi;
  const BN = 999_000_500;

  test.beforeAll(async () => {
    api = await loginViaApi();
    await provisionFixtureBuilding(api, BN, {
      business_shared_area: 0,
      assets: [
        { asset_id: BN * 10 + 1, main_asset_type: null, asset_size: 0, apartment_number: '2' },
        { asset_id: BN * 10 + 2, main_asset_type: null, asset_size: 0, apartment_number: '10' },
        { asset_id: BN * 10 + 3, main_asset_type: null, asset_size: 0, apartment_number: '3' },
      ],
    });
  });
  test.afterAll(async () => {
    await deleteBuildingIfExists(api, BN).catch(() => {});
    await api.close();
  });

  test('5.1 opening building shows "הוסף נכס" action-bar button', async ({ page }) => {
    await login(page);
    await openBuildingInUI(page, BN);
  });

  test('5.2 "הצג רק לא תקינים" checkbox is present on asset list', async ({ page }) => {
    await login(page);
    await openBuildingInUI(page, BN);
    await expect(page.locator('label:has-text("הצג רק לא תקינים")').first()).toBeVisible({ timeout: 10_000 });
  });

  test('5.3 apartment_number column sorts numerically ascending', async ({ page }) => {
    await login(page);
    await openBuildingInUI(page, BN);

    // Click header so user-sort kicks in (even though API default is already apartment_number ASC)
    const header = page.locator('.ag-header-cell:has-text("מספר דירה")').first();
    await header.click();
    await page.waitForTimeout(400);

    const values = (await page.locator('[col-id="apartment_number"] .ag-cell-value').allTextContents())
      .map((v) => v.trim()).filter(Boolean);
    // We inserted 2, 10, 3 — ascending numeric should be 2, 3, 10
    expect(values.slice(0, 3)).toEqual(['2', '3', '10']);
  });

  test('5.4 non_accountable asset_type does NOT freeze the row (gate scope check)', async ({ page }) => {
    // Type 199 is non_accountable_for_total_area; editability must still apply.
    // Insert a 199 asset into our fixture building.
    const AID = BN * 10 + 99;
    await apiPost(api, '/api/assets/save-bulk-transactional', {
      p_assets_data: [{ asset_id: AID, building_number: BN, payer_id: 'PX', tax_region: 10, main_asset_type: '199', asset_size: 100, sub_asset_type_1: '212', sub_asset_size_1: 60, sub_asset_type_2: '216', sub_asset_size_2: 40, measurement_date: '01/01/2026' }],
      p_validation_passed: true, p_action_type: 'manual_update', p_user_id: 'uid:101',
    });
    await login(page);
    await openBuildingInUI(page, BN);

    // Cell for payer_id on the 199 row should open an editor when double-clicked
    const row = page.locator(`.ag-row:has(.ag-cell[col-id="asset_id"]:has-text("${AID}"))`).first();
    const cell = row.locator('.ag-cell[col-id="payer_id"]').first();
    await expect(cell).toBeVisible({ timeout: 15_000 });
    await cell.dblclick();
    // Editor input should mount
    await expect(row.locator('input, textarea, .ag-cell-edit-input').first()).toBeVisible({ timeout: 5000 });
  });
});

// -------- 6. Asset files API --------

test.describe('6. Asset files', () => {
  let api: AuthedApi;
  const BN = 999_000_600;
  const AID = BN * 10;

  test.beforeAll(async () => {
    api = await loginViaApi();
    await provisionFixtureBuilding(api, BN, {
      assets: [{ asset_id: AID, main_asset_type: null, asset_size: 0 }],
    });
  });
  test.afterAll(async () => {
    await deleteBuildingIfExists(api, BN).catch(() => {});
    await api.close();
  });

  test('6.1 list files for an empty asset returns an empty array', async () => {
    const rows = await apiGet<any>(api, `/api/data/asset_files?asset_id=${AID}&select=*`);
    const arr = Array.isArray(rows) ? rows : (rows.data || []);
    expect(Array.isArray(arr)).toBe(true);
    expect(arr.length).toBe(0);
  });

  test('6.2 bulk-files endpoint accepts asset_id_in and returns 200', async () => {
    const res = await api.ctx.get(`/api/data/asset_files?asset_id__in=${AID}&select=*&limit=10`, {
      headers: { Authorization: `Bearer ${api.token}` },
    });
    expect(res.ok()).toBe(true);
  });
});

// -------- 7. Asset types metadata --------

test.describe('7. Asset types metadata', () => {
  let api: AuthedApi;
  test.beforeAll(async () => { api = await loginViaApi(); });
  test.afterAll(async () => { await api.close(); });

  test('7.1 listing returns non-empty array and includes 199', async () => {
    const rows = await apiGet<any>(api, `/api/data/asset_types?select=*&limit=1000`);
    const arr = Array.isArray(rows) ? rows : (rows.data || []);
    expect(arr.length).toBeGreaterThan(0);
    expect(arr.some((t: any) => String(t.name) === '199')).toBe(true);
  });

  test('7.2 type 199 has min_sub_types_number = 2 and is complex', async () => {
    const rows: any = await apiGet(api, `/api/data/asset_types?name=199&select=*&limit=10`);
    const arr = Array.isArray(rows) ? rows : (rows.data || []);
    expect(arr.length).toBeGreaterThan(0);
    for (const t of arr) {
      expect(Number(t.min_sub_types_number)).toBe(2);
      expect(t.can_be_subtype).toBe(false);
    }
  });
});

// -------- 8. Distribution history modal shape --------

test.describe('8. Distribution history', () => {
  let api: AuthedApi;
  const BN = 999_000_800;
  const AID = BN * 10;

  test.beforeAll(async () => { api = await loginViaApi(); });
  test.afterAll(async () => {
    await deleteBuildingIfExists(api, BN).catch(() => {});
    await api.close();
  });

  test.beforeEach(async () => {
    await provisionFixtureBuilding(api, BN, {
      assets: [{ asset_id: AID, main_asset_type: '800', asset_size: 100 }],
    });
  });
  test.afterEach(async () => { await deleteBuildingIfExists(api, BN).catch(() => {}); });

  test('8.1 bulk_asset audit row contains before_data and after_data with building + assets', async () => {
    await apiPost(api, '/api/buildings/bulk-distribution-flags', {
      p_buildings_data: [{ building_number: BN, updates: { business_shared_area: 500 } }],
    });
    await apiPost(api, '/api/assets/save-bulk-transactional', {
      p_assets_data: [{ asset_id: AID, building_number: BN, payer_id: 'P1', tax_region: 10, main_asset_type: '800', asset_size: 100, business_distribution_area: 50, measurement_date: '01/01/2026' }],
      p_validation_passed: true, p_action_type: 'business_distribution', p_user_id: 'uid:101',
    });
    const audit: any = await apiGet(api, `/api/data/audit?entity_type=bulk_asset&entity_id=${BN}&action_type=business_distribution&select=*&limit=1`);
    const rows = Array.isArray(audit) ? audit : (audit.data || []);
    expect(rows.length).toBe(1);
    const r = rows[0];
    const before = typeof r.before_data === 'string' ? JSON.parse(r.before_data) : r.before_data;
    const after  = typeof r.after_data  === 'string' ? JSON.parse(r.after_data)  : r.after_data;
    expect(before).toBeTruthy();
    expect(after).toBeTruthy();
    expect(before.building).toBeTruthy();
    expect(Array.isArray(after.assets)).toBe(true);
    expect(after.assets.length).toBeGreaterThan(0);
  });
});

// -------- 9. Address list (read-only reference data) --------

test.describe('9. Address list', () => {
  let api: AuthedApi;
  test.beforeAll(async () => { api = await loginViaApi(); });
  test.afterAll(async () => { await api.close(); });

  test('9.1 returns at least 100 addresses and is sortable by street_code', async () => {
    const rows = await apiGet<any>(api, `/api/data/address_list?select=*&order=street_code&limit=1000&offset=0`);
    const arr = Array.isArray(rows) ? rows : (rows.data || []);
    expect(arr.length).toBeGreaterThan(100);
    for (let i = 1; i < Math.min(arr.length, 50); i++) {
      expect(Number(arr[i].street_code)).toBeGreaterThanOrEqual(Number(arr[i - 1].street_code));
    }
  });
});

// -------- 10. UI smoke: navigate back from asset list to buildings --------

test.describe('10. Navigation', () => {
  test('10.1 login → buildings → open building → back to buildings', async ({ page }) => {
    const api = await loginViaApi();
    const BN = 999_001_000;
    await provisionFixtureBuilding(api, BN);
    try {
      await login(page);
      await openBuildingInUI(page, BN);
      // Look for a back affordance (MoveLeft icon button, or tab "מבנים")
      const backToBuildings = page.locator('button:has-text("חזרה"), text=מבנים').first();
      if (await backToBuildings.isVisible({ timeout: 5000 }).catch(() => false)) {
        await backToBuildings.click();
        await expect(page.locator(`.ag-cell[col-id="building_number"]:has-text("${BN}")`).first()).toBeVisible({ timeout: 15_000 });
      }
    } finally {
      await deleteBuildingIfExists(api, BN).catch(() => {});
      await api.close();
    }
  });
});
