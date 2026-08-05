import { expect, test, type Download, type Locator, type Page } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { getSupportMatrix } from '@evangwt/xmermaid';
import { encodeShareState } from '@evangwt/xmermaid/editor';

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

const MANY_DIAGRAMS = Array.from({ length: 40 }, (_, index) => `\`\`\`mermaid
flowchart TD
  Diagram${index + 1}[Diagram ${index + 1}] --> End${index + 1}[End]
\`\`\``).join('\n\n');

const TALL_CHAIN = `flowchart TD\n${Array.from(
  { length: 40 },
  (_, index) => `  Node${index + 1}[Node ${index + 1}]${index === 39 ? '' : ` --> Node${index + 2}`}`,
).join('\n')}`;

const DEFAULT_DIAGRAM_TYPES = getSupportMatrix().entries
  .filter(entry => entry.status !== 'planned')
  .map(entry => entry.diagramType)
  .sort();

const USER_REPORTED_FLOWCHART_DOCUMENT = `# xmermaid live

\`\`\`mermaid
flowchart TD
    A[Christmas] -->|Get money| B(Go shopping)
    B --> C{Let me think}
    C -->|One| D[Laptop]
    C -->|Two| E[iPhone]
    C -->|Three| F[fa:fa-car Car]
\`\`\`

\`\`\`mermaid
flowchart LR
  Document --> List
  List --> Editor
  Editor --> WASM
\`\`\`
`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('xmermaid-live.locale.v1', 'zh-CN'));
});

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

async function readEditor(locator: Locator): Promise<string> {
  return locator.evaluate(element => (element as HTMLElement).innerText.replace(/\n{3,}/g, '\n\n').trimEnd());
}

async function expectEditorValue(locator: Locator, expected: string | RegExp): Promise<void> {
  if (typeof expected === 'string') {
    await expect.poll(() => readEditor(locator)).toBe(expected.replace(/\n{3,}/g, '\n\n').trimEnd());
    return;
  }
  await expect.poll(() => readEditor(locator)).toMatch(expected);
}

async function expectFilledArrowContinuity(page: Page): Promise<void> {
  const result = await page.locator('[data-preview] svg').evaluate(async svg => {
    const path = svg.querySelector<SVGPathElement>('.edge path');
    const polygon = svg.querySelector<SVGPolygonElement>('.edge polygon');
    if (!path || !polygon) throw new Error('Expected a filled-arrow edge.');
    const pathEnd = path.getPointAtLength(path.getTotalLength());
    const coordinates = polygon.getAttribute('points')?.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
    if (!coordinates || coordinates.length < 6) throw new Error('Expected triangle coordinates.');
    const arrowBase = {
      x: (coordinates[0]! + coordinates[4]!) / 2,
      y: (coordinates[1]! + coordinates[5]!) / 2,
    };
    const geometricGap = Math.hypot(pathEnd.x - arrowBase.x, pathEnd.y - arrowBase.y);

    const serialized = new XMLSerializer().serializeToString(svg);
    const url = URL.createObjectURL(new Blob([serialized], { type: 'image/svg+xml' }));
    const image = new Image();
    image.src = url;
    await image.decode();
    const viewBox = (svg as SVGSVGElement).viewBox.baseVal;
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewBox.width * scale);
    canvas.height = Math.ceil(viewBox.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Expected a 2D canvas context.');
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, viewBox.width, viewBox.height);
    URL.revokeObjectURL(url);

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixel = (x: number, y: number): number[] => {
      const px = Math.max(0, Math.min(canvas.width - 1, Math.round(x * scale)));
      const py = Math.max(0, Math.min(canvas.height - 1, Math.round(y * scale)));
      const offset = (py * canvas.width + px) * 4;
      return Array.from(pixels.data.slice(offset, offset + 4));
    };
    const background = pixel(1, 1);
    const isBackground = (sample: number[]): boolean =>
      sample.every((channel, index) => Math.abs(channel - background[index]!) <= 4);
    const distance = Math.max(geometricGap, .5);
    let backgroundOnlySamples = 0;
    for (let travelled = 0; travelled <= distance; travelled += .5) {
      const ratio = travelled / distance;
      const x = pathEnd.x + (arrowBase.x - pathEnd.x) * ratio;
      const y = pathEnd.y + (arrowBase.y - pathEnd.y) * ratio;
      const neighborhood: number[][] = [];
      for (const dx of [-.5, 0, .5]) {
        for (const dy of [-.5, 0, .5]) neighborhood.push(pixel(x + dx, y + dy));
      }
      if (neighborhood.every(isBackground)) backgroundOnlySamples += 1;
    }
    return { geometricGap, backgroundOnlySamples };
  });

  expect(result.geometricGap).toBeLessThanOrEqual(.76);
  expect(result.backgroundOnlySamples).toBe(0);
}

async function expectTerminalTangentsMatchFilledArrows(page: Page): Promise<Array<{ angle: number; path: string }>> {
  const edges = await page.locator('[data-preview] svg').evaluate(svg => Array.from(svg.querySelectorAll<SVGGElement>('.edge')).map(edge => {
    const path = edge.querySelector<SVGPathElement>('path');
    const polygon = edge.querySelector<SVGPolygonElement>('polygon');
    if (!path || !polygon) throw new Error('Expected every tested edge to have a path and filled arrow.');

    const length = path.getTotalLength();
    const end = path.getPointAtLength(length);
    const previous = path.getPointAtLength(Math.max(0, length - Math.min(2, length / 4)));
    const tangent = { x: end.x - previous.x, y: end.y - previous.y };
    const coordinates = polygon.getAttribute('points')?.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
    if (!coordinates || coordinates.length < 6) throw new Error('Expected filled arrow triangle coordinates.');
    const base = {
      x: (coordinates[0]! + coordinates[4]!) / 2,
      y: (coordinates[1]! + coordinates[5]!) / 2,
    };
    const tip = { x: coordinates[2]!, y: coordinates[3]! };
    const arrow = { x: tip.x - base.x, y: tip.y - base.y };
    const tangentLength = Math.hypot(tangent.x, tangent.y);
    const arrowLength = Math.hypot(arrow.x, arrow.y);
    if (!tangentLength || !arrowLength) throw new Error('Expected non-zero path tangent and arrow vector.');

    return {
      angle: Math.atan2(tangent.y, tangent.x),
      alignment: (tangent.x * arrow.x + tangent.y * arrow.y) / (tangentLength * arrowLength),
      attachment: Math.hypot(end.x - base.x, end.y - base.y),
      path: path.getAttribute('d') ?? '',
    };
  }));

  expect(edges.length).toBeGreaterThan(0);
  for (const edge of edges) {
    expect(edge.attachment).toBeLessThanOrEqual(.76);
    expect(edge.alignment).toBeGreaterThan(.985);
  }
  return edges.map(({ angle, path }) => ({ angle, path }));
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

interface ViewportRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface WorkspaceGeometry {
  viewport: { width: number; height: number };
  topbar: ViewportRect;
  workspace: ViewportRect;
  activePanel: ViewportRect;
  diagnostics: ViewportRect | null;
  navigation: ViewportRect | null;
}

async function expectResponsiveGeometry(page: Page): Promise<void> {
  const geometry = await page.locator('.app-shell').evaluate(shell => {
    const rect = (element: Element): ViewportRect => {
      const { top, bottom, left, right } = element.getBoundingClientRect();
      return { top, bottom, left, right };
    };
    const visible = (element: Element | null): element is HTMLElement => {
      if (!element) return false;
      return getComputedStyle(element).display !== 'none';
    };
    const workspace = shell.querySelector<HTMLElement>('.workspace')!;
    const compact = window.matchMedia('(max-width: 1024px)').matches;
    const activePanel = compact
      ? shell.querySelector<HTMLElement>(`[data-panel="${shell.dataset.mobilePanel}"]`)!
      : workspace;
    const diagnostics = shell.querySelector<HTMLElement>('[data-diagnostics]');
    const navigation = shell.querySelector<HTMLElement>('[data-mobile-navigation]');

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      topbar: rect(shell.querySelector('.topbar')!),
      workspace: rect(workspace),
      activePanel: rect(activePanel),
      diagnostics: visible(diagnostics) ? rect(diagnostics) : null,
      navigation: visible(navigation) ? rect(navigation) : null,
    };
  });

  const withinViewport = (box: ViewportRect) => {
    expect(box.top).toBeGreaterThanOrEqual(-1);
    expect(box.left).toBeGreaterThanOrEqual(-1);
    expect(box.bottom).toBeLessThanOrEqual(geometry.viewport.height + 1);
    expect(box.right).toBeLessThanOrEqual(geometry.viewport.width + 1);
  };

  withinViewport(geometry.topbar);
  withinViewport(geometry.workspace);
  withinViewport(geometry.activePanel);
  expect(geometry.workspace.top).toBeGreaterThanOrEqual(geometry.topbar.bottom - 1);

  if (geometry.navigation) {
    withinViewport(geometry.navigation);
    expect(geometry.workspace.bottom).toBeLessThanOrEqual(geometry.navigation.top + 1);
  }
  if (geometry.diagnostics) {
    withinViewport(geometry.diagnostics);
    if (geometry.navigation) {
      expect(geometry.diagnostics.bottom).toBeLessThanOrEqual(geometry.navigation.top + 1);
    } else {
      expect(geometry.workspace.bottom).toBeLessThanOrEqual(geometry.diagnostics.top + 1);
    }
  }
}

