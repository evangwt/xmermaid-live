import { expect, test } from '@playwright/test';

// The mixed reading view is the one surface where the real WASM renderer runs
// many times in one page, so this covers it against the production build.

const MIXED_DOCUMENT = `# Mixed view

Intro paragraph before the diagram.

\`\`\`mermaid
flowchart TD
  Start[Start] --> End[End]
\`\`\`

Middle prose between the two diagrams.

\`\`\`mermaid
sequenceDiagram
  Alice->>Bob: Hello
\`\`\`

Outro paragraph after the second diagram.
`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('i18n-preferences-configured') === '1') return;
    localStorage.setItem('xmermaid-live.locale.v1', 'zh-CN');
  });
});

test('renders the whole document with every diagram inline @cross-browser', async ({ page }) => {
  await page.goto('./');

  const documentEditor = page.getByRole('textbox', { name: '完整文本' });
  await documentEditor.fill(MIXED_DOCUMENT);
  await expect(page.locator('[data-diagram-item]')).toHaveCount(2, { timeout: 30_000 });

  await page.getByRole('tab', { name: '文档预览' }).click();

  const mixed = page.locator('.document-preview');
  await expect(mixed.locator('.doc-diagram')).toHaveCount(2);
  await expect(mixed.locator('.doc-diagram-svg')).toHaveCount(2, { timeout: 30_000 });
  // Real renderer output, not a placeholder.
  await expect(mixed.locator('.doc-diagram-svg').first()).toContainText('Start');
  await expect(mixed.locator('.doc-diagram-svg').nth(1)).toContainText('Alice');
  // Prose sits around the diagrams in source order, with no stray fence markers.
  const prose = await mixed.locator('.doc-prose').allInnerTexts();
  expect(prose.join('\n')).toContain('Intro paragraph');
  expect(prose.join('\n')).toContain('Outro paragraph');
  expect(prose.join('\n')).not.toContain('```');
});

test('splits one fence holding two diagrams and renders both @cross-browser', async ({ page }) => {
  await page.goto('./');

  const documentEditor = page.getByRole('textbox', { name: '完整文本' });
  await documentEditor.fill(`\`\`\`mermaid
flowchart TD
  Start[Start] --> End[End]
sequenceDiagram
  Alice->>Bob: Hello
\`\`\``);

  // Two diagrams, not one merged block that fails to render.
  await expect(page.locator('[data-diagram-item]')).toHaveCount(2, { timeout: 30_000 });

  await page.getByRole('tab', { name: '文档预览' }).click();
  const mixed = page.locator('.document-preview');
  await expect(mixed.locator('.doc-diagram-svg')).toHaveCount(2, { timeout: 30_000 });
  await expect(mixed.locator('.doc-diagram-svg').first()).toContainText('Start');
  await expect(mixed.locator('.doc-diagram-svg').nth(1)).toContainText('Alice');
});
