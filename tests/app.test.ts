import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DARK_THEME, type RenderTheme } from 'xmermaid';
import { decodeShareState, type ExportRequest } from 'xmermaid/editor';
import { mountApp, type MountedApp } from '../src/app';
import type { PreviewRenderResult, PreviewRenderer } from '../src/preview-runtime';
import '../src/styles.css';

const DOCUMENT = `\`\`\`mermaid
flowchart TD
  A --> B
\`\`\`

\`\`\`mermaid
flowchart LR
  C --> D
\`\`\``;

let mounted: MountedApp | null = null;

beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) { this.setAttribute('open', ''); },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.removeAttribute('open');
        this.dispatchEvent(new Event('close'));
      },
    },
  });
});

afterEach(() => {
  mounted?.destroy();
  mounted = null;
  document.body.innerHTML = '';
  window.history.replaceState(null, '', window.location.pathname);
  vi.useRealTimers();
});

function root(): HTMLElement {
  document.body.innerHTML = '<main id="app"></main>';
  return document.querySelector<HTMLElement>('#app')!;
}

function renderer(source: string) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.dataset.source = source;
  return Promise.resolve({ svg, diagnostics: [] });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise; });
  return { promise, resolve };
}

function previewResult(label: string): PreviewRenderResult {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.dataset.source = label;
  return { svg, diagnostics: [] };
}

