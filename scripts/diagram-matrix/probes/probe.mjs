// Probe candidate syntaxes in the real app; print status + first diagnostic.
import { chromium } from '@playwright/test';

const ORIGIN = 'http://127.0.0.1:4173';
const READY = '已更新';

const CASES = {
  'class classifier no-space': `classDiagram
  class Scheduler {
    <<interface>>
    +schedule(task: Task) bool
  }`,
  'class classifier spaced': `classDiagram
  class Scheduler {
    << interface >>
    +schedule(task: Task) bool
  }`,
  'state choice spaced': `stateDiagram-v2
  state check << choice >>
  [*] --> check
  check --> A : ok`,
  'quadrant classDef color-only': `quadrantChart
  x-axis Low --> High
  y-axis Low --> High
  Point A: [0.2, 0.3]
  Point B:::flagged: [0.6, 0.7]
  classDef flagged color: #b91c1c`,
  'quadrant classDef radius': `quadrantChart
  x-axis Low --> High
  y-axis Low --> High
  Point A: [0.2, 0.3]
  Point B:::flagged: [0.6, 0.7]
  classDef flagged radius: 9, color: #b91c1c, strokeColor: #7f1d1d, strokeWidth: 2`,
  'quadrant direct style': `quadrantChart
  x-axis Low --> High
  y-axis Low --> High
  Point A: [0.2, 0.3] radius: 9, color: #2563eb, strokeColor: #1e3a8a, strokeWidth: 2`,
  'c4 boundary braces': `C4Container
  Person(u, "User")
  System_Boundary(b, "Platform") {
    Container(web, "Web", "ts", "App")
  }
  Rel(u, web, "Uses")`,
  'c4 boundary parens': `C4Container
  Person(u, "User")
  System_Boundary(b, "Platform")
  Container(web, "Web", "ts", "App")
  Rel(u, web, "Uses")`,
  'c4 enterprise': `C4Context
  Person(u, "User")
  Enterprise_Boundary(b, "Company")
  System(s, "Core")
  Rel(u, s, "Uses")`,
  'c4 deployment': `C4Deployment
  Deployment_Node(dn, "Cluster", "k8s")
  Container(web, "Web", "ts", "App")
  Rel(dn, web, "Hosts")`,
  'mindmap asymmetric': `mindmap
  root
    A
      id1>Asymmetric label]`,
  'mindmap round shapes': `mindmap
  root
    id1[square]
    id2(round)
    id3((circle))
    id4([stadium])
    id5{{hexagon}}
    id6[(cylinder)]`,
  'packet absolute order': `packet
  0-15: "Magic"
  16-31: "Version"
  32-39: "Length"
  40-47: "Flags"
  48-63: "Checksum"
  +32: "Payload"`,
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
  const firstProblem = diag
    .split('\n')
    .map(l => l.trim())
    .find(l => l && !l.startsWith('（') && !/^(支持|部分|完全|没有诊断)/.test(l) && !l.includes('支持。') && l !== '没有诊断。');
  console.log(`${status === 'READY' ? 'READY ' : 'FAIL  '} ${label}`);
  if (firstProblem) console.log('        -> ' + firstProblem.slice(0, 160));
}

await browser.close();