test('loads, switches, and persists the interface locale without losing the document', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('i18n-default-tested') === '1') return;
    localStorage.removeItem('xmermaid-live.locale.v1');
    Object.defineProperty(navigator, 'language', { configurable: true, value: 'zh-CN' });
    sessionStorage.setItem('i18n-default-tested', '1');
  });
  await page.goto('/');

  const documentInput = page.getByRole('textbox', { name: 'Full document' });
  await expect(documentInput).toBeVisible();
  const sourceBeforeSwitch = await readEditor(documentInput);
  await expect(page.locator('[data-locale-select]')).toHaveValue('en');

  await page.locator('[data-locale-select]').selectOption('zh-CN');
  await expect(page.getByRole('textbox', { name: '完整文本' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expectEditorValue(page.getByRole('textbox', { name: '完整文本' }), sourceBeforeSwitch);

  await page.reload();
  await expect(page.locator('[data-locale-select]')).toHaveValue('zh-CN');
  await expect(page.getByRole('textbox', { name: '完整文本' })).toBeVisible();
});

test('renders every built-in default example from a clean workspace', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('./');

  const items = page.locator('[data-diagram-item]');
  await expect(items).toHaveCount(DEFAULT_DIAGRAM_TYPES.length + 1);
  expect((await items.evaluateAll(buttons => [...new Set(buttons.map(button => button.dataset.diagramType))].sort()))).toEqual(DEFAULT_DIAGRAM_TYPES);

  const preview = page.locator('[data-preview] svg');
  await expect(preview).toBeVisible();
  await expect(page.locator('[data-preview-status]')).toHaveText('Updated');

  for (let index = 1; index <= DEFAULT_DIAGRAM_TYPES.length; index += 1) {
    const previousSvg = await preview.evaluate(svg => svg.outerHTML);
    await items.nth(index).click();
    await expect(items.nth(index)).toHaveAttribute('aria-current', 'true');
    await expect.poll(() => preview.evaluate(svg => svg.outerHTML)).not.toBe(previousSvg);
    await expect(page.locator('[data-preview-status]')).toHaveText('Updated');
  }
});

test('keeps the Ishikawa sample inside its SVG viewBox and gives every preview a diagram-level name', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('xmermaid-live.workspace.v2'));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('./');

  const ishikawa = page.locator('[data-diagram-item][data-diagram-type="ishikawa"]');
  await ishikawa.click();
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');

  const geometry = await page.locator('[data-preview] svg').evaluate(svg => {
    const viewBox = (svg as SVGSVGElement).viewBox.baseVal;
    const bounds = (svg as SVGGraphicsElement).getBBox();
    return {
      ariaLabel: svg.getAttribute('aria-label'),
      role: svg.getAttribute('role'),
      bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      viewBox: { x: viewBox.x, y: viewBox.y, width: viewBox.width, height: viewBox.height },
    };
  });

  expect(geometry.role).toBe('img');
  expect(geometry.ariaLabel).toContain('ishikawa');
  expect(geometry.bounds.x).toBeGreaterThanOrEqual(geometry.viewBox.x);
  expect(geometry.bounds.y).toBeGreaterThanOrEqual(geometry.viewBox.y);
  expect(geometry.bounds.x + geometry.bounds.width).toBeLessThanOrEqual(geometry.viewBox.x + geometry.viewBox.width);
  expect(geometry.bounds.y + geometry.bounds.height).toBeLessThanOrEqual(geometry.viewBox.y + geometry.viewBox.height);
});

test('keeps the compact desktop workspace visible and preserves editor focus through preview navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('./');

  for (const panel of ['list', 'edit', 'preview']) {
    await expect(page.locator(`[data-panel="${panel}"]`)).toBeVisible();
  }
  await expect(page.locator('[data-document-editor] .cm-content')).toBeVisible();
  await expect(page.locator('[data-preview-zoom-value]')).toHaveText(/%$/);

  const editor = page.getByRole('textbox', { name: '完整文本' });
  const previous = page.getByRole('button', { name: '上一张图表' });
  const next = page.getByRole('button', { name: '下一张图表' });
  await editor.focus();
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  await next.click();
  await expect(page.locator('[data-preview-position]')).toHaveText(/2 \/ \d+/);
  await expect(editor).toBeFocused();

  const zoomBefore = await page.locator('[data-preview-zoom-value]').innerText();
  await page.getByRole('button', { name: '缩小预览' }).click();
  await expect(page.locator('[data-preview-zoom-value]')).not.toHaveText(zoomBefore);

  await page.addStyleTag({ content: ':root { --test-fullscreen: 1; }' });
  await page.evaluate(() => {
    HTMLElement.prototype.requestFullscreen = () => Promise.reject(new Error('Fullscreen unavailable'));
  });
  const fullscreen = page.getByRole('button', { name: '全屏预览' });
  const maximize = page.getByRole('button', { name: '最大化预览' });
  expect(await fullscreen.locator('svg').innerHTML()).not.toBe(await maximize.locator('svg').innerHTML());
  await fullscreen.click();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-preview-maximized', 'true');
  await expect(page.locator('[data-preview-stage]')).toHaveAttribute('data-viewport-mode', 'fit');
  await page.getByRole('button', { name: '退出最大化预览' }).click();
  await expect(page.locator('.app-shell')).not.toHaveAttribute('data-preview-maximized', 'true');
});

test('keeps project repositories reachable from the compact More menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.locator('[data-mobile-more] > summary').click();

  const menu = page.locator('[data-project-menu="mobile"]');
  await expect(menu).toBeVisible();
  await expect(menu.locator('a')).toHaveCount(2);
  await expect(menu.locator('a').nth(0)).toHaveAttribute('href', 'https://github.com/evangwt/xmermaid');
  await expect(menu.locator('a').nth(1)).toHaveAttribute('href', 'https://github.com/evangwt/xmermaid-live');
});

test('focuses CodeMirror, scopes the primary select-all shortcut, and colors Mermaid tokens', async ({ page }) => {
  await page.goto('./');

  const editor = page.locator('[data-document-editor] .cm-content');
  await editor.click({ position: { x: 80, y: 24 } });
  await expect(editor).toBeFocused();

  await page.keyboard.press('ControlOrMeta+A');
  const selection = await page.evaluate(() => getSelection()?.toString() ?? '');
  expect(selection.replace(/\n{3,}/g, '\n\n').trimEnd()).toBe(
    (await editor.innerText()).replace(/\n{3,}/g, '\n\n').trimEnd(),
  );

  const colors = await editor.locator('span').evaluateAll(spans => [
    ...new Set(spans.map(span => getComputedStyle(span).color)),
  ]);
  expect(colors.length).toBeGreaterThan(1);
});

