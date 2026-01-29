/**
 * Playwright configuration for HomeHero E2E tests
 * @see https://playwright.dev/docs/test-configuration
 */

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  // Look for test files in the tests directory
  testDir: './tests',

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter to use
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }]
  ],

  // Shared settings for all projects
  use: {
    // Base URL to use in tests
    baseURL: process.env.BASE_URL || 'http://localhost:3000',

    // Collect trace when retrying a failed test
    trace: 'on-first-retry',

    // Take screenshot on failure
    screenshot: 'only-on-failure',

    // Record video on failure
    video: 'on-first-retry',

    // Default timeout for each action
    actionTimeout: 10000,

    // Default timeout for navigation
    navigationTimeout: 30000
  },

  // Timeout for each test
  timeout: 60000,

  // Global setup and teardown
  globalSetup: './tests/global-setup.js',
  globalTeardown: './tests/global-teardown.js',

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    // Mobile viewport for testing responsive design
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] }
    }
  ],

  // Run local dev server before starting the tests
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      NODE_ENV: 'test',
      PORT: '3000'
    }
  },

  // Output folder for test artifacts
  outputDir: 'test-results'
});
