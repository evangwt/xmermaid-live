import { encodeShareState, exportDiagram, type ExportRequest } from 'xmermaid/editor';
import type { ArrowStyle, CurveStyle, SourceRange, ThemeColors } from 'xmermaid';
import type { PreviewRenderer, PreviewSnapshot } from './preview-runtime';
import { PreviewRuntime } from './preview-runtime';
import { createRenderSource } from './render-source';
import {
  createWorkspaceDocument,
  replaceSelectedDiagramSource,
  selectWorkspaceDiagram,
  selectedDiagram,
  setWorkspaceText,
} from './document-model';
import {
  DEFAULT_LAYOUT_PREFERENCES,
  adjustWorkspaceDivider,
  resolveWorkspaceLayout,
  toggleListCollapsed,
  type WorkspaceDivider,
  type WorkspaceLayoutPreferences,
} from './layout-preferences';
import { icon } from './icons';
import {
  fitCanvasViewport,
  panCanvasViewport,
  viewportForDiagram,
  viewportTransform,
  zoomCanvasViewport,
  type CanvasSize,
  type CanvasViewport,
} from './canvas-viewport';
import {
  DEFAULT_THEME_PREFERENCES,
  THEME_FONT_FAMILIES,
  resolveDiagramTheme,
  themeSignature,
  type DiagramStyleOverrides,
  type ThemePreferences,
  type WorkspaceTheme,
} from './theme';

export interface AppOptions {
  initialText: string;
  initialSelectedIndex?: number;
  renderer?: PreviewRenderer;
  renderDelayMs?: number;
  exporter?: (request: ExportRequest) => Promise<Blob>;
  saveBlob?: (blob: Blob, fileName: string) => void;
  initialThemePreferences?: ThemePreferences;
  persistThemePreferences?: (preferences: ThemePreferences) => void;
  initialLayoutPreferences?: WorkspaceLayoutPreferences;
  persistLayoutPreferences?: (preferences: WorkspaceLayoutPreferences) => void;
}

export interface MountedApp {
  destroy(): void;
}

