import type { RenderTheme } from '@evangwt/xmermaid';
import type { DiagramBlock } from '@evangwt/xmermaid/editor';
import type { MessageKey } from './i18n';
import type { PreviewRenderResult } from './preview-runtime';
import { normalizePreviewSvg } from './preview-svg';
import { themeSignature } from './theme';

// Mixed reading view: the pasted document rendered in order, prose as formatted
// text and every recognized diagram rendered inline where it appeared. This is
// the "paste the whole document and read it" surface — the editor pane still
// owns editing, so this view is read-only.
//
// Long documents are the point, so diagrams render lazily as they scroll into
// view and successful renders are cached by source + theme.

export type DocumentPreviewTranslate = (key: MessageKey, values?: Record<string, string | number>) => string;

export interface DocumentPreviewOptions {
  render: (source: string, theme: RenderTheme) => Promise<PreviewRenderResult>;
  translate: DocumentPreviewTranslate;
}

// Successful renders are cached by source + theme. The cache is bounded: a long
// document the reader has scrolled through would otherwise retain a live SVG for
// every diagram it ever showed. The least recently shown entry is evicted first.
export const PREVIEW_CACHE_LIMIT = 200;

export interface DocumentSegment {
  kind: 'prose' | 'diagram';
  /** Prose text, or '' for a diagram segment. */
  text: string;
  /** Index into the document's diagram list, or -1 for prose. */
  diagramIndex: number;
}

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

