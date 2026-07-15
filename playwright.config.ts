import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://127.0.0.1:4173/xmermaid-live/',
    browserName: 'chromium',
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run serve:test',
    url: 'http://127.0.0.1:4173/xmermaid-live/',
    reuseExistingServer: false,
  },
});
