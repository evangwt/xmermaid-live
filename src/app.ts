import { encodeShareState, exportDiagram, type ExportRequest } from '@evangwt/xmermaid/editor';
import { analyzeSupport, type ArrowStyle, type CurveStyle, type SourceRange, type ThemeColors } from '@evangwt/xmermaid';
import type { PreviewRenderer, PreviewSnapshot } from './preview-runtime';
import { PreviewRuntime } from './preview-runtime';
import type { WorkspaceCacheState } from './workspace-cache';
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
import { createTranslator, parseLocale, type Locale, type MessageKey } from './i18n';
import { createCodeEditor, type CodeEditor } from './code-editor';
import { normalizePreviewSvg } from './preview-svg';
import {
  fitCanvasViewport,
  formatCanvasZoom,
  panCanvasViewport,
  viewportForDiagram,
  viewportTransform,
  zoomCanvasViewport,
  zoomCanvasViewportAt,
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
  persistDocumentText?: (text: string) => void;
  initialViewports?: Record<string, CanvasViewport>;
  persistWorkspaceState?: (state: WorkspaceCacheState) => void;
  initialLocale?: Locale;
  persistLocale?: (locale: Locale) => void;
}

export interface MountedApp {
  destroy(): void;
}

const SHELL = `
  <div class="app-shell" data-studio-layout="aurora" data-mobile-panel="edit" data-workspace-theme="dark">
    <header class="topbar">
      <div class="brand" aria-label="xmermaid live">
        <span class="brand-mark" aria-hidden="true">x</span>
        <span class="brand-copy"><strong>xmermaid</strong><span>live</span></span>
        <span class="brand-kicker">DIAGRAM STUDIO</span>
      </div>
      <div class="topbar-actions" data-toolbar>
        <span class="action-status" data-action-status aria-live="polite"></span>
        <select data-locale-select aria-label="界面语言"><option value="zh-CN">简体中文</option><option value="en">English</option></select>
        <div class="theme-switch" role="group" aria-label="工作台主题">
          <button type="button" data-theme-option="dark" aria-pressed="true">深色</button>
          <button type="button" data-theme-option="light" aria-pressed="false">浅色</button>
        </div>
        <button type="button" class="compact-theme-button quiet-icon-button" data-mobile-theme aria-label="切换工作台主题" title="切换工作台主题">${icon('palette')}</button>
        <button type="button" class="style-open-button" data-style-open aria-haspopup="dialog">${icon('sliders')}<span class="toolbar-label">图表样式</span></button>
        <button type="button" data-share>分享</button>
        <details class="export-menu">
          <summary>导出</summary>
          <div class="export-options">
            <button type="button" data-export-svg disabled>下载 SVG</button>
            <button type="button" data-export-png disabled>下载 PNG</button>
          </div>
        </details>
        <details class="mobile-more-menu" data-mobile-more>
          <summary aria-label="更多操作" title="更多操作">${icon('more')}<span class="sr-only">更多操作</span></summary>
          <div class="mobile-more-options">
            <button type="button" data-mobile-share>${icon('share')}<span data-mobile-share-label>分享</span></button>
            <button type="button" data-mobile-export="svg" disabled>${icon('download')}<span data-mobile-export-label="svg">下载 SVG</span></button>
            <button type="button" data-mobile-export="png" disabled>${icon('download')}<span data-mobile-export-label="png">下载 PNG</span></button>
          </div>
        </details>
      </div>
    </header>
    <div class="workspace">
      <aside class="diagram-panel" data-panel="list" aria-label="图表列表">
        <div class="panel-heading"><h2>图表</h2><span data-diagram-count></span><button type="button" class="quiet-icon-button" data-list-collapse aria-label="收起图表列表">${icon('chevron-left')}</button></div>
        <div class="diagram-list" data-diagram-list></div>
      </aside>
      <button type="button" class="list-restore-button quiet-icon-button" data-list-restore aria-label="展开图表列表" title="展开图表列表">${icon('chevron-right')}</button>
      <div class="workspace-divider" data-workspace-divider="list" role="separator" aria-orientation="vertical" aria-label="调整图表列表宽度" tabindex="0"></div>
      <section class="editor-panel" data-panel="edit">
        <div class="editor-tabs" role="tablist" aria-label="编辑内容">
          <button type="button" role="tab" id="document-editor-tab" aria-controls="document-editor-panel" data-editor-tab="document">完整文本</button>
          <button type="button" role="tab" id="diagram-editor-tab" aria-controls="diagram-editor-panel" data-editor-tab="diagram">当前图表</button>
        </div>
        <div class="editor-surface" id="document-editor-panel" role="tabpanel" aria-labelledby="document-editor-tab" data-editor-surface="document">
          <span class="sr-only">完整文本</span>
          <textarea class="editor-proxy" data-document-input aria-hidden="true" tabindex="-1" spellcheck="false"></textarea>
          <div class="code-editor-host" data-document-editor></div>
        </div>
        <div class="editor-surface" id="diagram-editor-panel" role="tabpanel" aria-labelledby="diagram-editor-tab" data-editor-surface="diagram" hidden>
          <span class="sr-only">当前图表</span>
          <textarea class="editor-proxy" data-diagram-input aria-hidden="true" tabindex="-1" spellcheck="false"></textarea>
          <div class="code-editor-host" data-diagram-editor></div>
        </div>
      </section>
      <div class="workspace-divider" data-workspace-divider="editor" role="separator" aria-orientation="vertical" aria-label="调整编辑器与预览宽度" tabindex="0"></div>
      <section class="preview-panel" data-panel="preview" aria-label="实时预览">
        <div class="panel-heading"><h2>预览</h2><span data-preview-status></span><div class="preview-navigation" role="group"><button type="button" class="quiet-icon-button" data-preview-previous>${icon('chevron-left')}</button><span data-preview-position></span><button type="button" class="quiet-icon-button" data-preview-next>${icon('chevron-right')}</button></div></div>
        <div class="preview-content-grid"><div class="preview-canvas" data-preview-canvas data-preview-priority="primary" aria-label="图表画布"><div class="preview-actions preview-canvas-controls" data-preview-controls role="group" aria-label="画布视图控制"><output data-preview-zoom-value>100%</output><button type="button" class="quiet-icon-button" data-preview-zoom="out" aria-label="缩小预览" title="缩小预览">${icon('minus')}</button><button type="button" class="quiet-icon-button" data-preview-fit aria-label="适配预览" title="适配预览">${icon('fit')}</button><button type="button" class="quiet-icon-button" data-preview-zoom="in" aria-label="放大预览" title="放大预览">${icon('plus')}</button><button type="button" class="quiet-icon-button" data-preview-fullscreen aria-label="全屏预览" title="全屏预览">${icon('maximize')}</button></div><div class="preview-stage" data-preview-stage data-viewport-mode="fit" data-preview></div><div class="preview-minimap" data-preview-minimap aria-hidden="true"></div></div><aside class="preview-inspector" data-style-desktop-host aria-label="图表样式"><div class="style-inspector-content" data-style-content><header class="style-inspector-header"><h2 id="style-title">图表样式</h2><button type="button" class="icon-button" data-style-close aria-label="关闭图表样式"><span class="style-close-desktop">×</span><span class="style-close-compact">完成</span></button></header><div class="style-drawer-body" data-style-body><fieldset><legend>主题</legend><div class="theme-switch theme-switch-drawer" role="group" aria-label="图表基础主题"><button type="button" data-theme-option="dark" aria-pressed="true">深色</button><button type="button" data-theme-option="light" aria-pressed="false">浅色</button></div></fieldset><fieldset><legend>颜色</legend><div class="color-controls"><label class="style-control"><span>画布</span><input type="color" data-style-color="background"></label><label class="style-control"><span>节点</span><input type="color" data-style-color="nodeFill"></label><label class="style-control"><span>节点描边</span><input type="color" data-style-color="nodeStroke"></label><label class="style-control"><span>连线</span><input type="color" data-style-color="edgeStroke"></label><label class="style-control"><span>箭头颜色</span><input type="color" data-style-color="arrowFill"></label></div><details data-style-advanced-colors><summary>更多颜色</summary><div class="color-controls"><label class="style-control"><span>节点文字</span><input type="color" data-style-color="nodeText"></label><label class="style-control"><span>连线标签</span><input type="color" data-style-color="edgeLabel"></label><label class="style-control"><span>子图</span><input type="color" data-style-color="subgraphFill"></label><label class="style-control"><span>子图描边</span><input type="color" data-style-color="subgraphStroke"></label></div></details></fieldset><fieldset><legend>几何</legend><div class="style-control style-control-stack" data-style-row="curveStyle"><span>曲线</span><div class="segmented-control" role="group" aria-label="曲线样式"><button type="button" data-style-option="bezier" aria-pressed="true">贝塞尔</button><button type="button" data-style-option="step" aria-pressed="false">折线</button><button type="button" data-style-option="straight" aria-pressed="false">直线</button></div></div><label class="style-control" data-style-row="arrowStyle"><span>箭头类型</span><select data-style-select="arrowStyle"><option value="filled">实心</option><option value="triangle">三角</option><option value="open">开放</option><option value="circle">圆形</option><option value="cross">交叉</option></select></label><label class="style-control range-control" data-style-row="edgeGap"><span>箭头与节点间距</span><output data-style-output="edgeGap"></output><input type="range" min="0" max="24" step="1" aria-label="箭头与节点间距" data-style-number="edgeGap"></label><label class="style-control range-control" data-style-row="arrowSize"><span>箭头大小</span><output data-style-output="arrowSize"></output><input type="range" min="4" max="32" step="1" aria-label="箭头大小" data-style-number="arrowSize"></label><label class="style-control range-control" data-style-row="nodeBorderRadius"><span>节点圆角</span><output data-style-output="nodeBorderRadius"></output><input type="range" min="0" max="24" step="1" aria-label="节点圆角" data-style-number="nodeBorderRadius"></label></fieldset><details data-style-advanced-text><summary>文字与字体</summary><label class="style-control" data-style-row="fontFamily"><span>字体</span><select data-style-select="fontFamily"><option value="sans-serif">系统字体</option><option value="Inter, ui-sans-serif, system-ui, sans-serif">界面字体</option><option value="ui-monospace, SFMono-Regular, Consolas, monospace">等宽字体</option></select></label><label class="style-control range-control" data-style-row="fontSize"><span>字号</span><output data-style-output="fontSize"></output><input type="range" min="10" max="24" step="1" aria-label="字号" data-style-number="fontSize"></label></details></div><footer class="style-drawer-footer" data-style-footer><button type="button" data-style-reset>重置图表样式</button></footer></div></aside></div>
      </section>
    </div>
    <section class="diagnostics diagnostics-bar" data-diagnostics aria-live="polite" aria-atomic="true"></section>
    <nav class="mobile-nav" data-mobile-navigation aria-label="工作区面板">
      <button type="button" data-mobile-target="list">${icon('diagram')}<span>图表</span></button>
      <button type="button" data-mobile-target="edit">${icon('edit')}<span>编辑</span></button>
      <button type="button" data-mobile-target="preview">${icon('preview')}<span>预览</span><span class="mobile-diagnostic-dot" aria-hidden="true"></span></button>
    </nav>
    <dialog class="style-drawer" data-style-dialog aria-labelledby="style-title"><div data-style-mobile-host></div></dialog>
  </div>`;

