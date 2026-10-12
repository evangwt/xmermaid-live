// Generate README media from the real, production build:
//   1. a workflow frame sequence  -> output/readme-assets/frames/  (assembled into docs/assets/demo.gif)
//   2. clean per-family tiles      -> output/readme-assets/tiles/   (assembled into docs/assets/diagram-gallery.png)
//   3. theme stills + toggle frames -> output/readme-assets/theme*/ (docs/assets/theme-dark.png, theme-toggle.gif)
//
// Usage: node scripts/readme-assets.mjs   (requires `npm run build` and `npm run serve:test`)
import { chromium } from '@playwright/test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLES } from './diagram-matrix/examples.mjs';

const ORIGIN = 'http://127.0.0.1:4173';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'output', 'readme-assets');
const FRAMES = join(OUT, 'frames');
const TILES = join(OUT, 'tiles');
const THEME = join(OUT, 'theme');
const THEME_FRAMES = join(OUT, 'theme-frames');

// Render every family; the compositor picks the best-proportioned subset.
const GALLERY_FAMILIES = Object.keys(EXAMPLES);

// A short document that mixes a fenced block with two bare (fence-less) diagrams.
const DOC = `# Release review

Here is how a release goes out:

\`\`\`mermaid
flowchart TD
  Commit --> CI
  CI --> Review
  Review --> Release
\`\`\`

If review finds a problem we roll forward instead:

flowchart LR
  Alert --> Triage
  Triage --> Rollback
  Triage --> FixForward

And where this month's bugs came from:

pie showData title Bug sources
  "UI" : 42
  "API" : 31
  "Docs" : 12
`;

// Run every step by default; `--only=workflow|gallery|theme` runs just one.
const ONLY = (process.argv.find(arg => arg.startsWith('--only=')) ?? '').slice('--only='.length);
const run = (step) => ONLY === '' || ONLY === step;

if (ONLY === '') rmSync(OUT, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });
mkdirSync(TILES, { recursive: true });
mkdirSync(THEME, { recursive: true });
mkdirSync(THEME_FRAMES, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1400, height: 880 },
  deviceScaleFactor: 1,
  colorScheme: 'light',
  locale: 'en-US',
});
await page.addInitScript(() => { try { localStorage.clear(); } catch {} });

const editor = () => page.locator('[data-document-editor] .cm-content');
async function fill(text) {
  await editor().fill(text);
}
async function waitRendered() {
  await page.waitForSelector('[data-preview] > svg.xmermaid-diagram', { timeout: 20000 });
  await page.waitForTimeout(420);
}

let frameCount = 0;
async function shot() {
  const name = `f${String(frameCount).padStart(3, '0')}.png`;
  await page.screenshot({ path: join(FRAMES, name) });
  frameCount += 1;
}

// ---- 1. workflow frames -------------------------------------------------
if (run('workflow')) {
  await page.goto(ORIGIN, { waitUntil: 'networkidle' });
  await fill('');
  await page.waitForTimeout(450);
  await shot();
  await shot();

  await fill(DOC);
  for (let i = 0; i < 8; i += 1) { await page.waitForTimeout(140); await shot(); }

  const items = page.locator('[data-diagram-item]');
  const count = await items.count();
  if (count < 3) throw new Error(`Expected 3 extracted diagrams, got ${count}`);

  await items.nth(1).click();
  for (let i = 0; i < 5; i += 1) { await page.waitForTimeout(140); await shot(); }

  await items.nth(2).click();
  for (let i = 0; i < 9; i += 1) { await page.waitForTimeout(140); await shot(); }

  console.log(`frames: ${frameCount}`);
}