test('extracts, switches, edits, shares, and exports real WASM diagrams', async ({ page }) => {
  const expectPrivateRequests = monitorPrivacy(page);

  await page.goto('./');
  await page.getByRole('tab', { name: '完整文本' }).click();
  await page.getByRole('textbox', { name: '完整文本' }).fill(PASTED_DOCUMENT);

  await expect(page.locator('[data-diagram-item]')).toHaveCount(2);
  const previewSvg = page.locator('[data-preview] svg');
  await expect(previewSvg).toContainText('First diagram');
  const firstMarkup = await previewSvg.evaluate(svg => svg.outerHTML);

  await page.locator('[data-diagram-item]').nth(1).click();
  await expectEditorValue(page.getByRole('textbox', { name: '当前图表' }), /Second diagram/);
  await expect(previewSvg).toContainText('Second diagram');
  const secondMarkup = await previewSvg.evaluate(svg => svg.outerHTML);
  expect(secondMarkup).not.toBe(firstMarkup);

  await page.getByRole('textbox', { name: '当前图表' }).fill('flowchart LR\n  Browser[Browser] --> WASM[WASM]');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await page.getByRole('tab', { name: '完整文本' }).click();
  await expectEditorValue(page.getByRole('textbox', { name: '完整文本' }), /Browser\[Browser\] --> WASM\[WASM\]/);
  await expectEditorValue(page.getByRole('textbox', { name: '完整文本' }), /First\[First diagram\]/);

  await page.getByRole('button', { name: '分享' }).click();
  await expect(page).toHaveURL(/#xm=/);
  await page.reload();
  await page.getByRole('tab', { name: '当前图表' }).click();
  await expectEditorValue(page.getByRole('textbox', { name: '当前图表' }), /Browser\[Browser\]/);
  await page.getByRole('tab', { name: '完整文本' }).click();
  await expectEditorValue(page.getByRole('textbox', { name: '完整文本' }), PASTED_DOCUMENT.replace(
    'flowchart LR\n  Second[Second diagram] --> Shared[Preview]',
    'flowchart LR\n  Browser[Browser] --> WASM[WASM]',
  ));

  const svgButton = page.getByRole('button', { name: '下载 SVG' });
  await page.getByText('导出', { exact: true }).click();
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

test('switches paired themes, preserves custom style, and restores it locally', async ({ page }) => {
  await page.goto('./');
  const shell = page.locator('.app-shell');
  await expect(shell).toHaveAttribute('data-workspace-theme', 'dark');
  await expect(page.locator('[data-preview] svg')).toHaveCSS('background-color', 'rgb(9, 10, 12)');

  await page.getByRole('button', { name: '图表样式' }).click();
  await page.getByRole('slider', { name: '箭头大小' }).fill('18');
  await page.getByRole('button', { name: '关闭图表样式' }).click();
  await page.getByRole('button', { name: '浅色' }).click();
  await expect(shell).toHaveAttribute('data-workspace-theme', 'light');
  await expect(page.locator('[data-preview] svg')).toHaveCSS('background-color', 'rgb(245, 246, 247)');
  await page.reload();

  await expect(shell).toHaveAttribute('data-workspace-theme', 'light');
  await page.getByRole('button', { name: /图表样式/ }).click();
  await expect(page.getByRole('slider', { name: '箭头大小' })).toHaveValue('18');
  await page.getByRole('button', { name: '重置图表样式' }).click();
  await expect(page.getByRole('slider', { name: '箭头大小' })).toHaveValue('10');
});

test('opens the desktop style inspector without blocking editor focus', async ({ page }) => {
  await page.goto('./');
  const opener = page.getByRole('button', { name: '图表样式' });
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-inspector-open', 'true');
  await page.getByRole('textbox', { name: '完整文本' }).focus();
  await expect(page.getByRole('textbox', { name: '完整文本' })).toBeFocused();
});

test('exports the currently rendered custom colors', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '图表样式' }).click();
  await page.getByLabel('箭头颜色').fill('#ff3366');
  await page.getByRole('button', { name: '关闭图表样式' }).click();
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await page.getByText('导出', { exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载 SVG' }).click();
  const markup = (await downloadBytes(await downloadPromise)).toString('utf8');
  expect(markup).toContain('#ff3366');
});

test('keeps filled arrows connected across themes and custom sizes', async ({ page }) => {
  const expectPrivateRequests = monitorPrivacy(page);
  await page.goto('./');
  await page.getByRole('tab', { name: '当前图表' }).click();
  await page.getByRole('textbox', { name: '当前图表' }).fill('flowchart LR\n  Start[Start] --> Finish[Finish]');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await expectFilledArrowContinuity(page);

  await page.getByRole('button', { name: '浅色' }).click();
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await expectFilledArrowContinuity(page);

  await page.getByRole('button', { name: '图表样式' }).click();
  await page.getByRole('slider', { name: '箭头大小' }).fill('24');
  await page.getByRole('button', { name: '关闭图表样式' }).click();
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await expectFilledArrowContinuity(page);
  expectPrivateRequests();
});

test('@cross-browser keeps folded and bezier back-edge arrows tangent to their terminal route', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('tab', { name: '当前图表' }).click();
  await page.getByRole('textbox', { name: '当前图表' }).fill(`flowchart TD
  Start[Start] --> Middle[Middle]
  Middle --> Finish[Finish]
  Finish --> Middle`);
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');

  await page.getByRole('button', { name: '图表样式' }).click();
  await page.getByRole('button', { name: '折线' }).click();
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  const folded = await expectTerminalTangentsMatchFilledArrows(page);
  expect(folded.every(({ angle }) => Math.abs(Math.cos(angle)) < .15)).toBe(true);

  await page.getByRole('button', { name: '贝塞尔' }).click();
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  const bezier = await expectTerminalTangentsMatchFilledArrows(page);
  expect(bezier.every(({ angle }) => Math.abs(Math.cos(angle)) < .15)).toBe(true);
  expect(bezier.some(({ path }) => path.includes('C'))).toBe(true);
});

test('@cross-browser keeps folded and bezier horizontal back-edge arrows tangent to their terminal route', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('tab', { name: '当前图表' }).click();
  await page.getByRole('textbox', { name: '当前图表' }).fill(`flowchart LR
  Start[Start] --> Middle[Middle]
  Middle --> Finish[Finish]
  Finish --> Middle`);
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');

  await page.getByRole('button', { name: '图表样式' }).click();
  await page.getByRole('button', { name: '折线' }).click();
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  const folded = await expectTerminalTangentsMatchFilledArrows(page);
  expect(folded.every(({ angle }) => Math.abs(Math.sin(angle)) < .15)).toBe(true);

  await page.getByRole('button', { name: '贝塞尔' }).click();
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  const bezier = await expectTerminalTangentsMatchFilledArrows(page);
  expect(bezier.every(({ angle }) => Math.abs(Math.sin(angle)) < .15)).toBe(true);
  expect(bezier.some(({ path }) => path.includes('C'))).toBe(true);
});

test('@cross-browser keeps every multi-branch folded edge tangent to its arrowhead', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('tab', { name: '当前图表' }).click();
  await page.getByRole('textbox', { name: '当前图表' }).fill(`flowchart TD
  Start[Start] --> Validate[Validate]
  Start --> Config[Load config]
  Validate --> Service[Service]
  Config --> Service
  Service --> Success[Success]
  Service --> Retry[Retry]
  Retry --> Validate
  Retry --> Fallback[Fallback]
  Fallback --> Service
  Fallback --> Failure[Failure]`);
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');

  await page.getByRole('button', { name: '图表样式' }).click();
  await page.getByRole('button', { name: '折线' }).click();
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');

  await expectTerminalTangentsMatchFilledArrows(page);
});

test('@cross-browser routes the reported TD fan-out and preserves the following LR diagram', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill(USER_REPORTED_FLOWCHART_DOCUMENT);
  await expect(page.locator('[data-diagram-item]')).toHaveCount(2);
  await expect(page.locator('[data-preview] svg')).toContainText('Let me think');

  await page.getByRole('button', { name: '图表样式' }).click();
  await page.getByRole('button', { name: '折线' }).click();
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');

  const fanOut = await page.locator('[data-preview] svg').evaluate(svg => {
    const commands = (path: string) => {
      const points: Array<{ x: number; y: number }> = [];
      let x = 0;
      let y = 0;
      for (const match of path.matchAll(/([MLHV])\s+(-?\d+(?:\.\d+)?)(?:\s+(-?\d+(?:\.\d+)?))?/g)) {
        const command = match[1]!;
        const first = Number(match[2]);
        const second = match[3] === undefined ? undefined : Number(match[3]);
        if (command === 'H') x = first;
        else if (command === 'V') y = first;
        else if (second !== undefined) {
          x = first;
          y = second;
        }
        points.push({ x, y });
      }
      return points;
    };

    return Array.from(svg.querySelectorAll<SVGGElement>('.edge')).flatMap(edge => {
      const label = edge.querySelector('title')?.textContent;
      if (!['One', 'Two', 'Three'].includes(label ?? '')) return [];
      const path = edge.querySelector('path')?.getAttribute('d') ?? '';
      const text = edge.querySelector('text');
      const arrow = edge.querySelector('polygon')?.getAttribute('points')?.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      return [{
        label,
        points: commands(path),
        labelPosition: { x: Number(text?.getAttribute('x')), y: Number(text?.getAttribute('y')) },
        arrow: { baseX: (arrow[0]! + arrow[4]!) / 2, baseY: (arrow[1]! + arrow[5]!) / 2, tipX: arrow[2]!, tipY: arrow[3]! },
      }];
    });
  });

  expect(fanOut).toHaveLength(3);
  const expectedFanOut = new Map([
    ['One', { targetX: 100, labelX: 212.5 }],
    ['Two', { targetX: 280, labelX: 302.5 }],
    ['Three', { targetX: 505, labelX: 415 }],
  ]);
  for (const branch of fanOut) {
    const expected = expectedFanOut.get(branch.label!);
    expect(expected).toBeDefined();
    expect(branch.points[0]).toEqual({ x: 325, y: 280 });
    expect(branch.points[1]).toEqual({ x: 325, y: 310 });
    expect(branch.points[2]).toEqual({ x: expected!.targetX, y: 310 });
    expect(branch.points.at(-1)?.x).toBe(expected!.targetX);
    expect(branch.labelPosition).toEqual({ x: expected!.labelX, y: 310 });
    expect(branch.arrow.tipX).toBe(expected!.targetX);
    expect(branch.arrow.tipY).toBeGreaterThan(branch.arrow.baseY);
  }

  await page.locator('[data-diagram-item]').nth(1).click();
  await expect(page.locator('[data-preview] svg')).toContainText('WASM');
  const lrPaths = await page.locator('[data-preview] svg').evaluate(svg => Array.from(svg.querySelectorAll<SVGPathElement>('.edge path'))
    .map(path => path.getAttribute('d') ?? ''));
  expect(lrPaths).toHaveLength(3);
  expect(lrPaths.every(path => /^M [\d.]+ 60 H [\d.]+$/.test(path))).toBe(true);
});