const SHELL = `
  <div class="app-shell" data-mobile-panel="edit" data-workspace-theme="dark">
    <header class="topbar">
      <div class="brand"><strong>xmermaid</strong><span>live</span></div>
      <div class="topbar-actions" data-toolbar>
        <span class="action-status" data-action-status aria-live="polite"></span>
        <div class="theme-switch" role="group" aria-label="工作台主题">
          <button type="button" data-theme-option="dark" aria-pressed="true">深色</button>
          <button type="button" data-theme-option="light" aria-pressed="false">浅色</button>
        </div>
        <button type="button" data-style-open aria-haspopup="dialog">图表样式</button>
        <button type="button" data-share>分享</button>
        <details class="export-menu">
          <summary>导出</summary>
          <div class="export-options">
            <button type="button" data-export-svg disabled>下载 SVG</button>
            <button type="button" data-export-png disabled>下载 PNG</button>
          </div>
        </details>
      </div>
    </header>
    <nav class="mobile-nav" aria-label="工作区面板">
      <button type="button" data-mobile-target="list">图表</button>
      <button type="button" data-mobile-target="edit">编辑</button>
      <button type="button" data-mobile-target="preview">预览</button>
    </nav>
    <div class="workspace">
      <aside class="diagram-panel" data-panel="list" aria-label="图表列表">
        <div class="panel-heading"><h2>图表</h2><span data-diagram-count></span><button type="button" class="quiet-icon-button" data-list-collapse aria-label="收起图表列表">${icon('chevron-left')}</button></div>
        <div class="diagram-list" data-diagram-list></div>
      </aside>
      <div class="workspace-divider" data-workspace-divider="list" role="separator" aria-orientation="vertical" aria-label="调整图表列表宽度" tabindex="0"></div>
      <section class="editor-panel" data-panel="edit">
        <div class="editor-tabs" role="tablist" aria-label="编辑内容">
          <button type="button" role="tab" id="document-editor-tab" aria-controls="document-editor-panel" data-editor-tab="document">完整文本</button>
          <button type="button" role="tab" id="diagram-editor-tab" aria-controls="diagram-editor-panel" data-editor-tab="diagram">当前图表</button>
        </div>
        <label class="editor-surface" id="document-editor-panel" role="tabpanel" aria-labelledby="document-editor-tab" data-editor-surface="document">
          <span class="sr-only">完整文本</span>
          <textarea data-document-input aria-label="完整文本" spellcheck="false"></textarea>
        </label>
        <label class="editor-surface" id="diagram-editor-panel" role="tabpanel" aria-labelledby="diagram-editor-tab" data-editor-surface="diagram" hidden>
          <span class="sr-only">当前图表</span>
          <textarea data-diagram-input aria-label="当前图表" spellcheck="false"></textarea>
        </label>
      </section>
      <div class="workspace-divider" data-workspace-divider="editor" role="separator" aria-orientation="vertical" aria-label="调整编辑器与预览宽度" tabindex="0"></div>
      <section class="preview-panel" data-panel="preview" aria-label="实时预览">
        <div class="panel-heading"><h2>预览</h2><span data-preview-status></span><div class="preview-actions" role="group" aria-label="预览画布"><button type="button" class="quiet-icon-button" data-preview-zoom="out" aria-label="缩小预览" title="缩小预览">${icon('minus')}</button><button type="button" class="quiet-icon-button" data-preview-fit aria-label="适配预览" title="适配预览">${icon('fit')}</button><button type="button" class="quiet-icon-button" data-preview-zoom="in" aria-label="放大预览" title="放大预览">${icon('plus')}</button><button type="button" class="quiet-icon-button" data-preview-fullscreen aria-label="全屏预览" title="全屏预览">${icon('maximize')}</button><button type="button" class="quiet-icon-button" data-preview-maximize-exit aria-label="退出最大化预览" title="退出最大化预览">${icon('chevron-right')}</button></div></div>
        <div class="preview-canvas" data-preview-canvas><div class="preview-stage" data-preview-stage data-viewport-mode="fit" data-preview></div></div>
      </section>
    </div>
    <section class="diagnostics diagnostics-bar" data-diagnostics aria-live="polite" aria-atomic="true"></section>
    <dialog class="style-drawer" data-style-dialog aria-labelledby="style-title">
      <header class="style-drawer-header">
        <h2 id="style-title">图表样式</h2>
        <button type="button" class="icon-button" data-style-close aria-label="关闭图表样式">×</button>
      </header>
      <div class="style-drawer-body" data-style-body>
        <fieldset>
          <legend>主题</legend>
          <div class="theme-switch theme-switch-drawer" role="group" aria-label="图表基础主题">
            <button type="button" data-theme-option="dark" aria-pressed="true">深色</button>
            <button type="button" data-theme-option="light" aria-pressed="false">浅色</button>
          </div>
        </fieldset>
        <fieldset>
          <legend>颜色</legend>
          <div class="color-controls">
            <label class="style-control"><span>画布</span><input type="color" data-style-color="background"></label>
            <label class="style-control"><span>节点</span><input type="color" data-style-color="nodeFill"></label>
            <label class="style-control"><span>节点描边</span><input type="color" data-style-color="nodeStroke"></label>
            <label class="style-control"><span>节点文字</span><input type="color" data-style-color="nodeText"></label>
            <label class="style-control"><span>连线</span><input type="color" data-style-color="edgeStroke"></label>
            <label class="style-control"><span>连线标签</span><input type="color" data-style-color="edgeLabel"></label>
            <label class="style-control"><span>箭头颜色</span><input type="color" data-style-color="arrowFill"></label>
            <label class="style-control"><span>子图</span><input type="color" data-style-color="subgraphFill"></label>
            <label class="style-control"><span>子图描边</span><input type="color" data-style-color="subgraphStroke"></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>几何</legend>
          <div class="style-control style-control-stack" data-style-row="curveStyle">
            <span>曲线</span>
            <div class="segmented-control" role="group" aria-label="曲线样式">
              <button type="button" data-style-option="bezier" aria-pressed="true">贝塞尔</button>
              <button type="button" data-style-option="step" aria-pressed="false">折线</button>
              <button type="button" data-style-option="straight" aria-pressed="false">直线</button>
            </div>
          </div>
          <label class="style-control" data-style-row="arrowStyle"><span>箭头类型</span>
            <select data-style-select="arrowStyle">
              <option value="filled">实心</option><option value="triangle">三角</option>
              <option value="open">开放</option><option value="circle">圆形</option><option value="cross">交叉</option>
            </select>
          </label>
          <label class="style-control range-control" data-style-row="edgeGap"><span>箭头与节点间距</span><output data-style-output="edgeGap"></output><input type="range" min="0" max="24" step="1" aria-label="箭头与节点间距" data-style-number="edgeGap"></label>
          <label class="style-control range-control" data-style-row="arrowSize"><span>箭头大小</span><output data-style-output="arrowSize"></output><input type="range" min="4" max="32" step="1" aria-label="箭头大小" data-style-number="arrowSize"></label>
          <label class="style-control range-control" data-style-row="nodeBorderRadius"><span>节点圆角</span><output data-style-output="nodeBorderRadius"></output><input type="range" min="0" max="24" step="1" aria-label="节点圆角" data-style-number="nodeBorderRadius"></label>
        </fieldset>
        <fieldset>
          <legend>文字</legend>
          <label class="style-control" data-style-row="fontFamily"><span>字体</span>
            <select data-style-select="fontFamily">
              <option value="sans-serif">系统字体</option>
              <option value="Inter, ui-sans-serif, system-ui, sans-serif">界面字体</option>
              <option value="ui-monospace, SFMono-Regular, Consolas, monospace">等宽字体</option>
            </select>
          </label>
          <label class="style-control range-control" data-style-row="fontSize"><span>字号</span><output data-style-output="fontSize"></output><input type="range" min="10" max="24" step="1" aria-label="字号" data-style-number="fontSize"></label>
        </fieldset>
      </div>
      <footer class="style-drawer-footer" data-style-footer>
        <button type="button" data-style-reset>重置图表样式</button>
      </footer>
    </dialog>
  </div>`;

