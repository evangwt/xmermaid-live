import { chromium } from '@playwright/test';
const ORIGIN = 'http://127.0.0.1:4173';
const READY = '已更新';
const BASE = `architecture-beta
  service api(server)[API]
  service search(search)[Search]
  service db(database)[DB]
  api:R --> L:search
  search:B --> T:db`;
const CASES = {
  'bare-bidir / no junction': `${BASE}
  search <--> db`,
  'bare-bidir / junction': `${BASE}
  junction bus
  api:R --> L:bus
  bus:R --> L:search
  search <--> db`,
  'ported-bidir / junction': `${BASE}
  junction bus
  api:R --> L:bus
  bus:R --> L:search
  search:R <--> L:db`,
};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.addInitScript(() => localStorage.setItem('xmermaid-live.locale.v1', 'zh-CN'));
for (const [label, source] of Object.entries(CASES)) {
  for (let i = 0; i < 2; i++) {
    await page.goto(ORIGIN, { waitUntil: 'networkidle' });
    await page.locator('[data-document-editor] .cm-content').fill(source);
    let status = 'timeout';
    try {
      await page.waitForFunction(ready => {
        const el = document.querySelector('[data-preview-status]');
        return el && el.textContent.trim() === ready;
      }, READY, { timeout: 12000 });
      status = 'READY';
    } catch {}
    console.log(`${label} try${i + 1}: ${status}`);
  }
}
await browser.close();
