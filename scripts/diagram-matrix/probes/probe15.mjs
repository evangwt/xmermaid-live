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
const info = await page.evaluate(() => {
  const svg = document.querySelector('[data-preview] > svg.xmermaid-diagram');
  const out = [];
  for (const t of svg.querySelectorAll('text')) {
    const b = t.getBBox();
    if (Math.max(Math.abs(b.x), Math.abs(b.y)) > 100000) {
      out.push({
        content: t.textContent,
        x: t.getAttribute('x'),
        y: t.getAttribute('y'),
        bbox: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
        parentChain: (() => { let p = t.parentElement; const c = []; while (p && p !== svg) { c.push(p.tagName + (p.getAttribute('class') ? '.' + p.getAttribute('class') : '')); p = p.parentElement; } return c.join('>'); })(),
      });
    }
  }
  return out;
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