// A fence line, optionally inside a blockquote, that only exists to carry a
// diagram — hidden from the reading view so no stray ``` shows up in prose.
const FENCE_LINE_PATTERN = /^[ \t]*(?:>[ \t]?)*(?:`{3,}|~{3,})[^\n]*$/;

export class DocumentPreview {
  private readonly cache = new Map<string, SVGSVGElement>();
  private observer: IntersectionObserver | null = null;
  private signature: string | null = null;
  private theme: RenderTheme | null = null;
  private figures: Array<{ element: HTMLElement; index: number; source: string }> = [];
  // The renderer is a single shared instance, so figures render one at a time.
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly host: HTMLElement,
    private readonly options: DocumentPreviewOptions,
  ) {}

  // Drops the memoized signature so the next update rebuilds (used on locale
  // change, where only the labels differ).
  invalidate(): void {
    this.signature = null;
  }

  update(text: string, diagrams: DiagramBlock[], theme: RenderTheme): void {
    const signature = `${themeSignature(theme)}\u0000${text}`;
    if (signature === this.signature) return;
    this.signature = signature;
    this.theme = theme;
    this.observer?.disconnect();
    this.figures = [];
    this.host.replaceChildren();

    const segments = buildDocumentSegments(text, diagrams);
    const fragment = document.createDocumentFragment();
    for (const segment of segments) {
      if (segment.kind === 'prose') {
        if (segment.text.trim() === '') continue;
        const article = document.createElement('div');
        article.className = 'doc-prose';
        article.innerHTML = proseToHtml(segment.text);
        fragment.append(article);
        continue;
      }
      const diagram = diagrams[segment.diagramIndex]!;
      fragment.append(this.createDiagramFigure(diagram, segment.diagramIndex));
    }

    if (!fragment.childNodes.length) {
      const empty = document.createElement('p');
      empty.className = 'doc-empty';
      empty.textContent = this.options.translate('list.empty');
      fragment.append(empty);
    }
    this.host.append(fragment);
    this.observeFigures();
  }

  dispose(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.cache.clear();
    this.figures = [];
    this.signature = null;
  }

  /** How many rendered diagrams are currently retained (bounded by PREVIEW_CACHE_LIMIT). */
  get cacheSize(): number {
    return this.cache.size;
  }

  // Map preserves insertion order, so delete + set is enough to move an entry to
  // the most-recently-used end.
  private takeCached(key: string): SVGSVGElement | undefined {
    const cached = this.cache.get(key);
    if (cached === undefined) return undefined;
    this.cache.delete(key);
    this.cache.set(key, cached);
    return cached;
  }

  private remember(key: string, svg: SVGSVGElement): void {
    this.cache.delete(key);
    this.cache.set(key, svg);
    while (this.cache.size > PREVIEW_CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  private createDiagramFigure(diagram: DiagramBlock, index: number): HTMLElement {
    const figure = document.createElement('figure');
    figure.className = 'doc-diagram';
    figure.dataset.docDiagram = String(index);
    figure.dataset.diagramStatus = 'pending';

    const caption = document.createElement('figcaption');
    const label = document.createElement('span');
    label.className = 'doc-diagram-label';
    label.textContent = this.options.translate('list.diagram', { index: index + 1 });
    const type = document.createElement('span');
    type.className = 'doc-diagram-type';
    type.textContent = diagram.diagramType;
    const status = document.createElement('span');
    status.className = 'doc-diagram-status';
    status.textContent = this.options.translate('preview.waiting');
    caption.append(label, type, status);

    const body = document.createElement('div');
    body.className = 'doc-diagram-body';

    figure.append(caption, body);
    this.figures.push({ element: figure, index, source: diagram.source });
    return figure;
  }

  private observeFigures(): void {
    if (this.figures.length === 0) return;
    if (typeof IntersectionObserver !== 'function') {
      for (const figure of this.figures) this.enqueue(figure);
      return;
    }
    this.observer ??= new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const figure = this.figures.find(candidate => candidate.element === entry.target);
        if (figure) this.enqueue(figure);
      }
    }, { root: this.host, rootMargin: '200px 0px' });
    for (const figure of this.figures) this.observer.observe(figure.element);
  }

  private enqueue(figure: { element: HTMLElement; index: number; source: string }): void {
    this.chain = this.chain
      .then(() => this.renderFigure(figure))
      .catch(() => undefined);
  }

  private async renderFigure(figure: { element: HTMLElement; index: number; source: string }): Promise<void> {
    const theme = this.theme;
    if (!theme) return;
    const body = figure.element.querySelector<HTMLElement>('.doc-diagram-body');
    const status = figure.element.querySelector<HTMLElement>('.doc-diagram-status');
    if (!body) return;

    const key = `${themeSignature(theme)}\u0000${figure.source}`;
    const cached = this.takeCached(key);
    if (cached) {
      this.showSvg(figure, body, status, cached);
      return;
    }

    figure.element.dataset.diagramStatus = 'rendering';
    if (status) status.textContent = this.options.translate('preview.rendering');

    try {
      const result = await this.options.render(figure.source, theme);
      if (!figure.element.isConnected || figure.element.dataset.diagramStatus !== 'rendering') return;
      this.remember(key, result.svg);
      this.showSvg(figure, body, status, result.svg);
    } catch (error) {
      if (!figure.element.isConnected) return;
      figure.element.dataset.diagramStatus = 'error';
      if (status) status.textContent = this.options.translate('preview.stale');
      const failure = document.createElement('pre');
      failure.className = 'doc-diagram-error';
      failure.textContent = error instanceof Error ? error.message : String(error);
      body.replaceChildren(failure);
    }
  }

  private showSvg(
    figure: { element: HTMLElement; index: number },
    body: HTMLElement,
    status: HTMLElement | null,
    svg: SVGSVGElement,
  ): void {
    figure.element.dataset.diagramStatus = 'ready';
    if (status) status.textContent = this.options.translate('preview.ready');
    const clone = svg.cloneNode(true) as SVGSVGElement;
    normalizePreviewSvg(clone, {
      label: this.options.translate('list.diagram', { index: figure.index + 1 }),
    });
    // Inline diagrams fill the column; the viewBox keeps the aspect ratio.
    clone.removeAttribute('width');
    clone.removeAttribute('height');
    clone.classList.add('doc-diagram-svg');
    body.replaceChildren(clone);
  }
}

// Splits the document into alternating prose and diagram segments. Fence lines
// that only wrap a diagram are folded into the diagram (not shown as prose): a
// fenced diagram's opener is stripped from the gap before it and its closer from
// the gap after it, so two adjacent fenced diagrams leave no stray ``` behind.
export function buildDocumentSegments(text: string, diagrams: DiagramBlock[]): DocumentSegment[] {
  const segments: DocumentSegment[] = [];
  let cursor = 0;
  let previousFenced = false;
  for (const diagram of diagrams) {
    const fenced = diagram.origin === 'markdown-fence';
    let gap = text.slice(cursor, diagram.range.startOffset);
    if (fenced) gap = stripTrailingFence(gap);
    if (previousFenced) gap = stripLeadingFence(gap);
    segments.push({ kind: 'prose', text: gap, diagramIndex: -1 });
    cursor = diagram.range.endOffset;
    segments.push({ kind: 'diagram', text: '', diagramIndex: diagram.index });
    previousFenced = fenced;
  }
  let tail = text.slice(cursor);
  if (previousFenced) tail = stripLeadingFence(tail);
  segments.push({ kind: 'prose', text: tail, diagramIndex: -1 });
  return segments;
}

// Drops the fence opener that belongs to the diagram that follows.
function stripTrailingFence(gap: string): string {
  const end = gap.length;
  const lineStart = gap.lastIndexOf('\n', end - 2) + 1;
  const line = gap.slice(lineStart, gap.endsWith('\n') ? end - 1 : end);
  if (!FENCE_LINE_PATTERN.test(line)) return gap;
  return gap.slice(0, lineStart);
}

// Drops the fence closer that belongs to the diagram that precedes. The diagram
// range stops at its last content character, so `tail` normally opens with the
// newline that ends that line and the closer sits on the following line.
function stripLeadingFence(tail: string): string {
  const firstBreak = tail.indexOf('\n');
  const firstLine = firstBreak < 0 ? tail : tail.slice(0, firstBreak);
  if (FENCE_LINE_PATTERN.test(firstLine)) {
    return firstBreak < 0 ? '' : tail.slice(firstBreak + 1);
  }
  if (firstBreak < 0) return tail;
  const secondBreak = tail.indexOf('\n', firstBreak + 1);
  const secondLine = tail.slice(firstBreak + 1, secondBreak < 0 ? tail.length : secondBreak);
  if (!FENCE_LINE_PATTERN.test(secondLine)) return tail;
  return tail.slice(0, firstBreak + 1) + (secondBreak < 0 ? '' : tail.slice(secondBreak + 1));
}

// A deliberately small, safe markdown subset: the text is escaped first, so the
// tags added below are the only markup that can reach the DOM.
export function proseToHtml(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let paragraph: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let code: string[] | null = null;
  let quote: string[] | null = null;

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    out.push(`<p>${inlineHtml(escapeHtml(paragraph.join('\n')))}</p>`);
    paragraph = [];
  };
  const closeList = (): void => {
    if (list === null) return;
    out.push(`</${list}>`);
    list = null;
  };
  // Consecutive quoted lines are one blockquote, not one per line.
  const closeQuote = (): void => {
    if (quote === null) return;
    out.push(`<blockquote>${quote.map(line => inlineHtml(escapeHtml(line))).join('<br>')}</blockquote>`);
    quote = null;
  };
  const closeBlocks = (): void => {
    flushParagraph();
    closeList();
    closeQuote();
  };

  for (const line of lines) {
    const fence = /^\s*(?:`{3,}|~{3,})\s*([^\s`]*)\s*$/.exec(line);
    if (code !== null) {
      if (fence) {
        out.push(`<pre class="doc-code"><code>${escapeHtml(code.join('\n'))}</code></pre>`);
        code = null;
      } else {
        code.push(line);
      }
      continue;
    }
    if (fence) {
      closeBlocks();
      code = [];
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      closeBlocks();
      const level = Math.min(heading[1]!.length + 1, 6);
      out.push(`<h${level}>${inlineHtml(escapeHtml(heading[2]!))}</h${level}>`);
      continue;
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      closeBlocks();
      out.push('<hr>');
      continue;
    }
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || ordered) {
      flushParagraph();
      closeQuote();
      const wanted = bullet ? 'ul' : 'ol';
      if (list !== wanted) {
        closeList();
        out.push(`<${wanted}>`);
        list = wanted;
      }
      out.push(`<li>${inlineHtml(escapeHtml((bullet ?? ordered)![1]!))}</li>`);
      continue;
    }
    const quoteLine = /^\s*>\s?(.*)$/.exec(line);
    if (quoteLine) {
      flushParagraph();
      closeList();
      const content = quoteLine[1]!;
      if (content.trim() === '') {
        // A blank quoted line separates two quoted paragraphs.
        closeQuote();
        continue;
      }
      (quote ??= []).push(content);
      continue;
    }
    if (line.trim() === '') {
      closeBlocks();
      continue;
    }
    closeQuote();
    paragraph.push(line);
  }

  if (code !== null) out.push(`<pre class="doc-code"><code>${escapeHtml(code.join('\n'))}</code></pre>`);
  closeBlocks();
  return out.join('');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ESCAPES[character]!);
}

// Operates on already-escaped text, so no raw '<' can survive from the document.
// Emphasis follows markdown's flanking rule — the delimiters must hug their
// content — so arithmetic such as "2 * 3 * 4" stays literal instead of turning
// into emphasis.
function inlineHtml(escaped: string): string {
  return escaped
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*(\S(?:[^*\n]*\S)?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(\S(?:[^*\n]*\S)?)\*/g, '$1<em>$2</em>')
    .replace(
      /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    );
}