// ---- 2. per-family tiles ------------------------------------------------
// Selecting a diagram in the list switches the editor to its "Current diagram"
// tab; go back to the full-document editor before filling whole documents again.
if (run('gallery')) {
  await page.locator('[data-editor-tab="document"]').click();
  await page.waitForTimeout(200);

  for (const family of GALLERY_FAMILIES) {
    const source = EXAMPLES[family];
    if (!source) { console.warn(`no example for ${family}`); continue; }
    try {
      await fill(source);
      await waitRendered();

      const info = await page.locator('[data-preview] > svg.xmermaid-diagram').first().evaluate((el) => {
        const num = (v) => Number.parseFloat(String(v ?? '').replace('px', ''));
        let w = num(el.getAttribute('width'));
        let h = num(el.getAttribute('height'));
        if (!Number.isFinite(w) || !Number.isFinite(h)) {
          const vb = (el.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
          w = vb[2]; h = vb[3];
        }
        return { html: el.outerHTML, width: Math.ceil(w), height: Math.ceil(h) };
      });

      const tilePage = await browser.newPage({
        viewport: { width: info.width, height: info.height },
        deviceScaleFactor: 2,
      });
      await tilePage.setContent(
        `<!doctype html><meta charset="utf-8"><body style="margin:0">${info.html}</body>`,
        { waitUntil: 'load' },
      );
      await tilePage.screenshot({ path: join(TILES, `${family}.png`) });
      await tilePage.close();
      console.log(`tile: ${family} ${info.width}x${info.height}`);
    } catch (error) {
      console.warn(`skip ${family}: ${error instanceof Error ? error.message.split('\n')[0] : error}`);
    }
  }
}

// ---- 3. theme showcase --------------------------------------------------
// A fresh page per capture so the full-document editor tab is active and no
// family example from step 2 lingers in the workspace.
const THEME_DOC = DOC;
let themeFrames = 0;

async function themePage({ width, height, deviceScaleFactor }) {
  const p = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor,
    colorScheme: 'light',
    locale: 'en-US',
  });
  await p.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await p.goto(ORIGIN, { waitUntil: 'networkidle' });
  await p.locator('[data-document-editor] .cm-content').fill(THEME_DOC);
  await p.waitForSelector('[data-preview] > svg.xmermaid-diagram', { timeout: 20000 });
  await p.waitForTimeout(500);
  return p;
}

const pickWorkspaceTheme = async (p, theme) => {
  await p.locator(`.topbar .theme-switch [data-theme-option="${theme}"]`).click();
  await p.waitForTimeout(600);
};

if (run('theme')) {
  // 3a. crisp stills at 2x, matching the hero screenshot's framing.
  const stills = await themePage({ width: 1440, height: 860, deviceScaleFactor: 2 });
  await pickWorkspaceTheme(stills, 'light');
  await stills.screenshot({ path: join(THEME, 'light@2x.png') });
  await pickWorkspaceTheme(stills, 'dark');
  await stills.screenshot({ path: join(THEME, 'dark@2x.png') });
  await stills.close();
  console.log('theme stills: light@2x.png, dark@2x.png');

  // 3b. toggle frames at 1x (assembled into docs/assets/theme-toggle.gif).
  const anim = await themePage({ width: 1400, height: 880, deviceScaleFactor: 1 });
  await pickWorkspaceTheme(anim, 'light');

  const themeShot = async () => {
    await anim.screenshot({ path: join(THEME_FRAMES, `t${String(themeFrames).padStart(3, '0')}.png`) });
    themeFrames += 1;
  };

  // A light -> dark -> light round trip so the loop restarts where it began.
  const toggle = async (theme, frames) => {
    await anim.locator(`.topbar .theme-switch [data-theme-option="${theme}"]`).click();
    for (let i = 0; i < frames; i += 1) { await anim.waitForTimeout(90); await themeShot(); }
  };
  const hold = async (frames) => {
    for (let i = 0; i < frames; i += 1) { await anim.waitForTimeout(140); await themeShot(); }
  };

  await hold(3);            // light, settled
  await toggle('dark', 4);  // flip to dark (chrome + diagram re-render)
  await hold(3);            // dark, settled
  await toggle('light', 4); // flip back to light
  await hold(3);            // light again — loops cleanly
  await anim.close();
  console.log(`theme frames: ${themeFrames}`);
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ families: GALLERY_FAMILIES, frames: frameCount, themeFrames }, null, 2));
await browser.close();
console.log('done');
