import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for E2E tests
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',

  /* Give tests extra headroom when running with slowMo in headed mode.
   * Every Playwright action is delayed by PW_SLOWMO_MS (default 2000ms
   * when HEADLESS=false), so a test with 10 UI steps picks up ~20s of
   * pure delay. Raise the per-test budget to 3 min when headed. */
  timeout: process.env.HEADLESS === 'false' ? 180_000 : 30_000,

  /* Run tests in files in parallel */
  fullyParallel: true,
  
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html'],
    ['list']
  ],
  
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.TEST_BASE_URL || 'http://test.profile.wavelync.com/',
    
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    
    /* Screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Video on failure */
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // HEADLESS=false explicitly wins (even under CI) so headed local
          // runs are observable. If HEADLESS is unset, default to CI-state.
          headless: process.env.HEADLESS !== undefined
            ? process.env.HEADLESS !== 'false'
            : !!process.env.CI,
          args: ['--disable-extensions'],
        },
      },
    },

    /**
     * pstaging project: runs every spec against https://pstaging.wavelync.com/.
     * Credentials come from env (TEST_USER_NAME / TEST_PASSWORD).
     * Usage:
     *   TEST_USER_NAME=regression_tester TEST_PASSWORD=... \
     *     npx playwright test --project=pstaging
     */
    {
      name: 'pstaging',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'https://pstaging.wavelync.com/',
        // When PW_CHANNEL is set (e.g. 'chrome' or 'msedge'), use the
        // system-installed browser instead of Playwright's bundled
        // chromium. Useful on Windows laptops whose SxS runtime can't
        // launch the bundled build; headed runs just work against the
        // user's real Chrome/Edge.
        channel: process.env.PW_CHANNEL || undefined,
        // Bump action timeout to accommodate slowMo so asserts don't race
        // the slowed-down click/fill.
        actionTimeout: process.env.HEADLESS === 'false' ? 30_000 : 10_000,
        navigationTimeout: process.env.HEADLESS === 'false' ? 60_000 : 30_000,
        launchOptions: {
          // HEADLESS=false explicitly wins (even under CI) so headed local
          // runs against pstaging are observable. If HEADLESS is unset,
          // default to CI-state.
          headless: process.env.HEADLESS !== undefined
            ? process.env.HEADLESS !== 'false'
            : !!process.env.CI,
          // In headed mode, pause between each Playwright action so a
          // human can follow the browser. Override with PW_SLOWMO_MS.
          // Default 2000ms per step when headed, 0 otherwise.
          slowMo: process.env.HEADLESS === 'false'
            ? Number(process.env.PW_SLOWMO_MS ?? 2000)
            : 0,
          args: ['--disable-extensions'],
        },
      },
    },

    // Uncomment to test on other browsers
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },

    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'https://buildingmanager.bolt.host/',
  //   reuseExistingServer: !process.env.CI,
  // },
});