test('@cross-browser routes the reported TD fan-out through vertical bezier ports', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill(USER_REPORTED_FLOWCHART_DOCUMENT);
  await page.getByRole('button', { name: '图表样式' }).click();
  await page.getByRole('button', { name: '贝塞尔' }).click();
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');

  const fanOut = await page.locator('[data-preview] svg').evaluate(svg => Array.from(svg.querySelectorAll<SVGGElement>('.edge')).flatMap(edge => {
    const label = edge.querySelector('title')?.textContent;
    if (!['One', 'Two', 'Three'].includes(label ?? '')) return [];
    const path = edge.querySelector<SVGPathElement>('path');
    const arrow = edge.querySelector<SVGPolygonElement>('polygon');
    if (!path || !arrow) throw new Error('Expected a filled arrow edge.');
    const length = path.getTotalLength();
    const start = path.getPointAtLength(0);
    const end = path.getPointAtLength(length);
    const pathCoordinates = path.getAttribute('d')?.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
    if (!pathCoordinates || pathCoordinates.length < 4) throw new Error('Expected cubic bezier coordinates.');
    const terminalControl = {
      x: pathCoordinates.at(-4)!,
      y: pathCoordinates.at(-3)!,
    };
    const arrowCoordinates = arrow.getAttribute('points')?.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
    if (!arrowCoordinates || arrowCoordinates.length < 6) throw new Error('Expected triangle coordinates.');
    return [{
      label,
      start: { x: start.x, y: start.y },
      end: { x: end.x, y: end.y },
      terminalControl,
      arrow: {
        base: { x: (arrowCoordinates[0]! + arrowCoordinates[4]!) / 2, y: (arrowCoordinates[1]! + arrowCoordinates[5]!) / 2 },
        tip: { x: arrowCoordinates[2]!, y: arrowCoordinates[3]! },
      },
    }];
  }));

  expect(fanOut).toHaveLength(3);
  const targetXs = new Map([['One', 100], ['Two', 280], ['Three', 505]]);
  for (const branch of fanOut) {
    expect(branch.start.x).toBeCloseTo(325, 1);
    expect(branch.start.y).toBeCloseTo(280, 1);
    expect(branch.end.x).toBeCloseTo(targetXs.get(branch.label!)!, 1);
    expect(branch.terminalControl.x).toBeCloseTo(branch.end.x, 1);
    expect(branch.terminalControl.y).toBeLessThan(branch.end.y);
    expect(branch.arrow.tip.x).toBeCloseTo(targetXs.get(branch.label!)!, 1);
    expect(branch.arrow.tip.y).toBeGreaterThan(branch.arrow.base.y);
  }
});

test('runs the core static editing workflow across browsers @cross-browser', async ({ page }) => {
  const expectPrivateRequests = monitorPrivacy(page);

  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill(PASTED_DOCUMENT);
  await expect(page.locator('[data-diagram-item]')).toHaveCount(2);
  await page.locator('[data-diagram-item]').nth(1).click();
  await expect(page.locator('[data-preview] svg')).toContainText('Second diagram');
  await page.getByRole('textbox', { name: '当前图表' }).fill(
    'flowchart LR\n  Browser[Browser] --> Core[Core workflow]',
  );
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await expect(page.locator('[data-preview] svg')).toContainText('Core workflow');
  await page.getByRole('tab', { name: '完整文本' }).click();
  await expectEditorValue(page.getByRole('textbox', { name: '完整文本' }), /Core\[Core workflow\]/);
  expectPrivateRequests();
});

test('keeps labels, geometry, and scaling visible in real SVG output', async ({ page }) => {
  const expectPrivateRequests = monitorPrivacy(page);
  await page.goto('./');

  const previewSvg = page.locator('[data-preview] svg');
  await page.locator('[data-diagram-item]').nth(1).click();
  await expect(previewSvg).toBeVisible();
  await expect(previewSvg.locator('.node text')).toHaveCount(6);
  await expect(previewSvg.locator('.node text')).toHaveText([
    'Document',
    'Parse document',
    'Diagram list',
    'Editor',
    'WASM',
    'SVG preview',
  ]);

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
  expect(circleGeometry.tipX).toBeCloseTo(circleGeometry.centerX - circleGeometry.radius - 2, 6);
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
      viewportMode: preview.querySelector('[data-preview-stage]')?.getAttribute('data-viewport-mode'),
    };
  });
  expect(Math.abs(tallDiagram.scaleX - tallDiagram.scaleY)).toBeLessThan(0.01);
  expect(tallDiagram.textHeight).toBeGreaterThan(0);
  expect(tallDiagram.viewportMode).toBe('fit');
  expectPrivateRequests();
});

test('keeps the last SVG but blocks stale export after a render error', async ({ page }) => {
  const expectPrivateRequests = monitorPrivacy(page);

  await page.goto('./');
  const previewSvg = page.locator('[data-preview] svg');
  await expect(previewSvg).toBeVisible();
  const successfulMarkup = await previewSvg.evaluate(svg => svg.outerHTML);
  await page.getByRole('tab', { name: '当前图表' }).click();
  await page.getByRole('textbox', { name: '当前图表' }).fill('not a diagram');

  await expect(page.locator('[data-preview-status]')).toHaveText('预览未更新');
  await expect(previewSvg).toBeVisible();
  expect(await previewSvg.evaluate(svg => svg.outerHTML)).toBe(successfulMarkup);
  await expect(page.locator('[data-export-svg]')).toBeDisabled();
  await expect(page.locator('[data-export-png]')).toBeDisabled();
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
  await page.getByRole('textbox', { name: '当前图表' }).fill('flowchart TD\n  Broken -->');

  await expect(page.locator('[data-preview-status]')).toHaveText('预览未更新');
  await expect(page.locator('[data-diagnostics]')).toContainText('parse_error');
  expect(await previewSvg.evaluate(svg => svg.outerHTML)).toBe(successfulMarkup);
  await expect(page.locator('[data-export-svg]')).toBeDisabled();
  await expect(page.locator('[data-export-png]')).toBeDisabled();
  expectPrivateRequests();
});

test('@cross-browser renders safe Flowchart class styles through the installed npm package', async ({ page }) => {
  const expectPrivateRequests = monitorPrivacy(page);

  await page.goto('./');
  await page.getByRole('tab', { name: '当前图表' }).click();
  await page.getByRole('textbox', { name: '当前图表' }).fill([
    'flowchart TD',
    '  A[Start] --> B[Finish]',
    '  classDef emphasis fill:#ff0000,stroke:#990000,color:#ffffff',
    '  class A emphasis',
  ].join('\n'));

  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  const node = page.locator('[data-preview] #node-A');
  await expect(node.locator('rect')).toHaveAttribute('fill', '#ff0000');
  await expect(node.locator('rect')).toHaveAttribute('stroke', '#990000');
  await expect(node.locator('text')).toHaveAttribute('fill', '#ffffff');
  await expect(page.locator('[data-export-svg]')).toBeEnabled();
  await expect(page.locator('[data-export-png]')).toBeEnabled();
  expectPrivateRequests();
});

test('@cross-browser reports malformed Flowchart class styles from the installed npm package and blocks export', async ({ page }) => {
  const expectPrivateRequests = monitorPrivacy(page);

  await page.goto('./');
  await page.getByRole('tab', { name: '当前图表' }).click();
  await page.getByRole('textbox', { name: '当前图表' }).fill([
    'flowchart TD',
    '  A[Start]',
    '  classDef emphasis fill:red',
    '  class A emphasis',
  ].join('\n'));

  await expect(page.locator('[data-preview-status]')).toHaveText('预览未更新');
  await expect(page.locator('[data-diagnostics]')).toContainText('classDef statements only support');
  await expect(page.locator('[data-export-svg]')).toBeDisabled();
  await expect(page.locator('[data-export-png]')).toBeDisabled();
  expectPrivateRequests();
});

test('@cross-browser renders declared Sequence participants and actors without an error', async ({ page }) => {
  await page.goto('./');
  const documentInput = page.getByRole('textbox', { name: '完整文本' });
  await documentInput.fill('```mermaid\nsequenceDiagram\n  participant Alice\n  participant Payments as Payment service\n  actor User\n  User->>Payments: Sign in\n  Payments-->>User: Signed in\n```');
  const item = page.locator('[data-diagram-item]');
  await expect(item).toHaveCount(1);
  await expect(item).toHaveAttribute('data-diagram-type', 'sequence');
  await expect(item).toHaveAttribute('data-diagram-status', 'partial');
  await expect(page.locator('[data-capability-recovery]')).toContainText('部分支持');
  await expect(page.getByRole('button', { name: '复制复现源码' })).toBeVisible();
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await expect(page.locator('[data-preview] svg')).toContainText('A');
  await expect(page.locator('[data-preview] svg')).toContainText('Payment service');
  await expect(page.locator('[data-preview] svg')).toContainText('User');
  await expect(page.locator('[data-preview] svg')).toContainText('Signed in');
});

