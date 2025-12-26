# Comprehensive Regression Tests

This test suite provides comprehensive regression testing for critical system operations including transfer areas, distribution operations (business and residence), and tax region changes.

## Test Coverage

### 1. Transfer Area Operations (`tests/regression-comprehensive.test.ts`)

Tests for transferring areas between assets:

- ✅ **Basic Transfer**: Transfers area from one asset to another and verifies the changes
- ✅ **Total Area Integrity**: Ensures building total area remains correct after transfer
- ✅ **History Preservation**: Verifies old asset measurements are copied to history table

### 2. Distribution Operations - Business

Tests for distributing business shared areas:

- ✅ **Proportional Distribution**: Distributes business shared area proportionally based on asset sizes
- ✅ **Distribution Flag Clearing**: Verifies that `need_business_distribution` flag is cleared after distribution
- ✅ **Audit Logging**: Creates audit log entries for business distribution operations

### 3. Distribution Operations - Residence

Tests for distributing residence shared areas:

- ✅ **Proportional Distribution**: Distributes residence shared area proportionally based on asset sizes
- ✅ **Distribution Flag Clearing**: Verifies that `need_residence_distribution` flag is cleared after distribution
- ✅ **Audit Logging**: Creates audit log entries for residence distribution operations

### 4. Tax Region Changes

Tests for changing asset tax regions:

- ✅ **Basic Tax Region Change**: Changes asset tax region and verifies the update
- ✅ **Distribution Flags**: Verifies distribution flags are set when tax region changes
- ✅ **Area From Distribution Clearing**: Clears `area_from_distribution` when asset type changes from business to residence
- ✅ **Dual Flag Setting**: Sets both business and residence distribution flags when asset changes classification

### 5. Complex Scenarios

Integration tests combining multiple operations:

- ✅ **Transfer Followed by Distribution**: Executes transfer then distribution in sequence
- ✅ **Tax Region Change Followed by Distribution**: Changes tax region then distributes shared area

## Test Data

The tests use dedicated test fixtures in `tests/fixtures/test-data.ts`:

- **Buildings**: Test buildings with various tax regions and shared areas
- **Assets**: Test assets with different types (business and residence)
- **Asset Types**: Reference data for asset type validation
- **Addresses**: Street address codes for building validation
- **Validation Rules**: Rules for data validation

## Running the Tests

```bash
# Run all comprehensive regression tests
npm run test:run tests/regression-comprehensive.test.ts

# Run in watch mode
npm test tests/regression-comprehensive.test.ts

# Run with UI
npm run test:ui
```

## Test Setup

The tests automatically:

1. **Setup Database**: Creates and configures test database tables
2. **Insert Reference Data**: Populates asset_types, address_list, and validation_rules
3. **Clear Data**: Cleans test data between each test case
4. **Teardown**: Cleans up after all tests complete

## Key Features Tested

### Transfer Operations

- Asset size updates
- Measurement date changes
- History table preservation
- Building total area integrity
- Audit logging

### Distribution Operations

- Proportional area calculation
- Business vs. residence classification
- Distribution flag management
- `area_from_distribution` field updates
- Audit trail creation

### Tax Region Changes

- Tax region field updates
- Distribution flag triggering
- Asset type classification changes
- Area clearing when switching between business/residence
- Dual flag setting for classification changes

## Database Requirements

Tests require:

- PostgreSQL database (local or Supabase)
- Test database configured via `TEST_DB_URL` environment variable
- Supabase credentials for API tests (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)

## Environment Variables

Create a `.env.test` file with:

```env
# Supabase API
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Direct PostgreSQL (for test utilities)
TEST_DB_URL=postgresql://postgres:password@localhost:5432/buildings_manager_test
```

## Notes

- Tests are isolated - each test runs independently
- Test data is cleaned between tests
- Tests use unique building and asset IDs to avoid conflicts
- Database operations are transactional and verified for correctness