const MAX_SHARE_HASH_LENGTH = 50_000;
const COMPACT_LAYOUT_QUERY = '(max-width: 1024px)';

export function mountApp(root: HTMLElement, options: AppOptions): MountedApp {
  root.innerHTML = SHELL;
  const shell = required<HTMLElement>(root, '.app-shell');
  const workspace = required<HTMLElement>(root, '.workspace');
  const list = required<HTMLElement>(root, '[data-diagram-list]');
  const count = required<HTMLElement>(root, '[data-diagram-count]');
  const documentInput = required<HTMLTextAreaElement>(root, '[data-document-input]');
  const diagramInput = required<HTMLTextAreaElement>(root, '[data-diagram-input]');
  const preview = required<HTMLElement>(root, '[data-preview]');
  const previewCanvas = required<HTMLElement>(root, '[data-preview-canvas]');
  const previewStage = required<HTMLElement>(root, '[data-preview-stage]');
  const previewPanel = required<HTMLElement>(root, '[data-panel="preview"]');
  const previewStatus = required<HTMLElement>(root, '[data-preview-status]');
  const diagnostics = required<HTMLElement>(root, '[data-diagnostics]');
  const actionStatus = required<HTMLElement>(root, '[data-action-status]');
  const shareButton = required<HTMLButtonElement>(root, '[data-share]');
  const exportSvgButton = required<HTMLButtonElement>(root, '[data-export-svg]');
  const exportPngButton = required<HTMLButtonElement>(root, '[data-export-png]');
  const styleOpenButton = required<HTMLButtonElement>(root, '[data-style-open]');
  const styleCloseButton = required<HTMLButtonElement>(root, '[data-style-close]');
  const styleDialog = required<HTMLDialogElement>(root, '[data-style-dialog]');
  const styleResetButton = required<HTMLButtonElement>(root, '[data-style-reset]');
  const listCollapseButton = required<HTMLButtonElement>(root, '[data-list-collapse]');
  const previewFitButton = required<HTMLButtonElement>(root, '[data-preview-fit]');
  const previewFullscreenButton = required<HTMLButtonElement>(root, '[data-preview-fullscreen]');
  const previewMaximizeExitButton = required<HTMLButtonElement>(root, '[data-preview-maximize-exit]');
  const exporter = options.exporter ?? exportDiagram;
  const saveBlob = options.saveBlob ?? downloadBlob;
  let state = createWorkspaceDocument(options.initialText, options.initialSelectedIndex ?? 0);
  let activeEditor: 'document' | 'diagram' = 'document';
  let snapshot: PreviewSnapshot | null = null;
  let renderedListSignature: string | null = null;
  let preferences = cloneThemePreferences(options.initialThemePreferences ?? DEFAULT_THEME_PREFERENCES);
  let effectiveTheme = resolveDiagramTheme(preferences);
  let layoutPreferences = options.initialLayoutPreferences ?? DEFAULT_LAYOUT_PREFERENCES;
  const viewportCache = new Map<string, CanvasViewport>();
  const animationFrames = new Set<number>();
  let activeViewport: CanvasViewport = { mode: 'fit', scale: 1, offsetX: 0, offsetY: 0 };
  let resizeObserver: ResizeObserver | null = null;
  let panningPointerId: number | null = null;
  let panningPosition: { x: number; y: number } | null = null;
  shell.dataset.workspaceTheme = preferences.workspace;

  const runtime = new PreviewRuntime(
    options.renderer ?? createRenderSource(),
    next => {
      snapshot = next;
      renderPreview();
    },
    options.renderDelayMs,
  );

  shareButton.addEventListener('click', () => {
    if (state.text.length > MAX_SHARE_HASH_LENGTH) {
      actionStatus.textContent = '文本过长，无法生成可靠的分享链接。';
      return;
    }
    try {
      const current = selectedDiagram(state);
      const hash = encodeShareState(state.text, current?.id ?? null);
      if (hash.length > MAX_SHARE_HASH_LENGTH) {
        actionStatus.textContent = '文本过长，无法生成可靠的分享链接。';
        return;
      }
      window.location.hash = hash;
      actionStatus.textContent = '分享内容已写入地址栏。';
    } catch (error) {
      actionStatus.textContent = `生成分享链接失败：${error instanceof Error ? error.message : String(error)}`;
    }
  });
  exportSvgButton.addEventListener('click', () => void exportCurrent('svg'));
  exportPngButton.addEventListener('click', () => void exportCurrent('png'));
  styleOpenButton.addEventListener('click', () => styleDialog.showModal());
  styleCloseButton.addEventListener('click', () => styleDialog.close());
  styleDialog.addEventListener('close', () => styleOpenButton.focus());
  styleResetButton.addEventListener('click', () => {
    applyThemePreferences({ ...preferences, overrides: {} });
  });
  listCollapseButton.addEventListener('click', () => {
    applyLayoutPreferences(toggleListCollapsed(layoutPreferences), true);
  });

  for (const divider of root.querySelectorAll<HTMLElement>('[data-workspace-divider]')) {
    const kind = divider.dataset.workspaceDivider as WorkspaceDivider;
    if (kind !== 'list' && kind !== 'editor') continue;
    bindWorkspaceDivider(divider, kind);
  }

  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-preview-zoom]')) {
    button.addEventListener('click', () => {
      setActiveViewport(zoomCanvasViewport(
        activeViewport,
        previewContentSize(),
        previewContainerSize(),
        activeViewport.scale * (button.dataset.previewZoom === 'out' ? 1 / 1.2 : 1.2),
      ));
    });
  }
  previewFitButton.addEventListener('click', refitActiveViewport);
  previewFullscreenButton.addEventListener('click', () => void togglePreviewFullscreen());
  previewMaximizeExitButton.addEventListener('click', () => setPreviewMaximized(false));
  previewCanvas.addEventListener('wheel', event => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const multiplier = event.deltaY < 0 ? 1.2 : 1 / 1.2;
    setActiveViewport(zoomCanvasViewport(
      activeViewport,
      previewContentSize(),
      previewContainerSize(),
      activeViewport.scale * multiplier,
    ));
  }, { passive: false });
  previewCanvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest('button'))) return;
    panningPointerId = event.pointerId;
    panningPosition = { x: event.clientX, y: event.clientY };
    previewCanvas.setPointerCapture(event.pointerId);
    previewCanvas.dataset.panning = 'true';
  });
  previewCanvas.addEventListener('pointermove', event => {
    if (panningPointerId !== event.pointerId || !panningPosition) return;
    setActiveViewport(panCanvasViewport(
      activeViewport,
      previewContentSize(),
      previewContainerSize(),
      event.clientX - panningPosition.x,
      event.clientY - panningPosition.y,
    ));
    panningPosition = { x: event.clientX, y: event.clientY };
  });
  const endPan = (event: PointerEvent) => {
    if (panningPointerId !== event.pointerId) return;
    if (previewCanvas.hasPointerCapture(event.pointerId)) previewCanvas.releasePointerCapture(event.pointerId);
    panningPointerId = null;
    panningPosition = null;
    delete previewCanvas.dataset.panning;
  };
  previewCanvas.addEventListener('pointerup', endPan);
  previewCanvas.addEventListener('pointercancel', endPan);

  const handleWindowResize = () => {
    if (activeViewport.mode === 'fit') refitActiveViewport();
  };
  const handleFullscreenChange = () => {
    const fullscreen = document.fullscreenElement === previewPanel;
    previewFullscreenButton.setAttribute('aria-label', fullscreen ? '退出全屏预览' : '全屏预览');
    previewFullscreenButton.title = fullscreen ? '退出全屏预览' : '全屏预览';
  };
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(handleWindowResize);
    resizeObserver.observe(previewCanvas);
  } else {
    window.addEventListener('resize', handleWindowResize);
  }
  document.addEventListener('fullscreenchange', handleFullscreenChange);

  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-theme-option]')) {
    button.addEventListener('click', () => {
      const workspace = button.dataset.themeOption as WorkspaceTheme;
      if (workspace !== 'dark' && workspace !== 'light') return;
      applyThemePreferences({ ...preferences, workspace });
    });
  }
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-style-option]')) {
    button.addEventListener('click', () => {
      const curveStyle = button.dataset.styleOption as CurveStyle;
      if (!['bezier', 'step', 'straight'].includes(curveStyle)) return;
      updateStyleOverride('curveStyle', curveStyle);
    });
  }
  for (const input of root.querySelectorAll<HTMLInputElement>('[data-style-color]')) {
    input.addEventListener('input', () => {
      const key = input.dataset.styleColor as keyof ThemeColors;
      applyThemePreferences({
        ...preferences,
        overrides: {
          ...preferences.overrides,
          colors: { ...preferences.overrides.colors, [key]: input.value },
        },
      });
    });
  }
  for (const input of root.querySelectorAll<HTMLInputElement>('[data-style-number]')) {
    input.addEventListener('input', () => {
      const key = input.dataset.styleNumber as NumericStyleKey;
      updateStyleOverride(key, input.valueAsNumber);
    });
  }
  for (const select of root.querySelectorAll<HTMLSelectElement>('[data-style-select]')) {
    select.addEventListener('change', () => {
      if (select.dataset.styleSelect === 'arrowStyle') {
        updateStyleOverride('arrowStyle', select.value as ArrowStyle);
      } else if (select.dataset.styleSelect === 'fontFamily' && THEME_FONT_FAMILIES.includes(select.value as typeof THEME_FONT_FAMILIES[number])) {
        updateStyleOverride('fontFamily', select.value);
      }
    });
  }

  documentInput.addEventListener('input', () => {
    state = setWorkspaceText(state, documentInput.value);
    renderDocument();
  });
  diagramInput.addEventListener('input', () => {
    state = replaceSelectedDiagramSource(state, diagramInput.value);
    renderDocument();
  });
  list.addEventListener('click', event => {
    const button = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>('[data-diagram-item]')
      : null;
    const index = Number(button?.dataset.diagramIndex);
    if (!Number.isInteger(index)) return;
    state = selectWorkspaceDiagram(state, index);
    activeEditor = 'diagram';
    shell.dataset.mobilePanel = 'edit';
    renderDocument();
    renderMobileNavigation();
    if (typeof window.matchMedia === 'function' && window.matchMedia(COMPACT_LAYOUT_QUERY).matches) {
      diagramInput.focus();
    }
  });

  for (const tab of root.querySelectorAll<HTMLButtonElement>('[data-editor-tab]')) {
    tab.addEventListener('click', () => {
      activateEditorTab(tab);
    });
    tab.addEventListener('keydown', event => {
      const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-editor-tab]')];
      const currentIndex = tabs.indexOf(tab);
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : event.key === 'ArrowRight'
            ? (currentIndex + 1) % tabs.length
            : event.key === 'ArrowLeft'
              ? (currentIndex - 1 + tabs.length) % tabs.length
              : -1;
      if (nextIndex < 0) return;
      event.preventDefault();
      const nextTab = tabs[nextIndex];
      if (!nextTab) return;
      activateEditorTab(nextTab);
      nextTab.focus();
    });
  }

  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-mobile-target]')) {
    button.addEventListener('click', () => {
      shell.dataset.mobilePanel = button.dataset.mobileTarget ?? 'edit';
      renderMobileNavigation();
    });
  }

  function renderDocument(): void {
    syncValue(documentInput, state.text);
    const current = selectedDiagram(state);
    syncValue(diagramInput, current?.source ?? '');
    diagramInput.disabled = !current;
    count.textContent = String(state.document.diagrams.length);
    renderList();
    renderEditors();
    runtime.request(current?.source ?? null, effectiveTheme);
  }

  function renderList(): void {
    const signature = JSON.stringify(state.document.diagrams.map(diagram => [
      diagramTypeLabel(diagram.source),
      diagram.range.startLine,
    ]));
    if (signature === renderedListSignature) {
      for (const [index, button] of [...list.querySelectorAll<HTMLButtonElement>('[data-diagram-item]')].entries()) {
        button.setAttribute('aria-current', String(index === state.selectedIndex));
      }
      return;
    }
    renderedListSignature = signature;
    list.replaceChildren();
    if (state.document.diagrams.length === 0) {
      const empty = document.createElement('p');
      empty.dataset.emptyList = '';
      empty.textContent = '没有找到图表。请粘贴 ```mermaid fenced block 或一张裸 flowchart。';
      list.append(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    state.document.diagrams.forEach((diagram, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.diagramItem = '';
      button.dataset.diagramIndex = String(index);
      button.className = 'diagram-item';
      button.setAttribute('aria-current', index === state.selectedIndex ? 'true' : 'false');
      const title = document.createElement('strong');
      title.textContent = `图表 ${index + 1}`;
      const meta = document.createElement('span');
      meta.textContent = `${diagramTypeLabel(diagram.source)} · 第 ${diagram.range.startLine} 行`;
      button.append(title, meta);
      fragment.append(button);
    });
    list.append(fragment);
  }

  function renderEditors(): void {
    for (const tab of root.querySelectorAll<HTMLButtonElement>('[data-editor-tab]')) {
      const selected = tab.dataset.editorTab === activeEditor;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    for (const surface of root.querySelectorAll<HTMLElement>('[data-editor-surface]')) {
      surface.hidden = surface.dataset.editorSurface !== activeEditor;
    }
  }

  function activateEditorTab(tab: HTMLButtonElement): void {
    activeEditor = tab.dataset.editorTab === 'diagram' ? 'diagram' : 'document';
    renderEditors();
  }

  function renderMobileNavigation(): void {
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-mobile-target]')) {
      button.setAttribute('aria-pressed', String(button.dataset.mobileTarget === shell.dataset.mobilePanel));
    }
  }

  function renderPreview(): void {
    if (!snapshot) return;
    previewStatus.textContent = snapshot.status === 'ready'
      ? '已更新'
      : snapshot.status === 'rendering'
        ? '渲染中'
        : snapshot.status === 'error'
          ? '预览未更新'
          : '等待图表';
    if (snapshot.svg) preview.replaceChildren(snapshot.svg);
    else preview.replaceChildren(emptyPreview(snapshot.status === 'idle'));

    diagnostics.replaceChildren();
    if (snapshot.status === 'error' && snapshot.message && snapshot.diagnostics.length === 0) {
      diagnostics.append(diagnosticItem('render_error', snapshot.message));
    }
    for (const diagnostic of snapshot.diagnostics) {
      diagnostics.append(diagnosticItem(diagnostic.code, diagnostic.message, diagnostic.range));
    }
    if (snapshot.status === 'ready' && snapshot.diagnostics.length === 0) {
      diagnostics.append(diagnosticItem('ok', '没有诊断。'));
    }

    const current = selectedDiagram(state);
    const canExport = Boolean(
      current
      && snapshot.exportable
      && snapshot.svg
      && snapshot.source === current.source
      && snapshot.themeSignature === themeSignature(effectiveTheme),
    );
    exportSvgButton.disabled = !canExport;
    exportPngButton.disabled = !canExport;
    if (snapshot.svg) {
      const current = selectedDiagram(state);
      activeViewport = viewportForDiagram(viewportCache, current?.id ?? null, previewContentSize(), previewContainerSize());
      applyViewport();
    }
  }

  async function exportCurrent(format: 'svg' | 'png'): Promise<void> {
    const current = selectedDiagram(state);
    const exportThemeSignature = themeSignature(effectiveTheme);
    if (
      !current
      || !snapshot?.exportable
      || !snapshot.svg
      || snapshot.source !== current.source
      || snapshot.themeSignature !== exportThemeSignature
    ) return;
    const exportSource = current.source;
    const exportDiagramId = current.id;
    const exportSvg = snapshot.svg;

    try {
      const fileName = `${current.id}.${format}`;
      const blob = await exporter({
        diagramId: exportDiagramId,
        source: exportSource,
        svg: exportSvg,
        format,
        fileName,
      });
      const latest = selectedDiagram(state);
      if (
        latest?.id !== exportDiagramId
        || latest.source !== exportSource
        || snapshot?.svg !== exportSvg
        || snapshot.source !== exportSource
        || !snapshot.exportable
        || snapshot.themeSignature !== exportThemeSignature
        || themeSignature(effectiveTheme) !== exportThemeSignature
      ) return;
      saveBlob(blob, fileName);
      actionStatus.textContent = `${format.toUpperCase()} 已下载。`;
    } catch (error) {
      actionStatus.textContent = `导出失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  renderThemeControls();
  applyLayoutPreferences(layoutPreferences);
  renderDocument();
  renderMobileNavigation();

  return {
    destroy() {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleWindowResize);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      for (const frame of animationFrames) window.cancelAnimationFrame(frame);
      if (panningPointerId !== null && previewCanvas.hasPointerCapture(panningPointerId)) previewCanvas.releasePointerCapture(panningPointerId);
      runtime.dispose();
      root.replaceChildren();
    },
  };

  function applyThemePreferences(next: ThemePreferences): void {
    preferences = cloneThemePreferences(next);
    effectiveTheme = resolveDiagramTheme(preferences);
    shell.dataset.workspaceTheme = preferences.workspace;
    renderThemeControls();
    options.persistThemePreferences?.(cloneThemePreferences(preferences));
    runtime.request(selectedDiagram(state)?.source ?? null, effectiveTheme);
  }

  function applyLayoutPreferences(next: WorkspaceLayoutPreferences, persist = false): void {
    layoutPreferences = next;
    const layout = resolveWorkspaceLayout(next, workspace.getBoundingClientRect().width);
    shell.dataset.listCollapsed = String(next.listCollapsed);
    workspace.style.setProperty('--list-width', `${layout.listWidth}px`);
    workspace.style.setProperty('--editor-width', `${layout.editorWidth}px`);
    workspace.style.setProperty('--preview-width', `${layout.previewWidth}px`);
    listCollapseButton.setAttribute('aria-label', next.listCollapsed ? '展开图表列表' : '收起图表列表');
    listCollapseButton.innerHTML = icon(next.listCollapsed ? 'chevron-right' : 'chevron-left');
    if (activeViewport.mode === 'fit') refitActiveViewport();
    if (persist) options.persistLayoutPreferences?.(layoutPreferences);
  }

  function bindWorkspaceDivider(divider: HTMLElement, kind: WorkspaceDivider): void {
    let drag: { pointerId: number; startX: number; start: WorkspaceLayoutPreferences; next: WorkspaceLayoutPreferences } | null = null;
    let frame: number | null = null;

    const applyDrag = () => {
      if (frame !== null) animationFrames.delete(frame);
      frame = null;
      if (drag) applyLayoutPreferences(drag.next);
    };
    const endDrag = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
        animationFrames.delete(frame);
        frame = null;
      }
      const next = drag.next;
      if (divider.hasPointerCapture(event.pointerId)) divider.releasePointerCapture(event.pointerId);
      drag = null;
      applyLayoutPreferences(next, true);
    };

    divider.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      drag = { pointerId: event.pointerId, startX: event.clientX, start: layoutPreferences, next: layoutPreferences };
      divider.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    divider.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.next = adjustWorkspaceDivider(drag.start, kind, event.clientX - drag.startX, workspace.getBoundingClientRect().width);
      if (frame === null) {
        frame = window.requestAnimationFrame(applyDrag);
        animationFrames.add(frame);
      }
    });
    divider.addEventListener('pointerup', endDrag);
    divider.addEventListener('pointercancel', endDrag);
    divider.addEventListener('dblclick', () => applyLayoutPreferences(DEFAULT_LAYOUT_PREFERENCES, true));
    divider.addEventListener('keydown', event => {
      const delta = event.shiftKey ? 64 : 16;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        applyLayoutPreferences(adjustWorkspaceDivider(
          layoutPreferences,
          kind,
          event.key === 'ArrowLeft' ? -delta : delta,
          workspace.getBoundingClientRect().width,
        ), true);
      } else if (event.key === 'Home' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        applyLayoutPreferences(DEFAULT_LAYOUT_PREFERENCES, true);
      }
    });
  }

  function previewContentSize(): CanvasSize {
    const svg = preview.querySelector<SVGSVGElement>('svg');
    if (!svg) return { width: 1, height: 1 };
    const viewBox = svg.viewBox?.baseVal;
    const width = viewBox?.width || finiteAttribute(svg, 'width') || 1;
    const height = viewBox?.height || finiteAttribute(svg, 'height') || 1;
    return { width, height };
  }

  function previewContainerSize(): CanvasSize {
    const bounds = previewCanvas.getBoundingClientRect();
    return { width: bounds.width || 1, height: bounds.height || 1 };
  }

  function setActiveViewport(next: CanvasViewport): void {
    activeViewport = next;
    const current = selectedDiagram(state);
    if (next.mode === 'manual' && current) viewportCache.set(current.id, next);
    applyViewport();
  }

  function refitActiveViewport(): void {
    const current = selectedDiagram(state);
    if (current) viewportCache.delete(current.id);
    activeViewport = fitCanvasViewport(previewContentSize(), previewContainerSize());
    applyViewport();
  }

  function applyViewport(): void {
    previewStage.style.transform = viewportTransform(activeViewport);
    previewStage.dataset.viewportMode = activeViewport.mode;
  }

  async function togglePreviewFullscreen(): Promise<void> {
    if (document.fullscreenElement === previewPanel) {
      await document.exitFullscreen?.();
      return;
    }
    try {
      if (typeof previewPanel.requestFullscreen !== 'function') throw new Error('Fullscreen unavailable');
      await previewPanel.requestFullscreen();
    } catch {
      setPreviewMaximized(true);
      actionStatus.textContent = '浏览器未进入全屏，已切换到应用内最大化预览。';
    }
  }

  function setPreviewMaximized(maximized: boolean): void {
    if (maximized) shell.dataset.previewMaximized = 'true';
    else delete shell.dataset.previewMaximized;
  }

  function updateStyleOverride<K extends keyof DiagramStyleOverrides>(
    key: K,
    value: DiagramStyleOverrides[K],
  ): void {
    applyThemePreferences({
      ...preferences,
      overrides: { ...preferences.overrides, [key]: value },
    });
  }

  function renderThemeControls(): void {
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-theme-option]')) {
      button.setAttribute('aria-pressed', String(button.dataset.themeOption === preferences.workspace));
    }
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-style-option]')) {
      button.setAttribute('aria-pressed', String(button.dataset.styleOption === effectiveTheme.curveStyle));
    }
    for (const input of root.querySelectorAll<HTMLInputElement>('[data-style-color]')) {
      const key = input.dataset.styleColor as keyof ThemeColors;
      input.value = effectiveTheme.colors[key];
      markOverridden(input, Boolean(preferences.overrides.colors?.[key]));
    }
    for (const input of root.querySelectorAll<HTMLInputElement>('[data-style-number]')) {
      const key = input.dataset.styleNumber as NumericStyleKey;
      input.value = String(effectiveTheme[key]);
      const output = root.querySelector<HTMLOutputElement>(`[data-style-output="${key}"]`);
      if (output) output.value = String(effectiveTheme[key]);
      markOverridden(input, preferences.overrides[key] !== undefined);
    }
    for (const select of root.querySelectorAll<HTMLSelectElement>('[data-style-select]')) {
      const key = select.dataset.styleSelect;
      if (key === 'arrowStyle') select.value = effectiveTheme.arrowStyle;
      if (key === 'fontFamily') select.value = effectiveTheme.fontFamily;
      markOverridden(select, key ? preferences.overrides[key as keyof DiagramStyleOverrides] !== undefined : false);
    }
    const custom = Object.keys(preferences.overrides).length > 0;
    styleOpenButton.dataset.styleCustom = String(custom);
    styleOpenButton.setAttribute('aria-label', custom ? '图表样式，已自定义' : '图表样式');
    styleResetButton.disabled = !custom;
  }
}

type NumericStyleKey = 'edgeGap' | 'arrowSize' | 'nodeBorderRadius' | 'fontSize';

function cloneThemePreferences(preferences: ThemePreferences): ThemePreferences {
  const overrides: DiagramStyleOverrides = { ...preferences.overrides };
  if (preferences.overrides.colors) overrides.colors = { ...preferences.overrides.colors };
  return {
    version: 1,
    workspace: preferences.workspace,
    overrides,
  };
}

function markOverridden(control: Element, overridden: boolean): void {
  const row = control.closest<HTMLElement>('.style-control');
  if (row) row.dataset.overridden = String(overridden);
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing application element: ${selector}`);
  return element;
}

function syncValue(input: HTMLTextAreaElement, value: string): void {
  if (input.value !== value) input.value = value;
}

function finiteAttribute(element: SVGSVGElement, name: 'width' | 'height'): number {
  const value = Number(element.getAttribute(name));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function diagramTypeLabel(source: string): string {
  return source.trim().split(/\s+/, 1)[0] || 'unknown';
}

function emptyPreview(showGuide: boolean): HTMLElement {
  const empty = document.createElement('p');
  empty.className = 'empty-preview';
  empty.textContent = showGuide ? '选择或粘贴一张 Mermaid flowchart。' : '正在准备预览。';
  return empty;
}

function diagnosticItem(code: string, message: string, range: SourceRange | null = null): HTMLElement {
  const item = document.createElement('p');
  item.className = `diagnostic diagnostic-${code === 'ok' ? 'ok' : 'issue'}`;
  const line = range
    ? range.startLine === range.endLine
      ? `（图内第 ${range.startLine} 行）`
      : `（图内第 ${range.startLine}-${range.endLine} 行）`
    : '';
  item.textContent = `${code}: ${message}${line}`;
  return item;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