test('@cross-browser renders Sequence activations, notes, and control blocks without an unsupported diagnostic', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\nsequenceDiagram\n  participant Client\n  participant API\n  Client->>+API: Request\n  Note right of API: Validate request\n  alt Accepted\n    API-->>-Client: Response\n  else Rejected\n    API-->>Client: Denied\n  end\n```');

  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await expect(page.locator('[data-diagnostics]')).not.toContainText('unsupported_syntax');
  const preview = page.locator('[data-preview] svg');
  await expect(preview.locator('.sequence-lifeline')).toHaveCount(2);
  await expect(preview.locator('.sequence-activation')).toHaveCount(1);
  await expect(preview.locator('.sequence-note')).toHaveCount(1);
  await expect(preview.locator('.sequence-block')).toHaveCount(1);
  await expect(preview.locator('.sequence-block-divider')).toHaveCount(1);
});

test('@cross-browser renders document-style sequence autonumber, RGB rect, and cross termination', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\nsequenceDiagram\n  autonumber\n  participant EventBus\n  participant CraneJob\n  rect rgb(255, 235, 235)\n    EventBus--xCraneJob: 无订阅者时丢弃 Stop\n  end\n```');

  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await expect(page.locator('[data-diagnostics]')).not.toContainText('unsupported_syntax');
  await expect(page.locator('[data-diagnostics]')).not.toContainText('parse_error');
  const preview = page.locator('[data-preview] svg');
  await expect(preview.locator('.sequence-message-number')).toHaveText('1');
  await expect(preview.locator('.sequence-rect')).toHaveAttribute('fill', 'rgb(255, 235, 235)');
  await expect(preview.locator('.sequence-message-cross')).toHaveCount(1);
});

test('@cross-browser fits native sequence participants and scoped control blocks to their content', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\nsequenceDiagram\n  participant Client as Crane STK Stack Machine\n  participant API as API\n  participant Store as PostgreSQL Task Repository\n  participant Audit as Audit\n  Client->>Client: Publish a snapshot after every observed device state change\n  par Persist task state independently\n    API->>Store: Persist a command that must remain attributable to its physical task generation\n  and Append audit trail independently\n    API->>Audit: Record a committed result for the same command generation\n  end\n```');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');

  const geometry = await page.locator('[data-preview] svg').evaluate(svg => {
    const box = (element: SVGGraphicsElement) => element.getBBox();
    return {
      viewBoxWidth: (svg as SVGSVGElement).viewBox.baseVal.width,
      participants: [...svg.querySelectorAll<SVGGElement>('.sequence-participant')].map(group => {
        const frame = group.querySelector<SVGGraphicsElement>('rect')!;
        const label = group.querySelector<SVGGraphicsElement>('text')!;
        return { frame: box(frame).width, label: box(label).width };
      }),
      blocks: [...svg.querySelectorAll<SVGGElement>('.sequence-block')].map(group => box(group.querySelector<SVGGraphicsElement>('rect')!).width),
    };
  });

  expect(geometry.participants.every(({ frame, label }) => frame >= label + 18)).toBe(true);
  expect(geometry.blocks[0]).toBeLessThan(geometry.viewBoxWidth - 160);
});

test('styles the capability recovery copy control as a workspace action', async ({ page }) => {
  await page.goto('./');
  const button = page.getByRole('button', { name: '复制复现源码' });
  await expect(button).toBeVisible();
  await expect(button).toHaveCSS('border-radius', '6px');
  const style = await button.evaluate(element => {
    const computed = getComputedStyle(element);
    return { background: computed.backgroundColor, borderRadius: computed.borderRadius, color: computed.color };
  });

  expect(style.background).not.toBe('rgb(239, 239, 239)');
  expect(style.borderRadius).toBe('6px');
  expect(style.color).not.toBe('rgb(0, 0, 0)');
});

test('keeps fitted SVG output vector-first and the canvas visually quiet', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\nsequenceDiagram\n  Alice->>Bob: Inspect\n```');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');

  const presentation = await page.locator('.app-shell').evaluate(shell => {
    const stage = shell.querySelector<HTMLElement>('[data-preview-stage]')!;
    const svg = shell.querySelector<SVGSVGElement>('[data-preview] svg')!;
    const minimap = shell.querySelector<HTMLElement>('[data-preview-minimap]')!;
    return {
      appFontSize: getComputedStyle(shell).fontSize,
      stageWillChange: getComputedStyle(stage).willChange,
      svgShapeRendering: getComputedStyle(svg).shapeRendering,
      svgTextRendering: getComputedStyle(svg).textRendering,
      minimapDisplay: getComputedStyle(minimap).display,
    };
  });

  expect(presentation.appFontSize).toBe('14px');
  expect(presentation.stageWillChange).toBe('auto');
  expect(presentation.svgShapeRendering).toBe('geometricprecision');
  expect(presentation.svgTextRendering).toBe('geometricprecision');
  expect(presentation.minimapDisplay).toBe('none');
});

test('keeps multi-diagram diagnostics visible and identifies their chart', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 768 });
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\nsequenceDiagram\n  Alice->>Bob: Working\n```\n\n```mermaid\nsequenceDiagram\n  Alice->>Bob: Broken\n```');
  await page.getByRole('button', { name: /图表 2 sequence/ }).click();
  await page.getByRole('tab', { name: '当前图表' }).click();
  await page.getByRole('textbox', { name: '当前图表' }).fill('sequenceDiagram\n  Alice->>');

  await expect(page.locator('[data-preview-status]')).toHaveText('预览未更新');
  const diagnostics = page.locator('[data-diagnostics]');
  await expect(diagnostics).toContainText('图表 2');
  await expect(diagnostics).toBeVisible();
  const geometry = await diagnostics.evaluate(node => {
    const box = node.getBoundingClientRect();
    return { bottom: box.bottom, height: box.height, viewportHeight: window.innerHeight, scrollHeight: node.scrollHeight };
  });
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.height + 1);
});

test('@cross-browser renders the partial Entity Relationship subset and keeps its capability boundary visible', async ({ page }) => {
  await page.goto('./');
  const documentInput = page.getByRole('textbox', { name: '完整文本' });
  await documentInput.fill('```mermaid\nerDiagram\n  CUSTOMER ||--o{ ORDER : places\n```');
  const item = page.locator('[data-diagram-item]');
  await expect(item).toHaveCount(1);
  await expect(item).toHaveAttribute('data-diagram-type', 'er');
  await expect(item).toHaveAttribute('data-diagram-status', 'partial');
  await expect(page.locator('[data-capability-recovery]')).toContainText('部分支持');
  await expect(page.getByRole('button', { name: '复制复现源码' })).toBeVisible();
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  const preview = page.locator('[data-preview] svg');
  await expect(preview).toContainText('CUSTOMER');
  await expect(preview).toContainText('ORDER');
  await expect(preview).toContainText('places');
});

test('@cross-browser renders the partial Gantt subset and keeps its capability boundary visible', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\ngantt\n  section Build\n  Compile : 2026-07-28, 2d\n```');
  const item = page.locator('[data-diagram-item]');
  await expect(item).toHaveCount(1);
  await expect(item).toHaveAttribute('data-diagram-type', 'gantt');
  await expect(item).toHaveAttribute('data-diagram-status', 'partial');
  await expect(page.locator('[data-capability-recovery]')).toContainText('部分支持');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  const preview = page.locator('[data-preview] svg');
  await expect(preview).toContainText('Build');
  await expect(preview).toContainText('Compile');
});

test('@cross-browser renders partial Pie slices and keeps its capability boundary visible', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\npie title Deployment\n  "Passed" : 80\n  "Failed" : 20\n```');
  const item = page.locator('[data-diagram-item]');
  await expect(item).toHaveAttribute('data-diagram-type', 'pie');
  await expect(item).toHaveAttribute('data-diagram-status', 'partial');
  await expect(page.locator('[data-capability-recovery]')).toContainText('部分支持');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  const preview = page.locator('[data-preview] svg');
  await expect(preview).toContainText('Passed');
  await expect(preview).toContainText('Failed');
});

test('@cross-browser renders native partial XY chart bars and lines', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\nxychart-beta\n  title "Quarterly revenue"\n  x-axis [Q1, Q2]\n  y-axis "Revenue" 0 --> 100\n  bar [20, 40]\n  line [30, 50]\n```');
  const item = page.locator('[data-diagram-item]');
  const preview = page.locator('[data-preview]');

  await expect(item).toHaveAttribute('data-diagram-type', 'xychart');
  await expect(item).toHaveAttribute('data-diagram-status', 'partial');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await expect(preview.locator('.xychart-axis')).toHaveCount(2);
  await expect(preview.locator('.xychart-bar')).toHaveCount(2);
  await expect(preview.locator('.xychart-line')).toBeVisible();
  await expect(preview.locator('.node')).toHaveCount(0);
});

