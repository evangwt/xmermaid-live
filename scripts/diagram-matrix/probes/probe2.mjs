import { chromium } from '@playwright/test';
const ORIGIN = 'http://127.0.0.1:4173';
const READY = '已更新';
const CASES = {
  'class tight classifier top-level': `classDiagram
  class Scheduler {
    <<interface>>
    +schedule() bool
  }`,
  'class tight classifier in namespace': `classDiagram
  namespace Ops {
    class Scheduler {
      <<interface>>
      +schedule() bool
    }
  }`,
  'class no classifier in namespace': `classDiagram
  namespace Ops {
    class Scheduler {
      +schedule() bool
    }
  }`,
  'c4 full minus deployment': `C4Container
  title Streaming platform - container view
  Person(subscriber, "Subscriber", "Watches content")
  System_Ext(identity, "Identity provider", "OIDC login")
  System_Boundary(platform, "Streaming platform")
  Container(web, "Web app", "TypeScript")
  Container(mobile, "Mobile app", "Kotlin")
  Container(api, "Public API", "Go")
  ContainerDb(catalog, "Catalog DB", "Postgres")
  Container(recs, "Recommender", "Python")
  Rel(subscriber, web, "Watch and search")
  Rel(subscriber, mobile, "Watch on the go")
  Rel_Back(web, identity, "Authenticate via")
  Rel(api, identity, "Validate tokens")
  Rel(web, api, "GraphQL queries")
  Rel(mobile, api, "REST calls")
  Rel(api, catalog, "Read and write")
  Rel(recs, catalog, "Read titles")
  Rel_Right(recs, api, "Serve ranked lists")
  BiRel(web, mobile, "Continue-watching sync")`,
  'c4 full minus Rel_Back/BiRel/Rel_Right': `C4Container
  title Streaming platform - container view
  Person(subscriber, "Subscriber", "Watches content")
  System_Ext(identity, "Identity provider", "OIDC login")
  System_Boundary(platform, "Streaming platform")
  Container(web, "Web app", "TypeScript")
  Container(mobile, "Mobile app", "Kotlin")
  Container(api, "Public API", "Go")
  ContainerDb(catalog, "Catalog DB", "Postgres")
  Container(recs, "Recommender", "Python")
  Deployment_Node(edge, "Edge cluster")
  ContainerDb(cache, "Edge cache", "Redis")
  Rel(subscriber, web, "Watch and search")
  Rel(subscriber, mobile, "Watch on the go")
  Rel(api, identity, "Validate tokens")
  Rel(web, api, "GraphQL queries")
  Rel(mobile, api, "REST calls")
  Rel(api, catalog, "Read and write")
  Rel(recs, catalog, "Read titles")
  Rel(edge, cache, "Terminates")`,
  'c4 deployment only': `C4Container
  Deployment_Node(edge, "Edge cluster")
  ContainerDb(cache, "Edge cache", "Redis")
  Rel(edge, cache, "Terminates")`,
  'c4 rel to external system': `C4Container
  System_Ext(identity, "Identity provider")
  Container(api, "API", "Go")
  Rel(api, identity, "Validate tokens")`,
};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.addInitScript(() => localStorage.setItem('xmermaid-live.locale.v1', 'zh-CN'));
for (const [label, source] of Object.entries(CASES)) {
  await page.goto(ORIGIN, { waitUntil: 'networkidle' });
  await page.locator('[data-document-editor] .cm-content').fill(source);
  let ok = true;
  try {
    await page.waitForFunction(ready => {
      const el = document.querySelector('[data-preview-status]');
      return el && el.textContent.trim() === ready;
    }, READY, { timeout: 8000 });
  } catch { ok = false; }
  const diag = (await page.locator('[data-diagnostics]').innerText().catch(() => '')).trim();
  const problem = diag.split('\n').map(l => l.trim()).find(l => /parse_error|render_error|security/.test(l));
  console.log(`${ok ? 'READY ' : 'FAIL  '} ${label}${problem ? '  -> ' + problem.slice(0, 130) : ''}`);
}
await browser.close();
