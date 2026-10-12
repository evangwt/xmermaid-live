import { afterEach, describe, expect, it, vi } from 'vitest';
import { DARK_THEME } from '@evangwt/xmermaid';
import { DocumentPreview, PREVIEW_CACHE_LIMIT, buildDocumentSegments, proseToHtml } from '../src/document-preview';
import { extractDiagrams } from '../src/diagram-extract';
import type { PreviewRenderer } from '../src/preview-runtime';
import '../src/styles.css';

const translate = (key: string, values?: Record<string, string | number>): string =>
  (values ? `${key}:${JSON.stringify(values)}` : key);

function fakeSvg(label: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 50');
  svg.setAttribute('width', '100');
  svg.setAttribute('height', '50');
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.textContent = label;
  svg.append(text);
  return svg;
}

function host(): HTMLElement {
  const element = document.createElement('div');
  document.body.append(element);
  return element;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('buildDocumentSegments', () => {
  it('alternates prose and diagram segments in source order', () => {
    const text = 'intro\n\n```mermaid\nflowchart TD\n  A --> B\n```\n\noutro';
    const document = extractDiagrams(text);

    const segments = buildDocumentSegments(text, document.diagrams);

    expect(segments.map(segment => segment.kind)).toEqual(['prose', 'diagram', 'prose']);
    expect(segments[0]!.text).toBe('intro\n\n');
    expect(segments[2]!.text).toBe('\n\noutro');
  });

  it('folds a diagram fence into the diagram instead of leaving stray markers in prose', () => {
    const text = 'before\n```mermaid\nflowchart TD\n  A --> B\n```\nafter';
    const document = extractDiagrams(text);

    const segments = buildDocumentSegments(text, document.diagrams);

    expect(segments[0]!.text).toBe('before\n');
    expect(segments[2]!.text).toBe('\nafter');
  });

  it('leaves a bare diagram unfenced in the prose around it', () => {
    const text = 'Intro\nflowchart TD\n  A --> B\nOutro';
    const document = extractDiagrams(text);

    const segments = buildDocumentSegments(text, document.diagrams);

    expect(segments[0]!.text).toBe('Intro\n');
    expect(segments[2]!.text).toBe('\nOutro');
  });

  it('leaves no stray fence between two adjacent fenced diagrams', () => {
    const text = '```mermaid\nflowchart TD\n  A --> B\n```\n```mermaid\nflowchart LR\n  C --> D\n```\n';
    const document = extractDiagrams(text);
    expect(document.diagrams).toHaveLength(2);

    const segments = buildDocumentSegments(text, document.diagrams);

    expect(segments.map(segment => segment.kind)).toEqual(['prose', 'diagram', 'prose', 'diagram', 'prose']);
    for (const segment of segments.filter(segment => segment.kind === 'prose')) {
      expect(segment.text).not.toContain('```');
      // A leftover closer would render as an empty code block.
      expect(proseToHtml(segment.text)).not.toContain('doc-code');
    }
  });
});

describe('proseToHtml', () => {
  it('escapes document markup instead of rendering it', () => {
    const html = proseToHtml('<script>alert(1)</script>\n<img src=x onerror=alert(1)>');

    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('leaves arithmetic asterisks alone instead of reading them as emphasis', () => {
    const html = proseToHtml('Width = 2 * 3 * 4 px');

    expect(html).not.toContain('<em>');
    expect(html).toContain('2 * 3 * 4');
  });

  it('still reads emphasis that hugs its content', () => {
    expect(proseToHtml('a *real* word')).toContain('<em>real</em>');
    expect(proseToHtml('**bold** text')).toContain('<strong>bold</strong>');
  });

  it('keeps a multi-line quote in one blockquote', () => {
    const html = proseToHtml('> line one\n> line two\n> line three');

    expect(html).toBe('<blockquote>line one<br>line two<br>line three</blockquote>');
    expect(html.match(/<blockquote>/g)).toHaveLength(1);
  });

  it('separates quoted paragraphs at a blank quoted line', () => {
    const html = proseToHtml('> first\n>\n> second');

    expect(html.match(/<blockquote>/g)).toHaveLength(2);
    expect(html).toContain('<blockquote>first</blockquote>');
    expect(html).toContain('<blockquote>second</blockquote>');
  });

  it('renders a small safe markdown subset', () => {
    const html = proseToHtml('# Title\n\n- one\n- two\n\n```js\nconst a = 1;\n```\n\n**bold** and `code`');

    expect(html).toContain('<h2>Title</h2>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<pre class="doc-code"><code>const a = 1;</code></pre>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>code</code>');
  });

  it('only links http(s) and mailto targets', () => {
    expect(proseToHtml('[ok](https://example.com)')).toContain('href="https://example.com"');
    expect(proseToHtml('[mail](mailto:a@b.c)')).toContain('href="mailto:a@b.c"');
    expect(proseToHtml('[bad](javascript:alert(1))')).not.toContain('href=');
  });

  it('keeps an inline code span literal instead of marking it up', () => {
    const html = proseToHtml('Use `*a*` and `[x](https://y.z)` verbatim.');

    expect(html).toContain('<code>*a*</code>');
    expect(html).toContain('<code>[x](https://y.z)</code>');
    expect(html).not.toContain('<em>');
    expect(html).not.toContain('href=');
  });

  it('recognizes a fence whose info string contains spaces', () => {
    const html = proseToHtml('```js {linenos}\nconst a = 1;\n```');

    expect(html).toBe('<pre class="doc-code"><code>const a = 1;</code></pre>');
    // The opener must not leak into prose, and no empty block may be left behind.
    expect(html).not.toContain('linenos');
    expect(html.match(/doc-code/g)).toHaveLength(1);
  });

  it('keeps a tilde fence with an info string out of prose', () => {
    expect(proseToHtml('~~~bash title="build"\nnpm run build\n~~~')).toBe(
      '<pre class="doc-code"><code>npm run build</code></pre>',
    );
  });
});

describe('DocumentPreview', () => {
  it('renders every diagram inline with the document prose', async () => {
    const text = 'Intro\n\n```mermaid\nflowchart TD\n  A --> B\n```\n\nOutro';
    const document = extractDiagrams(text);
    const element = host();
    const preview = new DocumentPreview(element, { render: async source => ({ svg: fakeSvg(source), diagnostics: [] }), translate });

    preview.update(text, document.diagrams, DARK_THEME);

    await vi.waitFor(() => {
      expect(element.querySelector('.doc-diagram')?.getAttribute('data-diagram-status')).toBe('ready');
    });
    expect(element.querySelectorAll('.doc-diagram')).toHaveLength(1);
    expect(element.querySelector('.doc-diagram-svg')).not.toBeNull();
    expect(element.querySelector('.doc-prose')?.textContent).toContain('Intro');
  });

  it('surfaces a render failure instead of a blank canvas', async () => {
    const text = '```mermaid\nflowchart TD\n  A --> B\n```';
    const document = extractDiagrams(text);
    const element = host();
    const preview = new DocumentPreview(element, {
      render: async () => { throw new Error('boom'); },
      translate,
    });

    preview.update(text, document.diagrams, DARK_THEME);

    await vi.waitFor(() => {
      expect(element.querySelector('.doc-diagram')?.getAttribute('data-diagram-status')).toBe('error');
    });
    expect(element.querySelector('.doc-diagram-error')?.textContent).toBe('boom');
  });

  it('renders a repeated source once', async () => {
    const text = '```mermaid\nflowchart TD\n  A --> B\n```\n\n```mermaid\nflowchart TD\n  A --> B\n```';
    const document = extractDiagrams(text);
    const render = vi.fn(async (source: string) => ({ svg: fakeSvg(source), diagnostics: [] }));
    const element = host();
    const preview = new DocumentPreview(element, { render, translate });

    preview.update(text, document.diagrams, DARK_THEME);

    await vi.waitFor(() => {
      expect(element.querySelectorAll('[data-diagram-status="ready"]')).toHaveLength(2);
    });
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('rebuilds after invalidate even when the text is unchanged', () => {
    const text = 'flowchart TD\n  A --> B';
    const document = extractDiagrams(text);
    const element = host();
    const preview = new DocumentPreview(element, { render: async source => ({ svg: fakeSvg(source), diagnostics: [] }), translate });

    preview.update(text, document.diagrams, DARK_THEME);
    element.replaceChildren();
    preview.update(text, document.diagrams, DARK_THEME);
    expect(element.querySelectorAll('.doc-diagram')).toHaveLength(0);

    preview.invalidate();
    preview.update(text, document.diagrams, DARK_THEME);
    expect(element.querySelectorAll('.doc-diagram')).toHaveLength(1);
  });
});

describe('DocumentPreview renderer contract', () => {
  it('uses the injected renderer as a PreviewRenderer', async () => {
    const render: PreviewRenderer = async source => ({ svg: fakeSvg(source), diagnostics: [] });
    const text = 'flowchart TD\n  A --> B';
    const document = extractDiagrams(text);
    const element = host();
    const preview = new DocumentPreview(element, { render, translate });

    preview.update(text, document.diagrams, DARK_THEME);

    await vi.waitFor(() => {
      expect(element.querySelector('.doc-diagram-svg')?.textContent).toContain('flowchart TD');
    });
  });
});

describe('DocumentPreview render cache', () => {
  it('reuses a cached render instead of rendering the same source twice', async () => {
    const text = '```mermaid\nflowchart TD\n  A --> B\n```\n\n```mermaid\nflowchart LR\n  C --> D\n```';
    const document = extractDiagrams(text);
    const rendered: string[] = [];
    const element = host();
    const preview = new DocumentPreview(element, {
      render: async source => {
        rendered.push(source);
        return { svg: fakeSvg(source), diagnostics: [] };
      },
      translate,
    });

    preview.update(text, document.diagrams, DARK_THEME);
    await vi.waitFor(() => expect(element.querySelectorAll('.doc-diagram-svg')).toHaveLength(2));
    expect(rendered).toHaveLength(2);

    // A rebuild (e.g. the tab was left and re-entered) must come from the cache.
    preview.invalidate();
    preview.update(text, document.diagrams, DARK_THEME);
    await vi.waitFor(() => expect(element.querySelectorAll('.doc-diagram-svg')).toHaveLength(2));
    expect(rendered).toHaveLength(2);
  });

  it('stays bounded so a long document does not retain every render', async () => {
    const count = PREVIEW_CACHE_LIMIT + 25;
    const sources = Array.from({ length: count }, (_, index) => `flowchart TD\n  A${index} --> B${index}`);
    const text = sources.map(source => `\`\`\`mermaid\n${source}\n\`\`\``).join('\n');
    const document = extractDiagrams(text);
    expect(document.diagrams).toHaveLength(count);

    const rendered: string[] = [];
    const element = host();
    const preview = new DocumentPreview(element, {
      render: async source => {
        rendered.push(source);
        return { svg: fakeSvg(source), diagnostics: [] };
      },
      translate,
    });

    preview.update(text, document.diagrams, DARK_THEME);
    await vi.waitFor(() => expect(rendered).toHaveLength(count));

    expect(preview.cacheSize).toBeLessThanOrEqual(PREVIEW_CACHE_LIMIT);
  });
});
