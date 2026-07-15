import { expect, test, type Download, type Page } from '@playwright/test';

const ORIGIN = 'http://127.0.0.1:4173';
const ALLOWED_STATIC_PATHS = [
  /^\/$/,
  /^\/xmermaid-live\/$/,
  /^\/(?:xmermaid-live\/)?assets\/index-[A-Za-z0-9_-]{8}\.(?:css|js)$/,
  /^\/(?:xmermaid-live\/)?assets\/xmermaid_wasm_bg-[A-Za-z0-9_-]{8}\.wasm$/,
  /^\/(?:xmermaid-live\/)?xmermaid_wasm_bg\.wasm$/,
];

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

function monitorPrivacy(page: Page): () => void {
  const externalRequests: string[] = [];
  const writeRequests: string[] = [];
  const queryRequests: string[] = [];
  const unexpectedRequests: string[] = [];
  const browserErrors: string[] = [];

  page.on('request', request => {
    const requestUrl = request.url();
    if (!['GET', 'HEAD'].includes(request.method())) {
      writeRequests.push(`${request.method()} ${requestUrl}`);
    }
    if (requestUrl === 'data:,') return;

    const url = new URL(requestUrl);
    if (url.protocol === 'blob:' && url.origin === ORIGIN) return;
    if (url.origin !== ORIGIN) externalRequests.push(requestUrl);
    if (url.origin === ORIGIN && url.search) queryRequests.push(requestUrl);
    if (url.origin === ORIGIN && !ALLOWED_STATIC_PATHS.some(pattern => pattern.test(url.pathname))) {
      unexpectedRequests.push(requestUrl);
    }
  });
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', error => browserErrors.push(error.message));

  return () => {
    expect(externalRequests).toEqual([]);
    expect(writeRequests).toEqual([]);
    expect(queryRequests).toEqual([]);
    expect(unexpectedRequests).toEqual([]);
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

interface DeploymentAssets {
  css: URL;
  js: URL;
  wasm: URL;
}

async function loadDeployment(page: Page, prefix: '/' | '/xmermaid-live/'): Promise<DeploymentAssets> {
  const requests: URL[] = [];
  const recordRequest = (request: { url(): string }) => {
    const url = new URL(request.url());
    if (url.origin === ORIGIN) requests.push(url);
  };
  page.on('request', recordRequest);

  const wasmPath = `${prefix}xmermaid_wasm_bg.wasm`;
  const wasmResponsePromise = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.origin === ORIGIN && url.pathname === wasmPath && !url.search;
  });

  try {
    await page.goto(`${ORIGIN}${prefix}`);
    await expect(page.locator('[data-preview] svg')).toBeVisible();
    const wasmResponse = await wasmResponsePromise;
    expect(wasmResponse.ok()).toBe(true);
    expect(wasmResponse.headers()['content-type']).toContain('application/wasm');
  } finally {
    page.off('request', recordRequest);
  }

  const documentUrl = onlyUrl(requests, url => url.pathname === prefix, 'document');
  const js = onlyUrl(requests, url => new RegExp(`^${prefix}assets/index-[A-Za-z0-9_-]{8}\\.js$`).test(url.pathname), 'JavaScript');
  const css = onlyUrl(requests, url => new RegExp(`^${prefix}assets/index-[A-Za-z0-9_-]{8}\\.css$`).test(url.pathname), 'CSS');
  const wasm = onlyUrl(requests, url => url.pathname === wasmPath, 'WASM');

  for (const url of [documentUrl, js, css, wasm]) expect(url.search).toBe('');
  return { css, js, wasm };
}

function onlyUrl(urls: URL[], matches: (url: URL) => boolean, label: string): URL {
  const matching = urls.filter(matches);
  expect(matching, `expected exactly one ${label} request`).toHaveLength(1);
  return matching[0]!;
}

function assetName(url: URL): string {
  return url.pathname.slice(url.pathname.lastIndexOf('/') + 1);
}