const MAX_SHARE_HASH_LENGTH = 50_000;
const COMPACT_LAYOUT_QUERY = '(max-width: 1024px)';

export function mountApp(root: HTMLElement, options: AppOptions): MountedApp {
  const originalDocumentLanguage = document.documentElement.lang;
  let locale = options.initialLocale ?? 'en';
  let translator = createTranslator(locale);
  const t = (key: MessageKey, values?: Record<string, string | number>) => translator.text(key, values);
  root.innerHTML = SHELL;
  const shell = required<HTMLElement>(root, '.app-shell');
  const workspace = required<HTMLElement>(root, '.workspace');
  const list = required<HTMLElement>(root, '[data-diagram-list]');
  const count = required<HTMLElement>(root, '[data-diagram-count]');
  const documentInput = required<HTMLTextAreaElement>(root, '[data-document-input]');
  const diagramInput = required<HTMLTextAreaElement>(root, '[data-diagram-input]');
  const documentEditorHost = required<HTMLElement>(root, '[data-document-editor]');
  const diagramEditorHost = required<HTMLElement>(root, '[data-diagram-editor]');
  const preview = required<HTMLElement>(root, '[data-preview]');
  const previewCanvas = required<HTMLElement>(root, '[data-preview-canvas]');
  const previewStage = required<HTMLElement>(root, '[data-preview-stage]');
  const previewPanel = required<HTMLElement>(root, '[data-panel="preview"]');
  const previewStatus = required<HTMLElement>(root, '[data-preview-status]');
  const diagnostics = required<HTMLElement>(root, '[data-diagnostics]');
  const actionStatus = required<HTMLElement>(root, '[data-action-status]');
  const localeSelect = required<HTMLSelectElement>(root, '[data-locale-select]');
  const shareButton = required<HTMLButtonElement>(root, '[data-share]');
  const mobileShareButton = required<HTMLButtonElement>(root, '[data-mobile-share]');
  const exportSvgButton = required<HTMLButtonElement>(root, '[data-export-svg]');
  const exportPngButton = required<HTMLButtonElement>(root, '[data-export-png]');
  const mobileExportSvgButton = required<HTMLButtonElement>(root, '[data-mobile-export="svg"]');
  const mobileExportPngButton = required<HTMLButtonElement>(root, '[data-mobile-export="png"]');
  const styleOpenButton = required<HTMLButtonElement>(root, '[data-style-open]');
  const styleCloseButton = required<HTMLButtonElement>(root, '[data-style-close]');
  const styleDialog = required<HTMLDialogElement>(root, '[data-style-dialog]');
  const styleContent = required<HTMLElement>(root, '[data-style-content]');
  const styleDesktopHost = required<HTMLElement>(root, '[data-style-desktop-host]');
  const styleMobileHost = required<HTMLElement>(root, '[data-style-mobile-host]');
  const compactMediaQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia(COMPACT_LAYOUT_QUERY)
    : null;
  const styleResetButton = required<HTMLButtonElement>(root, '[data-style-reset]');
  const listCollapseButton = required<HTMLButtonElement>(root, '[data-list-collapse]');
  const listRestoreButton = required<HTMLButtonElement>(root, '[data-list-restore]');
  const mobileThemeButton = required<HTMLButtonElement>(root, '[data-mobile-theme]');
  const previewFitButton = required<HTMLButtonElement>(root, '[data-preview-fit]');
  const previewFullscreenButton = required<HTMLButtonElement>(root, '[data-preview-fullscreen]');
  const previewPreviousButton = required<HTMLButtonElement>(root, '[data-preview-previous]');
  const previewNextButton = required<HTMLButtonElement>(root, '[data-preview-next]');
  const previewPosition = required<HTMLElement>(root, '[data-preview-position]');
  const previewZoomValue = required<HTMLOutputElement>(root, '[data-preview-zoom-value]');
  const previewMinimap = required<HTMLElement>(root, '[data-preview-minimap]');
  const exporter = options.exporter ?? exportDiagram;
  const saveBlob = options.saveBlob ?? downloadBlob;
  let state = createWorkspaceDocument(options.initialText, options.initialSelectedIndex ?? 0);
  let activeEditor: 'document' | 'diagram' = 'document';
  let snapshot: PreviewSnapshot | null = null;
  let renderedListSignature: string | null = null;
  let listRenderFrame: number | null = null;
  let preferences = cloneThemePreferences(options.initialThemePreferences ?? DEFAULT_THEME_PREFERENCES);
  let effectiveTheme = resolveDiagramTheme(preferences);
  let layoutPreferences = options.initialLayoutPreferences ?? DEFAULT_LAYOUT_PREFERENCES;
  const viewportCache = new Map<string, CanvasViewport>(Object.entries(options.initialViewports ?? {}));
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
  const documentEditor = createSourceEditor(documentEditorHost, state.text, 'markdown', 'editor.document', updateDocumentText);
  const diagramEditor = createSourceEditor(diagramEditorHost, selectedDiagram(state)?.source ?? '', 'mermaid', 'editor.diagram', updateDiagramSource);

  const shareCurrent = () => {
    if (state.text.length > MAX_SHARE_HASH_LENGTH) {
      actionStatus.textContent = t('status.shareTooLong');
      return;
    }
    try {
      const current = selectedDiagram(state);
      const hash = encodeShareState(state.text, current?.id ?? null);
      if (hash.length > MAX_SHARE_HASH_LENGTH) {
        actionStatus.textContent = t('status.shareTooLong');
        return;
      }
      window.location.hash = hash;
      actionStatus.textContent = t('status.shareSuccess');
    } catch (error) {
      actionStatus.textContent = t('status.shareFailed', { message: error instanceof Error ? error.message : String(error) });
    }
  };
  shareButton.addEventListener('click', shareCurrent);
  mobileShareButton.addEventListener('click', shareCurrent);
  localeSelect.addEventListener('change', () => applyLocale(localeSelect.value));
  exportSvgButton.addEventListener('click', () => void exportCurrent('svg'));
  exportPngButton.addEventListener('click', () => void exportCurrent('png'));
  mobileExportSvgButton.addEventListener('click', () => void exportCurrent('svg'));
  mobileExportPngButton.addEventListener('click', () => void exportCurrent('png'));
  mobileThemeButton.addEventListener('click', () => {
    applyThemePreferences({ ...preferences, workspace: preferences.workspace === 'dark' ? 'light' : 'dark' });
  });
  styleOpenButton.addEventListener('click', openStyleInspector);
  styleCloseButton.addEventListener('click', closeStyleInspector);
  styleDialog.addEventListener('close', () => {
    placeStyleContent(styleDesktopHost);
    styleOpenButton.focus();
  });
  const closeDesktopStyleInspectorOnEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || isCompactLayout() || shell.dataset.inspectorOpen !== 'true') return;
    event.preventDefault();
    closeStyleInspector();
  };
  document.addEventListener('keydown', closeDesktopStyleInspectorOnEscape);
  styleResetButton.addEventListener('click', () => {
    applyThemePreferences({ ...preferences, overrides: {} });
  });
  listCollapseButton.addEventListener('click', () => {
    applyLayoutPreferences(toggleListCollapsed(layoutPreferences), true);
  });
  listRestoreButton.addEventListener('click', () => {
    applyLayoutPreferences(toggleListCollapsed(layoutPreferences), true);
    listCollapseButton.focus();
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
  previewPreviousButton.addEventListener('pointerdown', event => event.preventDefault());
  previewNextButton.addEventListener('pointerdown', event => event.preventDefault());
  previewPreviousButton.addEventListener('click', () => selectDiagram((state.selectedIndex ?? 0) - 1));
  previewNextButton.addEventListener('click', () => selectDiagram((state.selectedIndex ?? -1) + 1));
  previewCanvas.addEventListener('wheel', event => {
    event.preventDefault();
    const bounds = previewCanvas.getBoundingClientRect();
    const multiplier = event.deltaY < 0 ? 1.2 : 1 / 1.2;
    setActiveViewport(zoomCanvasViewportAt(
      activeViewport,
      previewContentSize(),
      previewContainerSize(),
      activeViewport.scale * multiplier,
      { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
    ));
  }, { passive: false });
  previewCanvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest('button'))) return;
    panningPointerId = event.pointerId;
    panningPosition = { x: event.clientX, y: event.clientY };
    previewCanvas.setPointerCapture(event.pointerId);
    previewCanvas.dataset.panning = 'true';
    document.body.classList.add('canvas-panning');
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
    document.body.classList.remove('canvas-panning');
  };
  previewCanvas.addEventListener('pointerup', endPan);
  previewCanvas.addEventListener('pointercancel', endPan);

  const handleWindowResize = () => {
    applyLayoutPreferences(layoutPreferences);
    if (activeViewport.mode === 'fit') refitActiveViewport();
  };
  const handleFullscreenChange = () => {
    updatePreviewPresentationControl();
    schedulePresentationFit();
  };
  const handleCompactLayoutChange = (event: MediaQueryListEvent) => {
    const inspectorOpen = styleDialog.open || shell.dataset.inspectorOpen === 'true';
    if (!inspectorOpen) return;
    if (event.matches) {
      delete shell.dataset.inspectorOpen;
      placeStyleContent(styleMobileHost);
      styleDialog.showModal();
      return;
    }
    if (styleDialog.open) styleDialog.close();
    placeStyleContent(styleDesktopHost);
    shell.dataset.inspectorOpen = 'true';
    refitActiveViewport();
  };
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(handleWindowResize);
    resizeObserver.observe(previewCanvas);
  } else {
    window.addEventListener('resize', handleWindowResize);
  }
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  compactMediaQuery?.addEventListener?.('change', handleCompactLayoutChange);

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

  documentInput.addEventListener('input', () => updateDocumentText(documentInput.value));
  diagramInput.addEventListener('input', () => updateDiagramSource(diagramInput.value));
  list.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    const copyButton = target?.closest<HTMLButtonElement>('[data-copy-repro]');
    if (copyButton) {
      const index = Number(copyButton.dataset.diagramIndex);
      if (Number.isInteger(index)) void copyRepro(index);
      return;
    }
    const button = target
      ? target.closest<HTMLButtonElement>('[data-diagram-item]')
      : null;
    const index = Number(button?.dataset.diagramIndex);
    if (!Number.isInteger(index)) return;
    selectDiagram(index, { revealEditor: true });
    if (typeof window.matchMedia === 'function' && window.matchMedia(COMPACT_LAYOUT_QUERY).matches) {
      diagramEditor.focus();
    }
  });
  diagnostics.addEventListener('click', event => {
    const button = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>('[data-copy-repro]')
      : null;
    const index = Number(button?.dataset.diagramIndex);
    if (Number.isInteger(index)) void copyRepro(index);
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
    documentEditor.setValue(state.text);
    const current = selectedDiagram(state);
    syncValue(diagramInput, current?.source ?? '');
    diagramEditor.setValue(current?.source ?? '');
    diagramInput.disabled = !current;
    diagramEditor.setDisabled(!current);
    count.textContent = String(state.document.diagrams.length);
    renderList();
    renderEditors();
    renderPreviewNavigation();
    runtime.request(current?.source ?? null, effectiveTheme);
    persistWorkspace();
  }

  function renderList(): void {
    const largeDocument = state.document.diagrams.length > 200;
    const signature = largeDocument
      ? `${locale}\u0000${state.text}`
      : JSON.stringify([locale, state.document.diagrams.map(diagram => [
        diagram.diagramType,
        analyzeSupport(diagram.source).status,
        diagram.range.startLine,
      ])]);
    if (signature === renderedListSignature) {
      for (const [index, button] of [...list.querySelectorAll<HTMLButtonElement>('[data-diagram-item]')].entries()) {
        button.setAttribute('aria-current', String(index === state.selectedIndex));
      }
      return;
    }
    renderedListSignature = signature;
    const renderItems = () => {
      if (listRenderFrame !== null) animationFrames.delete(listRenderFrame);
      listRenderFrame = null;
      list.replaceChildren();
      if (state.document.diagrams.length === 0) {
        const empty = document.createElement('p');
        empty.dataset.emptyList = '';
        empty.textContent = t('list.empty');
        list.append(empty);
        return;
      }
      const fragment = document.createDocumentFragment();
      state.document.diagrams.forEach((diagram, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.diagramItem = '';
        button.dataset.diagramIndex = String(index);
        button.dataset.diagramType = diagram.diagramType;
        const capability = analyzeSupport(diagram.source);
        button.dataset.diagramStatus = capability.status;
        button.className = 'diagram-item';
        button.setAttribute('aria-current', String(index === state.selectedIndex));
        const title = document.createElement('strong');
        title.textContent = t('list.diagram', { index: index + 1 });
        const meta = document.createElement('span');
        meta.textContent = t('list.meta', {
          type: diagramTypeLabel(diagram.diagramType, diagram.source, t),
          status: diagramStatusLabel(capability.status, t),
          line: diagram.range.startLine,
        });
        button.append(title, meta);
        fragment.append(button);
      });
      list.append(fragment);
    };
    if (largeDocument) {
      if (listRenderFrame !== null) {
        window.cancelAnimationFrame(listRenderFrame);
        animationFrames.delete(listRenderFrame);
      }
      listRenderFrame = window.requestAnimationFrame(renderItems);
      animationFrames.add(listRenderFrame);
      return;
    }
    renderItems();
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

  function updateDocumentText(value: string): void {
    state = setWorkspaceText(state, value);
    options.persistDocumentText?.(state.text);
    renderDocument();
  }

  function updateDiagramSource(value: string): void {
    state = replaceSelectedDiagramSource(state, value);
    options.persistDocumentText?.(state.text);
    renderDocument();
  }

  function selectDiagram(index: number, options: { revealEditor?: boolean } = {}): void {
    if (index < 0 || index >= state.document.diagrams.length) return;
    const changed = index !== state.selectedIndex;
    if (changed) state = selectWorkspaceDiagram(state, index);
    if (options.revealEditor) {
      activeEditor = 'diagram';
      shell.dataset.mobilePanel = 'edit';
    }
    if (!changed && !options.revealEditor) return;
    renderDocument();
    renderMobileNavigation();
  }

  function renderPreviewNavigation(): void {
    const total = state.document.diagrams.length;
    const current = total === 0 ? 0 : (state.selectedIndex ?? 0) + 1;
    previewPreviousButton.disabled = current <= 1;
    previewNextButton.disabled = total === 0 || current >= total;
    previewPosition.textContent = `${current} / ${total}`;
  }

  function renderMobileNavigation(): void {
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-mobile-target]')) {
      const selected = button.dataset.mobileTarget === shell.dataset.mobilePanel;
      button.setAttribute('aria-pressed', String(selected));
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
  }

  function renderPreview(): void {
    if (!snapshot) return;
    previewStatus.textContent = snapshot.status === 'ready'
      ? t('preview.ready')
      : snapshot.status === 'rendering'
        ? t('preview.rendering')
        : snapshot.status === 'error'
          ? t('preview.stale')
          : t('preview.waiting');
    if (snapshot.svg) {
      preview.replaceChildren(snapshot.svg);
      const current = selectedDiagram(state);
      if (snapshot.status === 'ready' && snapshot.source === current?.source) {
        normalizePreviewSvg(snapshot.svg, {
          label: t('canvas.diagramLabel', {
            index: current.index + 1,
            type: diagramTypeLabel(current.diagramType, current.source, t),
          }),
        });
      }
      renderMinimap(snapshot.svg);
    } else {
      preview.replaceChildren(emptyPreview(snapshot.status === 'idle', t));
      previewMinimap.replaceChildren();
    }

    diagnostics.replaceChildren();
    const current = selectedDiagram(state);
    if (current) {
      const recovery = capabilityRecovery(current, t);
      if (recovery) diagnostics.append(recovery);
    }
    if (snapshot.status === 'error' && snapshot.message && snapshot.diagnostics.length === 0) {
      diagnostics.append(diagnosticItem('render_error', snapshot.message, null, current, t));
    }
    for (const diagnostic of snapshot.diagnostics) {
      diagnostics.append(diagnosticItem(diagnostic.code, diagnostic.message, diagnostic.range, current, t));
    }
    if (snapshot.status === 'ready' && snapshot.diagnostics.length === 0) {
      diagnostics.append(diagnosticItem('ok', t('diagnostic.none'), null, null, t));
    }

    const canExport = Boolean(
      current
      && snapshot.exportable
      && snapshot.svg
      && snapshot.source === current.source
      && snapshot.themeSignature === themeSignature(effectiveTheme),
    );
    exportSvgButton.disabled = !canExport;
    exportPngButton.disabled = !canExport;
    mobileExportSvgButton.disabled = !canExport;
    mobileExportPngButton.disabled = !canExport;
    const previewButton = root.querySelector<HTMLButtonElement>('[data-mobile-target="preview"]');
    if (previewButton) previewButton.dataset.hasDiagnostics = String(snapshot.diagnostics.length > 0);
    if (snapshot.svg) {
      const current = selectedDiagram(state);
      if (snapshot.status === 'ready' && snapshot.source === current?.source) {
        activeViewport = viewportForDiagram(viewportCache, current.id, previewContentSize(), previewContainerSize());
        applyViewport();
      }
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
      actionStatus.textContent = t('status.exported', { format: format.toUpperCase() });
    } catch (error) {
      actionStatus.textContent = t('status.exportFailed', { message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function copyRepro(index: number): Promise<void> {
    const source = state.document.diagrams[index]?.source;
    if (!source) return;
    if (await copyText(source)) {
      actionStatus.textContent = t('status.copySuccess');
      return;
    }
    actionStatus.textContent = t('status.copyFailed');
  }

  renderStaticCopy();
  renderThemeControls();
  applyLayoutPreferences(layoutPreferences);
  renderDocument();
  renderMobileNavigation();

  return {
    destroy() {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleWindowResize);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('keydown', closeDesktopStyleInspectorOnEscape);
      compactMediaQuery?.removeEventListener?.('change', handleCompactLayoutChange);
      for (const frame of animationFrames) window.cancelAnimationFrame(frame);
      if (panningPointerId !== null && previewCanvas.hasPointerCapture(panningPointerId)) previewCanvas.releasePointerCapture(panningPointerId);
      document.body.classList.remove('canvas-panning');
      document.documentElement.lang = originalDocumentLanguage;
      documentEditor.destroy();
      diagramEditor.destroy();
      runtime.dispose();
      root.replaceChildren();
    },
  };

  function renderStaticCopy(): void {
    const setText = (selector: string, key: MessageKey) => {
      for (const element of root.querySelectorAll<HTMLElement>(selector)) element.textContent = t(key);
    };
    const setAttribute = (selector: string, name: 'aria-label' | 'title', key: MessageKey) => {
      for (const element of root.querySelectorAll<HTMLElement>(selector)) element.setAttribute(name, t(key));
    };
    const setStyleLabel = (selector: string, key: MessageKey) => {
      const control = root.querySelector<HTMLElement>(selector);
      const label = control?.closest<HTMLElement>('label, .style-control');
      label?.querySelector<HTMLElement>(':scope > span')?.replaceChildren(t(key));
    };

    setText('.brand-kicker', 'brand.kicker');
    setText('[data-theme-option="dark"]', 'theme.dark');
    setText('[data-theme-option="light"]', 'theme.light');
    setText('.toolbar-label', 'action.style');
    setText('[data-share]', 'action.share');
    setText('.export-menu > summary', 'action.export');
    setText('[data-export-svg]', 'action.downloadSvg');
    setText('[data-export-png]', 'action.downloadPng');
    setText('[data-mobile-more] .sr-only', 'action.more');
    setText('[data-mobile-share-label]', 'action.share');
    setText('[data-mobile-export-label="svg"]', 'action.downloadSvg');
    setText('[data-mobile-export-label="png"]', 'action.downloadPng');
    setText('[data-panel="list"] .panel-heading h2', 'panel.diagrams');
    setText('[data-editor-tab="document"]', 'editor.document');
    setText('[data-editor-tab="diagram"]', 'editor.diagram');
    setText('[data-editor-surface="document"] .sr-only', 'editor.document');
    setText('[data-editor-surface="diagram"] .sr-only', 'editor.diagram');
    setText('[data-panel="preview"] > .panel-heading h2', 'panel.preview');
    setText('#style-title', 'style.title');
    setText('.style-close-compact', 'style.done');
    setText('[data-style-body] > fieldset:nth-of-type(1) > legend', 'style.theme');
    setText('[data-style-body] > fieldset:nth-of-type(2) > legend', 'style.colors');
    setText('[data-style-body] > fieldset:nth-of-type(3) > legend', 'style.geometry');
    setText('[data-style-advanced-colors] > summary', 'style.moreColors');
    setText('[data-style-advanced-text] > summary', 'style.textAndFonts');
    setText('[data-style-option="bezier"]', 'curve.bezier');
    setText('[data-style-option="step"]', 'curve.step');
    setText('[data-style-option="straight"]', 'curve.straight');
    setText('[data-style-select="arrowStyle"] option[value="filled"]', 'arrow.filled');
    setText('[data-style-select="arrowStyle"] option[value="triangle"]', 'arrow.triangle');
    setText('[data-style-select="arrowStyle"] option[value="open"]', 'arrow.open');
    setText('[data-style-select="arrowStyle"] option[value="circle"]', 'arrow.circle');
    setText('[data-style-select="arrowStyle"] option[value="cross"]', 'arrow.cross');
    setText('[data-style-select="fontFamily"] option[value="sans-serif"]', 'font.system');
    setText('[data-style-select="fontFamily"] option[value="Inter, ui-sans-serif, system-ui, sans-serif"]', 'font.ui');
    setText('[data-style-select="fontFamily"] option[value="ui-monospace, SFMono-Regular, Consolas, monospace"]', 'font.mono');
    setText('[data-style-reset]', 'style.reset');
    setText('[data-mobile-target="list"] span', 'nav.diagrams');
    setText('[data-mobile-target="edit"] span', 'nav.edit');
    setText('[data-mobile-target="preview"] > span:first-of-type', 'nav.preview');
    setStyleLabel('[data-style-color="background"]', 'style.background');
    setStyleLabel('[data-style-color="nodeFill"]', 'style.nodeFill');
    setStyleLabel('[data-style-color="nodeStroke"]', 'style.nodeStroke');
    setStyleLabel('[data-style-color="edgeStroke"]', 'style.edgeStroke');
    setStyleLabel('[data-style-color="arrowFill"]', 'style.arrowFill');
    setStyleLabel('[data-style-color="nodeText"]', 'style.nodeText');
    setStyleLabel('[data-style-color="edgeLabel"]', 'style.edgeLabel');
    setStyleLabel('[data-style-color="subgraphFill"]', 'style.subgraphFill');
    setStyleLabel('[data-style-color="subgraphStroke"]', 'style.subgraphStroke');
    setStyleLabel('[data-style-row="curveStyle"]', 'style.curve');
    setStyleLabel('[data-style-select="arrowStyle"]', 'style.arrowStyle');
    setStyleLabel('[data-style-number="edgeGap"]', 'style.edgeGap');
    setStyleLabel('[data-style-number="arrowSize"]', 'style.arrowSize');
    setStyleLabel('[data-style-number="nodeBorderRadius"]', 'style.nodeBorderRadius');
    setStyleLabel('[data-style-select="fontFamily"]', 'style.fontFamily');
    setStyleLabel('[data-style-number="fontSize"]', 'style.fontSize');

    setAttribute('.brand', 'aria-label', 'brand.label');
    setAttribute('[data-locale-select]', 'aria-label', 'language.label');
    setAttribute('[data-toolbar] > .theme-switch', 'aria-label', 'theme.workspace');
    setAttribute('[data-mobile-theme]', 'aria-label', 'theme.toggle');
    setAttribute('[data-mobile-theme]', 'title', 'theme.toggle');
    setAttribute('[data-mobile-more] > summary', 'aria-label', 'action.more');
    setAttribute('[data-mobile-more] > summary', 'title', 'action.more');
    setAttribute('[data-panel="list"]', 'aria-label', 'panel.diagramList');
    setAttribute('[data-list-collapse]', 'aria-label', layoutPreferences.listCollapsed ? 'action.expandList' : 'action.collapseList');
    setAttribute('[data-list-restore]', 'aria-label', 'action.expandList');
    setAttribute('[data-list-restore]', 'title', 'action.expandList');
    setAttribute('[data-workspace-divider="list"]', 'aria-label', 'action.resizeList');
    setAttribute('[data-workspace-divider="editor"]', 'aria-label', 'action.resizeEditorPreview');
    setAttribute('.editor-tabs', 'aria-label', 'editor.content');
    setAttribute('[data-document-input]', 'aria-label', 'editor.document');
    setAttribute('[data-diagram-input]', 'aria-label', 'editor.diagram');
    documentEditor.setLabel(t('editor.document'));
    diagramEditor.setLabel(t('editor.diagram'));
    setAttribute('[data-panel="preview"]', 'aria-label', 'panel.preview');
    setAttribute('.preview-actions', 'aria-label', 'canvas.controls');
    setAttribute('[data-preview-previous]', 'aria-label', 'preview.previous');
    setAttribute('[data-preview-previous]', 'title', 'preview.previous');
    setAttribute('[data-preview-next]', 'aria-label', 'preview.next');
    setAttribute('[data-preview-next]', 'title', 'preview.next');
    setAttribute('[data-preview-zoom="out"]', 'aria-label', 'canvas.zoomOut');
    setAttribute('[data-preview-zoom="out"]', 'title', 'canvas.zoomOut');
    setAttribute('[data-preview-fit]', 'aria-label', 'canvas.fit');
    setAttribute('[data-preview-fit]', 'title', 'canvas.fit');
    setAttribute('[data-preview-zoom="in"]', 'aria-label', 'canvas.zoomIn');
    setAttribute('[data-preview-zoom="in"]', 'title', 'canvas.zoomIn');
    setAttribute('[data-preview-fullscreen]', 'aria-label', 'canvas.fullscreen');
    setAttribute('[data-preview-fullscreen]', 'title', 'canvas.fullscreen');
    setAttribute('[data-preview-canvas]', 'aria-label', 'canvas.label');
    setAttribute('[data-style-desktop-host]', 'aria-label', 'style.title');
    setAttribute('[data-style-close]', 'aria-label', styleDialog.open ? 'style.done' : 'style.close');
    setAttribute('.theme-switch-drawer', 'aria-label', 'style.baseTheme');
    setAttribute('.segmented-control', 'aria-label', 'style.curveGroup');
    setAttribute('[data-style-number="edgeGap"]', 'aria-label', 'style.edgeGap');
    setAttribute('[data-style-number="arrowSize"]', 'aria-label', 'style.arrowSize');
    setAttribute('[data-style-number="nodeBorderRadius"]', 'aria-label', 'style.nodeBorderRadius');
    setAttribute('[data-style-number="fontSize"]', 'aria-label', 'style.fontSize');
    setAttribute('[data-mobile-navigation]', 'aria-label', 'navigation.workspace');
    localeSelect.value = locale;
    document.documentElement.lang = locale;
  }

  function applyLocale(value: string): void {
    const next = parseLocale(value);
    if (!next) {
      localeSelect.value = locale;
      return;
    }
    if (next === locale) return;
    locale = next;
    translator = createTranslator(locale);
    renderedListSignature = null;
    renderStaticCopy();
    renderThemeControls();
    renderList();
    renderPreview();
    renderMobileNavigation();
    updatePreviewPresentationControl();
    options.persistLocale?.(locale);
  }

  function applyThemePreferences(next: ThemePreferences): void {
    preferences = cloneThemePreferences(next);
    effectiveTheme = resolveDiagramTheme(preferences);
    shell.dataset.workspaceTheme = preferences.workspace;
    renderThemeControls();
    options.persistThemePreferences?.(cloneThemePreferences(preferences));
    runtime.request(selectedDiagram(state)?.source ?? null, effectiveTheme);
    persistWorkspace();
  }

  function isCompactLayout(): boolean {
    return compactMediaQuery?.matches ?? false;
  }

  function openStyleInspector(): void {
    if (isCompactLayout()) {
      placeStyleContent(styleMobileHost);
      styleCloseButton.setAttribute('aria-label', t('style.done'));
      styleDialog.showModal();
      return;
    }
    placeStyleContent(styleDesktopHost);
    styleCloseButton.setAttribute('aria-label', t('style.close'));
    shell.dataset.inspectorOpen = 'true';
    refitActiveViewport();
  }

  function closeStyleInspector(): void {
    if (styleDialog.open) {
      styleDialog.close();
      return;
    }
    delete shell.dataset.inspectorOpen;
    styleCloseButton.setAttribute('aria-label', t('style.close'));
    refitActiveViewport();
    styleOpenButton.focus();
  }

  function placeStyleContent(host: HTMLElement): void {
    if (styleContent.parentElement !== host) host.append(styleContent);
  }

  function applyLayoutPreferences(next: WorkspaceLayoutPreferences, persist = false): void {
    layoutPreferences = next;
    const layout = resolveWorkspaceLayout(next, workspaceAvailableWidth());
    shell.dataset.listCollapsed = String(next.listCollapsed);
    workspace.style.setProperty('--list-width', `${layout.listWidth}px`);
    workspace.style.setProperty('--editor-width', `${layout.editorWidth}px`);
    workspace.style.setProperty('--preview-width', `${layout.previewWidth}px`);
    listCollapseButton.setAttribute('aria-label', t(next.listCollapsed ? 'action.expandList' : 'action.collapseList'));
    listCollapseButton.innerHTML = icon(next.listCollapsed ? 'chevron-right' : 'chevron-left');
    listRestoreButton.setAttribute('aria-expanded', String(!next.listCollapsed));
    if (activeViewport.mode === 'fit') refitActiveViewport();
    if (persist) options.persistLayoutPreferences?.(layoutPreferences);
    persistWorkspace();
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
      drag.next = adjustWorkspaceDivider(drag.start, kind, event.clientX - drag.startX, workspaceAvailableWidth());
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
          workspaceAvailableWidth(),
        ), true);
      } else if (event.key === 'Home' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        applyLayoutPreferences(DEFAULT_LAYOUT_PREFERENCES, true);
      }
    });
  }

  function workspaceAvailableWidth(): number {
    const styles = getComputedStyle(workspace);
    const horizontalPadding = (Number.parseFloat(styles.paddingLeft) || 0) + (Number.parseFloat(styles.paddingRight) || 0);
    return Math.max(0, workspace.getBoundingClientRect().width - horizontalPadding);
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
    persistWorkspace();
  }

  function refitActiveViewport(): void {
    const current = selectedDiagram(state);
    if (current) viewportCache.delete(current.id);
    activeViewport = fitCanvasViewport(previewContentSize(), previewContainerSize());
    applyViewport();
    persistWorkspace();
  }

  function applyViewport(): void {
    previewStage.style.transform = viewportTransform(activeViewport);
    previewStage.dataset.viewportMode = activeViewport.mode;
    previewZoomValue.value = formatCanvasZoom(activeViewport);
    previewZoomValue.textContent = formatCanvasZoom(activeViewport);
    updateMinimapViewport();
  }

  function persistWorkspace(): void {
    if (!options.persistWorkspaceState) return;
    const current = selectedDiagram(state);
    options.persistWorkspaceState({
      documentText: state.text,
      selectedDiagramId: current?.id ?? null,
      themePreferences: cloneThemePreferences(preferences),
      layoutPreferences: { ...layoutPreferences },
      viewports: Object.fromEntries([...viewportCache].map(([id, viewport]) => [id, { ...viewport }])),
    });
  }

  async function togglePreviewFullscreen(): Promise<void> {
    if (document.fullscreenElement === previewPanel) {
      await document.exitFullscreen?.();
      return;
    }
    if (shell.dataset.previewMaximized === 'true') {
      setPreviewMaximized(false);
      return;
    }
    try {
      if (typeof previewPanel.requestFullscreen !== 'function') throw new Error('Fullscreen unavailable');
      await previewPanel.requestFullscreen();
    } catch {
      setPreviewMaximized(true);
      actionStatus.textContent = t('status.fullscreenFallback');
    }
  }

  function setPreviewMaximized(maximized: boolean): void {
    if (maximized) shell.dataset.previewMaximized = 'true';
    else delete shell.dataset.previewMaximized;
    updatePreviewPresentationControl();
    schedulePresentationFit();
  }

  function schedulePresentationFit(): void {
    let secondFrame: number | null = null;
    const firstFrame = window.requestAnimationFrame(() => {
      animationFrames.delete(firstFrame);
      secondFrame = window.requestAnimationFrame(() => {
        animationFrames.delete(secondFrame!);
        refitActiveViewport();
      });
      animationFrames.add(secondFrame);
    });
    animationFrames.add(firstFrame);
  }

  function createSourceEditor(
    host: HTMLElement,
    value: string,
    language: Parameters<typeof createCodeEditor>[0]['language'],
    label: MessageKey,
    onChange: (value: string) => void,
  ): CodeEditor {
    return createCodeEditor({ host, value, language, label: t(label), onChange });
  }

  function updatePreviewPresentationControl(): void {
    const fullscreen = document.fullscreenElement === previewPanel;
    const maximized = shell.dataset.previewMaximized === 'true';
    const label = fullscreen
      ? t('canvas.exitFullscreen')
      : maximized
        ? t('canvas.exitMaximized')
        : t('canvas.fullscreen');
    previewFullscreenButton.setAttribute('aria-label', label);
    previewFullscreenButton.title = label;
  }

  function renderMinimap(source: SVGSVGElement): void {
    const content = previewContentSize();
    const minimapSvg = source.cloneNode(true) as SVGSVGElement;
    minimapSvg.removeAttribute('id');
    minimapSvg.removeAttribute('width');
    minimapSvg.removeAttribute('height');
    if (!minimapSvg.hasAttribute('viewBox')) {
      minimapSvg.setAttribute('viewBox', `0 0 ${content.width} ${content.height}`);
    }
    minimapSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    minimapSvg.setAttribute('focusable', 'false');
    const viewport = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    viewport.dataset.previewMinimapViewport = '';
    viewport.setAttribute('vector-effect', 'non-scaling-stroke');
    minimapSvg.append(viewport);
    previewMinimap.replaceChildren(minimapSvg);
    updateMinimapViewport();
  }

  function updateMinimapViewport(): void {
    const viewport = previewMinimap.querySelector<SVGRectElement>('[data-preview-minimap-viewport]');
    if (!viewport) return;
    const content = previewContentSize();
    const container = previewContainerSize();
    const scale = activeViewport.scale || 1;
    const x = clamp(-activeViewport.offsetX / scale, 0, content.width);
    const y = clamp(-activeViewport.offsetY / scale, 0, content.height);
    viewport.setAttribute('x', String(x));
    viewport.setAttribute('y', String(y));
    viewport.setAttribute('width', String(Math.min(content.width - x, container.width / scale)));
    viewport.setAttribute('height', String(Math.min(content.height - y, container.height / scale)));
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
    styleOpenButton.setAttribute('aria-label', t(custom ? 'style.custom' : 'action.style'));
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;

function diagramTypeLabel(diagramType: string, source: string | undefined, translate: Translate): string {
  if (diagramType !== 'unknown') return diagramType;
  return source?.trim().split(/\s+/, 1)[0] || translate('type.unknown');
}

function diagramStatusLabel(status: ReturnType<typeof analyzeSupport>['status'], translate: Translate): string {
  if (status === 'supported') return translate('support.supported');
  if (status === 'partial') return translate('support.partial');
  if (status === 'planned') return translate('support.planned');
  return translate('support.unknown');
}

function capabilityRecovery(diagram: ReturnType<typeof selectedDiagram>, translate: Translate): HTMLElement | null {
  if (!diagram) return null;
  const capability = analyzeSupport(diagram.source);
  if (capability.status === 'supported') return null;

  const recovery = document.createElement('div');
  recovery.className = 'capability-recovery';
  recovery.dataset.capabilityRecovery = '';
  recovery.dataset.diagramType = diagram.diagramType;
  recovery.dataset.diagramStatus = capability.status;
  const message = document.createElement('span');
  message.textContent = translate('capability.message', {
    type: diagramTypeLabel(diagram.diagramType, undefined, translate),
    status: diagramStatusLabel(capability.status, translate),
    message: capability.message,
  });
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.dataset.copyRepro = '';
  copy.dataset.diagramIndex = String(diagram.index);
  copy.textContent = translate('capability.copy');
  recovery.append(message, copy);
  return recovery;
}

function emptyPreview(showGuide: boolean, translate: Translate): HTMLElement {
  const empty = document.createElement('p');
  empty.className = 'empty-preview';
  empty.textContent = translate(showGuide ? 'preview.guide' : 'preview.preparing');
  return empty;
}

function diagnosticItem(
  code: string,
  message: string,
  range: SourceRange | null = null,
  diagram: NonNullable<ReturnType<typeof selectedDiagram>> | null = null,
  translate: Translate,
): HTMLElement {
  const item = document.createElement('p');
  item.className = `diagnostic diagnostic-${code === 'ok' ? 'ok' : 'issue'}`;
  const diagramLabel = diagram ? translate('diagnostic.diagram', { index: diagram.index + 1 }) : '';
  const line = range && diagram
    ? range.startLine === range.endLine
      ? translate('diagnostic.diagramLine', {
        diagram: diagram.index + 1,
        line: range.startLine,
        documentLine: diagram.range.startLine + range.startLine - 1,
      })
      : translate('diagnostic.diagramRange', {
        diagram: diagram.index + 1,
        start: range.startLine,
        end: range.endLine,
        documentStart: diagram.range.startLine + range.startLine - 1,
        documentEnd: diagram.range.startLine + range.endLine - 1,
      })
    : range
      ? range.startLine === range.endLine
        ? translate('diagnostic.line', { line: range.startLine })
        : translate('diagnostic.range', { start: range.startLine, end: range.endLine })
      : '';
  const context = range && diagram ? line : [diagramLabel, line].filter(Boolean).join(' · ');
  item.textContent = `${code}: ${message}${context ? translate('diagnostic.context', { context }) : ''}`;
  return item;
}

async function copyText(value: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // HTTP and denied-permission contexts continue through the synchronous fallback.
    }
  }

  const input = document.createElement('textarea');
  input.value = value;
  input.setAttribute('readonly', '');
  input.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;pointer-events:none;';
  document.body.append(input);
  input.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    input.remove();
  }
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
