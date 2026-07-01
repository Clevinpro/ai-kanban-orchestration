import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:3000',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Auto-boot the MFE shell (auth + shell + chat on :3000) so `npm run test:e2e`
  // needs no manual `nx serve`. Devs with a shell already running reuse it;
  // CI always boots fresh. rspack cold start is slow, hence the long timeout.
  webServer: {
    command: 'npm start',
    cwd: __dirname,
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
