import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get the path to a test data file
 * @param filename - Name of the file in data_for_test folder
 * @returns Absolute path to the file
 */
export function getTestDataPath(filename: string): string {
  const projectRoot = path.resolve(__dirname, '../../../');
  const testDataPath = path.join(projectRoot, 'data_for_test', filename);
  
  if (!fs.existsSync(testDataPath)) {
    throw new Error(`Test data file not found: ${testDataPath}`);
  }
  
  return testDataPath;
}

/**
 * List available test data files
 */
export function listTestDataFiles(): string[] {
  const projectRoot = path.resolve(__dirname, '../../../');
  const testDataDir = path.join(projectRoot, 'data_for_test');
  
  if (!fs.existsSync(testDataDir)) {
    return [];
  }
  
  return fs.readdirSync(testDataDir);
}

