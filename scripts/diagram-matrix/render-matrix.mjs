// Render every diagram family example in the real app and capture evidence.
// Usage: node scripts/diagram-matrix/render-matrix.mjs [--browser=chromium|firefox|webkit] [--runs=N]
//
// For each family the complex example is attempted; a failed attempt is retried
// once before the simplified fallback (if any) is tried. Every attempt is
// recorded in the report so a fallback never hides the original failure.
import { chromium, firefox, webkit } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectDiagramType, analyzeSupport } from '@evangwt/xmermaid';
import { EXAMPLES, FALLBACKS } from './examples.mjs';

const args = process.argv.slice(2);
const browserName = (args.find(a => a.startsWith('--browser='))?.split('=')[1] ?? 'chromium').toLowerCase();
const runs = Number(args.find(a => a.startsWith('--runs='))?.split('=')[1] ?? 1);

const ENGINES = { chromium, firefox, webkit };
if (!ENGINES[browserName]) {
  console.error(`Unsupported browser: ${browserName}. Use one of ${Object.keys(ENGINES).join(', ')}.`);
  process.exit(2);
}

const ORIGIN = 'http://127.0.0.1:4173';
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUT_DIR = join(REPO_ROOT, 'output', 'diagram-matrix', browserName);
const TYPES = Object.keys(EXAMPLES);
const READY = '已更新';
const STALE = '预览未更新';

async function attempt(page, source) {
  await page.goto(ORIGIN, { waitUntil: 'networkidle' });
  await page.locator('[data-document-editor] .cm-content').fill(source);

  let statusText = '';
  try {
    await page.waitForFunction(
      ([ready, stale]) => {
        const el = document.querySelector('[data-preview-status]');
        const text = el ? el.textContent.trim() : '';
        return text === ready || text === stale;
      },
      [READY, STALE],
      { timeout: 20000 },
    );
    statusText = await page.locator('[data-preview-status]').innerText();
  } catch {
    statusText = await page.locator('[data-preview-status]').innerText().catch(() => '(missing)');
  }

  await page.waitForTimeout(400);

  const svgInfo = await page.evaluate(() => {
    const svg = document.querySelector('[data-preview] > svg.xmermaid-diagram');
    if (!svg) return null;
    const box = svg.getBoundingClientRect();
    return {
      width: Math.round(box.width),
      height: Math.round(box.height),
      viewBox: svg.getAttribute('viewBox'),
      textCount: svg.querySelectorAll('text').length,
      groupCount: svg.querySelectorAll('g').length,
      pathCount: svg.querySelectorAll('path').length,
      strayCoordinates: Array.from(svg.querySelectorAll('text')).filter(t => {
        const limit = 1_000_000;
        const x = Number(t.getAttribute('x'));
        const y = Number(t.getAttribute('y'));
        return (Number.isFinite(x) && Math.abs(x) > limit) || (Number.isFinite(y) && Math.abs(y) > limit);
      }).length,
    };
  });

  const diagnostics = (await page.locator('[data-diagnostics]').innerText().catch(() => '')).trim();
  return { statusText, svgInfo, diagnostics: diagnostics || '(empty)' };
}

const succeeded = outcome => outcome.statusText === READY && Boolean(outcome.svgInfo);

const engine = await ENGINES[browserName].launch();
const context = await engine.newContext({ viewport: { width: 1680, height: 1050 } });
await context.addInitScript(() => {
  localStorage.setItem('xmermaid-live.locale.v1', 'zh-CN');
});
const page = await context.newPage();

let allGood = true;
for (let run = 1; run <= runs; run += 1) {
  const runDir = join(OUT_DIR, `run${run}`);
  mkdirSync(runDir, { recursive: true });
  const report = [];

  for (const type of TYPES) {
    const complex = EXAMPLES[type];
    const detected = detectDiagramType(complex);
    const support = analyzeSupport(complex);

    const attempts = [];
    let outcome = null;
    let variant = 'complex';
    for (let tryIndex = 1; tryIndex <= 2; tryIndex += 1) {
      outcome = await attempt(page, complex);
      attempts.push({ variant: 'complex', ...outcome });
      if (succeeded(outcome)) break;
    }
    if (!succeeded(outcome) && FALLBACKS[type]) {
      outcome = await attempt(page, FALLBACKS[type]);
      attempts.push({ variant: 'fallback', ...outcome });
      variant = 'fallback';
    }
    const { statusText, svgInfo, diagnostics } = outcome;

    const shotPath = join(runDir, `${type}.png`);
    await page.locator('[data-preview-canvas]').screenshot({ path: shotPath });
    const svgPath = join(runDir, `${type}.svg`);
    const svgHtml = await page
      .locator('[data-preview] > svg.xmermaid-diagram')
      .evaluate(el => el.outerHTML)
      .catch(() => null);
    if (svgHtml) writeFileSync(svgPath, svgHtml);

    const entry = {
      type,
      detected,
      detectedMatch: detected === type,
      supportStatus: support.status,
      unsupportedFeatures: support.unsupportedFeatures.map(f => `${f.id} [${f.severity}]`),
      variant,
      attempts: attempts.map(a => ({ variant: a.variant, statusText: a.statusText, diagnostics: a.diagnostics })),
      statusText,
      rendered: statusText === READY && Boolean(svgInfo),
      svg: svgInfo,
      diagnostics,
      screenshot: shotPath,
    };
    report.push(entry);
    allGood &&= entry.rendered && entry.detectedMatch;
    console.log(
      `${entry.rendered ? 'OK  ' : 'FAIL'} run${run} ${type.padEnd(15)} detected=${String(entry.detectedMatch)} ` +
        `support=${entry.supportStatus} variant=${variant} status=${statusText} ` +
        `svg=${entry.svg ? `${entry.svg.textCount}t/${entry.svg.pathCount}p` : 'none'}` +
        (entry.svg && entry.svg.strayCoordinates ? ` STRAY=${entry.svg.strayCoordinates}` : ''),
    );
  }

  writeFileSync(join(OUT_DIR, `report-run${run}.json`), JSON.stringify(report, null, 2));
  const failed = report.filter(r => !r.rendered || !r.detectedMatch);
  console.log(`run${run}: ${report.length - failed.length}/${report.length} families rendered and detected.`);
  if (failed.length) console.log(`run${run} needs review:`, failed.map(f => f.type).join(', '));
}

await engine.close();
console.log(`\nBrowser=${browserName} runs=${runs} -> ${allGood ? 'ALL GREEN' : 'FAILURES PRESENT'}`);
process.exit(allGood ? 0 : 1);