test('@cross-browser renders native partial Sankey bands and nodes', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\nsankey\nA,B,8\nA,C,4\nB,D,8\nC,D,4\n```');
  const item = page.locator('[data-diagram-item]');
  const preview = page.locator('[data-preview]');

  await expect(item).toHaveAttribute('data-diagram-type', 'sankey');
  await expect(item).toHaveAttribute('data-diagram-status', 'partial');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await expect(preview.locator('.sankey-link')).toHaveCount(4);
  await expect(preview.locator('.sankey-node')).toHaveCount(4);
  await expect(preview.locator('.edge')).toHaveCount(0);
});

test('@cross-browser renders native partial Quadrant Chart cells and points', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\nquadrantChart\n  title Reach and engagement\n  x-axis Low Reach --> High Reach\n  y-axis Low Engagement --> High Engagement\n  quadrant-1 Expand\n  quadrant-2 Promote\n  quadrant-3 Re-evaluate\n  quadrant-4 Improve\n  Campaign A: [0.25, 0.75]\n```');
  const item = page.locator('[data-diagram-item]');
  const preview = page.locator('[data-preview]');

  await expect(item).toHaveAttribute('data-diagram-type', 'quadrant');
  await expect(item).toHaveAttribute('data-diagram-status', 'partial');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await expect(preview.locator('.quadrant-cell')).toHaveCount(4);
  await expect(preview.locator('.quadrant-point')).toHaveCount(1);
  await expect(preview.locator('.node')).toHaveCount(0);
  await expect(preview.locator('.edge')).toHaveCount(0);
});

test('@cross-browser renders partial Architecture Diagram services and relationships', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\narchitecture-beta\n  service db(database)[Database]\n  service api(server)[API]\n  db:R --> L:api\n```');
  const item = page.locator('[data-diagram-item]');
  const preview = page.locator('[data-preview]');

  await expect(item).toHaveAttribute('data-diagram-type', 'architecture');
  await expect(item).toHaveAttribute('data-diagram-status', 'partial');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await expect(preview.locator('.node')).toHaveCount(2);
  await expect(preview.locator('.edge')).toHaveCount(1);
});

test('@cross-browser renders native partial Block Diagram grid cells and relationships', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\nblock-beta\n  columns 3\n  A B C\n  Wide:2 D\n  A --> B\n```');
  const item = page.locator('[data-diagram-item]');
  const preview = page.locator('[data-preview]');

  await expect(item).toHaveAttribute('data-diagram-type', 'block');
  await expect(item).toHaveAttribute('data-diagram-status', 'partial');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await expect(preview.locator('.block-node')).toHaveCount(5);
  await expect(preview.locator('.block-relationship')).toHaveCount(1);
  await expect(preview.locator('.block-relationship polygon')).toHaveCount(1);
});

test('@cross-browser renders native partial Kanban columns and task cards', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\nkanban\n  todo[To do]\n    write[Write documentation]\n  doing[In progress]\n    ship[Ship renderer]\n  done[Done]\n```');
  const item = page.locator('[data-diagram-item]');
  const preview = page.locator('[data-preview]');

  await expect(item).toHaveAttribute('data-diagram-type', 'kanban');
  await expect(item).toHaveAttribute('data-diagram-status', 'partial');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await expect(preview.locator('.kanban-column')).toHaveCount(3);
  await expect(preview.locator('.kanban-header')).toHaveCount(3);
  await expect(preview.locator('.kanban-task')).toHaveCount(2);
});

test('@cross-browser renders native partial Treemap groups and weighted leaves', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\ntreemap-beta\n"Category A"\n    "Item A1": 10\n    "Item A2": 20\n"Category B"\n    "Item B1": 15\n    "Item B2": 25\n```');
  const item = page.locator('[data-diagram-item]');
  const preview = page.locator('[data-preview]');

  await expect(item).toHaveAttribute('data-diagram-type', 'treemap');
  await expect(item).toHaveAttribute('data-diagram-status', 'partial');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await expect(preview.locator('.treemap-group')).toHaveCount(2);
  await expect(preview.locator('.treemap-leaf')).toHaveCount(4);
  await expect(preview.locator('.treemap-leaf-label').first()).toContainText('Item A1');
  await expect(preview.locator('.node')).toHaveCount(0);
});

test('@cross-browser renders native partial Radar axes and curve polygons', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\nradar-beta\n  title Restaurant Comparison\n  axis food["Food Quality"], service["Service"], price["Price"], ambiance["Ambiance"]\n  curve a["Restaurant A"]{4, 3, 2, 4}\n  curve b["Restaurant B"]{3, 4, 3, 3}\n  min 0\n  max 5\n```');
  const item = page.locator('[data-diagram-item]');
  const preview = page.locator('[data-preview]');

  await expect(item).toHaveAttribute('data-diagram-type', 'radar');
  await expect(item).toHaveAttribute('data-diagram-status', 'partial');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await expect(preview.locator('.radar-grid')).toHaveCount(4);
  await expect(preview.locator('.radar-axis')).toHaveCount(4);
  await expect(preview.locator('.radar-curve')).toHaveCount(2);
  await expect(preview.locator('.radar-axis-label').first()).toContainText('Food Quality');
  await expect(preview.locator('.radar-title')).toContainText('Restaurant Comparison');
  await expect(preview.locator('.node')).toHaveCount(0);
});

test('@cross-browser renders native partial Packet bit fields', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\npacket\ntitle UDP Packet\n+16: "Source Port"\n+16: "Destination Port"\n32-47: "Length"\n48-63: "Checksum"\n64-95: "Data (variable length)"\n```');
  const item = page.locator('[data-diagram-item]');
  const preview = page.locator('[data-preview]');

  await expect(item).toHaveAttribute('data-diagram-type', 'packet');
  await expect(item).toHaveAttribute('data-diagram-status', 'partial');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await expect(preview.locator('.packet')).toHaveCount(1);
  await expect(preview.locator('.packet-field')).toHaveCount(5);
  await expect(preview.locator('.packet-segment')).toHaveCount(5);
  await expect(preview.locator('.packet-title')).toContainText('UDP Packet');
  await expect(preview.locator('.packet-field-label').first()).toContainText('Source Port');
  await expect(preview.locator('.node')).toHaveCount(0);
});

test('@cross-browser renders native partial Venn sets and unions', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\nvenn-beta\n  title "Team overlap"\n  set Frontend\n  set Backend\n  union Frontend,Backend["APIs"]\n```');
  const item = page.locator('[data-diagram-item]');
  const preview = page.locator('[data-preview]');

  await expect(item).toHaveAttribute('data-diagram-type', 'venn');
  await expect(item).toHaveAttribute('data-diagram-status', 'partial');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await expect(preview.locator('.venn-set')).toHaveCount(2);
  await expect(preview.locator('.venn-union-label')).toContainText('APIs');
  await expect(preview.locator('.venn-title')).toContainText('Team overlap');
});

test('@cross-browser renders native partial Swimlanes with lane labels and cross-lane arrows', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\nswimlane-beta LR\n  subgraph Customer\n    request[Request service]\n    receive[Receive update]\n  end\n\n  subgraph Support\n    triage[Triage request]\n    answer[Send answer]\n  end\n\n  request --> triage\n  triage -->|Known issue| answer\n  answer --> receive\n```');
  const item = page.locator('[data-diagram-item]');
  const preview = page.locator('[data-preview]');

  await expect(item).toHaveAttribute('data-diagram-type', 'swimlanes');
  await expect(item).toHaveAttribute('data-diagram-status', 'partial');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await expect(preview.locator('.swimlane')).toHaveCount(2);
  await expect(preview.locator('.swimlane-header').first()).toHaveText('Customer');
  await expect(preview.locator('.node')).toHaveCount(4);
  await expect(preview.locator('.edge')).toHaveCount(3);
});

test('@cross-browser renders native partial Treeview hierarchies', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\ntree\n  Product\n    Mobile\n      iOS\n      Android\n    Web\n```');
  const item = page.locator('[data-diagram-item]');
  const preview = page.locator('[data-preview]');

  await expect(item).toHaveAttribute('data-diagram-type', 'treeview');
  await expect(item).toHaveAttribute('data-diagram-status', 'partial');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await expect(preview.locator('.node')).toHaveCount(5);
  await expect(preview.locator('.edge')).toHaveCount(4);
  await expect(preview.locator('.node').first()).toContainText('Product');
});

test('@cross-browser renders native partial Ishikawa causes and effect', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\nishikawa-beta\n  Blurry Photo\n  Process\n    Out of focus\n    Shutter speed too slow\n  Equipment\n    Lens\n      Dirty lens\n```');
  const item = page.locator('[data-diagram-item]');
  const preview = page.locator('[data-preview]');

  await expect(item).toHaveAttribute('data-diagram-type', 'ishikawa');
  await expect(item).toHaveAttribute('data-diagram-status', 'partial');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await expect(preview.locator('.ishikawa')).toBeVisible();
  await expect(preview.locator('.ishikawa-spine')).toHaveCount(1);
  await expect(preview.locator('.ishikawa-effect')).toContainText('Blurry Photo');
  await expect(preview.locator('.ishikawa-cause')).toHaveCount(6);
});

