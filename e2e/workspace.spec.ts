import { expect, test, type Download, type Page } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { encodeShareState } from 'xmermaid/editor';

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
  await expect(page.getByRole('textbox', { name: '当前图表' })).toHaveValue(/Second diagram/);
  await expect(previewSvg).toContainText('Second diagram');
  const secondMarkup = await previewSvg.evaluate(svg => svg.outerHTML);
  expect(secondMarkup).not.toBe(firstMarkup);

  await page.getByRole('textbox', { name: '当前图表' }).fill('flowchart LR\n  Browser[Browser] --> WASM[WASM]');
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await page.getByRole('tab', { name: '完整文本' }).click();
  await expect(page.getByRole('textbox', { name: '完整文本' })).toHaveValue(/Browser\[Browser\] --> WASM\[WASM\]/);
  await expect(page.getByRole('textbox', { name: '完整文本' })).toHaveValue(/First\[First diagram\]/);

  await page.getByRole('button', { name: '分享' }).click();
  await expect(page).toHaveURL(/#xm=/);
  await page.reload();
  await page.getByRole('tab', { name: '当前图表' }).click();
  await expect(page.getByRole('textbox', { name: '当前图表' })).toHaveValue(/Browser\[Browser\]/);
  await page.getByRole('tab', { name: '完整文本' }).click();
  await expect(page.getByRole('textbox', { name: '完整文本' })).toHaveValue(PASTED_DOCUMENT.replace(
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
  await expect(page.locator('[data-preview] svg')).toHaveCSS('background-color', 'rgb(13, 11, 26)');

  await page.getByRole('button', { name: '图表样式' }).click();
  await page.getByRole('slider', { name: '箭头大小' }).fill('18');
  await page.getByRole('button', { name: '关闭图表样式' }).click();
  await page.getByRole('button', { name: '浅色' }).click();
  await expect(shell).toHaveAttribute('data-workspace-theme', 'light');
  await expect(page.locator('[data-preview] svg')).toHaveCSS('background-color', 'rgb(248, 247, 255)');
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
  await expect(page.getByRole('textbox', { name: '完整文本' })).toHaveValue(/Core\[Core workflow\]/);
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

test('@cross-browser renders the partial Sequence subset and keeps its capability boundary visible', async ({ page }) => {
  await page.goto('./');
  const documentInput = page.getByRole('textbox', { name: '完整文本' });
  await documentInput.fill('```mermaid\nsequenceDiagram\n  A->>B: Hello\n```');
  const item = page.locator('[data-diagram-item]');
  await expect(item).toHaveCount(1);
  await expect(item).toHaveAttribute('data-diagram-type', 'sequence');
  await expect(item).toHaveAttribute('data-diagram-status', 'partial');
  await expect(page.locator('[data-capability-recovery]')).toContainText('部分支持');
  await expect(page.getByRole('button', { name: '复制复现源码' })).toBeVisible();
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await expect(page.locator('[data-preview] svg')).toContainText('A');
  await expect(page.locator('[data-preview] svg')).toContainText('B');
  await expect(page.locator('[data-preview] svg')).toContainText('Hello');
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
  await expect(page.getByRole('textbox', { name: '当前图表' })).toHaveValue(/Diagram 40/);
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
  const source = await page.getByRole('textbox', { name: '完整文本' }).inputValue();
  const svgBefore = await page.locator('[data-preview] svg').evaluate(svg => svg.outerHTML);

  await page.getByRole('button', { name: '放大预览' }).click();
  await expect(page.locator('[data-preview-stage]')).toHaveAttribute('data-viewport-mode', 'manual');
  await page.locator('[data-preview-canvas]').hover({ position: { x: 120, y: 120 } });
  await page.mouse.down();
  await page.mouse.move(160, 150);
  await page.mouse.up();
  await page.getByRole('button', { name: '适配预览' }).click();

  await expect(page.getByRole('textbox', { name: '完整文本' })).toHaveValue(source);
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
  await expect(page.getByRole('textbox', { name: '完整文本' })).toHaveValue(documentText);
});

test('falls back to the first diagram when a shared selection id is stale', async ({ page }) => {
  const hash = encodeShareState(PASTED_DOCUMENT, 'diagram-999');
  await page.goto(`./${hash}`);

  await page.getByRole('tab', { name: '当前图表' }).click();
  await expect(page.getByRole('textbox', { name: '当前图表' })).toHaveValue(/First diagram/);
});

test('extracts a thousand-diagram document within the declared capacity', async ({ page }) => {
  const expectPrivateRequests = monitorPrivacy(page);
  const thousandDiagrams = Array.from({ length: 1_000 }, (_, index) => `\`\`\`mermaid
flowchart TD
  A${index} --> B${index}
\`\`\``).join('\n\n');
  await page.goto('./');

  const elapsedMs = await page.getByRole('textbox', { name: '完整文本' }).evaluate((element, value) => {
    const input = element as HTMLTextAreaElement;
    const startedAt = performance.now();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return performance.now() - startedAt;
  }, thousandDiagrams);
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
