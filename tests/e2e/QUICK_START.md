# Quick Start Guide - E2E Tests

## Install Playwright Browsers (First Time Only)

```bash
npx playwright install chromium
```

Or install all browsers:
```bash
npx playwright install
```

## Run Tests

### Basic Commands

```bash
# Run all tests (headless)
npm run test:e2e

# Run with UI (interactive mode - recommended for debugging)
npm run test:e2e:ui

# Run with visible browser
npm run test:e2e:headed

# Run in debug mode (step through tests)
npm run test:e2e:debug
```

### Run Specific Tests

```bash
# Run a specific test file
npx playwright test tests/e2e/buildings-import.spec.ts

# Run tests matching a pattern
npx playwright test --grep "import"

# Run a specific test by name
npx playwright test -g "should import buildings"
```

### View Results

```bash
# View HTML report
npm run test:e2e:report

# Open last trace
npx playwright show-trace test-results/path-to-trace.zip
```

## Test Files Overview

1. **integration.spec.ts** - Basic app functionality (loading, navigation)
2. **buildings-import.spec.ts** - Import buildings from Excel
3. **assets-import.spec.ts** - Import assets from Excel  
4. **business-distribution.spec.ts** - Business shared area distribution

## Common Workflows

### Debug a Failing Test

1. Run test in UI mode: `npm run test:e2e:ui`
2. Click on the failing test
3. Use "Time Travel" to step through
4. Inspect page state at each step

### Debug in Browser

1. Run with headed mode: `npm run test:e2e:headed`
2. Watch the browser as tests execute
3. Use `page.pause()` in test code to pause execution

### Find Correct Selectors

1. Run `npx playwright codegen https://buildingmanager.bolt.host/`
2. Interact with the app - Playwright generates selectors
3. Copy the generated code into your test

## Tips

- **Use UI mode for development** - Easier to debug and see what's happening
- **Check test data** - Ensure files exist in `data_for_test/` folder
- **Verify app is running** - Tests need the app at `https://buildingmanager.bolt.host/`
- **Read test output** - Playwright shows helpful error messages with suggestions

## Need Help?

See [README.md](./README.md) for detailed documentation.

