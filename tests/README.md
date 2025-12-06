# Automation Tests for Buildings Manager

This test suite provides comprehensive regression testing for the Buildings Manager system.

## Features

- **Database Reset**: Automatically erases and recreates the database before tests
- **Reference Tables**: Creates and populates the three reference tables:
  - `asset_types` - Asset type definitions
  - `address_list` - Street addresses with codes
  - `validation_rules` - Dynamic validation rules
- **Valid & Invalid Data**: Tests both valid and invalid assets and buildings
- **Regression Tests**: Comprehensive API and data integrity tests

## Prerequisites

1. **PostgreSQL Database** (local or Supabase)
2. **Node.js** 18+ and npm
3. **Test Database**: Either:
   - Local PostgreSQL database named `buildings_manager_test`
   - Or Supabase project with test credentials

## Setup

### 1. Install Dependencies

```bash
npm install
```

This will install:
- `vitest` - Test framework
- `@vitest/ui` - Test UI
- `pg` - PostgreSQL client (already in dependencies)
- `@types/pg` - TypeScript types for pg

### 2. Configure Test Database

Copy the example test environment file:

```bash
cp tests/.env.test.example .env.test
```

Edit `.env.test` with your test database credentials:

**Option A: Supabase (Recommended)**
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
TEST_DB_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres
```

**Option B: Local PostgreSQL with PostgREST**
```env
VITE_USE_LOCAL_DB=true
VITE_LOCAL_DB_URL=postgresql://postgres:postgres@localhost:5432/buildings_manager_test
TEST_DB_URL=postgresql://postgres:postgres@localhost:5432/buildings_manager_test
```

**Note**: 
- The API uses Supabase client (requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`)
- Test utilities use direct PostgreSQL connection via `TEST_DB_URL`
- For local PostgreSQL, you'll need PostgREST running (or use Supabase local instance)

### 3. Create Test Database (Local PostgreSQL)

```bash
# Create test database
createdb buildings_manager_test

# Or using psql
psql -U postgres -c "CREATE DATABASE buildings_manager_test;"
```

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests once (CI mode)
```bash
npm run test:run
```

### Run tests with UI
```bash
npm run test:ui
```

### Run tests with coverage
```bash
npm run test:coverage
```

## Test Structure

```
tests/
├── setup.ts                 # Test setup and teardown
├── regression.test.ts        # Main regression test suite
├── fixtures/
│   └── test-data.ts         # Test data (valid/invalid assets, buildings)
└── utils/
    ├── db-setup.ts          # Database setup utilities
    └── test-helpers.ts      # Helper functions
```

## What the Tests Do

### 1. Database Setup
- Drops all existing tables
- Creates fresh database schema from `setup-local-db.sql`
- Creates reference tables (address_list, etc.)

### 2. Reference Tables Creation
The three reference tables are created and populated:
- **asset_types**: Test asset types (199, 299, 101, 201) with various configurations
- **address_list**: Test addresses (street codes 100, 200, 300, 400)
- **validation_rules**: Test validation rules for required fields, numeric validation, etc.

### 3. Valid Data Tests
- Creates valid buildings with proper addresses
- Creates valid assets linked to buildings
- Tests CRUD operations for all entities

### 4. Invalid Data Tests
- Attempts to create buildings with invalid addresses (should fail)
- Attempts to create assets with invalid building numbers (should fail)
- Attempts to create assets with negative sizes (should fail)

### 5. Regression Tests
- **Buildings API**: Create, read, update, delete operations
- **Assets API**: Create, read, update, delete operations
- **Asset Types API**: CRUD operations
- **Validation Rules**: Retrieval and filtering
- **Data Integrity**: Foreign key constraints, unique constraints
- **Edge Cases**: Empty results, non-existent records

## Test Data

### Valid Buildings
- Building 1001: Tax region 10, with elevator, address 100
- Building 1002: Tax region 40, no elevator, address 200
- Building 1003: Tax regions 10,40, with elevator, address 300

### Invalid Buildings
- Building 2001: Invalid address (9999 - doesn't exist)

### Valid Assets
- Asset 1 in Building 1001: Type 199, size 75.5, tax region 10
- Asset 2 in Building 1001: Type 299, size 120.0, tax region 40
- Asset 1 in Building 1002: Type 101, size 50.0, tax region 10

### Invalid Assets
- Asset with non-existent building (9999)
- Asset with negative size (-10)
- Asset with invalid asset type (999)

## Troubleshooting

### Database Connection Issues

If you get connection errors:

1. **Check database is running**:
   ```bash
   # PostgreSQL
   pg_isready
   
   # Or check service status
   sudo systemctl status postgresql
   ```

2. **Verify connection string**:
   - Check `.env.test` file exists
   - Verify database name, user, password, host, port

3. **Check database permissions**:
   ```sql
   GRANT ALL PRIVILEGES ON DATABASE buildings_manager_test TO postgres;
   ```

### Test Failures

1. **Foreign Key Violations**: Ensure reference data is inserted before creating assets/buildings
2. **Unique Constraint Violations**: Tests clear data between runs, but if tests fail mid-run, you may need to manually clean up
3. **Timeout Issues**: Increase timeout in `vitest.config.ts` if tests are slow

### Cleanup

If tests fail and leave data behind:

```sql
-- Connect to test database
psql -U postgres -d buildings_manager_test

-- Truncate all tables
TRUNCATE TABLE asset_measurements CASCADE;
TRUNCATE TABLE assets CASCADE;
TRUNCATE TABLE buildings CASCADE;
TRUNCATE TABLE asset_types CASCADE;
TRUNCATE TABLE validation_rules CASCADE;
TRUNCATE TABLE address_list CASCADE;
```

## Continuous Integration

To run tests in CI/CD:

```yaml
# Example GitHub Actions
- name: Run tests
  run: npm run test:run
  env:
    TEST_DB_URL: ${{ secrets.TEST_DB_URL }}
```

## Notes

- Tests use a separate test database to avoid affecting development data
- All tests are isolated - data is cleared between test suites
- Tests verify both positive (valid data) and negative (invalid data) cases
- The test suite validates data integrity, foreign keys, and business rules

