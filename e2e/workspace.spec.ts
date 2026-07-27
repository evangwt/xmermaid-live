import { expect, test, type Download, type Page } from '@playwright/test';
import { readdirSync } from 'node:fs';

const ORIGIN = 'http://127.0.0.1:4173';
const DEPLOYMENT_PREFIXES = ['/', '/xmermaid-live/'] as const;
const DIST_ASSET_NAMES = readdirSync(new URL('../dist/assets/', import.meta.url), { withFileTypes: true })
  .filter(entry => entry.isFile())
  .map(entry => entry.name);
const DIST_JS_ASSET = singleDistAsset('.js');
const DIST_CSS_ASSET = singleDistAsset('.css');
const ALLOWED_STATIC_PATHS = new Set(DEPLOYMENT_PREFIXES.flatMap(prefix => [
  prefix,
  `${prefix}xmermaid_wasm_bg.wasm`,
  ...DIST_ASSET_NAMES.map(name => `${prefix}assets/${name}`),
]));
const LOCAL_BLOB_URL = /^blob:http:\/\/127\.0\.0\.1:4173\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

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

const TALL_CHAIN = `flowchart TD\n${Array.from(
  { length: 40 },
  (_, index) => `  Node${index + 1}[Node ${index + 1}]${index === 39 ? '' : ` --> Node${index + 2}`}`,
).join('\n')}`;

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
    if (LOCAL_BLOB_URL.test(requestUrl)) return;
    if (url.origin !== ORIGIN) externalRequests.push(requestUrl);
    if (url.origin === ORIGIN && url.search) queryRequests.push(requestUrl);
    if (url.origin === ORIGIN && !ALLOWED_STATIC_PATHS.has(url.pathname)) {
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
  const js = onlyUrl(requests, url => url.pathname === `${prefix}assets/${DIST_JS_ASSET}`, 'JavaScript');
  const css = onlyUrl(requests, url => url.pathname === `${prefix}assets/${DIST_CSS_ASSET}`, 'CSS');
  const wasm = onlyUrl(requests, url => url.pathname === wasmPath, 'WASM');

  for (const url of [documentUrl, js, css, wasm]) expect(url.search).toBe('');
  return { css, js, wasm };
}

function onlyUrl(urls: URL[], matches: (url: URL) => boolean, label: string): URL {
  const matching = urls.filter(matches);
  expect(matching, `expected exactly one ${label} request`).toHaveLength(1);
  return matching[0]!;
}

