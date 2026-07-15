import { expect, test, type Download, type Page } from '@playwright/test';

const ORIGIN = 'http://127.0.0.1:4173';

const PASTED_DOCUMENT = `# Pasted

\`\`\`mermaid
flowchart TD
  First[First diagram] --> Shared[Preview]
\`\`\`

Text between diagrams.

\`\`\`mermaid
flowchart LR
  Second[Second diagram] --> Shared[Preview]
\`\`\`
`;

function monitorNetwork(page: Page): () => void {
  const externalRequests: string[] = [];
  const writeRequests: string[] = [];
  const browserErrors: string[] = [];

  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin !== ORIGIN) externalRequests.push(request.url());
    if (!['GET', 'HEAD'].includes(request.method())) {
      writeRequests.push(`${request.method()} ${request.url()}`);
    }
  });
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', error => browserErrors.push(error.message));

  return () => {
    expect(externalRequests).toEqual([]);
    expect(writeRequests).toEqual([]);
    expect(browserErrors).toEqual([]);
  };
}

async function downloadBytes(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Download did not provide a readable stream.');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test('extracts, switches, edits, shares, and exports real WASM diagrams', async ({ page }) => {
  const expectNoUploads = monitorNetwork(page);

  await page.goto('./');
  await page.getByRole('tab', { name: '完整文本' }).click();
  await page.getByLabel('完整文本').fill(PASTED_DOCUMENT);

  await expect(page.locator('[data-diagram-item]')).toHaveCount(2);
  await page.locator('[data-diagram-item]').nth(1).click();
  await expect(page.getByLabel('当前图表')).toHaveValue(/Second diagram/);
  await expect(page.locator('[data-preview] svg')).toBeVisible();

  await page.getByLabel('当前图表').fill('flowchart LR\n  Browser[Browser] --> WASM[WASM]');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await page.getByRole('tab', { name: '完整文本' }).click();
  await expect(page.getByLabel('完整文本')).toHaveValue(/Browser\[Browser\] --> WASM\[WASM\]/);
  await expect(page.getByLabel('完整文本')).toHaveValue(/First\[First diagram\]/);

  await page.getByRole('button', { name: '生成分享链接' }).click();
  await expect(page).toHaveURL(/#xm=/);
  await page.reload();
  await expect(page.getByLabel('当前图表')).toHaveValue(/Browser\[Browser\]/);
  await page.getByRole('tab', { name: '完整文本' }).click();
  await expect(page.getByLabel('完整文本')).toHaveValue(PASTED_DOCUMENT.replace(
    'flowchart LR\n  Second[Second diagram] --> Shared[Preview]',
    'flowchart LR\n  Browser[Browser] --> WASM[WASM]',
  ));

  const svgButton = page.getByRole('button', { name: '下载 SVG' });
  await expect(svgButton).toBeEnabled();
  const svgDownloadPromise = page.waitForEvent('download');
  await svgButton.click();
  const svgDownload = await svgDownloadPromise;
  expect(svgDownload.suggestedFilename()).toBe('diagram-2.svg');
  expect((await downloadBytes(svgDownload)).toString()).toContain('Browser');

  const pngDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载 PNG' }).click();
  const pngDownload = await pngDownloadPromise;
  expect(pngDownload.suggestedFilename()).toBe('diagram-2.png');
  expect((await downloadBytes(pngDownload)).subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  expectNoUploads();
});

test('keeps the last SVG but blocks stale export after a render error', async ({ page }) => {
  const expectNoUploads = monitorNetwork(page);

  await page.goto('./');
  await expect(page.locator('[data-preview] svg')).toBeVisible();
  await page.getByRole('tab', { name: '当前图表' }).click();
  await page.getByLabel('当前图表').fill('sequenceDiagram\n  Alice->>Bob: Hello');

  await expect(page.locator('[data-preview-status]')).toHaveText('预览未更新');
  await expect(page.locator('[data-preview] svg')).toBeVisible();
  await expect(page.getByRole('button', { name: '下载 SVG' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '下载 PNG' })).toBeDisabled();
  await expect(page.locator('[data-diagnostics]')).toContainText('unsupported_diagram_type');
  expectNoUploads();
});

test('switches to exactly one panel at a phone viewport', async ({ page }) => {
  const expectNoUploads = monitorNetwork(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByRole('button', { name: '预览', exact: true }).click();
  await expect(page.locator('[data-panel="preview"]')).toBeVisible();
  await expect(page.locator('[data-panel="edit"]')).toBeHidden();
  await expect(page.locator('[data-panel="list"]')).toBeHidden();
  expectNoUploads();
});

test('boots the same production build at the domain root and subpath', async ({ page }) => {
  const expectNoUploads = monitorNetwork(page);

  for (const url of [`${ORIGIN}/`, `${ORIGIN}/xmermaid-live/`]) {
    const wasmResponse = page.waitForResponse(response => response.url().endsWith('/xmermaid_wasm_bg.wasm'));
    await page.goto(url);
    await expect(page.locator('[data-preview] svg')).toBeVisible();
    const response = await wasmResponse;
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('application/wasm');
  }
  expectNoUploads();
});
