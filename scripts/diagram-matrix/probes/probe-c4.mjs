// Second probe round: narrow down working C4 forms.
import { chromium } from '@playwright/test';

const ORIGIN = 'http://127.0.0.1:4173';
const READY = '已更新';

const CASES = {
  'C4Container basic': `C4Container
  Person(u, "User")
  Container(web, "Web app", "TypeScript", "Browser client")
  Rel(u, web, "Uses")`,
  'C4Container containerdb+queue': `C4Container
  System(s, "Platform")
  ContainerDb(db, "Catalog DB", "Postgres", "Titles")
  ContainerQueue(q, "Bus", "Kafka", "Events")
  Rel(s, db, "Writes")`,
  'C4Context system_boundary': `C4Context
  Person(u, "User")
  System_Boundary(b, "Platform")
  System(s, "Core")
  Rel(u, s, "Uses")`,
  'C4Container system_boundary': `C4Container
  Person(u, "User")
  System_Boundary(b, "Platform")
  Container(web, "Web app", "ts", "App")
  Rel(u, web, "Uses")`,
  'C4Container boundary+ext': `C4Container
  Person(u, "User")
  System_Ext(idp, "Identity")
  System_Boundary(b, "Platform")
  Container(web, "Web app", "ts", "App")
  Rel(u, web, "Uses")
  Rel(web, idp, "Auth")`,
  'C4Deployment container inside': `C4Deployment
  Deployment_Node(dn, "Cluster", "k8s")
  ContainerDb(db, "DB", "Postgres", "Data")
  Rel(dn, db, "Hosts")`,
  'C4Deployment system inside': `C4Deployment
  Deployment_Node(dn, "Cluster", "k8s")
  System(web, "Web", "App")
  Rel(dn, web, "Hosts")`,
  'C4Container birel+directional': `C4Container
  Person(u, "User")
  Container(a, "App", "ts", "Client")
  Container(b, "Api", "go", "Server")
  Rel_Right(a, b, "Calls")
  BiRel(a, b, "Sync")`,
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.addInitScript(() => {
  localStorage.setItem('xmermaid-live.locale.v1', 'zh-CN');
});

for (const [label, source] of Object.entries(CASES)) {
  await page.goto(ORIGIN, { waitUntil: 'networkidle' });
  await page.locator('[data-document-editor] .cm-content').fill(source);
  let status = '';
  try {
    await page.waitForFunction(
      ready => {
        const el = document.querySelector('[data-preview-status]');
        return el && el.textContent.trim() === ready;
      },
      READY,
      { timeout: 8000 },
    );
    status = 'READY';
  } catch {
    status = (await page.locator('[data-preview-status]').innerText().catch(() => '?')).trim();
  }
  const diag = (await page.locator('[data-diagnostics]').innerText().catch(() => '')).trim();
  const problem = diag.split('\n').map(l => l.trim()).find(l => /parse_error|security|error/.test(l));
  console.log(`${status === 'READY' ? 'READY ' : 'FAIL  '} ${label}${problem ? '  -> ' + problem.slice(0, 150) : ''}`);
}

await browser.close();
