import { defineConfig } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_BROWSER_PATH;

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    viewport: { width: 1440, height: 810 },
    launchOptions: executablePath ? { executablePath } : {},
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
