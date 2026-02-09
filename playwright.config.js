// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
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
    url: 'http://localhost:3000/',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      NODE_ENV: 'test',
      TEST_NO_DB: 'true',
      DISABLE_CLIENT_BUILD: 'true',
      PORT: '3000',
      ADMIN_EMAIL: 'admin@sloboda.land',
      ADMIN_PASSWORD: 'testpassword123',
      RESET_ADMIN_PASSWORD: 'true',
      JWT_SECRET: 'test-secret-change-me',
    },
  },
});
