import { XMermaid } from '@evangwt/xmermaid';
import type { PreviewRenderer } from './preview-runtime';

export function createRenderSource(): PreviewRenderer {
  const renderer = new XMermaid({ container: document.createElement('div') });

  return (source, theme) => renderer.renderToSVGElement(source, {
    theme,
    wasm: {
      wasmUrl: new URL('xmermaid_wasm_bg.wasm', window.location.href),
      fetch: window.fetch.bind(window),
    },
  });
}
