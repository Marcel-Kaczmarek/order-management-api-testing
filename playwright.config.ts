import { defineConfig } from '@playwright/test';
import { apiRoot, env } from './src/config/env';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  // Retries are opt-in and never mask instability: a test that only passes on
  // retry is reported as "flaky" and, in CI, fails the run.
  retries: env.TEST_RETRIES,
  failOnFlakyTests: isCI,
  workers: env.TEST_WORKERS,
  timeout: env.TEST_TIMEOUT_MS,
  expect: { timeout: 5_000 },
  globalSetup: './src/config/global-setup.ts',
  globalTeardown: './src/config/global-teardown.ts',
  outputDir: './reports/test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/playwright-html', open: 'never' }],
    ['junit', { outputFile: 'reports/junit/results.xml' }],
    ['json', { outputFile: 'reports/json/results.json' }],
    [
      'allure-playwright',
      {
        // Override with ALLURE_RESULTS_DIR (e.g. on Windows hosts where antivirus locks fresh files).
        resultsDir: process.env.ALLURE_RESULTS_DIR ?? 'allure-results',
        detail: false,
        suiteTitle: false,
        environmentInfo: {
          AUT: 'orderflow-api @ 259c7d0e',
          API_BASE_URL: env.API_BASE_URL,
          TEST_ENV: env.TEST_ENV,
          NODE_VERSION: process.version,
        },
      },
    ],
  ],
  use: {
    baseURL: apiRoot,
    extraHTTPHeaders: { 'X-Test-Run': `qa-${env.TEST_ENV}` },
    // Playwright traces store raw request headers (bearer tokens), so they are
    // opt-in for local debugging only (PW_TRACE=1). Reports instead carry the
    // sanitized `http-exchanges.json` attachment produced by the fixtures.
    trace: process.env.PW_TRACE ? 'retain-on-failure' : 'off',
  },
  projects: [{ name: 'api' }],
});
