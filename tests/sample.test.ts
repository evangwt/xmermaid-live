import { describe, expect, it } from 'vitest';
import { analyzeSupport, getSupportMatrix, type DiagramType } from '@evangwt/xmermaid';
import { extractDiagrams } from '@evangwt/xmermaid/editor';
import { SAMPLE_DOCUMENT } from '../src/sample';

const CAPABILITY_MARKERS: Record<DiagramType, readonly RegExp[]> = {
  flowchart: [/Decision -->\|Laptop\| Laptop/, /Compare --> Checkout/],
  sequence: [/participant Payments/, /alt Payment approved/, /Note right of Gateway/],
  class: [/class Account/, /Account <\|-- Customer/, /Order --> Customer/],
  state: [/Reviewing --> Approved/, /Published --> Archived/],
  er: [/ORDER \|\|--o\{ ORDER_LINE/, /PRODUCT \|\|--o\{ ORDER_LINE/],
  'user-journey': [/section Explore/, /section Purchase/, /section Retain/],
  gantt: [/section Discovery/, /section Delivery/, /Review :/],
  pie: [/"Passed" : 62/, /"Blocked" : 8/],
  quadrant: [/Campaign A:/, /Campaign B:/, /Campaign C:/, /Campaign D:/],
  requirement: [/requirement Login/, /functionalRequirement Authenticate/, /functionalRequirement RecoverAccount/],
  gitgraph: [/branch develop/, /branch release/, /merge develop/],
  c4: [/Person\(customer/, /System_Ext\(email/, /Rel\(banking, email/],
  mindmap: [/Editor/, /Preview/, /Export/],
  timeline: [/2024 : First release/, /2026 : Enterprise rollout/],
  zenuml: [/Alice->Bob: Authenticate/, /Bob->Payments: Charge/, /Payments-->Bob: Receipt/],
  sankey: [/Source,Qualified,36/, /Qualified,Won,18/, /Qualified,Nurture,18/],
  xychart: [/x-axis \[Q1, Q2, Q3, Q4\]/, /bar \[20, 40, 55, 70\]/],
  block: [/columns 4/, /Browser --> Editor/, /Renderer --> Export/],
  packet: [/Source Port/, /Payload/, /Data \(variable length\)/],
  kanban: [/backlog\[Backlog\]/, /doing\[In progress\]/, /done\[Done\]/],
  architecture: [/service web\(server\)\[Web\]/, /service worker\(server\)\[Worker\]/, /web:R --> L:api/],
  radar: [/axis food/, /curve a/, /curve c/],
  'event-modeling': [/CartUI/, /CartSummary/, /PlaceOrder/],
  treemap: [/"Platform"/, /"Editor": 28/, /"Renderer": 36/],
  venn: [/set Frontend/, /set Backend/, /set Platform/],
  ishikawa: [/Process/, /Equipment/, /Environment/],
  wardley: [/component Storefront/, /component Payment/, /Storefront -> Checkout/],
  cynefin: [/"Investigate root cause"/, /"Run a standard procedure"/, /"Stabilize immediately"/],
  treeview: [/Desktop/, /Mobile/, /Command palette/],
  swimlanes: [/subgraph Customer/, /subgraph Support/, /subgraph Engineering/],
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
    expect(document.diagrams).toHaveLength(expectedTypes.length + 1);
    expect(document.diagrams.every(diagram => analyzeSupport(diagram.source).unsupportedFeatures.length === 0)).toBe(true);
  });

  it('opens with a complex top-down fan-out flowchart', () => {
    const [firstDiagram] = extractDiagrams(SAMPLE_DOCUMENT).diagrams;

    expect(firstDiagram?.diagramType).toBe('flowchart');
    expect(firstDiagram?.source).toMatch(/flowchart TD/);
    expect(firstDiagram?.source).toMatch(/Decision -->\|Laptop\| Laptop/);
    expect(firstDiagram?.source).toMatch(/Decision -->\|iPhone\| Phone/);
    expect(firstDiagram?.source).toMatch(/Decision -->\|Car\| Car/);
  });

  it('keeps a left-to-right flowchart alongside the top-down stress case', () => {
    const diagrams = extractDiagrams(SAMPLE_DOCUMENT).diagrams;

    expect(diagrams[1]?.source).toMatch(/flowchart LR/);
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