function singleDistAsset(extension: string): string {
  const matching = DIST_ASSET_NAMES.filter(name => name.endsWith(extension));
  if (matching.length !== 1) {
    throw new Error(`Expected exactly one ${extension} file in dist/assets, found ${matching.length}.`);
  }
  return matching[0]!;
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

test('keeps labels, geometry, and scaling visible in real SVG output', async ({ page }) => {
  const expectPrivateRequests = monitorPrivacy(page);
  await page.goto('./');

  const previewSvg = page.locator('[data-preview] svg');
  await page.locator('[data-diagram-item]').nth(1).click();
  await expect(previewSvg).toBeVisible();
  await expect(previewSvg.locator('.node text')).toHaveCount(4);
  await expect(previewSvg.locator('.node text')).toHaveText(['Document', 'List', 'Editor', 'WASM']);

  await page.getByRole('tab', { name: '当前图表' }).click();
  const editor = page.getByRole('textbox', { name: '当前图表' });
  await editor.fill('flowchart LR\n  A[Start] --> B((Circle))');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  const circleGeometry = await previewSvg.evaluate(svg => {
    const circle = svg.querySelector('#node-B circle');
    const arrow = svg.querySelector('.edge polygon');
    if (!circle || !arrow) throw new Error('Expected the circle node and its arrowhead.');
    const [, , tipX, tipY] = arrow.getAttribute('points')!.trim().split(/[\s,]+/).map(Number);
    return {
      centerX: Number(circle.getAttribute('cx')),
      centerY: Number(circle.getAttribute('cy')),
      radius: Number(circle.getAttribute('r')),
      tipX,
      tipY,
    };
  });
  expect(circleGeometry.tipX).toBeCloseTo(circleGeometry.centerX - circleGeometry.radius, 6);
  expect(circleGeometry.tipY).toBeCloseTo(circleGeometry.centerY, 6);

  const longLabel = 'A long label that must grow the upstream layout viewport instead of escaping past the SVG boundary';
  await editor.fill(`flowchart TD\n  A[${longLabel}]`);
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  const longLabelBounds = await previewSvg.evaluate(svg => {
    const root = svg as SVGSVGElement;
    const text = root.querySelector('#node-A text') as SVGGraphicsElement | null;
    if (!text) throw new Error('Expected the long-label node text.');
    const textBox = text.getBBox();
    const { width, height } = root.viewBox.baseVal;
    return {
      textBox: { x: textBox.x, y: textBox.y, width: textBox.width, height: textBox.height },
      width,
      height,
    };
  });
  expect(longLabelBounds.textBox.x).toBeGreaterThanOrEqual(-0.01);
  expect(longLabelBounds.textBox.y).toBeGreaterThanOrEqual(-0.01);
  expect(longLabelBounds.textBox.x + longLabelBounds.textBox.width).toBeLessThanOrEqual(longLabelBounds.width + 0.01);
  expect(longLabelBounds.textBox.y + longLabelBounds.textBox.height).toBeLessThanOrEqual(longLabelBounds.height + 0.01);

  const longEdgeLabel = 'wide edge label '.repeat(20);
  await editor.fill(`flowchart TD\n  A -->|${longEdgeLabel}| B`);
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  const longEdgeLabelBounds = await previewSvg.evaluate(svg => {
    const root = svg as SVGSVGElement;
    const text = root.querySelector('.edge text') as SVGGraphicsElement | null;
    const background = root.querySelector('.edge rect') as SVGGraphicsElement | null;
    if (!text || !background) throw new Error('Expected the long edge-label text and background.');
    const textBox = text.getBBox();
    const backgroundBox = background.getBBox();
    const { width, height } = root.viewBox.baseVal;
    return {
      textBox: { x: textBox.x, y: textBox.y, width: textBox.width, height: textBox.height },
      backgroundBox: { x: backgroundBox.x, y: backgroundBox.y, width: backgroundBox.width, height: backgroundBox.height },
      width,
      height,
    };
  });
  for (const bounds of [longEdgeLabelBounds.textBox, longEdgeLabelBounds.backgroundBox]) {
    expect(bounds.x).toBeGreaterThanOrEqual(-0.01);
    expect(bounds.y).toBeGreaterThanOrEqual(-0.01);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(longEdgeLabelBounds.width + 0.01);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(longEdgeLabelBounds.height + 0.01);
  }

  await editor.fill(`flowchart TD\n  A[${'W'.repeat(5_000)}]`);
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  const extremeNode = await previewSvg.evaluate(svg => {
    const root = svg as SVGSVGElement;
    const text = root.querySelector('#node-A text');
    const title = root.querySelector('#node-A title');
    const { width, height } = root.viewBox.baseVal;
    return { width, height, renderedText: text?.textContent, fullLabelLength: title?.textContent?.length };
  });
  expect(extremeNode.width).toBeLessThanOrEqual(1_200);
  expect(extremeNode.height).toBeLessThanOrEqual(1_200);
  expect(extremeNode.renderedText).toContain('…');
  expect(extremeNode.fullLabelLength).toBe(5_000);

  await editor.fill(TALL_CHAIN);
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await expect(previewSvg.locator('.node')).toHaveCount(40);
  await expect(previewSvg.locator('.edge')).toHaveCount(39);
  const tallDiagram = await previewSvg.evaluate(svg => {
    const root = svg as SVGSVGElement;
    const viewBox = root.viewBox.baseVal;
    const rendered = root.getBoundingClientRect();
    const preview = root.closest('.preview-canvas');
    const text = root.querySelector('#node-Node20 text') as SVGGraphicsElement | null;
    if (!preview || !text) throw new Error('Expected the tall diagram preview and a node label.');
    return {
      scaleX: rendered.width / viewBox.width,
      scaleY: rendered.height / viewBox.height,
      textHeight: text.getBoundingClientRect().height,
      scrollsVertically: preview.scrollHeight > preview.clientHeight,
    };
  });
  expect(Math.abs(tallDiagram.scaleX - tallDiagram.scaleY)).toBeLessThan(0.01);
  expect(tallDiagram.textHeight).toBeGreaterThanOrEqual(10);
  expect(tallDiagram.scrollsVertically).toBe(true);
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

test('reports an invalid flowchart without replacing the last successful SVG', async ({ page }) => {
  const expectPrivateRequests = monitorPrivacy(page);

  await page.goto('./');
  const previewSvg = page.locator('[data-preview] svg');
  await expect(previewSvg).toBeVisible();
  const successfulMarkup = await previewSvg.evaluate(svg => svg.outerHTML);
  await page.getByRole('tab', { name: '当前图表' }).click();
  await page.getByLabel('当前图表').fill('flowchart TD\n  Broken -->');

  await expect(page.locator('[data-preview-status]')).toHaveText('预览未更新');
  await expect(page.locator('[data-diagnostics]')).toContainText('parse_error');
  expect(await previewSvg.evaluate(svg => svg.outerHTML)).toBe(successfulMarkup);
  await expect(page.getByRole('button', { name: '下载 SVG' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '下载 PNG' })).toBeDisabled();
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
  expect(rootAssets.js.pathname).toBe(`/assets/${DIST_JS_ASSET}`);
  expect(rootAssets.css.pathname).toBe(`/assets/${DIST_CSS_ASSET}`);
  expect(rootAssets.wasm.pathname).toBe('/xmermaid_wasm_bg.wasm');

  const subpathAssets = await loadDeployment(page, '/xmermaid-live/');
  expect(subpathAssets.js.pathname).toBe(`/xmermaid-live/assets/${DIST_JS_ASSET}`);
  expect(subpathAssets.css.pathname).toBe(`/xmermaid-live/assets/${DIST_CSS_ASSET}`);
  expect(subpathAssets.wasm.pathname).toBe('/xmermaid-live/xmermaid_wasm_bg.wasm');
  expectPrivateRequests();
});
