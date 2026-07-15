import { XMermaid } from 'xmermaid';
import type { PreviewRenderResult } from './preview-runtime';

const renderer = new XMermaid({ container: document.createElement('div') });

export function renderSource(source: string): Promise<PreviewRenderResult> {
  return renderer.renderToSVGElement(source, {
    wasm: {
      wasmUrl: new URL('xmermaid_wasm_bg.wasm', window.location.href),
      fetch: window.fetch.bind(window),
    },
  });
}
