// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// Fail closed before spawning webServer (which sets RESET_ADMIN_PASSWORD=true) if DATABASE_URL is not a disposable test/CI DB
if (process.env.DATABASE_URL) {
  if (process.env.ALLOW_DESTRUCTIVE_PG_VERIFY !== 'true') {
    throw new Error('Refusing to start PG UI E2E webServer without ALLOW_DESTRUCTIVE_PG_VERIFY=true');
  }
  let dbName = '';
  try {
    dbName = new URL(process.env.DATABASE_URL).pathname.replace(/^\/+/, '');
  } catch {
    throw new Error('Invalid DATABASE_URL for PG UI E2E config');
  }
  if (!/(^|[_-])(test|ci|local|dev)($|[_-])/i.test(dbName)) {
    throw new Error(`Refusing to start PG UI E2E webServer against non-disposable database "${dbName}"`);
  }
}

/**
 * Built-React + PostgreSQL (or configurable) E2E Playwright configuration.
 * Serves the real compiled React SPA (DISABLE_CLIENT_BUILD=false) against server/index.js.
 */
module.exports = defineConfig({
  testDir: './tests',
  testMatch: /sloboda-ui-e2e\.spec\.js/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-ui' }]],
  use: {
    baseURL: 'http://localhost:3201',
    locale: 'ru-RU',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node server/index.js',
    url: 'http://localhost:3201/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 45000,
    env: {
      NODE_ENV: 'test',
      PORT: '3201',
      DISABLE_CLIENT_BUILD: 'false',
      TEST_NO_DB: process.env.DATABASE_URL ? 'false' : 'true',
      DATABASE_URL: process.env.DATABASE_URL || '',
      ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@sloboda.land',
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'testpassword123',
      RESET_ADMIN_PASSWORD: 'true',
      JWT_SECRET: process.env.JWT_SECRET || 'test-secret-change-me',
    },
  },
});
