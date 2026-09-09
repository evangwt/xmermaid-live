import { chromium } from '@playwright/test';
const ORIGIN = 'http://127.0.0.1:4173';
const READY = '已更新';
const CASES = {
  'c4 rich deployment doc': `C4Deployment
  title Edge rollout view
  Deployment_Node(cluster, "Main cluster")
  Deployment_Node(cdn, "CDN node")
  ContainerDb(cache, "Edge cache", "Redis")
  Container(player, "Player", "TS")
  Rel(cdn, cache, "Reads through")
  Rel(player, cache, "Fetch segments")`,
  'c4 deployment inside full (no rel to edge)': `C4Container
  Person(subscriber, "Subscriber", "Watches content")
  System_Boundary(platform, "Streaming platform")
  Container(web, "Web app", "TypeScript")
  Container(api, "Public API", "Go")
  Deployment_Node(edge, "Edge cluster")
  Rel(subscriber, web, "Watch and search")
  Rel(web, api, "GraphQL queries")`,
  'class mixed namespace + top-level members': `classDiagram
  namespace Operations {
    class CronScheduler
    class Metrics
  }
  namespace Domain {
    class BatchTask
    class SqlStore
  }
  class Scheduler {
    << interface >>
    +schedule(task: Task) bool
    -timezone: String$
  }
  class Task {
    << abstract >>
    +id: UUID
    #priority: int
    +validate() Result
  }
  class Store {
    << interface >>
    +save(task: Task) bool
  }
  class Runner {
    +execute(task: Task) Status
  }
  Task <|-- BatchTask : extends
  Runner *-- "1" Task : owns
  Scheduler o-- "many" Task : queues
  Runner ..> Store : depends on
  CronScheduler ..|> Scheduler : realizes
  SqlStore ..|> Store
  Runner --> "0..n" Metrics : reports to
  BatchTask -- SqlStore : persisted in
  style BatchTask fill:#1a7f4b,stroke:#0b4f2e,color:#ffffff
  style Scheduler fill:#b45309,stroke:#7c2d12,color:#ffffff`,
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
