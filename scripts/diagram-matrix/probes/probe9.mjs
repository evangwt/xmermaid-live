import { chromium } from '@playwright/test';
const ORIGIN = 'http://127.0.0.1:4173';
const READY = '已更新';
const CASES = {
  'mindmap icon fa:fa-car': `mindmap
  root
    A
      ::icon(fa:fa-car)
      B`,
  'mindmap icon fa-car': `mindmap
  root
    A
      ::icon(fa-car)
      B`,
  'flowchart linkStyle default': `flowchart TD
  A --> B
  B --> C
  linkStyle default stroke:#2563eb,stroke-width:2px`,
  'flowchart linkStyle color only': `flowchart TD
  A --> B
  linkStyle 0 stroke:#2563eb`,
  'flowchart linkStyle fill only': `flowchart TD
  A --> B
  linkStyle 0 fill:#2563eb`,
  'sequence spaced bidirectional': `sequenceDiagram
  participant A
  participant B
  A <--> B: Keepalive`,
  'arch junction ported arrows': `architecture-beta
  service api(server)[API]
  service a(server)[A]
  service b(database)[B]
  junction j
  api:R --> L:j
  j:R --> L:a
  j:B --> T:b`,
  'arch junction last': `architecture-beta
  service api(server)[API]
  service db(database)[DB]
  api:R --> L:db
  junction bus`,
  'zenuml participant solo': `zenuml
  participant Alice
  Alice->Bob: hi`,
  'zenuml new participant': `zenuml
  Alice->Bob: hi
  new Participant Carol
  Carol->Bob: yo`,
  'c4 rel 4th arg direction': `C4Container
  Person(u, "User")
  Container(web, "Web app", "ts")
  Rel(u, web, "Uses", "LTR")`,
  'c4 deployment unconnected in full': `C4Container
  Person(u, "User")
  System_Boundary(b, "Platform")
  Container(web, "Web app", "ts")
  Rel(u, web, "Uses")
  Deployment_Node(edge, "Edge cluster")`,
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
    const icons = svg.querySelectorAll('svg, use, symbol').length;
    return `${texts.length}t icons=${icons} [${texts.slice(0, 8).join(' | ')}]`;
  });
  console.log(`${ok ? 'READY ' : 'FAIL  '} ${label}\n       ${info.slice(0, 200)}`);
}
await browser.close();
