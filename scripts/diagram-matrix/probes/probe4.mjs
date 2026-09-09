import { chromium } from '@playwright/test';
const ORIGIN = 'http://127.0.0.1:4173';
const READY = '已更新';
const CASES = {
  'class minimal relation': `classDiagram
  A <|-- B`,
  'class members + relations': `classDiagram
  class Task {
    +id: UUID
    +validate() Result
  }
  class Runner {
    +execute(task: Task) Status
  }
  Task <|-- BatchTask : extends
  Runner *-- "1" Task : owns`,
  'class namespaces + relations': `classDiagram
  namespace Ops {
    class CronScheduler
  }
  class Scheduler
  CronScheduler ..|> Scheduler : realizes`,
  'class members + namespaces': `classDiagram
  namespace Ops {
    class CronScheduler
  }
  class Scheduler {
    +schedule() bool
  }
  CronScheduler ..|> Scheduler`,
  'class full minus style': `classDiagram
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
  }
  class Task {
    << abstract >>
    +id: UUID
  }
  Task <|-- BatchTask : extends
  Runner *-- "1" Task : owns
  Runner ..> Store : depends on`,
  'flowchart subroutine shape': `flowchart TD
  T[[Transform data]] --> M`,
  'flowchart double circle shape': `flowchart TD
  A --> M(((Merge point)))`,
  'flowchart ampersand + shape target': `flowchart TD
  A & B --> M(((Merge point)))`,
  'sequence link bidirectional': `sequenceDiagram
  Client<-->Gateway: Keepalive`,
  'sequence link no label': `sequenceDiagram
  participant A
  participant B
  A<-->B`,
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
    const lines = svg.querySelectorAll('line').length;
    return `${texts.length}t/${paths}p/${lines}l texts=[${texts.slice(0, 12).join(' | ')}]`;
  });
  console.log(`${ok ? 'READY ' : 'FAIL  '} ${label}\n       ${info.slice(0, 220)}`);
}
await browser.close();