test('extracts, switches, edits, shares, and exports real WASM diagrams', async ({ page }) => {
  const expectPrivateRequests = monitorPrivacy(page);

  await page.goto('./');
  await page.getByRole('tab', { name: '完整文本' }).click();
  await page.getByLabel('完整文本').fill(PASTED_DOCUMENT);

  await expect(page.locator('[data-diagram-item]')).toHaveCount(2);
  const previewSvg = page.locator('[data-preview] svg');
  await expect(previewSvg).toContainText('First diagram');
  const firstMarkup = await previewSvg.evaluate(svg => svg.outerHTML);

  await page.locator('[data-diagram-item]').nth(1).click();
  await expect(page.getByLabel('当前图表')).toHaveValue(/Second diagram/);
  await expect(previewSvg).toContainText('Second diagram');
  const secondMarkup = await previewSvg.evaluate(svg => svg.outerHTML);
  expect(secondMarkup).not.toBe(firstMarkup);

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
  expectPrivateRequests();
});

test('keeps the last SVG but blocks stale export after a render error', async ({ page }) => {
  const expectPrivateRequests = monitorPrivacy(page);

  await page.goto('./');
  const previewSvg = page.locator('[data-preview] svg');
  await expect(previewSvg).toBeVisible();
  const successfulMarkup = await previewSvg.evaluate(svg => svg.outerHTML);
  await page.getByRole('tab', { name: '当前图表' }).click();
  await page.getByLabel('当前图表').fill('sequenceDiagram\n  Alice->>Bob: Hello');

  await expect(page.locator('[data-preview-status]')).toHaveText('预览未更新');
  await expect(previewSvg).toBeVisible();
  expect(await previewSvg.evaluate(svg => svg.outerHTML)).toBe(successfulMarkup);
  await expect(page.getByRole('button', { name: '下载 SVG' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '下载 PNG' })).toBeDisabled();
  await expect(page.locator('[data-diagnostics]')).toContainText('unsupported_diagram_type');
  expectPrivateRequests();
});

test('switches to exactly one panel at a phone viewport', async ({ page }) => {
  const expectPrivateRequests = monitorPrivacy(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByRole('button', { name: '预览', exact: true }).click();
  await expect(page.locator('[data-panel="preview"]')).toBeVisible();
  await expect(page.locator('[data-panel="edit"]')).toBeHidden();
  await expect(page.locator('[data-panel="list"]')).toBeHidden();
  expectPrivateRequests();
});

test('boots the same production build at the domain root and subpath', async ({ page }) => {
  const expectPrivateRequests = monitorPrivacy(page);

  const rootAssets = await loadDeployment(page, '/');
  expect(rootAssets.js.pathname).toMatch(/^\/assets\/index-[A-Za-z0-9_-]{8}\.js$/);
  expect(rootAssets.css.pathname).toMatch(/^\/assets\/index-[A-Za-z0-9_-]{8}\.css$/);
  expect(rootAssets.wasm.pathname).toBe('/xmermaid_wasm_bg.wasm');

  const subpathAssets = await loadDeployment(page, '/xmermaid-live/');
  expect(subpathAssets.js.pathname).toMatch(/^\/xmermaid-live\/assets\/index-[A-Za-z0-9_-]{8}\.js$/);
  expect(subpathAssets.css.pathname).toMatch(/^\/xmermaid-live\/assets\/index-[A-Za-z0-9_-]{8}\.css$/);
  expect(subpathAssets.wasm.pathname).toBe('/xmermaid-live/xmermaid_wasm_bg.wasm');
  expect(assetName(subpathAssets.js)).toBe(assetName(rootAssets.js));
  expect(assetName(subpathAssets.css)).toBe(assetName(rootAssets.css));
  expect(assetName(subpathAssets.wasm)).toBe(assetName(rootAssets.wasm));
  expectPrivateRequests();
});