test('@cross-browser renders native partial Event Modeling frames and lanes', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\neventmodeling\n  tf 01 ui CartUI\n  tf 02 cmd AddItem\n  tf 03 evt ItemAdded\n  rf 04 evt External.InventoryChanged\n  timeframe 05 readmodel CartSummary\n```');
  const item = page.locator('[data-diagram-item]');
  const preview = page.locator('[data-preview]');

  await expect(item).toHaveAttribute('data-diagram-type', 'event-modeling');
  await expect(item).toHaveAttribute('data-diagram-status', 'partial');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await expect(preview.locator('.swimlane')).toHaveCount(3);
  await expect(preview.locator('.swimlane-header').first()).toHaveText('UI / Automation');
  await expect(preview.locator('.node')).toHaveCount(5);
  await expect(preview.locator('.edge')).toHaveCount(3);
});

test('@cross-browser renders native partial Wardley Map coordinates and dependencies', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\nwardley-beta\ntitle Tea shop value chain\nanchor Business [0.95, 0.63]\ncomponent Tea [0.63, 0.81]\ncomponent Kettle [0.43, 0.35]\nBusiness -> Tea\nTea -> Kettle\n```');
  const item = page.locator('[data-diagram-item]');
  const preview = page.locator('[data-preview]');

  await expect(item).toHaveAttribute('data-diagram-type', 'wardley');
  await expect(item).toHaveAttribute('data-diagram-status', 'partial');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await expect(preview.locator('.wardley')).toBeVisible();
  await expect(preview.locator('.wardley-title')).toContainText('Tea shop value chain');
  await expect(preview.locator('.wardley-anchor')).toHaveCount(1);
  await expect(preview.locator('.wardley-component')).toHaveCount(2);
  await expect(preview.locator('.wardley-dependency')).toHaveCount(2);
});

test('@cross-browser renders native partial Cynefin domains, items, and transitions', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\ncynefin-beta\ntitle Incident Response\n\ncomplex\n"Investigate root cause"\n\ncomplicated\n"Expert review needed"\n\nclear\n"Restart service"\n\nchaotic\n"Page on-call immediately"\n\nconfusion\n"Unknown failure mode"\n\ncomplex --> complicated : "Pattern identified"\nclear --> chaotic : "Complacency"\n```');
  const item = page.locator('[data-diagram-item]');
  const preview = page.locator('[data-preview]');

  await expect(item).toHaveAttribute('data-diagram-type', 'cynefin');
  await expect(item).toHaveAttribute('data-diagram-status', 'partial');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await expect(preview.locator('.cynefin')).toBeVisible();
  await expect(preview.locator('.cynefin-title')).toContainText('Incident Response');
  await expect(preview.locator('.cynefin-domain')).toHaveCount(5);
  await expect(preview.locator('.cynefin-confusion')).toHaveCount(1);
  await expect(preview.locator('.cynefin-item')).toHaveCount(5);
  await expect(preview.locator('.cynefin-transition')).toHaveCount(2);
  await expect(preview).toContainText('Pattern identified');
});

test('@cross-browser renders partial User Journey tasks and keeps its capability boundary visible', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\njourney\n  title Checkout\n  section Explore\n    Find product: 5: Buyer\n  section Purchase\n    Pay securely: 4: Buyer, Store\n```');
  const item = page.locator('[data-diagram-item]');
  await expect(item).toHaveAttribute('data-diagram-type', 'user-journey');
  await expect(item).toHaveAttribute('data-diagram-status', 'partial');
  await expect(page.locator('[data-capability-recovery]')).toContainText('部分支持');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  const preview = page.locator('[data-preview] svg');
  await expect(preview).toContainText('Explore');
  await expect(preview).toContainText('Pay securely');
});

test('@cross-browser renders partial Timeline entries and keeps its capability boundary visible', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\ntimeline\n  title Product history\n  2024 : First release\n       : Team grows\n  2025 : Global launch\n```');
  const item = page.locator('[data-diagram-item]');
  await expect(item).toHaveAttribute('data-diagram-type', 'timeline');
  await expect(item).toHaveAttribute('data-diagram-status', 'partial');
  await expect(page.locator('[data-capability-recovery]')).toContainText('部分支持');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await expect(page.locator('[data-preview] svg')).toContainText('Global launch');
});

test('@cross-browser renders partial Mindmap hierarchies and keeps its capability boundary visible', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\nmindmap\n  Root\n    Product\n      Editor\n    Renderer\n```');
  const item = page.locator('[data-diagram-item]');
  await expect(item).toHaveAttribute('data-diagram-type', 'mindmap');
  await expect(item).toHaveAttribute('data-diagram-status', 'partial');
  await expect(page.locator('[data-capability-recovery]')).toContainText('部分支持');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  const preview = page.locator('[data-preview] svg');
  await expect(preview).toContainText('Root');
  await expect(preview).toContainText('Editor');
});

test('@cross-browser renders partial Requirement blocks and semantic relationships', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\nrequirementDiagram\n  requirement Login {\n    id: 1\n    text: User must log in\n    risk: high\n    verifymethod: test\n  }\n  functionalRequirement Authenticate {\n    text: Validate credentials\n  }\n  Login - satisfies -> Authenticate\n```');
  const item = page.locator('[data-diagram-item]');
  await expect(item).toHaveAttribute('data-diagram-type', 'requirement');
  await expect(item).toHaveAttribute('data-diagram-status', 'partial');
  await expect(page.locator('[data-capability-recovery]')).toContainText('部分支持');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  const preview = page.locator('[data-preview] svg');
  await expect(preview).toContainText('Login');
  await expect(preview).toContainText('Validate credentials');
  await expect(preview).toContainText('satisfies');
});

test('@cross-browser renders partial GitGraph branches and merges', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\ngitGraph\n  commit id: "ZERO" tag: "v0.1.0"\n  branch develop\n  checkout develop\n  commit id: "FEATURE"\n  checkout main\n  merge develop id: "RELEASE" tag: "v1.0.0"\n```');
  const item = page.locator('[data-diagram-item]');
  await expect(item).toHaveAttribute('data-diagram-type', 'gitgraph');
  await expect(item).toHaveAttribute('data-diagram-status', 'partial');
  await expect(page.locator('[data-capability-recovery]')).toContainText('部分支持');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  const preview = page.locator('[data-preview] svg');
  await expect(preview).toContainText('ZERO');
  await expect(preview).toContainText('develop');
  await expect(preview).toContainText('RELEASE');
});

