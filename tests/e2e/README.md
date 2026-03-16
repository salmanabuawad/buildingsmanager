# E2E Tests — Buildings Manager

End-to-end tests written with [Playwright](https://playwright.dev/).

## Quick start

```bash
# Install browsers (once)
npx playwright install chromium

# Run all tests against production
TEST_PASSWORD=<yourpassword> npm run test:e2e

# Run with the Playwright UI
TEST_PASSWORD=<yourpassword> npm run test:e2e:ui

# Run a single file
npx playwright test tests/e2e/auth.spec.ts

# Run tests matching a pattern
npx playwright test --grep "login"

# View the last HTML report
npm run test:e2e:report
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `TEST_BASE_URL` | `https://profile.wavelync.com` | Target URL |
| `TEST_USER` | `admin` | Login username |
| `TEST_PASSWORD` | _(none)_ | Login password — **required** for authenticated tests |
| `TEST_BUILDING_NUMBER` | _(none)_ | Building number that has assets (used by `assets.spec.ts`) |
| `TEST_ASSET_FROM` | `1` | Lower bound for asset-search range tests |
| `TEST_ASSET_TO` | `9999999999` | Upper bound for asset-search range tests |
| `CI` | _(none)_ | Set in CI — enables retries and single-worker mode |

## Test files

| File | What it covers |
|---|---|
| `auth.spec.ts` | Login form, OTP toggle, bad-credentials error, successful login |
| `buildings.spec.ts` | Buildings AG Grid renders, has rows, row click |
| `assets.spec.ts` | Assets grid after building selection, 0 JS errors, 0 server 500s |
| `asset-search.spec.ts` | Search form, range search, AG Grid results, reset, empty state |
| `buildings-import.spec.ts` | Excel import flow for buildings |
| `assets-import.spec.ts` | Excel import flow for assets |
| `business-distribution.spec.ts` | Business area distribution button & action |
| `integration.spec.ts` | Smoke tests: page load, tab navigation |

## Test data

Excel test files live in `data_for_test/`:
- `רשימת_מבנים_20251226.xlsx` — buildings list
- `נכסים_מבנה_8230409_20251226.xlsx` — assets for building 8230409

## Notes

- Tests requiring `TEST_PASSWORD` are **auto-skipped** when the env var is absent, so
  CI passes on a PR without credentials configured.
- `sessionStorage` is isolated per Playwright context, so every `beforeEach` that
  calls `login()` performs a real login through the UI.

## CI/CD (GitHub Actions example)

```yaml
- name: Install Playwright browsers
  run: npx playwright install --with-deps chromium

- name: Run E2E tests
  run: npm run test:e2e
  env:
    TEST_BASE_URL: ${{ secrets.TEST_BASE_URL }}
    TEST_USER: ${{ secrets.TEST_USER }}
    TEST_PASSWORD: ${{ secrets.TEST_PASSWORD }}
```

## Debugging

```bash
# Step through with Playwright Inspector
npm run test:e2e:debug

# Watch the browser
npm run test:e2e:headed
```

After a failure, `test-results/` contains screenshots, videos, and traces.
Open a trace: `npx playwright show-trace test-results/.../trace.zip`
