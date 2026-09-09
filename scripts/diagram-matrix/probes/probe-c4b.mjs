import { chromium } from '@playwright/test';
const ORIGIN = 'http://127.0.0.1:4173';
const READY = '已更新';
const CASES = {
  'Container 2 args': `C4Container
  Container(web, "Web app")
  Rel(web, web, "loop?")`,
  'Container 2 args + rel to person': `C4Container
  Person(u, "User")
  Container(web, "Web app")
  Rel(u, web, "Uses")`,
  'Container 3 args': `C4Container
  Person(u, "User")
  Container(web, "Web app", "Browser client")
  Rel(u, web, "Uses")`,
  'ContainerDb 3 args': `C4Container
  ContainerDb(db, "Catalog", "Postgres store")`,
  'ContainerQueue 3 args': `C4Container
  ContainerQueue(q, "Bus", "Kafka events")`,
  'Deployment_Node 2 args': `C4Deployment
  Deployment_Node(dn, "Cluster")
  ContainerDb(db, "DB", "Postgres")
  Rel(dn, db, "Hosts")`,
  'Person 3 args': `C4Context
  Person(u, "User", "A person")`,
  'System 3 args': `C4Context
  System(s, "Core", "Main system")`,
  'Boundary 3 args desc': `C4Context
  System_Boundary(b, "Platform", "The platform")`,
  'Component': `C4Component
  Component(c, "Renderer", "Draws SVG")`,
};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.addInitScript(() => localStorage.setItem('xmermaid-live.locale.v1', 'zh-CN'));
for (const [label, source] of Object.entries(CASES)) {
  await page.goto(ORIGIN, { waitUntil: 'networkidle' });
  await page.locator('[data-document-editor] .cm-content').fill(source);
  let status = '';
  try {
    await page.waitForFunction(ready => {
      const el = document.querySelector('[data-preview-status]');
      return el && el.textContent.trim() === ready;
    }, READY, { timeout: 8000 });
    status = 'READY ';
  } catch {
    status = 'FAIL  ';
  }
  const diag = (await page.locator('[data-diagnostics]').innerText().catch(() => '')).trim();
  const problem = diag.split('\n').map(l => l.trim()).find(l => /parse_error|security/.test(l));
  console.log(`${status} ${label}${problem ? '  -> ' + problem.slice(0, 130) : ''}`);
}
await browser.close();