describe('mountApp', () => {
  it('presents the workspace as a focused diagram studio', () => {
    mounted = mountApp(root(), { initialText: DOCUMENT, renderer });

    expect(document.querySelector('.brand')?.textContent).toContain('DIAGRAM STUDIO');
    expect(document.querySelector('[data-preview-canvas]')?.getAttribute('aria-label')).toBe('图表画布');
    expect(document.querySelector('.preview-actions')?.getAttribute('aria-label')).toBe('画布视图控制');
  });

  it('marks the canvas-led Aurora hierarchy without changing accessible controls', () => {
    mounted = mountApp(root(), { initialText: DOCUMENT, renderer });

    const shell = document.querySelector<HTMLElement>('.app-shell')!;
    expect(shell.dataset.studioLayout).toBe('aurora');
    expect(document.querySelector<HTMLElement>('[data-preview-canvas]')?.dataset.previewPriority).toBe('primary');
    expect(document.querySelector('[data-preview-fit]')?.getAttribute('aria-label')).toBe('适配预览');
  });

  it('extracts a pasted document into a switchable diagram list', async () => {
    vi.useFakeTimers();
    mounted = mountApp(root(), { initialText: DOCUMENT, renderer, renderDelayMs: 10 });

    expect(document.querySelectorAll('[data-diagram-item]')).toHaveLength(2);
    document.querySelectorAll<HTMLButtonElement>('[data-diagram-item]')[1].click();
    await vi.runAllTimersAsync();

    expect(document.querySelector<HTMLTextAreaElement>('[data-diagram-input]')?.value).toContain('C --> D');
    expect(document.querySelector<SVGSVGElement>('[data-preview] svg')?.dataset.source).toContain('C --> D');
  });

  it('re-extracts all diagrams when complete text is pasted', () => {
    mounted = mountApp(root(), { initialText: 'flowchart TD\nA-->B', renderer });
    const input = document.querySelector<HTMLTextAreaElement>('[data-document-input]')!;
    input.value = DOCUMENT;
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(document.querySelectorAll('[data-diagram-item]')).toHaveLength(2);
  });

  it('keeps partial diagrams visible with a capability recovery action', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    mounted = mountApp(root(), {
      initialText: '```mermaid\nsequenceDiagram\n  A->>B: Hello\n```',
      renderer,
    });

    const item = document.querySelector<HTMLButtonElement>('[data-diagram-item]')!;
    expect(item.dataset.diagramType).toBe('sequence');
    expect(item.dataset.diagramStatus).toBe('partial');
    expect(item.textContent).toContain('部分支持');
    expect(document.querySelector('[data-capability-recovery]')).not.toBeNull();
    document.querySelector<HTMLButtonElement>('[data-copy-repro]')!.click();
    expect(writeText).toHaveBeenCalledWith('sequenceDiagram\n  A->>B: Hello');
  });

  it('marks the native XY chart subset as partial instead of planned', () => {
    mounted = mountApp(root(), {
      initialText: '```mermaid\nxychart-beta\n  x-axis [Q1, Q2]\n  y-axis 0 --> 100\n  bar [20, 40]\n  line [30, 50]\n```',
      renderer,
    });

    const item = document.querySelector<HTMLButtonElement>('[data-diagram-item]')!;
    expect(item.dataset.diagramType).toBe('xychart');
    expect(item.dataset.diagramStatus).toBe('partial');
  });

  it('marks the native Sankey CSV subset as partial instead of planned', () => {
    mounted = mountApp(root(), {
      initialText: '```mermaid\nsankey\nA,B,8\nB,C,8\n```',
      renderer,
    });

    const item = document.querySelector<HTMLButtonElement>('[data-diagram-item]')!;
    expect(item.dataset.diagramType).toBe('sankey');
    expect(item.dataset.diagramStatus).toBe('partial');
  });

  it('marks the native Quadrant Chart subset as partial instead of planned', () => {
    mounted = mountApp(root(), {
      initialText: '```mermaid\nquadrantChart\n  Campaign A: [0.25, 0.75]\n```',
      renderer,
    });

    const item = document.querySelector<HTMLButtonElement>('[data-diagram-item]')!;
    expect(item.dataset.diagramType).toBe('quadrant');
    expect(item.dataset.diagramStatus).toBe('partial');
  });

  it('keeps the last valid SVG while a partial diagram reports its recovery state', async () => {
    vi.useFakeTimers();
    const stagedRenderer: PreviewRenderer = async source => {
      if (source.startsWith('sequenceDiagram')) throw new Error('Unsupported diagram type: sequence');
      return previewResult(source);
    };
    mounted = mountApp(root(), { initialText: DOCUMENT, renderer: stagedRenderer, renderDelayMs: 0 });
    await vi.runAllTimersAsync();
    const firstSvg = document.querySelector<SVGSVGElement>('[data-preview] svg')!;
    document.querySelector<HTMLTextAreaElement>('[data-document-input]')!.value = '```mermaid\nsequenceDiagram\n  A->>B: Hello\n```';
    document.querySelector<HTMLTextAreaElement>('[data-document-input]')!.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.runAllTimersAsync();

    expect(document.querySelector('[data-preview] svg')).toBe(firstSvg);
    expect(document.querySelector('[data-capability-recovery]')?.textContent).toContain('部分支持');
  });

  it('writes focused source edits back into the complete document', () => {
    mounted = mountApp(root(), { initialText: DOCUMENT, renderer });
    document.querySelectorAll<HTMLButtonElement>('[data-diagram-item]')[1].click();
    const input = document.querySelector<HTMLTextAreaElement>('[data-diagram-input]')!;
    input.value = 'flowchart LR\n  Browser --> WASM';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(document.querySelector<HTMLTextAreaElement>('[data-document-input]')?.value).toContain('Browser --> WASM');
    expect(document.querySelector<HTMLTextAreaElement>('[data-document-input]')?.value).toContain('A --> B');
  });

  it('keeps unchanged diagram list nodes while focused source text changes', () => {
    mounted = mountApp(root(), { initialText: DOCUMENT, renderer });
    const firstItem = document.querySelector<HTMLButtonElement>('[data-diagram-item]')!;
    const input = document.querySelector<HTMLTextAreaElement>('[data-diagram-input]')!;
    input.value = 'flowchart TD\n  Renamed --> B';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(document.querySelector('[data-diagram-item]')).toBe(firstItem);
  });

  it('does not reuse list nodes when user tokens collide with signature separators', () => {
    const twoDiagrams = '```mermaid\nfoo\n```\n\n```mermaid\nbar\n```';
    const oneDiagram = 'one\ntwo\nthree\nfour\n```mermaid\nfoo:2|bar\n```';
    mounted = mountApp(root(), { initialText: twoDiagrams, renderer });
    const input = document.querySelector<HTMLTextAreaElement>('[data-document-input]')!;
    input.value = oneDiagram;
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(document.querySelector('[data-diagram-count]')?.textContent).toBe('1');
    expect(document.querySelectorAll('[data-diagram-item]')).toHaveLength(1);
    expect(document.querySelector('[data-diagram-item]')?.textContent).toContain('foo:2|bar');
  });

  it('shows the empty extraction guidance without calling the renderer', () => {
    const render = vi.fn(renderer);
    mounted = mountApp(root(), { initialText: 'plain text', renderer: render });

    expect(document.querySelector('[data-empty-list]')?.textContent).toContain('```mermaid');
    expect(render).not.toHaveBeenCalled();
  });

  it('shows warning diagnostics from a successful current preview', async () => {
    vi.useFakeTimers();
    const warningRenderer = async (source: string) => {
      const result = await renderer(source);
      return {
        ...result,
        diagnostics: [{
          code: 'unsupported_syntax' as const,
          message: 'This syntax is only partially supported.',
          severity: 'warning' as const,
          range: {
            startOffset: 13,
            endOffset: 20,
            startLine: 2,
            startColumn: 3,
            endLine: 2,
            endColumn: 10,
          },
        }],
      };
    };
    mounted = mountApp(root(), { initialText: DOCUMENT, renderer: warningRenderer, renderDelayMs: 10 });
    await vi.runAllTimersAsync();

    expect(document.querySelector('[data-preview-status]')?.textContent).toBe('已更新');
    expect(document.querySelector('[data-diagnostics]')?.textContent).toContain('unsupported_syntax');
    expect(document.querySelector('[data-diagnostics]')?.textContent).toContain('图内第 2 行');
    expect(document.querySelector('[data-preview] svg')).not.toBeNull();
  });

  it('does not duplicate a structured render failure with a generic diagnostic', async () => {
    vi.useFakeTimers();
    const failure = new (await import('xmermaid')).XMermaidError('PARSE_ERROR', 'bad source', undefined, [{
      code: 'parse_error',
      message: 'bad source',
      severity: 'error',
      range: null,
    }]);
    mounted = mountApp(root(), {
      initialText: DOCUMENT,
      renderer: async () => { throw failure; },
      renderDelayMs: 10,
    });
    await vi.runAllTimersAsync();

    expect(document.querySelectorAll('[data-diagnostics] .diagnostic')).toHaveLength(1);
    expect(document.querySelector('[data-diagnostics]')?.textContent).toContain('parse_error');
  });

  it('writes the complete document and selected id to the share hash', () => {
    mounted = mountApp(root(), { initialText: DOCUMENT, renderer });
    document.querySelectorAll<HTMLButtonElement>('[data-diagram-item]')[1].click();
    document.querySelector<HTMLButtonElement>('[data-share]')?.click();

    expect(decodeShareState(window.location.hash)).toEqual({
      documentText: DOCUMENT,
      selectedDiagramId: 'diagram-2',
    });
  });

  it('refuses to claim success when the encoded share link is too large', () => {
    const oversized = `flowchart TD\n  A[${'x'.repeat(60_000)}] --> B`;
    mounted = mountApp(root(), { initialText: oversized, renderer });
    document.querySelector<HTMLButtonElement>('[data-share]')?.click();

    expect(window.location.hash).toBe('');
    expect(document.querySelector('[data-action-status]')?.textContent).toContain('过长');
  });

  it('exports SVG only while the current preview matches the current source', async () => {
    vi.useFakeTimers();
    const blob = new Blob(['svg'], { type: 'image/svg+xml' });
    const exporter = vi.fn(async (_request: ExportRequest) => blob);
    const saveBlob = vi.fn();
    mounted = mountApp(root(), {
      initialText: DOCUMENT,
      renderer,
      exporter,
      saveBlob,
      renderDelayMs: 10,
    });

    const svgButton = document.querySelector<HTMLButtonElement>('[data-export-svg]')!;
    const pngButton = document.querySelector<HTMLButtonElement>('[data-export-png]')!;
    expect(svgButton.disabled).toBe(true);
    expect(pngButton.disabled).toBe(true);

    await vi.runAllTimersAsync();

    const currentSvg = document.querySelector<SVGSVGElement>('[data-preview] svg')!;
    expect(svgButton.disabled).toBe(false);
    expect(pngButton.disabled).toBe(false);
    svgButton.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(exporter).toHaveBeenCalledWith({
      diagramId: 'diagram-1',
      source: 'flowchart TD\n  A --> B',
      svg: currentSvg,
      format: 'svg',
      fileName: 'diagram-1.svg',
    });
    expect(saveBlob).toHaveBeenCalledWith(blob, 'diagram-1.svg');

    const source = document.querySelector<HTMLTextAreaElement>('[data-diagram-input]')!;
    source.value = 'flowchart TD\n  changed --> pending';
    source.dispatchEvent(new Event('input', { bubbles: true }));

    expect(svgButton.disabled).toBe(true);
    expect(pngButton.disabled).toBe(true);
    svgButton.click();
    expect(exporter).toHaveBeenCalledTimes(1);
  });

  it('shows export failures as text without creating user-provided markup', async () => {
    vi.useFakeTimers();
    const exporter = vi.fn(async (_request: ExportRequest) => {
      throw new Error('<img src=x onerror=alert(1)>');
    });
    mounted = mountApp(root(), {
      initialText: DOCUMENT,
      renderer,
      exporter,
      saveBlob: vi.fn(),
      renderDelayMs: 10,
    });
    await vi.runAllTimersAsync();

    document.querySelector<HTMLButtonElement>('[data-export-svg]')!.click();
    await Promise.resolve();
    await Promise.resolve();

    const status = document.querySelector<HTMLElement>('[data-action-status]')!;
    expect(status.textContent).toBe('导出失败：<img src=x onerror=alert(1)>');
    expect(status.querySelector('img')).toBeNull();
  });

  it('discards an export that finishes after the selected source changes', async () => {
    vi.useFakeTimers();
    let finishExport!: (blob: Blob) => void;
    const exporter = vi.fn(() => new Promise<Blob>(resolve => { finishExport = resolve; }));
    const saveBlob = vi.fn();
    mounted = mountApp(root(), {
      initialText: DOCUMENT,
      renderer,
      exporter,
      saveBlob,
      renderDelayMs: 10,
    });
    await vi.runAllTimersAsync();

    document.querySelector<HTMLButtonElement>('[data-export-svg]')!.click();
    const source = document.querySelector<HTMLTextAreaElement>('[data-diagram-input]')!;
    source.value = 'flowchart TD\n  changed --> pending';
    source.dispatchEvent(new Event('input', { bubbles: true }));
    finishExport(new Blob(['stale'], { type: 'image/svg+xml' }));
    await Promise.resolve();
    await Promise.resolve();

    expect(saveBlob).not.toHaveBeenCalled();
    expect(document.querySelector('[data-action-status]')?.textContent).not.toContain('已下载');
  });

  it('switches editor tabs with the standard arrow-key interaction', () => {
    mounted = mountApp(root(), { initialText: DOCUMENT, renderer });
    const documentTab = document.querySelector<HTMLButtonElement>('[data-editor-tab="document"]')!;
    const diagramTab = document.querySelector<HTMLButtonElement>('[data-editor-tab="diagram"]')!;
    documentTab.focus();
    documentTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(document.activeElement).toBe(diagramTab);
    expect(diagramTab.getAttribute('aria-selected')).toBe('true');
    expect(document.querySelector<HTMLElement>('[data-editor-surface="diagram"]')?.hidden).toBe(false);
    expect(diagramTab.getAttribute('aria-controls')).toBe('diagram-editor-panel');
  });

  it('exposes keyboard-operable mobile panel controls', () => {
    mounted = mountApp(root(), { initialText: DOCUMENT, renderer });
    const previewButton = document.querySelector<HTMLButtonElement>('[data-mobile-target="preview"]')!;
    previewButton.click();

    expect(document.querySelector<HTMLElement>('.app-shell')?.dataset.mobilePanel).toBe('preview');
    expect(previewButton.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector<HTMLTextAreaElement>('[data-document-input]')?.getAttribute('aria-label')).toBe('完整文本');
  });

  it('renders two keyboard-operable desktop dividers and persists only layout changes', () => {
    const persistLayout = vi.fn();
    const render = vi.fn(renderer);
    mounted = mountApp(root(), {
      initialText: DOCUMENT,
      renderer: render,
      initialLayoutPreferences: { version: 1, listCollapsed: false, listFraction: .18, editorFraction: .38 },
      persistLayoutPreferences: persistLayout,
    });
    const divider = document.querySelector<HTMLElement>('[data-workspace-divider="list"]')!;
    const callsBefore = render.mock.calls.length;
    divider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(document.querySelectorAll('[data-workspace-divider]')).toHaveLength(2);
    expect(persistLayout).toHaveBeenCalledWith(expect.objectContaining({ listFraction: expect.any(Number) }));
    expect(render).toHaveBeenCalledTimes(callsBefore);
  });

  it('collapses and restores the diagram list without replacing the selected diagram', () => {
    mounted = mountApp(root(), { initialText: DOCUMENT, renderer });
    document.querySelectorAll<HTMLButtonElement>('[data-diagram-item]')[1].click();
    const collapse = document.querySelector<HTMLButtonElement>('[data-list-collapse]')!;
    collapse.click();
    expect(document.querySelector<HTMLElement>('.app-shell')?.dataset.listCollapsed).toBe('true');
    const restore = document.querySelector<HTMLButtonElement>('[data-list-restore]')!;
    expect(restore.getAttribute('aria-label')).toBe('展开图表列表');
    restore.click();
    expect(document.querySelector<HTMLElement>('.app-shell')?.dataset.listCollapsed).toBe('false');
    expect(document.querySelector('[data-diagram-item][aria-current="true"]')?.textContent).toContain('图表 2');
  });

  it('changes only the preview viewport when zoom and fit controls are used', async () => {
    vi.useFakeTimers();
    const render = vi.fn(renderer);
    mounted = mountApp(root(), { initialText: DOCUMENT, renderer: render, renderDelayMs: 0 });
    await vi.runAllTimersAsync();
    const initialCalls = render.mock.calls.length;

    document.querySelector<HTMLButtonElement>('[data-preview-zoom="in"]')!.click();
    expect(document.querySelector<HTMLElement>('[data-preview-stage]')?.style.transform).toContain('scale(');
    expect(render).toHaveBeenCalledTimes(initialCalls);

    document.querySelector<HTMLButtonElement>('[data-preview-fit]')!.click();
    expect(document.querySelector<HTMLElement>('[data-preview-stage]')?.dataset.viewportMode).toBe('fit');

    document.querySelectorAll<HTMLButtonElement>('[data-diagram-item]')[1].click();
    await vi.runAllTimersAsync();
    document.querySelectorAll<HTMLButtonElement>('[data-diagram-item]')[0].click();
    await vi.runAllTimersAsync();
    expect(document.querySelector<HTMLElement>('[data-preview-stage]')?.dataset.viewportMode).toBe('fit');
  });

  it('zooms the preview with an unmodified mouse wheel and keeps the minimap in sync', async () => {
    vi.useFakeTimers();
    mounted = mountApp(root(), { initialText: DOCUMENT, renderer, renderDelayMs: 0 });
    await vi.runAllTimersAsync();
    const canvas = document.querySelector<HTMLElement>('[data-preview-canvas]')!;
    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120, clientX: 20, clientY: 20 });
    canvas.dispatchEvent(wheel);

    expect(wheel.defaultPrevented).toBe(true);
    expect(document.querySelector<HTMLElement>('[data-preview-stage]')?.dataset.viewportMode).toBe('manual');
    expect(document.querySelector('[data-preview-minimap] svg')).not.toBeNull();
    expect(document.querySelector('[data-preview-minimap-viewport]')).not.toBeNull();
  });

  it('uses application maximize when browser fullscreen rejects', async () => {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error('denied')),
    });
    mounted = mountApp(root(), { initialText: DOCUMENT, renderer });
    document.querySelector<HTMLButtonElement>('[data-preview-fullscreen]')!.click();
    await Promise.resolve();

    expect(document.querySelector<HTMLElement>('.app-shell')?.dataset.previewMaximized).toBe('true');
    expect(document.querySelector('[data-action-status]')?.textContent).toContain('应用内最大化');
    expect(document.querySelector('[data-preview-maximize-exit]')).toBeNull();
    const control = document.querySelector<HTMLButtonElement>('[data-preview-fullscreen]')!;
    expect(control.getAttribute('aria-label')).toBe('退出最大化预览');
    control.click();
    expect(document.querySelector<HTMLElement>('.app-shell')?.dataset.previewMaximized).toBeUndefined();
  });

  it('persists complete and focused source edits through the document cache callback', () => {
    const persistDocumentText = vi.fn();
    mounted = mountApp(root(), { initialText: DOCUMENT, renderer, persistDocumentText });
    const complete = document.querySelector<HTMLTextAreaElement>('[data-document-input]')!;
    complete.value = 'flowchart TD\n  Start --> End';
    complete.dispatchEvent(new Event('input', { bubbles: true }));
    expect(persistDocumentText).toHaveBeenLastCalledWith(complete.value);

    const focused = document.querySelector<HTMLTextAreaElement>('[data-diagram-input]')!;
    focused.value = 'flowchart TD\n  Start --> Cached';
    focused.dispatchEvent(new Event('input', { bubbles: true }));
    expect(persistDocumentText).toHaveBeenLastCalledWith(expect.stringContaining('Cached'));
  });

  it('emits the complete workspace state for V2 local persistence', () => {
    const persistWorkspaceState = vi.fn();
    mounted = mountApp(root(), { initialText: DOCUMENT, renderer, persistWorkspaceState });
    document.querySelectorAll<HTMLButtonElement>('[data-diagram-item]')[1].click();
    document.querySelector<HTMLButtonElement>('[data-theme-option="light"]')!.click();

    expect(persistWorkspaceState).toHaveBeenLastCalledWith(expect.objectContaining({
      documentText: DOCUMENT,
      selectedDiagramId: 'diagram-2',
      themePreferences: expect.objectContaining({ workspace: 'light' }),
      layoutPreferences: expect.any(Object),
      viewports: expect.any(Object),
    }));
  });

  it('starts dark, switches paired themes, preserves overrides, and resets them', async () => {
    vi.useFakeTimers();
    const persist = vi.fn();
    const renderedThemes: RenderTheme[] = [];
    const themeRenderer: PreviewRenderer = async (source, theme) => {
      renderedThemes.push(theme);
      return previewResult(source);
    };
    mounted = mountApp(root(), {
      initialText: DOCUMENT,
      renderer: themeRenderer,
      renderDelayMs: 0,
      persistThemePreferences: persist,
    });
    const shell = document.querySelector<HTMLElement>('.app-shell')!;
    expect(shell.dataset.workspaceTheme).toBe('dark');

    document.querySelector<HTMLButtonElement>('[data-theme-option="light"]')!.click();
    expect(shell.dataset.workspaceTheme).toBe('light');

    document.querySelector<HTMLButtonElement>('[data-style-open]')!.click();
    const arrowSize = document.querySelector<HTMLInputElement>('[data-style-number="arrowSize"]')!;
    arrowSize.value = '18';
    arrowSize.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector<HTMLButtonElement>('[data-theme-option="dark"]')!.click();
    await vi.runAllTimersAsync();
    expect(renderedThemes.at(-1)?.arrowSize).toBe(18);

    document.querySelector<HTMLButtonElement>('[data-style-reset]')!.click();
    await vi.runAllTimersAsync();
    expect(renderedThemes.at(-1)?.arrowSize).toBe(DARK_THEME.arrowSize);
    expect(persist).toHaveBeenCalled();
  });

  it('disables export until source and effective theme match the latest snapshot', async () => {
    vi.useFakeTimers();
    const first = deferred<PreviewRenderResult>();
    const second = deferred<PreviewRenderResult>();
    const themeRenderer = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    mounted = mountApp(root(), {
      initialText: DOCUMENT,
      renderer: themeRenderer,
      renderDelayMs: 0,
    });
    const exportButton = document.querySelector<HTMLButtonElement>('[data-export-svg]')!;
    await vi.advanceTimersByTimeAsync(0);
    first.resolve(previewResult('dark'));
    await Promise.resolve();
    expect(exportButton.disabled).toBe(false);

    document.querySelector<HTMLButtonElement>('[data-style-open]')!.click();
    const arrowSize = document.querySelector<HTMLInputElement>('[data-style-number="arrowSize"]')!;
    arrowSize.value = '18';
    arrowSize.dispatchEvent(new Event('input', { bubbles: true }));
    expect(exportButton.disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    second.resolve(previewResult('custom'));
    await Promise.resolve();
    expect(exportButton.disabled).toBe(false);
  });

  it('opens a non-modal desktop inspector without blocking editor focus', () => {
    mounted = mountApp(root(), { initialText: DOCUMENT, renderer });
    const editor = document.querySelector<HTMLTextAreaElement>('[data-document-input]')!;
    const dialog = document.querySelector<HTMLDialogElement>('[data-style-dialog]')!;
    document.querySelector<HTMLButtonElement>('[data-style-open]')!.click();

    expect(document.querySelector<HTMLElement>('.app-shell')?.dataset.inspectorOpen).toBe('true');
    expect(dialog.open).toBe(false);
    editor.focus();
    expect(document.activeElement).toBe(editor);
  });

  it('keeps the style dialog modal on compact layouts and returns focus to its opener', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    mounted = mountApp(root(), { initialText: DOCUMENT, renderer });
    const opener = document.querySelector<HTMLButtonElement>('[data-style-open]')!;
    opener.click();
    expect(document.querySelector<HTMLDialogElement>('[data-style-dialog]')?.open).toBe(true);
    document.querySelector<HTMLButtonElement>('[data-style-close]')!.click();
    expect(document.activeElement).toBe(opener);
  });

  it('uses labelled bottom navigation and puts sharing in the more menu on compact layouts', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    mounted = mountApp(root(), { initialText: DOCUMENT, renderer });
    const navigation = document.querySelector<HTMLElement>('[data-mobile-navigation]')!;

    expect(navigation.querySelectorAll('button')).toHaveLength(3);
    expect(document.querySelector('[data-mobile-more]')).not.toBeNull();
    expect(document.querySelector('[data-mobile-share]')).not.toBeNull();
  });

  it('uses a distinct adjustment glyph for compact chart styling', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    mounted = mountApp(root(), { initialText: DOCUMENT, renderer });

    expect(document.querySelector('[data-style-open] svg')?.innerHTML).toContain('M4 7h16');
    expect(document.querySelector('[data-mobile-theme] svg')?.innerHTML).not.toContain('M4 7h16');
  });

  it('provides accessible names for every style control', () => {
    mounted = mountApp(root(), { initialText: DOCUMENT, renderer });
    const dialog = document.querySelector<HTMLDialogElement>('[data-style-dialog]')!;
    const content = document.querySelector<HTMLElement>('[data-style-content]')!;
    expect(dialog.getAttribute('aria-labelledby')).toBe('style-title');
    expect(content.querySelector<HTMLButtonElement>('[data-style-close]')?.getAttribute('aria-label')).toBe('关闭图表样式');
    expect(content.querySelectorAll<HTMLInputElement>('[data-style-color]')).toHaveLength(9);
    expect(content.querySelectorAll<HTMLInputElement>('[data-style-number]')).toHaveLength(4);
    expect(content.querySelectorAll<HTMLButtonElement>('[data-style-option]')).toHaveLength(3);

    for (const control of content.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')) {
      const label = control.labels?.[0] ?? control.closest('label');
      expect(label?.textContent?.trim(), control.outerHTML).not.toBe('');
    }
  });

  it('applies distinct semantic workbench themes without changing panel geometry', () => {
    mounted = mountApp(root(), { initialText: DOCUMENT, renderer });
    const shell = document.querySelector<HTMLElement>('.app-shell')!;
    expect(getComputedStyle(shell).getPropertyValue('--surface-canvas').trim()).toBe('#08090f');

    document.querySelector<HTMLButtonElement>('[data-theme-option="light"]')!.click();
    expect(getComputedStyle(shell).getPropertyValue('--surface-canvas').trim()).toBe('#f4f2ed');
    expect(getComputedStyle(document.querySelector<HTMLElement>('.workspace')!).getPropertyValue('--list-width').trim()).toBe('168px');
  });
});
