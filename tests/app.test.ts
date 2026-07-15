import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountApp, type MountedApp } from '../src/app';

const DOCUMENT = `\`\`\`mermaid
flowchart TD
  A --> B
\`\`\`

\`\`\`mermaid
flowchart LR
  C --> D
\`\`\``;

let mounted: MountedApp | null = null;

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

describe('mountApp', () => {
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

  it('writes focused source edits back into the complete document', () => {
    mounted = mountApp(root(), { initialText: DOCUMENT, renderer });
    document.querySelectorAll<HTMLButtonElement>('[data-diagram-item]')[1].click();
    const input = document.querySelector<HTMLTextAreaElement>('[data-diagram-input]')!;
    input.value = 'flowchart LR\n  Browser --> WASM';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(document.querySelector<HTMLTextAreaElement>('[data-document-input]')?.value).toContain('Browser --> WASM');
    expect(document.querySelector<HTMLTextAreaElement>('[data-document-input]')?.value).toContain('A --> B');
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
          range: null,
        }],
      };
    };
    mounted = mountApp(root(), { initialText: DOCUMENT, renderer: warningRenderer, renderDelayMs: 10 });
    await vi.runAllTimersAsync();

    expect(document.querySelector('[data-preview-status]')?.textContent).toBe('已更新');
    expect(document.querySelector('[data-diagnostics]')?.textContent).toContain('unsupported_syntax');
    expect(document.querySelector('[data-preview] svg')).not.toBeNull();
  });
});
