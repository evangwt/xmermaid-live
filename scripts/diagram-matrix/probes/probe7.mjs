import { chromium } from '@playwright/test';
const ORIGIN = 'http://127.0.0.1:4173';
const READY = '已更新';
const CASES = {
  'shape then plain re-ref': `flowchart TD
  T[[Transform data]] --> S
  S --> M
  M --> T`,
  'shape then ampersand re-ref': `flowchart TD
  T[[Transform data]] --> S
  S --> M
  T & M --> Z`,
  'ampersand first, shape at decl': `flowchart TD
  T[[Transform data]] & S --> M`,
};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.addInitScript(() => localStorage.setItem('xmermaid-live.locale.v1', 'zh-CN'));
for (const [label, source] of Object.entries(CASES)) {
  await page.goto(ORIGIN, { waitUntil: 'networkidle' });
  await page.locator('[data-document-editor] .cm-content').fill(source);
  try {
    await page.waitForFunction(ready => {
      const el = document.querySelector('[data-preview-status]');
      return el && el.textContent.trim() === ready;
    }, READY, { timeout: 8000 });
  } catch {}
  const texts = await page.evaluate(() => {
    const svg = document.querySelector('[data-preview] > svg.xmermaid-diagram');
    return svg ? Array.from(svg.querySelectorAll('text')).map(t => t.textContent.trim()).join(' | ') : 'no-svg';
  });
  console.log(`${label}: [${texts}]`);
}
await browser.close();
