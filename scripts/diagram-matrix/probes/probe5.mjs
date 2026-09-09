import { chromium } from '@playwright/test';
const ORIGIN = 'http://127.0.0.1:4173';
const READY = '已更新';
const CASES = {
  'class one member block + bare rest': `classDiagram
  namespace Operations {
    class CronScheduler
    class Metrics
  }
  namespace Domain {
    class BatchTask
    class SqlStore
  }
  class Task {
    << abstract >>
    +id: UUID
    #priority: int
    +validate() Result
  }
  class Scheduler
  class Store
  class Runner
  Task <|-- BatchTask : extends
  Runner *-- "1" Task : owns
  Scheduler o-- "many" Task : queues
  Runner ..> Store : depends on
  CronScheduler ..|> Scheduler : realizes
  SqlStore ..|> Store
  Runner --> "0..n" Metrics : reports to
  BatchTask -- SqlStore : persisted in
  style BatchTask fill:#1a7f4b,stroke:#0b4f2e,color:#ffffff`,
  'flowchart shape label in subgraph': `flowchart TD
  subgraph P[Pipeline]
    T[[Transform data]] --> M(((Merge point)))
  end
  X --> P`,
  'flowchart shape redeclared in subgraph': `flowchart TD
  T --> M
  subgraph P[Pipeline]
    T[[Transform data]] --> M(((Merge point)))
  end`,
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
  const info = await page.evaluate(() => {
    const svg = document.querySelector('[data-preview] > svg.xmermaid-diagram');
    if (!svg) return 'no-svg';
    const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent.trim()).filter(Boolean);
    const paths = svg.querySelectorAll('path').length;
    return `${texts.length}t/${paths}p texts=[${texts.slice(0, 20).join(' | ')}]`;
  });
  console.log(`${ok ? 'READY ' : 'FAIL  '} ${label}\n       ${info.slice(0, 400)}`);
}
await browser.close();
