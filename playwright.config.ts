import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for E2E tests
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  
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
          headless: process.env.HEADLESS === 'true' || !!process.env.CI,
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
        launchOptions: {
          headless: process.env.HEADLESS === 'true' || !!process.env.CI,
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

