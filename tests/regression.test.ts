import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { setupTestDatabase, clearTestData, getDbPool } from './utils/db-setup';
import { insertReferenceData, getTableCount, recordExists } from './utils/test-helpers';
import { validBuildings, invalidBuildings, validAssets, invalidAssets } from './fixtures/test-data';
import { api } from '../src/lib/api';

// Note: These tests use the API which connects via Supabase client
// Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in .env.test
// The database setup utilities use direct PostgreSQL connection for setup/teardown

describe('Buildings Manager Regression Tests', () => {
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

  describe('Database Setup', () => {
    it('should have all tables created', async () => {
      const pool = getDbPool();
      
      const tables = [
        'buildings',
        'assets',
        'asset_types',      // Reference table
        'validation_rules', // Reference table
        'address_list',     // Reference table
      ];
      
      for (const table of tables) {
        const result = await pool.query(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = $1
          )`,
          [table]
        );
        expect(result.rows[0].exists).toBe(true);
      }
    });

    it('should have reference tables populated (asset_types, address_list, validation_rules)', async () => {
      expect(await getTableCount('address_list')).toBeGreaterThan(0);
      expect(await getTableCount('asset_types')).toBeGreaterThan(0);
      expect(await getTableCount('validation_rules')).toBeGreaterThan(0);
    });
  });

  describe('Buildings API', () => {
    it('should create valid buildings', async () => {
      for (const building of validBuildings) {
        const created = await api.buildings.create(building);
        expect(created.building_number).toBe(building.building_number);
        expect(created.tax_region).toBe(building.tax_region);
      }
      
      const allBuildings = await api.buildings.getAll();
      expect(allBuildings.length).toBe(validBuildings.length);
    });

    it('should reject buildings with invalid addresses', async () => {
      for (const building of invalidBuildings) {
        if (building.building_address === 9999) {
          await expect(api.buildings.create(building)).rejects.toThrow();
        }
      }
    });

    it('should get building by number', async () => {
      const testBuilding = validBuildings[0];
      await api.buildings.create(testBuilding);
      
      const building = await api.buildings.getOne(testBuilding.building_number);
      expect(building.building_number).toBe(testBuilding.building_number);
    });

    it('should update building', async () => {
      const testBuilding = validBuildings[0];
      await api.buildings.create(testBuilding);
      
      const updated = await api.buildings.update(testBuilding.building_number, {
        tax_region: '20',
      });
      
      expect(updated.tax_region).toBe('20');
    });

    it('should delete building', async () => {
      const testBuilding = validBuildings[0];
      await api.buildings.create(testBuilding);
      
      await api.buildings.delete(testBuilding.building_number);
      
      await expect(api.buildings.getOne(testBuilding.building_number)).rejects.toThrow();
    });

    it('should cascade delete assets when building is deleted', async () => {
      const testBuilding = validBuildings[0];
      await api.buildings.create(testBuilding);
      
      const testAsset = validAssets[0];
      await api.assets.create(testAsset);
      
      await api.buildings.delete(testBuilding.building_number);
      
      const assets = await api.assets.getAll(testBuilding.building_number);
      expect(assets.length).toBe(0);
    });
  });

  describe('Assets API', () => {
    beforeEach(async () => {
      // Create buildings first
      for (const building of validBuildings) {
        try {
          await api.buildings.create(building);
        } catch (error) {
          // Building might already exist
        }
      }
    });

    it('should create valid assets', async () => {
      for (const asset of validAssets) {
        const created = await api.assets.create(asset);
        expect(created.building_number).toBe(asset.building_number);
        expect(created.asset_id).toBe(asset.asset_id);
        expect(created.asset_size).toBe(asset.asset_size);
      }
      
      const allAssets = await api.assets.getAll();
      expect(allAssets.length).toBe(validAssets.length);
    });

    it('should reject assets with invalid building numbers', async () => {
      for (const asset of invalidAssets) {
        if (asset.building_number === 9999) {
          await expect(api.assets.create(asset)).rejects.toThrow();
        }
      }
    });

    it('should get assets by building number', async () => {
      const testBuilding = validBuildings[0];
      const testAssets = validAssets.filter(a => a.building_number === testBuilding.building_number);
      
      for (const asset of testAssets) {
        await api.assets.create(asset);
      }
      
      const assets = await api.assets.getAll(testBuilding.building_number);
      expect(assets.length).toBe(testAssets.length);
    });

    it('should get assets by asset_id', async () => {
      const testAsset = validAssets[0];
      await api.assets.create(testAsset);
      
      const assets = await api.assets.getAllByAssetId(testAsset.asset_id.toString());
      expect(assets.length).toBeGreaterThan(0);
      expect(assets[0].asset_id).toBe(testAsset.asset_id);
    });

    it('should update asset', async () => {
      const testAsset = validAssets[0];
      const created = await api.assets.create(testAsset);
      
      const updated = await api.assets.update(created.id.toString(), { asset_size: 100.0 });
      
      expect(updated.asset_size).toBe(100.0);
    });

    it('should delete asset', async () => {
      const testAsset = validAssets[0];
      const created = await api.assets.create(testAsset);
      
      await api.assets.delete(created.id.toString());
      
      const assets = await api.assets.getAll(testAsset.building_number);
      const found = assets.find(a => a.asset_id === testAsset.asset_id);
      expect(found).toBeUndefined();
    });
  });

  describe('Asset Types API', () => {
    it('should get all asset types', async () => {
      const assetTypes = await api.assetTypes.getAll();
      expect(assetTypes.length).toBeGreaterThan(0);
    });

    it('should get asset type by id', async () => {
      const allTypes = await api.assetTypes.getAll();
      if (allTypes.length > 0) {
        const assetType = await api.assetTypes.getOne(allTypes[0].id);
        expect(assetType.id).toBe(allTypes[0].id);
      }
    });

    it('should create asset type', async () => {
      const newType = {
        name: '999',
        description: 'Test Asset Type',
        tax_region: 10,
        min_size: 5,
        max_size: 50,
        active: 'כן',
      };
      
      const created = await api.assetTypes.create(newType);
      expect(created.name).toBe(newType.name);
      
      // Cleanup
      await api.assetTypes.delete(created.id);
    });

    it('should update asset type', async () => {
      const allTypes = await api.assetTypes.getAll();
      if (allTypes.length > 0) {
        const updated = await api.assetTypes.update(allTypes[0].id, {
          description: 'Updated Description',
        });
        expect(updated.description).toBe('Updated Description');
      }
    });
  });

  describe('Validation Rules', () => {
    it('should get all validation rules', async () => {
      const rules = await api.validationRules.getAll();
      expect(rules.length).toBeGreaterThan(0);
    });

    it('should get validation rules by entity type', async () => {
      const assetRules = await api.validationRules.getAll('asset');
      expect(assetRules.length).toBeGreaterThan(0);
      expect(assetRules.every(r => r.entity_type === 'asset')).toBe(true);
    });
  });

  describe('Data Integrity', () => {
    beforeEach(async () => {
      // Create buildings first
      for (const building of validBuildings) {
        try {
          await api.buildings.create(building);
        } catch (error) {
          // Building might already exist
        }
      }
    });

    it('should maintain referential integrity for assets', async () => {
      const testAsset = validAssets[0];
      await api.assets.create(testAsset);
      
      // Try to delete building - should cascade delete assets
      await api.buildings.delete(testAsset.building_number);
      
      const assets = await api.assets.getAll();
      const found = assets.find(a => 
        a.building_number === testAsset.building_number && 
        a.asset_id === testAsset.asset_id
      );
      expect(found).toBeUndefined();
    });

    it('should enforce unique building numbers', async () => {
      const testBuilding = validBuildings[0];
      await api.buildings.create(testBuilding);
      
      // Try to create duplicate
      await expect(api.buildings.create(testBuilding)).rejects.toThrow();
    });

    it('should enforce unique asset composite key', async () => {
      const testAsset = validAssets[0];
      await api.assets.create(testAsset);
      
      // Try to create duplicate with same building_number, asset_id, measurement_date
      await expect(api.assets.create(testAsset)).rejects.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty results gracefully', async () => {
      const buildings = await api.buildings.getAll();
      expect(Array.isArray(buildings)).toBe(true);
    });

    it('should handle non-existent building lookup', async () => {
      await expect(api.buildings.getOne(99999)).rejects.toThrow();
    });

    it('should handle non-existent asset lookup', async () => {
      const testBuilding = validBuildings[0];
      await api.buildings.create(testBuilding);
      
      const assets = await api.assets.getAllByAssetId('99999');
      expect(assets.length).toBe(0);
    });
  });
});

