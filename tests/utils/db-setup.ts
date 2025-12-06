import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

// Database connection pool
let pool: Pool | null = null;

/**
 * Get database connection pool
 * Supports both direct PostgreSQL connection and Supabase connection
 */
export function getDbPool(): Pool {
  if (!pool) {
    // Try to get connection string from environment
    const dbUrl = process.env.TEST_DB_URL || 
                  process.env.VITE_LOCAL_DB_URL || 
                  process.env.DATABASE_URL ||
                  'postgresql://postgres:postgres@localhost:5432/buildings_manager_test';
    
    pool = new Pool({
      connectionString: dbUrl,
      max: 10,
      ssl: dbUrl.includes('supabase') ? { rejectUnauthorized: false } : false,
    });
  }
  return pool;
}

/**
 * Execute SQL file
 */
async function executeSqlFile(filePath: string): Promise<void> {
  const pool = getDbPool();
  const sql = readFileSync(filePath, 'utf-8');
  await pool.query(sql);
}

/**
 * Setup test database - erase and recreate all tables
 * Reference tables: asset_types, address_list, validation_rules
 */
export async function setupTestDatabase(): Promise<void> {
  const pool = getDbPool();
  
  console.log('Dropping existing tables...');
  
  // Drop all tables in correct order (respecting foreign keys)
  // Note: Reference tables (asset_types, address_list, validation_rules) are dropped and recreated
  await pool.query(`
    DROP TABLE IF EXISTS asset_measurements CASCADE;
    DROP TABLE IF EXISTS assets CASCADE;
    DROP TABLE IF EXISTS buildings CASCADE;
    DROP TABLE IF EXISTS asset_types CASCADE;        -- Reference table
    DROP TABLE IF EXISTS validation_rules CASCADE;   -- Reference table
    DROP TABLE IF EXISTS address_list CASCADE;       -- Reference table
    DROP TABLE IF EXISTS user_preferences CASCADE;
    DROP TABLE IF EXISTS assets_history CASCADE;
  `);
  
  // Drop functions
  await pool.query(`
    DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
    DROP FUNCTION IF EXISTS search_assets_by_range(BIGINT, BIGINT, BIGINT, BIGINT) CASCADE;
    DROP FUNCTION IF EXISTS get_building_stats(BIGINT) CASCADE;
  `);
  
  console.log('Creating tables from setup-local-db.sql...');
  
  // Read and execute setup script
  // This creates: buildings, assets, asset_types, validation_rules, etc.
  const setupScriptPath = join(process.cwd(), 'setup-local-db.sql');
  await executeSqlFile(setupScriptPath);
  
  // Create address_list table if not in setup script (reference table)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS address_list (
      street_code integer PRIMARY KEY CHECK (street_code >= 0 AND street_code <= 9999),
      street_description text NOT NULL,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
    
    CREATE INDEX IF NOT EXISTS idx_address_list_street_code ON address_list(street_code);
    CREATE INDEX IF NOT EXISTS idx_address_list_street_description ON address_list(street_description);
  `);
  
  // Add building_address column if not exists
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'buildings' AND column_name = 'building_address'
      ) THEN
        ALTER TABLE buildings ADD COLUMN building_address integer;
        ALTER TABLE buildings
        ADD CONSTRAINT fk_buildings_building_address
        FOREIGN KEY (building_address)
        REFERENCES address_list(street_code)
        ON DELETE SET NULL
        ON UPDATE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_buildings_building_address ON buildings(building_address);
      END IF;
    END $$;
  `);
  
  console.log('Test database setup complete!');
  console.log('Reference tables created: asset_types, address_list, validation_rules');
}

/**
 * Teardown test database
 */
export async function teardownTestDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Clear all data from tables (but keep structure)
 * Note: Reference tables (asset_types, address_list, validation_rules) are also cleared
 * They will be repopulated by insertReferenceData()
 */
export async function clearTestData(): Promise<void> {
  const pool = getDbPool();
  
  await pool.query(`
    TRUNCATE TABLE asset_measurements CASCADE;
    TRUNCATE TABLE assets CASCADE;
    TRUNCATE TABLE buildings CASCADE;
    TRUNCATE TABLE asset_types CASCADE;        -- Reference table
    TRUNCATE TABLE validation_rules CASCADE;   -- Reference table
    TRUNCATE TABLE address_list CASCADE;       -- Reference table
    TRUNCATE TABLE user_preferences CASCADE;
  `);
}

