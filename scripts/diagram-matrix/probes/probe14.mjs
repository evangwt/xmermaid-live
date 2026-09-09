import { chromium } from '@playwright/test';
import { EXAMPLES } from '../examples.mjs';
const ORIGIN = 'http://127.0.0.1:4173';
const READY = '已更新';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
await page.addInitScript(() => localStorage.setItem('xmermaid-live.locale.v1', 'zh-CN'));
await page.goto(ORIGIN, { waitUntil: 'networkidle' });
await page.locator('[data-document-editor] .cm-content').fill(EXAMPLES.c4);
await page.waitForFunction(ready => {
  const el = document.querySelector('[data-preview-status]');
  return el && el.textContent.trim() === ready;
}, READY, { timeout: 20000 });
await page.waitForTimeout(500);
const info = await page.evaluate(() => {
  const svg = document.querySelector('[data-preview] > svg.xmermaid-diagram');
  if (!svg) return 'no svg';
  const bbox = svg.getBBox();
  let maxCoord = 0; let maxEl = '';
  for (const el of svg.querySelectorAll('*')) {
    try {
      const b = el.getBBox();
      const m = Math.max(Math.abs(b.x), Math.abs(b.y), Math.abs(b.x + b.width), Math.abs(b.y + b.height));
      if (m > maxCoord) { maxCoord = m; maxEl = el.tagName + '.' + (el.getAttribute('class') || ''); }
    } catch {}
  }
  return {
    viewBox: svg.getAttribute('viewBox'),
    width: svg.getAttribute('width'),
    bbox: { x: Math.round(bbox.x), y: Math.round(bbox.y), w: Math.round(bbox.width), h: Math.round(bbox.height) },
    maxCoord: Math.round(maxCoord),
    maxEl,
  };
});
console.log(JSON.stringify(info, null, 1));
const zoom = await page.locator('[data-preview-zoom-value]').innerText();
console.log('zoom shown:', zoom);
await page.locator('[data-preview-canvas]').screenshot({ path: new URL('./artifacts/c4-check.png', import.meta.url).pathname });
await browser.close();