test('@cross-browser renders partial C4 system landscapes and relationships', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\nC4Context\n  title Internet Banking\n  Person(customer, "Customer")\n  System(banking, "Internet Banking")\n  System_Ext(email, "E-mail system")\n  Rel(customer, banking, "Uses")\n  Rel(banking, email, "Sends mail")\n```');
  const item = page.locator('[data-diagram-item]');
  await expect(item).toHaveAttribute('data-diagram-type', 'c4');
  await expect(item).toHaveAttribute('data-diagram-status', 'partial');
  await expect(page.locator('[data-capability-recovery]')).toContainText('部分支持');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  const preview = page.locator('[data-preview] svg');
  await expect(preview).toContainText('Customer');
  await expect(preview).toContainText('Internet Banking');
  await expect(preview).toContainText('Sends mail');
});

test('@cross-browser renders partial ZenUML calls and returns with distinct edge semantics', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill('```mermaid\nzenuml\n  Alice->Bob: Authenticate\n  Bob-->Alice: Token\n```');
  const item = page.locator('[data-diagram-item]');
  const preview = page.locator('[data-preview]');

  await expect(item).toHaveAttribute('data-diagram-type', 'zenuml');
  await expect(item).toHaveAttribute('data-diagram-status', 'partial');
  await expect(preview).toContainText('Authenticate');
  await expect(preview).toContainText('Token');
  await expect(preview.locator('.edge path').nth(1)).toHaveAttribute('stroke-dasharray', '5,5');
});

test('switches to exactly one panel and preserves focus at a phone viewport', async ({ page }) => {
  const expectPrivateRequests = monitorPrivacy(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByRole('button', { name: '预览', exact: true }).click();
  await expect(page.locator('[data-panel="preview"]')).toBeVisible();
  await expect(page.locator('[data-panel="edit"]')).toBeHidden();
  await expect(page.locator('[data-panel="list"]')).toBeHidden();
  await page.getByRole('button', { name: '图表', exact: true }).click();
  await page.locator('[data-diagram-item]').first().click();
  await expect(page.locator('[data-panel="edit"]')).toBeVisible();
  await expect(page.getByRole('textbox', { name: '当前图表' })).toBeFocused();
  expectPrivateRequests();
});

test('uses a full-screen style dialog on mobile without changing the active panel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  const shell = page.locator('.app-shell');
  await expect(shell).toHaveAttribute('data-mobile-panel', 'edit');
  await page.getByRole('button', { name: '图表样式' }).click();

  const box = await page.getByRole('dialog', { name: '图表样式' }).boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeCloseTo(0, 0);
  expect(box!.y).toBeCloseTo(0, 0);
  expect(box!.width).toBeCloseTo(390, 0);
  expect(box!.height).toBeCloseTo(844, 0);

  await page.getByRole('button', { name: '完成图表样式' }).click();
  await expect(shell).toHaveAttribute('data-mobile-panel', 'edit');
});

test('uses the available desktop width for the preview after the first layout', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('./');

  const workspace = page.locator('.workspace');
  const geometry = await workspace.evaluate(workspace => {
    const right = (element: Element) => element.getBoundingClientRect().right;
    const width = (element: Element) => element.getBoundingClientRect().width;
    const preview = workspace.querySelector('[data-panel="preview"]')!;
    const editor = workspace.querySelector('[data-panel="edit"]')!;
    return {
      workspaceRight: right(workspace),
      previewRight: right(preview),
      previewWidth: width(preview),
      editorWidth: width(editor),
    };
  });

  const paddingRight = await workspace.evaluate(element => Number.parseFloat(getComputedStyle(element).paddingRight));
  expect(geometry.previewRight).toBeCloseTo(geometry.workspaceRight - paddingRight, 0);
  expect(geometry.previewWidth).toBeGreaterThan(geometry.editorWidth);
});

test('keeps every diagram reachable in a long desktop list', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.getByRole('textbox', { name: '完整文本' }).fill(MANY_DIAGRAMS);

  const panel = page.locator('[data-panel="list"]');
  await expect(page.locator('[data-diagram-item]')).toHaveCount(40);
  expect(await panel.evaluate(element => ({
    overflowY: getComputedStyle(element).overflowY,
    overflows: element.scrollHeight > element.clientHeight,
  }))).toEqual({ overflowY: 'auto', overflows: true });
  const last = page.locator('[data-diagram-item]').last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeVisible();
  await last.click();
  await expectEditorValue(page.getByRole('textbox', { name: '当前图表' }), /Diagram 40/);
});

test('uses the single-panel layout before the desktop grid would clip', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto('./');

  await expect(page.locator('.mobile-nav')).toBeVisible();
  await page.getByRole('button', { name: '预览', exact: true }).click();
  await expect(page.locator('[data-panel="preview"]')).toBeVisible();
  await expect(page.locator('[data-panel="edit"]')).toBeHidden();
});

test('persists desktop pane proportions without persisting the canvas viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await expect(page.locator('[data-preview] svg')).toBeVisible();
  const workspace = page.locator('.workspace');
  const divider = page.getByRole('separator', { name: '调整图表列表宽度' });
  const before = await workspace.evaluate(element => getComputedStyle(element).getPropertyValue('--list-width'));

  await divider.focus();
  await page.keyboard.press('Shift+ArrowRight');
  const after = await workspace.evaluate(element => getComputedStyle(element).getPropertyValue('--list-width'));
  expect(after).not.toBe(before);

  await page.getByRole('button', { name: '放大预览' }).click();
  await expect(page.locator('[data-preview-stage]')).toHaveAttribute('data-viewport-mode', 'manual');
  await page.reload();

  await expect(workspace).toHaveCSS('--list-width', after);
  await expect(page.locator('[data-preview-stage]')).toHaveAttribute('data-viewport-mode', 'fit');
});

test('keeps workbench geometry within every supported viewport', async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('./');
    await expectResponsiveGeometry(page);
  }
});

test('gives the Aurora canvas visual priority without hiding source editing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');

  const sizes = await page.locator('.app-shell').evaluate(shell => {
    const width = (selector: string) => shell.querySelector<HTMLElement>(selector)!.getBoundingClientRect().width;
    return { editor: width('.editor-panel'), preview: width('[data-preview-canvas]') };
  });

  expect(sizes.preview).toBeGreaterThan(sizes.editor);
});

test('keeps the mobile preview canvas full width when diagnostics are visible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByRole('button', { name: '预览', exact: true }).click();

  const layout = await page.locator('.app-shell').evaluate(shell => {
    const rect = (selector: string) => {
      const { x, width } = shell.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
      return { x, width };
    };
    return { preview: rect('[data-panel="preview"]'), navigation: rect('[data-mobile-navigation]') };
  });

  expect(layout.preview.x).toBe(0);
  expect(layout.preview.width).toBe(390);
  expect(layout.navigation.width).toBe(390);
});

test('switches editor tabs with the keyboard', async ({ page }) => {
  await page.goto('./');
  const documentTab = page.getByRole('tab', { name: '完整文本' });
  const diagramTab = page.getByRole('tab', { name: '当前图表' });
  await documentTab.focus();
  await page.keyboard.press('ArrowRight');

  await expect(diagramTab).toBeFocused();
  await expect(diagramTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('textbox', { name: '当前图表' })).toBeVisible();
});

test('zooms, fits, and pans the preview without rerendering the source', async ({ page }) => {
  await page.goto('./');
  const source = await readEditor(page.getByRole('textbox', { name: '完整文本' }));
  const svgBefore = await page.locator('[data-preview] svg').evaluate(svg => svg.outerHTML);

  await page.getByRole('button', { name: '放大预览' }).click();
  await expect(page.locator('[data-preview-stage]')).toHaveAttribute('data-viewport-mode', 'manual');
  await page.locator('[data-preview-canvas]').hover({ position: { x: 120, y: 120 } });
  await page.mouse.down();
  await page.mouse.move(160, 150);
  await page.mouse.up();
  await page.getByRole('button', { name: '适配预览' }).click();

  await expectEditorValue(page.getByRole('textbox', { name: '完整文本' }), source);
  expect(await page.locator('[data-preview] svg').evaluate(svg => svg.outerHTML)).toBe(svgBefore);
});

test('restores local content and keeps canvas controls reachable', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const documentText = 'flowchart TD\n  Local[Local cache] --> Canvas[Canvas]';
  await page.getByRole('textbox', { name: '完整文本' }).fill(documentText);
  await expect(page.locator('[data-preview] svg')).toContainText('Local cache');

  await page.getByRole('button', { name: '收起图表列表' }).click();
  const restoreList = page.getByRole('button', { name: '展开图表列表' });
  await expect(restoreList).toBeVisible();
  await restoreList.click();
  await expect(page.locator('[data-panel="list"]')).toBeVisible();

  await page.locator('[data-preview-canvas]').hover({ position: { x: 160, y: 120 } });
  await page.mouse.wheel(0, -120);
  await expect(page.locator('[data-preview-stage]')).toHaveAttribute('data-viewport-mode', 'manual');
  await expect(page.locator('[data-preview-minimap] svg')).toBeVisible();
  await expect(page.locator('[data-preview-minimap-viewport]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem('xmermaid-live.workspace.v2');
    return raw ? JSON.parse(raw) : null;
  })).toMatchObject({
    version: 2,
    documentText,
    layoutPreferences: expect.any(Object),
    themePreferences: expect.any(Object),
    viewports: expect.any(Object),
  });

  await page.reload();
  await expectEditorValue(page.getByRole('textbox', { name: '完整文本' }), documentText);
});

test('falls back to the first diagram when a shared selection id is stale', async ({ page }) => {
  const hash = encodeShareState(PASTED_DOCUMENT, 'diagram-999');
  await page.goto(`./${hash}`);

  await page.getByRole('tab', { name: '当前图表' }).click();
  await expectEditorValue(page.getByRole('textbox', { name: '当前图表' }), /First diagram/);
});

test('extracts a thousand-diagram document within the declared capacity', async ({ page }) => {
  const expectPrivateRequests = monitorPrivacy(page);
  const thousandDiagrams = Array.from({ length: 1_000 }, (_, index) => `\`\`\`mermaid
flowchart TD
  A${index} --> B${index}
\`\`\``).join('\n\n');
  await page.goto('./');

  const documentEditor = page.getByRole('textbox', { name: '完整文本' });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await documentEditor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.evaluate(value => navigator.clipboard.writeText(value), thousandDiagrams);
  const startedAt = await page.evaluate(() => performance.now());
  await page.keyboard.press('ControlOrMeta+V');
  const elapsedMs = await page.evaluate(start => performance.now() - start, startedAt);
  await expect(page.locator('[data-diagram-item]')).toHaveCount(1_000);
  expect(elapsedMs).toBeLessThan(1_500);
  expectPrivateRequests();
});

test('boots the same production build at the domain root and subpath @cross-browser', async ({ page }) => {
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
