# Test Suite Summary

## Overview

This automation test suite provides comprehensive regression testing for the Buildings Manager system. It automatically:

1. **Erases the database** - Drops all tables and recreates schema
2. **Creates reference tables** - Sets up and populates the three reference tables:
   - `asset_types` - Asset type definitions
   - `address_list` - Street addresses with codes  
   - `validation_rules` - Dynamic validation rules
3. **Adds test data** - Inserts valid and invalid assets and buildings
4. **Runs regression tests** - Tests all API endpoints and data integrity

## Test Coverage

### ✅ Database Setup Tests
- Verifies all tables are created (including reference tables)
- Confirms reference tables are populated:
  - `asset_types` - Asset type definitions
  - `address_list` - Street addresses
  - `validation_rules` - Validation rules

### ✅ Buildings API Tests
- Create valid buildings
- Reject invalid buildings (invalid addresses)
- Get building by number
- Update building
- Delete building
- Cascade delete assets when building is deleted

### ✅ Assets API Tests
- Create valid assets
- Reject invalid assets (invalid building numbers, negative sizes)
- Get assets by building number
- Get assets by asset_id
- Update asset
- Delete asset

### ✅ Asset Types API Tests
- Get all asset types
- Get asset type by id
- Create asset type
- Update asset type

### ✅ Validation Rules Tests
- Get all validation rules
- Get rules by entity type

### ✅ Data Integrity Tests
- Foreign key constraints (assets reference buildings)
- Unique constraints (building numbers, asset composite keys)
- Cascade deletes

### ✅ Edge Cases
- Empty results handling
- Non-existent record lookups
- Error handling

## Test Data

### Valid Test Data
- **3 Buildings**: Different tax regions, elevator configurations
- **3 Assets**: Various types (199, 299, 101), different sizes
- **4 Addresses**: Street codes 100-400
- **4 Asset Types**: 199, 299, 101, 201 with various configurations
- **5 Validation Rules**: Required fields, numeric validation, positive numbers

### Invalid Test Data
- **1 Building**: Invalid address (9999)
- **2 Assets**: Non-existent building, negative size, invalid type

## Running Tests

```bash
# Install dependencies first
npm install

# Run all tests
npm test

# Run tests once (CI mode)
npm run test:run

# Run with UI
npm run test:ui
```

## Configuration

Create `.env.test` file with your test database credentials:

```env
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Direct PostgreSQL (for test utilities)
TEST_DB_URL=postgresql://postgres:postgres@localhost:5432/buildings_manager_test
```

## Test Structure

```
tests/
├── setup.ts              # Global setup/teardown
├── regression.test.ts    # Main test suite
├── fixtures/
│   └── test-data.ts      # Test data definitions
└── utils/
    ├── db-setup.ts       # Database utilities
    └── test-helpers.ts   # Helper functions
```

## Expected Results

All tests should pass, verifying:
- ✅ Database schema is correct
- ✅ Reference data is created
- ✅ Valid data is accepted
- ✅ Invalid data is rejected
- ✅ CRUD operations work correctly
- ✅ Data integrity is maintained
- ✅ Edge cases are handled gracefully

## Troubleshooting

See `tests/README.md` for detailed troubleshooting guide.

