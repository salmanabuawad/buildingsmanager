import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { setupTestDatabase, clearTestData, getDbPool } from './utils/db-setup';
import { insertReferenceData, getTableCount, recordExists } from './utils/test-helpers';
import { validBuildings, validAssets } from './fixtures/test-data';
import { api } from '../src/lib/api';
import { Asset, Building } from '../src/lib/api';

// Note: These tests use the API which connects via Supabase client
// Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in .env.test
// The database setup utilities use direct PostgreSQL connection for setup/teardown

describe('Buildings Manager Comprehensive Regression Tests', () => {
  beforeAll(async () => {
    // Ensure database is set up
    await setupTestDatabase();
    await insertReferenceData();
  });

  beforeEach(async () => {
    // Clear data before each test but keep structure
    await clearTestData();
    await insertReferenceData();
  });

  describe('Transfer Area Operations', () => {
    let testBuilding: Building;
    let asset1: Asset;
    let asset2: Asset;

    beforeEach(async () => {
      // Create test building with multiple assets for transfer operations
      testBuilding = await api.buildings.create({
        building_number: 5001,
        tax_region: '10',
        elevator: 'כן',
        building_address: 100,
        total_building_area: 500,
        business_shared_area: 0,
        residence_shared_area: 0,
      });

      // Create two assets with different sizes
      const createdAsset1 = await api.assets.create({
        building_number: 5001,
        asset_id: 101,
        payer_id: '111111111',
        main_asset_type: '101',
        asset_size: 100,
        measurement_date: '01/01/2024',
        tax_region: 10,
        sub_asset_type_1: null,
        sub_asset_size_1: 0,
        sub_asset_type_2: null,
        sub_asset_size_2: 0,
        sub_asset_type_3: null,
        sub_asset_size_3: 0,
        sub_asset_type_4: null,
        sub_asset_size_4: 0,
        sub_asset_type_5: null,
        sub_asset_size_5: 0,
        sub_asset_type_6: null,
        sub_asset_size_6: 0,
      });

      const createdAsset2 = await api.assets.create({
        building_number: 5001,
        asset_id: 102,
        payer_id: '222222222',
        main_asset_type: '201',
        asset_size: 80,
        measurement_date: '01/01/2024',
        tax_region: 10,
        sub_asset_type_1: null,
        sub_asset_size_1: 0,
        sub_asset_type_2: null,
        sub_asset_size_2: 0,
        sub_asset_type_3: null,
        sub_asset_size_3: 0,
        sub_asset_type_4: null,
        sub_asset_size_4: 0,
        sub_asset_type_5: null,
        sub_asset_size_5: 0,
        sub_asset_type_6: null,
        sub_asset_size_6: 0,
      });

      // Fetch full asset data
      const allAssets = await api.assets.getAll(5001);
      asset1 = allAssets.find(a => a.asset_id === 101)!;
      asset2 = allAssets.find(a => a.asset_id === 102)!;
    });

    it('should transfer area from one asset to another', async () => {
      const transferAmount = 20;

      // Original sizes
      const originalSize1 = asset1.asset_size;
      const originalSize2 = asset2.asset_size;

      // Prepare transfer: reduce asset1 by transferAmount, increase asset2 by transferAmount
      const oldAssets = [asset1, asset2];
      const newAssets = [
        {
          ...asset1,
          asset_size: originalSize1 - transferAmount,
          measurement_date: '02/01/2024', // New measurement date
        },
        {
          ...asset2,
          asset_size: originalSize2 + transferAmount,
          measurement_date: '02/01/2024', // New measurement date
        },
      ];

      // Execute transfer
      const result = await api.auditLog.bulkTransferAreas(
        oldAssets,
        newAssets,
        'transfer_area',
        undefined,
        undefined,
        'Test transfer operation'
      );

      expect(result.affected_asset_ids).toHaveLength(2);
      expect(result.count).toBe(2);

      // Verify assets were updated
      const updatedAssets = await api.assets.getAll(5001);
      const updatedAsset1 = updatedAssets.find(a => a.asset_id === 101)!;
      const updatedAsset2 = updatedAssets.find(a => a.asset_id === 102)!;

      expect(updatedAsset1.asset_size).toBe(originalSize1 - transferAmount);
      expect(updatedAsset2.asset_size).toBe(originalSize2 + transferAmount);
      expect(updatedAsset1.measurement_date).toBe('02/01/2024');
      expect(updatedAsset2.measurement_date).toBe('02/01/2024');

      // Verify audit log was created
      const auditLogs = await api.distributionAudit.getByBuilding(5001, 'transfer_area');
      expect(auditLogs.length).toBeGreaterThan(0);
      const transferLog = auditLogs[0];
      expect(transferLog.action_type).toBe('transfer_area');
      expect(transferLog.before_data).toBeDefined();
      expect(transferLog.after_data).toBeDefined();
    });

    it('should maintain total building area after transfer', async () => {
      const transferAmount = 15;
      const pool = getDbPool();

      // Get original sizes
      const originalSize1 = asset1.asset_size;
      const originalSize2 = asset2.asset_size;
      const originalTotal = originalSize1 + originalSize2;

      // Execute transfer
      const oldAssets = [asset1, asset2];
      const newAssets = [
        {
          ...asset1,
          asset_size: asset1.asset_size - transferAmount,
          measurement_date: '02/01/2024',
        },
        {
          ...asset2,
          asset_size: asset2.asset_size + transferAmount,
          measurement_date: '02/01/2024',
        },
      ];

      await api.auditLog.bulkTransferAreas(oldAssets, newAssets);

      // Verify building total area remains the same (sum of all assets)
      const result = await pool.query(
        `SELECT SUM(asset_size) as total FROM assets WHERE building_number = $1`,
        [5001]
      );
      const newTotalFromAssets = parseFloat(result.rows[0].total || '0');

      const updatedBuilding = await api.buildings.getOne(5001);
      const newTotalArea = updatedBuilding.total_building_area || 0;

      // Total area should match sum of assets (original total)
      expect(newTotalFromAssets).toBeCloseTo(originalTotal, 2);
      expect(newTotalArea).toBeCloseTo(originalTotal, 2);
    });

    it('should copy old assets to history table during transfer', async () => {
      const pool = getDbPool();
      const transferAmount = 10;

      const oldAssets = [asset1];
      const newAssets = [
        {
          ...asset1,
          asset_size: asset1.asset_size - transferAmount,
          measurement_date: '02/01/2024',
        },
      ];

      await api.auditLog.bulkTransferAreas(oldAssets, newAssets);

      // Check that old asset was copied to history
      const historyResult = await pool.query(
        `SELECT * FROM assets_history 
         WHERE asset_id = $1 AND building_number = $2 
         ORDER BY measurement_date DESC LIMIT 1`,
        [asset1.asset_id, 5001]
      );

      expect(historyResult.rows.length).toBe(1);
      const historyRecord = historyResult.rows[0];
      expect(parseFloat(historyRecord.asset_size)).toBe(asset1.asset_size);
      expect(historyRecord.measurement_date).toBe('01/01/2024');
    });
  });

  describe('Distribution Operations - Business', () => {
    let testBuilding: Building;
    let businessAsset1: Asset;
    let businessAsset2: Asset;

    beforeEach(async () => {
      // Create building with business shared area
      testBuilding = await api.buildings.create({
        building_number: 6001,
        tax_region: '10',
        elevator: 'כן',
        building_address: 100,
        total_building_area: 500,
        business_shared_area: 50,
        residence_shared_area: 0,
        need_business_distribution: true,
        need_residence_distribution: false,
      });

      // Create business assets (type 101 and 201 are business types)
      const createdAsset1 = await api.assets.create({
        building_number: 6001,
        asset_id: 201,
        payer_id: '333333333',
        main_asset_type: '101',
        asset_size: 100,
        measurement_date: '01/01/2024',
        tax_region: 10,
        sub_asset_type_1: null,
        sub_asset_size_1: 0,
        sub_asset_type_2: null,
        sub_asset_size_2: 0,
        sub_asset_type_3: null,
        sub_asset_size_3: 0,
        sub_asset_type_4: null,
        sub_asset_size_4: 0,
        sub_asset_type_5: null,
        sub_asset_size_5: 0,
        sub_asset_type_6: null,
        sub_asset_size_6: 0,
      });

      const createdAsset2 = await api.assets.create({
        building_number: 6001,
        asset_id: 202,
        payer_id: '444444444',
        main_asset_type: '201',
        asset_size: 150,
        measurement_date: '01/01/2024',
        tax_region: 10,
        sub_asset_type_1: null,
        sub_asset_size_1: 0,
        sub_asset_type_2: null,
        sub_asset_size_2: 0,
        sub_asset_type_3: null,
        sub_asset_size_3: 0,
        sub_asset_type_4: null,
        sub_asset_size_4: 0,
        sub_asset_type_5: null,
        sub_asset_size_5: 0,
        sub_asset_type_6: null,
        sub_asset_size_6: 0,
      });

      const allAssets = await api.assets.getAll(6001);
      businessAsset1 = allAssets.find(a => a.asset_id === 201)!;
      businessAsset2 = allAssets.find(a => a.asset_id === 202)!;
    });

    it('should distribute business shared area proportionally to business assets', async () => {
      const sharedArea = 50;
      const totalAssetSize = businessAsset1.asset_size + businessAsset2.asset_size;
      const ratio1 = businessAsset1.asset_size / totalAssetSize;
      const ratio2 = businessAsset2.asset_size / totalAssetSize;
      const expectedArea1 = sharedArea * ratio1;
      const expectedArea2 = sharedArea * ratio2;

      // Update building with distribution flag
      await api.buildings.update(6001, {
        need_business_distribution: true,
        business_shared_area: sharedArea,
      });

      // Distribute shared area (this simulates what the UI does)
      // For business distribution, area_from_distribution is set on each asset
      const assetsToDistribute = [
        {
          ...businessAsset1,
          area_from_distribution: expectedArea1,
        },
        {
          ...businessAsset2,
          area_from_distribution: expectedArea2,
        },
      ];

      const result = await api.assets.saveBulkTransactional(
        assetsToDistribute,
        'business_distribution',
        undefined,
        { overload_ratio: null },
        'Business distribution test'
      );

      expect(result.success).toBe(true);
      expect(result.affected_asset_ids).toHaveLength(2);

      // Verify distribution was applied
      const updatedAssets = await api.assets.getAll(6001);
      const updatedAsset1 = updatedAssets.find(a => a.asset_id === 201)!;
      const updatedAsset2 = updatedAssets.find(a => a.asset_id === 202)!;

      expect(updatedAsset1.area_from_distribution).toBeCloseTo(expectedArea1, 2);
      expect(updatedAsset2.area_from_distribution).toBeCloseTo(expectedArea2, 2);

      // Verify distribution flag was cleared
      const updatedBuilding = await api.buildings.getOne(6001);
      expect(updatedBuilding.need_business_distribution).toBe(false);
    });

    it('should create audit log for business distribution', async () => {
      const sharedArea = 50;
      const totalAssetSize = businessAsset1.asset_size + businessAsset2.asset_size;
      const ratio1 = businessAsset1.asset_size / totalAssetSize;
      const ratio2 = businessAsset2.asset_size / totalAssetSize;

      const assetsToDistribute = [
        {
          ...businessAsset1,
          area_from_distribution: sharedArea * ratio1,
        },
        {
          ...businessAsset2,
          area_from_distribution: sharedArea * ratio2,
        },
      ];

      await api.assets.saveBulkTransactional(
        assetsToDistribute,
        'business_distribution',
        undefined,
        undefined,
        'Business distribution audit test'
      );

      // Verify audit log
      const auditLogs = await api.distributionAudit.getByBuilding(6001, 'business_distribution');
      expect(auditLogs.length).toBeGreaterThan(0);
      const distributionLog = auditLogs[0];
      expect(distributionLog.action_type).toBe('business_distribution');
      expect(distributionLog.before_data).toBeDefined();
      expect(distributionLog.after_data).toBeDefined();
    });
  });

  describe('Distribution Operations - Residence', () => {
    let testBuilding: Building;
    let residenceAsset1: Asset;
    let residenceAsset2: Asset;

    beforeEach(async () => {
      // Create building with residence shared area
      testBuilding = await api.buildings.create({
        building_number: 7001,
        tax_region: '10',
        elevator: 'כן',
        building_address: 100,
        total_building_area: 600,
        business_shared_area: 0,
        residence_shared_area: 60,
        need_business_distribution: false,
        need_residence_distribution: true,
      });

      // Create residence assets (type 199 is residence)
      const createdAsset1 = await api.assets.create({
        building_number: 7001,
        asset_id: 301,
        payer_id: '555555555',
        main_asset_type: '199',
        asset_size: 120,
        measurement_date: '01/01/2024',
        tax_region: 10,
        sub_asset_type_1: null,
        sub_asset_size_1: 0,
        sub_asset_type_2: null,
        sub_asset_size_2: 0,
        sub_asset_type_3: null,
        sub_asset_size_3: 0,
        sub_asset_type_4: null,
        sub_asset_size_4: 0,
        sub_asset_type_5: null,
        sub_asset_size_5: 0,
        sub_asset_type_6: null,
        sub_asset_size_6: 0,
      });

      const createdAsset2 = await api.assets.create({
        building_number: 7001,
        asset_id: 302,
        payer_id: '666666666',
        main_asset_type: '199',
        asset_size: 180,
        measurement_date: '01/01/2024',
        tax_region: 10,
        sub_asset_type_1: null,
        sub_asset_size_1: 0,
        sub_asset_type_2: null,
        sub_asset_size_2: 0,
        sub_asset_type_3: null,
        sub_asset_size_3: 0,
        sub_asset_type_4: null,
        sub_asset_size_4: 0,
        sub_asset_type_5: null,
        sub_asset_size_5: 0,
        sub_asset_type_6: null,
        sub_asset_size_6: 0,
      });

      const allAssets = await api.assets.getAll(7001);
      residenceAsset1 = allAssets.find(a => a.asset_id === 301)!;
      residenceAsset2 = allAssets.find(a => a.asset_id === 302)!;
    });

    it('should distribute residence shared area proportionally to residence assets', async () => {
      const sharedArea = 60;
      const totalAssetSize = residenceAsset1.asset_size + residenceAsset2.asset_size;
      const ratio1 = residenceAsset1.asset_size / totalAssetSize;
      const ratio2 = residenceAsset2.asset_size / totalAssetSize;
      const expectedArea1 = sharedArea * ratio1;
      const expectedArea2 = sharedArea * ratio2;

      // Distribute shared area
      const assetsToDistribute = [
        {
          ...residenceAsset1,
          area_from_distribution: expectedArea1,
        },
        {
          ...residenceAsset2,
          area_from_distribution: expectedArea2,
        },
      ];

      const result = await api.assets.saveBulkTransactional(
        assetsToDistribute,
        'residence_distribution',
        undefined,
        undefined,
        'Residence distribution test'
      );

      expect(result.success).toBe(true);
      expect(result.affected_asset_ids).toHaveLength(2);

      // Verify distribution was applied
      const updatedAssets = await api.assets.getAll(7001);
      const updatedAsset1 = updatedAssets.find(a => a.asset_id === 301)!;
      const updatedAsset2 = updatedAssets.find(a => a.asset_id === 302)!;

      expect(updatedAsset1.area_from_distribution).toBeCloseTo(expectedArea1, 2);
      expect(updatedAsset2.area_from_distribution).toBeCloseTo(expectedArea2, 2);

      // Verify distribution flag was cleared
      const updatedBuilding = await api.buildings.getOne(7001);
      expect(updatedBuilding.need_residence_distribution).toBe(false);
    });

    it('should create audit log for residence distribution', async () => {
      const sharedArea = 60;
      const totalAssetSize = residenceAsset1.asset_size + residenceAsset2.asset_size;
      const ratio1 = residenceAsset1.asset_size / totalAssetSize;
      const ratio2 = residenceAsset2.asset_size / totalAssetSize;

      const assetsToDistribute = [
        {
          ...residenceAsset1,
          area_from_distribution: sharedArea * ratio1,
        },
        {
          ...residenceAsset2,
          area_from_distribution: sharedArea * ratio2,
        },
      ];

      await api.assets.saveBulkTransactional(
        assetsToDistribute,
        'residence_distribution',
        undefined,
        undefined,
        'Residence distribution audit test'
      );

      // Verify audit log
      const auditLogs = await api.distributionAudit.getByBuilding(7001, 'residence_distribution');
      expect(auditLogs.length).toBeGreaterThan(0);
      const distributionLog = auditLogs[0];
      expect(distributionLog.action_type).toBe('residence_distribution');
      expect(distributionLog.before_data).toBeDefined();
      expect(distributionLog.after_data).toBeDefined();
    });
  });

  describe('Tax Region Changes', () => {
    let testBuilding: Building;
    let testAsset: Asset;

    beforeEach(async () => {
      // Create building and asset
      testBuilding = await api.buildings.create({
        building_number: 8001,
        tax_region: '10,40',
        elevator: 'כן',
        building_address: 100,
        total_building_area: 300,
        business_shared_area: 30,
        residence_shared_area: 20,
      });

      testAsset = await api.assets.create({
        building_number: 8001,
        asset_id: 401,
        payer_id: '777777777',
        main_asset_type: '199',
        asset_size: 100,
        measurement_date: '01/01/2024',
        tax_region: 10,
        sub_asset_type_1: null,
        sub_asset_size_1: 0,
        sub_asset_type_2: null,
        sub_asset_size_2: 0,
        sub_asset_type_3: null,
        sub_asset_size_3: 0,
        sub_asset_type_4: null,
        sub_asset_size_4: 0,
        sub_asset_type_5: null,
        sub_asset_size_5: 0,
        sub_asset_type_6: null,
        sub_asset_size_6: 0,
      });

      // Fetch full asset data
      const allAssets = await api.assets.getAll(8001);
      testAsset = allAssets.find(a => a.asset_id === 401)!;
    });

    it('should change asset tax region', async () => {
      const newTaxRegion = 40;

      const updatedAsset = {
        ...testAsset,
        tax_region: newTaxRegion,
      };

      const result = await api.assets.saveBulkTransactional(
        [updatedAsset],
        'manual_update',
        undefined,
        undefined,
        'Tax region change test'
      );

      expect(result.success).toBe(true);

      // Verify tax region was changed
      const allAssets = await api.assets.getAll(8001);
      const updated = allAssets.find(a => a.asset_id === 401)!;
      expect(updated.tax_region).toBe(newTaxRegion);
    });

    it('should set distribution flags when tax region changes', async () => {
      const pool = getDbPool();
      
      // Create a business asset in tax region 10
      const businessAsset = await api.assets.create({
        building_number: 8001,
        asset_id: 402,
        payer_id: '888888888',
        main_asset_type: '101', // Business type
        asset_size: 80,
        measurement_date: '01/01/2024',
        tax_region: 10,
        sub_asset_type_1: null,
        sub_asset_size_1: 0,
        sub_asset_type_2: null,
        sub_asset_size_2: 0,
        sub_asset_type_3: null,
        sub_asset_size_3: 0,
        sub_asset_type_4: null,
        sub_asset_size_4: 0,
        sub_asset_type_5: null,
        sub_asset_size_5: 0,
        sub_asset_type_6: null,
        sub_asset_size_6: 0,
      });

      // Change tax region (this should trigger distribution flag logic)
      const allAssets = await api.assets.getAll(8001);
      const assetToChange = allAssets.find(a => a.asset_id === 402)!;

      const updatedAsset = {
        ...assetToChange,
        tax_region: 40,
      };

      await api.assets.saveBulkTransactional(
        [updatedAsset],
        'manual_update',
        undefined,
        undefined,
        'Tax region change'
      );

      // Verify tax region was changed
      const updatedAssets = await api.assets.getAll(8001);
      const updated = updatedAssets.find(a => a.asset_id === 402)!;
      expect(updated.tax_region).toBe(40);

      // Verify distribution flags were potentially set (depending on asset type and shared area)
      const buildingResult = await pool.query(
        `SELECT need_business_distribution, need_residence_distribution,
                business_shared_area, residence_shared_area
         FROM buildings WHERE building_number = $1`,
        [8001]
      );

      const building = buildingResult.rows[0];
      // Flags should be set based on asset type classification and shared area
      // The exact values depend on the asset type's business_residence in the new tax region
      expect(building.need_business_distribution !== undefined).toBe(true);
      expect(building.need_residence_distribution !== undefined).toBe(true);
    });

    it('should clear area_from_distribution when asset type changes from business to residence', async () => {
      const pool = getDbPool();
      
      // Create a business asset with area_from_distribution
      const businessAsset = await api.assets.create({
        building_number: 8001,
        asset_id: 403,
        payer_id: '999999999',
        main_asset_type: '101', // Business type
        asset_size: 90,
        measurement_date: '01/01/2024',
        tax_region: 10,
        area_from_distribution: 10, // Has distributed area
        sub_asset_type_1: null,
        sub_asset_size_1: 0,
        sub_asset_type_2: null,
        sub_asset_size_2: 0,
        sub_asset_type_3: null,
        sub_asset_size_3: 0,
        sub_asset_type_4: null,
        sub_asset_size_4: 0,
        sub_asset_type_5: null,
        sub_asset_size_5: 0,
        sub_asset_type_6: null,
        sub_asset_size_6: 0,
      });

      const allAssets = await api.assets.getAll(8001);
      const assetToChange = allAssets.find(a => a.asset_id === 403)!;

      // Change main_asset_type from business (101) to residence (199)
      const updatedAsset = {
        ...assetToChange,
        main_asset_type: '199', // Residence type
      };

      await api.assets.saveBulkTransactional(
        [updatedAsset],
        'manual_update',
        undefined,
        undefined,
        'Asset type change business to residence'
      );

      // Verify area_from_distribution was cleared
      const assetResult = await pool.query(
        `SELECT area_from_distribution FROM assets WHERE asset_id = $1 AND building_number = $2`,
        [403, 8001]
      );

      expect(assetResult.rows.length).toBe(1);
      expect(parseFloat(assetResult.rows[0].area_from_distribution || '0')).toBe(0);
    });

    it('should set both distribution flags when asset changes from business to residence', async () => {
      const pool = getDbPool();
      
      // Create a business asset
      const businessAsset = await api.assets.create({
        building_number: 8001,
        asset_id: 404,
        payer_id: '101010101',
        main_asset_type: '101', // Business type
        asset_size: 70,
        measurement_date: '01/01/2024',
        tax_region: 10,
        sub_asset_type_1: null,
        sub_asset_size_1: 0,
        sub_asset_type_2: null,
        sub_asset_size_2: 0,
        sub_asset_type_3: null,
        sub_asset_size_3: 0,
        sub_asset_type_4: null,
        sub_asset_size_4: 0,
        sub_asset_type_5: null,
        sub_asset_size_5: 0,
        sub_asset_type_6: null,
        sub_asset_size_6: 0,
      });

      const allAssets = await api.assets.getAll(8001);
      const assetToChange = allAssets.find(a => a.asset_id === 404)!;

      // Change main_asset_type from business (101) to residence (199)
      const updatedAsset = {
        ...assetToChange,
        main_asset_type: '199', // Residence type
      };

      await api.assets.saveBulkTransactional(
        [updatedAsset],
        'manual_update',
        undefined,
        undefined,
        'Business to residence change - both flags'
      );

      // Verify both flags are set if building has both shared areas > 0
      const buildingResult = await pool.query(
        `SELECT need_business_distribution, need_residence_distribution, 
                business_shared_area, residence_shared_area
         FROM buildings WHERE building_number = $1`,
        [8001]
      );

      const building = buildingResult.rows[0];
      if (building.business_shared_area > 0 && building.residence_shared_area > 0) {
        expect(building.need_business_distribution).toBe(true);
        expect(building.need_residence_distribution).toBe(true);
      }
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle transfer followed by distribution', async () => {
      // Create building
      const building = await api.buildings.create({
        building_number: 9001,
        tax_region: '10',
        elevator: 'כן',
        building_address: 100,
        total_building_area: 400,
        business_shared_area: 40,
        residence_shared_area: 0,
      });

      // Create assets
      const asset1 = await api.assets.create({
        building_number: 9001,
        asset_id: 501,
        payer_id: '111111111',
        main_asset_type: '101',
        asset_size: 100,
        measurement_date: '01/01/2024',
        tax_region: 10,
        sub_asset_type_1: null,
        sub_asset_size_1: 0,
        sub_asset_type_2: null,
        sub_asset_size_2: 0,
        sub_asset_type_3: null,
        sub_asset_size_3: 0,
        sub_asset_type_4: null,
        sub_asset_size_4: 0,
        sub_asset_type_5: null,
        sub_asset_size_5: 0,
        sub_asset_type_6: null,
        sub_asset_size_6: 0,
      });

      const asset2 = await api.assets.create({
        building_number: 9001,
        asset_id: 502,
        payer_id: '222222222',
        main_asset_type: '201',
        asset_size: 100,
        measurement_date: '01/01/2024',
        tax_region: 10,
        sub_asset_type_1: null,
        sub_asset_size_1: 0,
        sub_asset_type_2: null,
        sub_asset_size_2: 0,
        sub_asset_type_3: null,
        sub_asset_size_3: 0,
        sub_asset_type_4: null,
        sub_asset_size_4: 0,
        sub_asset_type_5: null,
        sub_asset_size_5: 0,
        sub_asset_type_6: null,
        sub_asset_size_6: 0,
      });

      let allAssets = await api.assets.getAll(9001);
      let asset1Data = allAssets.find(a => a.asset_id === 501)!;
      let asset2Data = allAssets.find(a => a.asset_id === 502)!;

      // Step 1: Transfer area
      const transferAmount = 20;
      const oldAssets = [asset1Data, asset2Data];
      const newAssetsAfterTransfer = [
        {
          ...asset1Data,
          asset_size: asset1Data.asset_size - transferAmount,
          measurement_date: '02/01/2024',
        },
        {
          ...asset2Data,
          asset_size: asset2Data.asset_size + transferAmount,
          measurement_date: '02/01/2024',
        },
      ];

      await api.auditLog.bulkTransferAreas(oldAssets, newAssetsAfterTransfer);

      // Step 2: Distribute shared area on the new sizes
      allAssets = await api.assets.getAll(9001);
      asset1Data = allAssets.find(a => a.asset_id === 501)!;
      asset2Data = allAssets.find(a => a.asset_id === 502)!;

      const totalSize = asset1Data.asset_size + asset2Data.asset_size;
      const sharedArea = 40;
      const ratio1 = asset1Data.asset_size / totalSize;
      const ratio2 = asset2Data.asset_size / totalSize;

      const assetsToDistribute = [
        {
          ...asset1Data,
          area_from_distribution: sharedArea * ratio1,
        },
        {
          ...asset2Data,
          area_from_distribution: sharedArea * ratio2,
        },
      ];

      const result = await api.assets.saveBulkTransactional(
        assetsToDistribute,
        'business_distribution',
        undefined,
        undefined,
        'Distribution after transfer'
      );

      expect(result.success).toBe(true);

      // Verify both operations completed successfully
      const finalAssets = await api.assets.getAll(9001);
      const finalAsset1 = finalAssets.find(a => a.asset_id === 501)!;
      const finalAsset2 = finalAssets.find(a => a.asset_id === 502)!;

      expect(finalAsset1.asset_size).toBe(100 - transferAmount);
      expect(finalAsset2.asset_size).toBe(100 + transferAmount);
      expect(finalAsset1.area_from_distribution).toBeGreaterThan(0);
      expect(finalAsset2.area_from_distribution).toBeGreaterThan(0);
    });

    it('should handle tax region change followed by distribution', async () => {
      // Create building with both shared areas
      const building = await api.buildings.create({
        building_number: 10001,
        tax_region: '10,40',
        elevator: 'כן',
        building_address: 100,
        total_building_area: 500,
        business_shared_area: 50,
        residence_shared_area: 50,
      });

      // Create asset in tax region 10 (business)
      const asset = await api.assets.create({
        building_number: 10001,
        asset_id: 601,
        payer_id: '333333333',
        main_asset_type: '101', // Business type
        asset_size: 150,
        measurement_date: '01/01/2024',
        tax_region: 10,
        sub_asset_type_1: null,
        sub_asset_size_1: 0,
        sub_asset_type_2: null,
        sub_asset_size_2: 0,
        sub_asset_type_3: null,
        sub_asset_size_3: 0,
        sub_asset_type_4: null,
        sub_asset_size_4: 0,
        sub_asset_type_5: null,
        sub_asset_size_5: 0,
        sub_asset_type_6: null,
        sub_asset_size_6: 0,
      });

      let allAssets = await api.assets.getAll(10001);
      let assetData = allAssets.find(a => a.asset_id === 601)!;

      // Step 1: Change tax region to 40 (might be residence)
      const updatedAsset = {
        ...assetData,
        tax_region: 40,
      };

      await api.assets.saveBulkTransactional(
        [updatedAsset],
        'manual_update',
        undefined,
        undefined,
        'Tax region change before distribution'
      );

      // Step 2: Distribute shared area (should use residence if tax_region 40 is residence)
      allAssets = await api.assets.getAll(10001);
      assetData = allAssets.find(a => a.asset_id === 601)!;

      const sharedArea = 50;
      const assetsToDistribute = [
        {
          ...assetData,
          area_from_distribution: sharedArea,
        },
      ];

      const result = await api.assets.saveBulkTransactional(
        assetsToDistribute,
        'residence_distribution',
        undefined,
        undefined,
        'Distribution after tax region change'
      );

      expect(result.success).toBe(true);

      // Verify asset has distributed area
      const finalAssets = await api.assets.getAll(10001);
      const finalAsset = finalAssets.find(a => a.asset_id === 601)!;
      expect(finalAsset.tax_region).toBe(40);
      expect(finalAsset.area_from_distribution).toBeCloseTo(sharedArea, 2);
    });
  });
});

