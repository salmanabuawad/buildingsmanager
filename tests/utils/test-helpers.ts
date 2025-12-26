import { Pool } from 'pg';
import { getDbPool } from './db-setup';
import { testAddresses, testAssetTypes, testValidationRules } from '../fixtures/test-data';

/**
 * Insert reference data into database
 * Reference tables: asset_types, address_list, validation_rules
 */
export async function insertReferenceData(): Promise<void> {
  const pool = getDbPool();
  
  console.log('Inserting reference data (asset_types, address_list, validation_rules)...');
  
  // Insert addresses (address_list - reference table)
  for (const addr of testAddresses) {
    await pool.query(
      `INSERT INTO address_list (street_code, street_description) 
       VALUES ($1, $2) 
       ON CONFLICT (street_code) DO UPDATE SET street_description = EXCLUDED.street_description`,
      [addr.street_code, addr.street_description]
    );
  }
  
  // Insert asset types (asset_types - reference table)
  // Delete existing and insert fresh to avoid conflicts
  for (const assetType of testAssetTypes) {
    // Delete if exists (matching name and tax_region to avoid duplicates)
    await pool.query(
      `DELETE FROM asset_types WHERE name = $1 AND tax_region = $2`,
      [assetType.name, assetType.tax_region]
    );
    
    // Insert new record
    await pool.query(
      `INSERT INTO asset_types (name, description, tax_region, min_size, max_size, elevator, condo, business_residence, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        assetType.name,
        assetType.description,
        assetType.tax_region,
        assetType.min_size,
        assetType.max_size,
        assetType.elevator,
        assetType.condo,
        assetType.business_residence,
        assetType.active,
      ]
    );
  }
  
  // Insert validation rules (validation_rules - reference table)
  for (const rule of testValidationRules) {
    await pool.query(
      `INSERT INTO validation_rules (rule_key, entity_type, field_name, rule_type, error_message, description, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (rule_key) DO UPDATE SET
         entity_type = EXCLUDED.entity_type,
         field_name = EXCLUDED.field_name,
         rule_type = EXCLUDED.rule_type,
         error_message = EXCLUDED.error_message,
         description = EXCLUDED.description,
         enabled = EXCLUDED.enabled`,
      [
        rule.rule_key,
        rule.entity_type,
        rule.field_name,
        rule.rule_type,
        rule.error_message,
        rule.description,
        rule.enabled,
      ]
    );
  }
  
  console.log('Reference data inserted successfully!');
}

/**
 * Get count of records in a table
 */
export async function getTableCount(tableName: string): Promise<number> {
  const pool = getDbPool();
  const result = await pool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
  return parseInt(result.rows[0].count, 10);
}

/**
 * Check if a record exists
 */
export async function recordExists(
  tableName: string,
  conditions: Record<string, any>
): Promise<boolean> {
  const pool = getDbPool();
  const keys = Object.keys(conditions);
  const values = Object.values(conditions);
  const whereClause = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');
  
  const result = await pool.query(
    `SELECT 1 FROM ${tableName} WHERE ${whereClause} LIMIT 1`,
    values
  );
  
  return result.rows.length > 0;
}

