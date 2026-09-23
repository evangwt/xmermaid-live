import { describe, expect, it } from 'vitest';
import { analyzeSupport, getSupportMatrix, type DiagramType } from '@evangwt/xmermaid';
import { extractDiagrams } from '../src/diagram-extract';
import { SAMPLE_DOCUMENT } from '../src/sample';

const CAPABILITY_MARKERS: Record<DiagramType, readonly RegExp[]> = {
  flowchart: [/Found\{How many diagrams\?\}/, /Preview\["Live SVG preview"\]/],
  sequence: [/autonumber/, /Click Share/, /Note right of Hash/],
  class: [/class Workspace/, /Workspace o-- Document/, /Diagram --> Preview/],
  state: [/Pasted --> Extracted/, /Previewing --> Exported/, /note right of Previewing/],
  er: [/WORKSPACE \|\|--o\{ DOCUMENT/, /DIAGRAM \|\|--o\{ DIAGRAM_VERSION/, /string family/],
  'user-journey': [/section Discover/, /section Paste/, /section Ship/],
  gantt: [/section Shipped/, /:done, 2026-09-14, 4d/, /:milestone, 2026-10-02, 0d/],
  pie: [/"SVG file" : 46/, /"Copy source" : 8/],
  quadrant: [/HTML labels:/, /Edge IDs:/, /PDF export:/],
  requirement: [/requirement LocalOnly/, /functionalRequirement HashShare/, /LocalOnly - contains -> HashShare/],
  gitgraph: [/branch workbench/, /branch ai-syntax/, /merge ai-syntax id: "v0.4.0"/],
  c4: [/Person\(visitor/, /System_Ext\(registry/, /Rel\(workbench, registry/],
  mindmap: [/::icon\(fa fa-code\)/, /Visual flowchart edits/, /Share hash/],
  timeline: [/0\.2 : Compact workbench/, /0\.4 : AI-syntax support/],
  zenuml: [/Browser->Parser/, /Layout-->Parser/, /Parser-->Browser/],
  sankey: [/AI chat,Flowchart,42/, /Flowchart,Rendered,52/],
  xychart: [/x-axis \[100, 250, 500, 1000\]/, /bar \[48, 121, 266, 610\]/],
  block: [/columns 3/, /State\["Document state"\]:3/, /List --> Editor/],
  packet: [/Format version/, /Checksum/, /Compressed source/],
  kanban: [/done\[Shipped\]/, /doing\[In progress\]/, /ticket: XM-240/],
  architecture: [/service pages\(server\)\[GitHub Pages\]/, /service registry\(database\)\[npm registry\]/, /workbench:R --> L:pages/],
  radar: [/axis aisyntax/, /curve xm/, /curve mj/],
  'event-modeling': [/PasteSurface/, /DiagramList/, /SelectDiagram/],
  treemap: [/"SDK"/, /"WASM module": 1327/, /"Extractor": 64/],
  venn: [/set Mermaid/, /set AI/, /set Native/],
  ishikawa: [/Blank preview/, /Unterminated label/, /Missing wasm asset/],
  wardley: [/component Editor/, /component Renderer/, /Extractor -> Renderer/],
  cynefin: [/"Fix the quoted label"/, /"Redraw by hand right now"/, /"Unknown family entirely"/],
  treeview: [/Paste or type/, /Support matrix/, /Security policy/],
  swimlanes: [/subgraph You/, /subgraph Maintainers/, /fix --> verify/],
};

describe('SAMPLE_DOCUMENT', () => {
  it('covers every currently renderable diagram type with valid source', () => {
    const document = extractDiagrams(SAMPLE_DOCUMENT);
    const expectedTypes = getSupportMatrix().entries
      .filter(entry => entry.status !== 'planned')
      .map(entry => entry.diagramType)
      .sort();

    expect(document.diagnostics).toEqual([]);
    expect([...new Set(document.diagrams.map(diagram => diagram.diagramType))].sort()).toEqual(expectedTypes);
    expect(document.diagrams).toHaveLength(expectedTypes.length + 3);
    expect(document.diagrams.every(diagram => analyzeSupport(diagram.source).unsupportedFeatures.length === 0)).toBe(true);
  });

  it('demonstrates that bare diagrams without fences are recognized', () => {
    const document = extractDiagrams(SAMPLE_DOCUMENT);
    const bare = document.diagrams.filter(diagram => diagram.origin === 'raw-mermaid-block');

    expect(bare).toHaveLength(1);
    expect(bare[0]!.diagramType).toBe('flowchart');
    expect(bare[0]!.source).toMatch(/Bare\[Bare in prose\] --> Recognized/);
  });

  it('opens with the paste-flow fan-out flowchart', () => {
    const [firstDiagram] = extractDiagrams(SAMPLE_DOCUMENT).diagrams;

    expect(firstDiagram?.diagramType).toBe('flowchart');
    expect(firstDiagram?.source).toMatch(/flowchart TD/);
    expect(firstDiagram?.source).toMatch(/Found\{How many diagrams\?\}/);
    expect(firstDiagram?.source).toMatch(/\|one\| Solo/);
    expect(firstDiagram?.source).toMatch(/Preview\["Live SVG preview"\]/);
  });

  it('keeps the left-to-right pipeline as the third diagram', () => {
    const diagrams = extractDiagrams(SAMPLE_DOCUMENT).diagrams;

    expect(diagrams[2]?.source).toMatch(/flowchart LR/);
  });

  it('showcases the AI-written syntax the renderer supports', () => {
    const source = extractDiagrams(SAMPLE_DOCUMENT).diagrams
      .find(diagram => diagram.source.includes('e1@-->'))?.source ?? '';

    expect(source).toMatch(/<br\/>/);
    expect(source).toMatch(/<b>Mermaid text<\/b>/);
    expect(source).toMatch(/e1@-->/);
    expect(source).toMatch(/\|"yes, <br\/>labels included"\|/);
    expect(source).toMatch(/`[^`]*file an issue[^`]*`/);
    expect(source).toMatch(/font-size:14px/);
    expect(source).toMatch(/class Ship good/);
  });

  it('uses each diagram type to demonstrate its supported scene structure', () => {
    const diagrams = extractDiagrams(SAMPLE_DOCUMENT).diagrams;

    for (const [diagramType, markers] of Object.entries(CAPABILITY_MARKERS) as [DiagramType, readonly RegExp[]][]) {
      const source = diagrams.find(diagram => diagram.diagramType === diagramType)?.source ?? '';
      expect(source, `missing ${diagramType} sample`).not.toBe('');
      for (const marker of markers) expect(source).toMatch(marker);
    }
  });
});
