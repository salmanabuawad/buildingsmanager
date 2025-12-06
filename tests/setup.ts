import { beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase } from './utils/db-setup';

// Setup test database before all tests
beforeAll(async () => {
  console.log('Setting up test database...');
  await setupTestDatabase();
});

// Cleanup after all tests
afterAll(async () => {
  console.log('Tearing down test database...');
  await teardownTestDatabase();
});

