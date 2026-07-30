import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DARK_THEME } from '@evangwt/xmermaid';

const constructors = vi.hoisted(() => vi.fn());
const renderToSVGElement = vi.hoisted(() => vi.fn(() => Promise.resolve({
  svg: document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
  diagnostics: [],
})));

vi.mock('@evangwt/xmermaid', async importOriginal => {
  const actual = await importOriginal<typeof import('@evangwt/xmermaid')>();
  return {
    ...actual,
    XMermaid: class {
      constructor() {
        constructors();
      }

      renderToSVGElement = renderToSVGElement;
    },
  };
});

import { createRenderSource } from '../src/render-source';

beforeEach(() => {
  constructors.mockClear();
  renderToSVGElement.mockClear();
});

describe('createRenderSource', () => {
  it('gives each mounted app its own renderer lifecycle', () => {
    const first = createRenderSource();
    const second = createRenderSource();

    expect(first).not.toBe(second);
    expect(constructors).toHaveBeenCalledTimes(2);
  });

  it('forwards the complete theme with the explicit WASM loader options', async () => {
    const render = createRenderSource();
    await render('flowchart LR\nA-->B', DARK_THEME);

    expect(renderToSVGElement).toHaveBeenCalledWith('flowchart LR\nA-->B', {
      theme: DARK_THEME,
      wasm: {
        wasmUrl: new URL('xmermaid_wasm_bg.wasm', window.location.href),
        fetch: expect.any(Function),
      },
    });
  });
});
