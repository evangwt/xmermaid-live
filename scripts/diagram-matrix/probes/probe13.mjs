import { chromium } from '@playwright/test';
import { EXAMPLES } from '../examples.mjs';
const ORIGIN = 'http://127.0.0.1:4173';
const READY = '已更新';
const INLINE = `architecture-beta
  group edge(cloud)[Edge layer]
  group core(cloud)[Core services]

  service lb(server)[Load balancer] in edge
  service cdn(internet)[CDN] in edge
  service api(server)[Public API] in core
  service auth(lock)[Auth service] in core
  service search(search)[Search index] in core
  service db(database)[Primary DB] in core

  cdn:T --> B:lb
  lb:R --> L:api
  api:B --> T:auth
  api:B --> T:db
  auth:R --> L:db

  junction bus
  api:R --> L:bus
  bus:R --> L:search
  bus:B --> T:db`;
console.log('identical to file:', INLINE === EXAMPLES.architecture);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.addInitScript(() => localStorage.setItem('xmermaid-live.locale.v1', 'zh-CN'));
for (let i = 0; i < 3; i++) {
  for (const [label, source] of [['inline', INLINE], ['file', EXAMPLES.architecture]]) {
    await page.goto(ORIGIN, { waitUntil: 'networkidle' });
    await page.locator('[data-document-editor] .cm-content').fill(source);
    let status = 'timeout';
    try {
      await page.waitForFunction(ready => {
        const el = document.querySelector('[data-preview-status]');
        return el && el.textContent.trim() === ready;
      }, READY, { timeout: 15000 });
      status = 'READY';
    } catch {}
    console.log(`round ${i + 1} ${label}: ${status}`);
  }
}
await browser.close();
