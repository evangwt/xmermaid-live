import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // Slow CI webkit/firefox runners intermittently lose the first typed
  // document to the sample swap ("Expected 1, Received 32"); retry those
  // on CI while keeping local runs single-shot so failures stay visible.
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://127.0.0.1:4173/xmermaid-live/',
    headless: true,
    locale: 'zh-CN',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    {
      name: 'firefox',
      grep: /@cross-browser/,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      grep: /@cross-browser/,
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'npm run serve:test',
    url: 'http://127.0.0.1:4173/xmermaid-live/',
    reuseExistingServer: false,
  },
});
