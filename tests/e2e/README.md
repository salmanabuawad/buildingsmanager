# E2E Tests with Playwright

End-to-end tests using Playwright that test the Buildings Manager application with real data from the `data_for_test` folder.

## Test Data

Tests use Excel files from the `data_for_test` folder:
- `רשימת_מבנים_20251226.xlsx` - Buildings list Excel file for testing
- `נכסים_מבנה_8230409_20251226.xlsx` - Assets Excel file for building 8230409

## Prerequisites

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Install Playwright browsers:**
   ```bash
   npx playwright install
   ```

3. **Application must be running** at `https://buildingmanager.bolt.host/` (or set `TEST_BASE_URL` environment variable)

## Running Tests

### Run all E2E tests
```bash
npm run test:e2e
```

### Run tests with UI (interactive mode)
```bash
npm run test:e2e:ui
```

### Run tests in headed mode (see browser)
```bash
npm run test:e2e:headed
```

### Run tests in debug mode
```bash
npm run test:e2e:debug
```

### Run specific test file
```bash
npx playwright test tests/e2e/buildings-import.spec.ts
```

### Run tests matching a pattern
```bash
npx playwright test --grep "import"
```

### View test report
```bash
npm run test:e2e:report
```

## Test Files

- `buildings-import.spec.ts` - Tests for importing buildings from Excel files
- `assets-import.spec.ts` - Tests for importing assets from Excel files
- `integration.spec.ts` - Integration tests for basic application functionality
- `business-distribution.spec.ts` - Tests for business shared area distribution

## Configuration

Tests use configuration from `playwright.config.ts`:

- `baseURL`: Application URL (default: `https://buildingmanager.bolt.host/`)
- `testDir`: Test directory (default: `./tests/e2e`)
- `timeout`: Test timeout (default: 30 seconds)
- `retries`: Number of retries on failure (2 on CI, 0 locally)
- `workers`: Number of parallel workers

## Environment Variables

- `TEST_BASE_URL` - Override the base URL for the application
- `CI` - Set automatically in CI environments (enables retries, reduces workers)

## Test Structure

Tests follow Playwright best practices:
- Use `test.describe` to group related tests
- Use `test.beforeEach` for setup
- Use page object pattern via selectors utility
- Use explicit waits with `waitForSelector` and `waitForLoadState`
- Use descriptive test names

## Writing New Tests

1. Create a new `.spec.ts` file in `tests/e2e/`
2. Import test utilities:
   ```typescript
   import { test, expect } from '@playwright/test';
   import { selectors, waitForGrid } from './utils/selectors';
   import { getTestDataPath } from './utils/file-helper';
   ```
3. Use selectors from `utils/selectors.ts` for maintainability
4. Use file helpers from `utils/file-helper.ts` for test data

## Debugging Tests

### Run in debug mode
```bash
npm run test:e2e:debug
```

This opens Playwright Inspector where you can:
- Step through test execution
- Inspect page state
- View console logs
- See network requests

### Run with headed browser
```bash
npm run test:e2e:headed
```

### View test traces
After a test fails, check the `test-results/` folder for:
- Screenshots
- Videos
- Traces (open with `npx playwright show-trace`)

## Best Practices

1. **Use explicit waits** - Don't use fixed timeouts where possible
2. **Use selectors utility** - Centralize selectors for easier maintenance
3. **Test user workflows** - Test how users actually interact with the app
4. **Keep tests independent** - Each test should work in isolation
5. **Use meaningful test names** - Describe what the test verifies
6. **Handle async operations** - Wait for network requests and animations

## Troubleshooting

### Tests fail to find elements
- Increase timeout in selectors or test options
- Check that application is running
- Run in headed mode to see what's happening
- Use Playwright Inspector to debug

### Tests timeout
- Check network connectivity
- Verify application is accessible
- Increase timeout values in config or test options

### File upload fails
- Verify test data files exist in `data_for_test/`
- Check file paths are correct
- Ensure files are valid Excel format

### Selectors not working
- Use Playwright Inspector to find correct selectors
- Check for dynamic content that might not be loaded
- Use more specific selectors (data-testid if available)

## CI/CD Integration

Add to your CI/CD pipeline:

```yaml
# Example GitHub Actions
- name: Install Playwright
  run: npx playwright install --with-deps

- name: Run E2E tests
  run: npm run test:e2e
  env:
    TEST_BASE_URL: ${{ secrets.TEST_BASE_URL }}
```

## Next Steps

- Add more test coverage for critical workflows
- Add visual regression testing
- Set up CI/CD integration
- Add test result notifications
- Create page object models for complex components

