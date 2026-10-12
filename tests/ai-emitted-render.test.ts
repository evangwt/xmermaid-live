import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { LIGHT_THEME } from '@evangwt/xmermaid';

import { createRenderSource } from '../src/render-source';

// The app's render source loads WASM through `window.fetch` against the URL
// served next to the page. Under jsdom there is no server, so serve the real
// packaged `.wasm` bytes for that URL and let the real wasm-bindgen module
// initialize. Everything downstream of that is the production path.
const wasmBytes = readFileSync(
  resolve(process.cwd(), 'node_modules/@evangwt/xmermaid/dist/xmermaid_wasm_bg.wasm'),
);

beforeAll(() => {
  Object.defineProperty(window, 'fetch', {
    configurable: true,
    value: async () => new Response(wasmBytes, {
      headers: { 'content-type': 'application/wasm' },
    }),
  });
});

type Rendered = { svg: SVGElement; diagnostics: { severity: string; message: string }[] };

async function render(source: string): Promise<Rendered> {
  const result = await createRenderSource()(source, LIGHT_THEME);
  return result as Rendered;
}

function errors(diagnostics: Rendered['diagnostics']): string[] {
  return diagnostics.filter(d => d.severity === 'error').map(d => d.message);
}

describe('AI-emitted Mermaid that previously failed to render', () => {
  it('renders the full Mermaid sequence arrow set', async () => {
    const { svg, diagnostics } = await render(`sequenceDiagram
  Alice->>Bob: solid async
  Alice->Bob: solid
  Alice-->>Bob: dashed async
  Alice-->Bob: dashed
  Alice-xBob: solid cross
  Alice--xBob: dashed cross
  Alice-)Bob: solid open
  Alice--)Bob: dashed open
  Alice<<->>Bob: bidirectional
`);

    expect(errors(diagnostics)).toEqual([]);
    expect(svg.querySelectorAll('text').length).toBeGreaterThan(0);
  });

  it('renders a class diagram with an explicit direction', async () => {
    const { svg, diagnostics } = await render(`classDiagram
  direction TB
  Animal <|-- Duck
  Animal <|-- Fish
`);

    expect(errors(diagnostics)).toEqual([]);
    const boxes = [...svg.querySelectorAll('rect, polygon')];
    expect(boxes.length).toBeGreaterThan(0);
  });

  it('accepts class diagram notes instead of failing the chart', async () => {
    const { svg, diagnostics } = await render(`classDiagram
  class Animal
  note for Animal "Animals are living beings"
  class Duck
  Animal <|-- Duck
`);

    expect(errors(diagnostics)).toEqual([]);
    expect(svg.querySelectorAll('text').length).toBeGreaterThan(0);
  });

  it('accepts quadrant point-to-point connectors', async () => {
    const { svg, diagnostics } = await render(`quadrantChart
  title Reach and engagement
  x-axis Low Reach --> High Reach
  y-axis Low Engagement --> High Engagement
  quadrant-1 We should expand
  quadrant-2 Need to promote
  quadrant-3 Re-evaluate
  quadrant-4 May be improved
  Campaign A: [0.3, 0.6]
  Campaign B: [0.45, 0.23]
  Campaign A --> Campaign B
`);

    expect(errors(diagnostics)).toEqual([]);
    expect(svg.querySelectorAll('text').length).toBeGreaterThan(0);
  });

  it('renders a mindmap icon written on the same line as its label', async () => {
    const { svg, diagnostics } = await render(`mindmap
  root((mindmap))
    Origins
      ::icon(fa fa-book) Long history
    Research
`);

    expect(errors(diagnostics)).toEqual([]);
    expect(svg.textContent).toContain('Long history');
  });

  it('applies safe linkStyle indices and stroke-width / dasharray values', async () => {
    const { svg, diagnostics } = await render(`flowchart LR
  A --> B
  A --> C
  linkStyle 0 stroke:#ff0000,stroke-width:2
  linkStyle 1 stroke-width:2px
  linkStyle 0,1 stroke-dasharray:5 5
`);

    expect(errors(diagnostics)).toEqual([]);
    expect(svg.querySelectorAll('path').length).toBeGreaterThan(0);
  });

  it('still blocks genuinely unsafe style values', async () => {
    for (const directive of [
      'linkStyle 0 stroke:url(#evil)',
      'linkStyle 0 stroke-width:abc',
    ]) {
      await expect(render(`flowchart LR
  A --> B
  ${directive}
`), directive).rejects.toThrow(/linkStyle/);
    }
  });
});
