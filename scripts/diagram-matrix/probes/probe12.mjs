import { chromium } from '@playwright/test';
import { EXAMPLES } from '../examples.mjs';
const ORIGIN = 'http://127.0.0.1:4173';
const READY = '已更新';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.addInitScript(() => localStorage.setItem('xmermaid-live.locale.v1', 'zh-CN'));
for (let i = 0; i < 5; i++) {
  await page.goto(ORIGIN, { waitUntil: 'networkidle' });
  await page.locator('[data-document-editor] .cm-content').fill(EXAMPLES.architecture);
  let status = 'timeout';
  try {
    await page.waitForFunction(ready => {
      const el = document.querySelector('[data-preview-status]');
      return el && el.textContent.trim() === ready;
    }, READY, { timeout: 20000 });
    status = 'READY';
  } catch {}
  console.log(`attempt ${i + 1}: ${status}`);
}
await browser.close();
