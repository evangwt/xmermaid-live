import { chromium } from '@playwright/test';
const ORIGIN = 'http://127.0.0.1:4173';
const READY = '已更新';
const CASES = {
  'junction no bidir': `architecture-beta
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
  bus:B --> T:db`,
  'no junction with bidir': `architecture-beta
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
  search:R <--> L:db`,
};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.addInitScript(() => localStorage.setItem('xmermaid-live.locale.v1', 'zh-CN'));
for (const [label, source] of Object.entries(CASES)) {
  await page.goto(ORIGIN, { waitUntil: 'networkidle' });
  await page.locator('[data-document-editor] .cm-content').fill(source);
  let status = 'timeout';
  try {
    await page.waitForFunction(ready => {
      const el = document.querySelector('[data-preview-status]');
      return el && el.textContent.trim() === ready;
    }, READY, { timeout: 10000 });
    status = 'READY';
  } catch {}
  console.log(`${status}  ${label}`);
}
await browser.close();
