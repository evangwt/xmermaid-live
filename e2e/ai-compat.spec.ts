import { expect, test } from '@playwright/test';

// AI-written Mermaid leans on syntax this renderer used to reject outright:
// HTML labels (<br/>, <b>, <span>), Markdown string labels, edge IDs, quoted
// inline edge labels, classDef with cosmetic properties, and class-diagram
// classDef. Every form must render now instead of surfacing an error.
const AI_STYLE_FLOWCHART = [
  'flowchart TD',
  '  A["Start<br/>next"] -->|"yes<br/>ok"| B{"<b>Check</b>"}',
  '  B --> C["<span style=\\"color:red\\">Done</span>"]',
  '  B e1@--> D["`**fallback** plan`"]',
  '  A -- "try it" --> E[End]',
  '  classDef green fill:#9f6,stroke:#333,font-size:14px',
  '  class C green',
].join('\n');

const AI_STYLE_CLASS_DIAGRAM = [
  'classDiagram',
  '  class Order',
  '  Order : +int total',
  '  classDef green fill:#9f6,stroke:#333',
  '  class Order green',
].join('\n');

test('renders AI-written syntax that used to be rejected as unsupported', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('./');
  await page.getByRole('tab', { name: '当前图表' }).click();
  await page.getByRole('textbox', { name: '当前图表' }).fill(AI_STYLE_FLOWCHART);

  const previewSvg = page.locator('[data-preview] > svg.xmermaid-diagram');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');

  // Sanitized multi-line labels render as real text, not raw markup.
  await expect(previewSvg).toContainText('Start');
  await expect(previewSvg.locator('g.node', { hasText: 'Start' })).toContainText('next');
  await expect(previewSvg).toContainText('Check');
  await expect(previewSvg).toContainText('Done');
  await expect(previewSvg).toContainText('fallback plan');
  await expect(previewSvg).toContainText('try it');

  // No raw tag markup leaks into the drawing.
  const markup = await previewSvg.evaluate(svg => svg.textContent ?? '');
  expect(markup).not.toContain('<br');
  expect(markup).not.toContain('<b>');
  expect(markup).not.toContain('<span');
  expect(markup).not.toContain('**');
  expect(markup).not.toContain('`');
});

test('renders class diagrams with classDef styling from AI-written sources', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('./');
  await page.getByRole('tab', { name: '当前图表' }).click();
  await page.getByRole('textbox', { name: '当前图表' }).fill(AI_STYLE_CLASS_DIAGRAM);

  const previewSvg = page.locator('[data-preview] > svg.xmermaid-diagram');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await expect(previewSvg).toContainText('Order');
  await expect(previewSvg).toContainText('+int total');
});
