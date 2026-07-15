import type { PreviewRenderer, PreviewSnapshot } from './preview-runtime';
import { PreviewRuntime } from './preview-runtime';
import { renderSource } from './render-source';
import {
  createWorkspaceDocument,
  replaceSelectedDiagramSource,
  selectWorkspaceDiagram,
  selectedDiagram,
  setWorkspaceText,
} from './document-model';

export interface AppOptions {
  initialText: string;
  initialSelectedIndex?: number;
  renderer?: PreviewRenderer;
  renderDelayMs?: number;
}

export interface MountedApp {
  destroy(): void;
}

const SHELL = `
  <div class="app-shell" data-mobile-panel="edit">
    <header class="topbar">
      <div><strong>xmermaid</strong><span> live</span></div>
      <div class="topbar-actions" data-toolbar></div>
    </header>
    <nav class="mobile-nav" aria-label="工作区面板">
      <button type="button" data-mobile-target="list">图表</button>
      <button type="button" data-mobile-target="edit">编辑</button>
      <button type="button" data-mobile-target="preview">预览</button>
    </nav>
    <div class="workspace">
      <aside class="diagram-panel" data-panel="list" aria-label="图表列表">
        <div class="panel-heading"><h2>图表</h2><span data-diagram-count></span></div>
        <div class="diagram-list" data-diagram-list></div>
      </aside>
      <section class="editor-panel" data-panel="edit">
        <div class="editor-tabs" role="tablist" aria-label="编辑内容">
          <button type="button" role="tab" data-editor-tab="document">完整文本</button>
          <button type="button" role="tab" data-editor-tab="diagram">当前图表</button>
        </div>
        <label class="editor-surface" data-editor-surface="document">
          <span class="sr-only">完整文本</span>
          <textarea data-document-input aria-label="完整文本" spellcheck="false"></textarea>
        </label>
        <label class="editor-surface" data-editor-surface="diagram" hidden>
          <span class="sr-only">当前图表</span>
          <textarea data-diagram-input aria-label="当前图表" spellcheck="false"></textarea>
        </label>
      </section>
      <section class="preview-panel" data-panel="preview" aria-label="实时预览">
        <div class="panel-heading"><h2>预览</h2><span data-preview-status></span></div>
        <div class="preview-canvas" data-preview></div>
        <section class="diagnostics" data-diagnostics aria-live="polite" aria-atomic="true"></section>
      </section>
    </div>
  </div>`;

export function mountApp(root: HTMLElement, options: AppOptions): MountedApp {
  root.innerHTML = SHELL;
  const shell = required<HTMLElement>(root, '.app-shell');
  const list = required<HTMLElement>(root, '[data-diagram-list]');
  const count = required<HTMLElement>(root, '[data-diagram-count]');
  const documentInput = required<HTMLTextAreaElement>(root, '[data-document-input]');
  const diagramInput = required<HTMLTextAreaElement>(root, '[data-diagram-input]');
  const preview = required<HTMLElement>(root, '[data-preview]');
  const previewStatus = required<HTMLElement>(root, '[data-preview-status]');
  const diagnostics = required<HTMLElement>(root, '[data-diagnostics]');
  let state = createWorkspaceDocument(options.initialText, options.initialSelectedIndex ?? 0);
  let activeEditor: 'document' | 'diagram' = 'document';
  let snapshot: PreviewSnapshot | null = null;

  const runtime = new PreviewRuntime(
    options.renderer ?? renderSource,
    next => {
      snapshot = next;
      renderPreview();
    },
    options.renderDelayMs,
  );

  documentInput.addEventListener('input', () => {
    state = setWorkspaceText(state, documentInput.value);
    renderDocument();
  });
  diagramInput.addEventListener('input', () => {
    state = replaceSelectedDiagramSource(state, diagramInput.value);
    renderDocument();
  });

  for (const tab of root.querySelectorAll<HTMLButtonElement>('[data-editor-tab]')) {
    tab.addEventListener('click', () => {
      activeEditor = tab.dataset.editorTab === 'diagram' ? 'diagram' : 'document';
      renderEditors();
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
    runtime.request(current?.source ?? null);
  }

  function renderList(): void {
    list.replaceChildren();
    if (state.document.diagrams.length === 0) {
      const empty = document.createElement('p');
      empty.dataset.emptyList = '';
      empty.textContent = '没有找到图表。请粘贴 ```mermaid fenced block 或一张裸 flowchart。';
      list.append(empty);
      return;
    }
    state.document.diagrams.forEach((diagram, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.diagramItem = '';
      button.className = 'diagram-item';
      button.setAttribute('aria-current', index === state.selectedIndex ? 'true' : 'false');
      const title = document.createElement('strong');
      title.textContent = `图表 ${index + 1}`;
      const meta = document.createElement('span');
      meta.textContent = `${diagram.source.trim().split(/\s+/)[0] ?? 'unknown'} · 第 ${diagram.range.startLine} 行`;
      button.append(title, meta);
      button.addEventListener('click', () => {
        state = selectWorkspaceDiagram(state, index);
        activeEditor = 'diagram';
        shell.dataset.mobilePanel = 'edit';
        renderDocument();
      });
      list.append(button);
    });
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
    if (snapshot.status === 'error' && snapshot.message) {
      diagnostics.append(diagnosticItem('render_error', snapshot.message));
    }
    for (const diagnostic of snapshot.diagnostics) {
      diagnostics.append(diagnosticItem(diagnostic.code, diagnostic.message));
    }
    if (snapshot.status === 'ready' && snapshot.diagnostics.length === 0) {
      diagnostics.append(diagnosticItem('ok', '没有诊断。'));
    }
  }

  renderDocument();

  return {
    destroy() {
      runtime.dispose();
      root.replaceChildren();
    },
  };
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing application element: ${selector}`);
  return element;
}

function syncValue(input: HTMLTextAreaElement, value: string): void {
  if (input.value !== value) input.value = value;
}

function emptyPreview(showGuide: boolean): HTMLElement {
  const empty = document.createElement('p');
  empty.className = 'empty-preview';
  empty.textContent = showGuide ? '选择或粘贴一张 Mermaid flowchart。' : '正在准备预览。';
  return empty;
}

function diagnosticItem(code: string, message: string): HTMLElement {
  const item = document.createElement('p');
  item.className = `diagnostic diagnostic-${code === 'ok' ? 'ok' : 'issue'}`;
  item.textContent = `${code}: ${message}`;
  return item;
}
