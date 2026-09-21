import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractDiagrams, replaceDiagramSource } from '../src/diagram-extract';

// \p{...} without the u flag silently degrades to a literal 'p', so every
// unicode pattern in the table is checked for the flag.
it('marks every \\p pattern with the u flag', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/diagram-extract.ts'), 'utf8');
  for (const line of source.split('\n')) {
    if (line.includes('\\p{')) {
      expect(line.includes('/u'), `missing u flag: ${line.trim()}`).toBe(true);
    }
  }
});

function sliceSource(text: string, diagram: { range: { startOffset: number; endOffset: number } }): string {
  return text.slice(diagram.range.startOffset, diagram.range.endOffset);
}

describe('extractDiagrams', () => {
  it('keeps strict fenced extraction on the upstream path', () => {
    const text = '# Title\n\n```mermaid\nflowchart TD\n  A --> B\n```\n';
    const document = extractDiagrams(text);

    expect(document.diagrams).toHaveLength(1);
    expect(document.diagrams[0]).toMatchObject({
      origin: 'markdown-fence',
      language: 'mermaid',
      diagramType: 'flowchart',
      source: 'flowchart TD\n  A --> B',
    });
    expect(sliceSource(text, document.diagrams[0]!)).toBe('flowchart TD\n  A --> B');
  });

  it('extracts an unfenced diagram embedded in prose', () => {
    const text = 'Here is the diagram:\nflowchart TD\n  A --> B\nHope it helps.';
    const document = extractDiagrams(text);

    expect(document.diagrams).toHaveLength(1);
    expect(document.diagrams[0]).toMatchObject({
      origin: 'raw-mermaid-block',
      language: null,
      source: 'flowchart TD\n  A --> B',
    });
    expect(sliceSource(text, document.diagrams[0]!)).toBe('flowchart TD\n  A --> B');
  });

  it('extracts multiple unfenced diagrams separated by prose', () => {
    const text = [
      'Two diagrams:',
      'flowchart TD',
      '  A --> B',
      'and here is another:',
      'sequenceDiagram',
      '  A->>B: hi',
      'done.',
    ].join('\n');
    const document = extractDiagrams(text);

    expect(document.diagrams.map(diagram => diagram.diagramType)).toEqual(['flowchart', 'sequence']);
    expect(document.diagrams[0]!.source).toBe('flowchart TD\n  A --> B');
    expect(document.diagrams[1]!.source).toBe('sequenceDiagram\n  A->>B: hi');
  });

  it('splits consecutive unfenced diagrams', () => {
    const document = extractDiagrams('flowchart TD\n  A --> B\nflowchart LR\n  C --> D');

    expect(document.diagrams.map(diagram => diagram.source)).toEqual([
      'flowchart TD\n  A --> B',
      'flowchart LR\n  C --> D',
    ]);
  });

  it('extracts an unclosed fence', () => {
    const document = extractDiagrams('```mermaid\nflowchart TD\n  A --> B');

    expect(document.diagrams).toHaveLength(1);
    expect(document.diagrams[0]).toMatchObject({
      origin: 'markdown-fence',
      language: 'mermaid',
      source: 'flowchart TD\n  A --> B',
    });
  });

  it('extracts fences with an info string after the language', () => {
    const document = extractDiagrams('```mermaid {highlight: "1-2"}\nflowchart TD\n  A --> B\n```\n');

    expect(document.diagrams).toHaveLength(1);
    expect(document.diagrams[0]!.source).toBe('flowchart TD\n  A --> B');
  });

  it('infers a diagram from a neutral fence that only carries an info string', () => {
    const document = extractDiagrams('``` {highlight: "1-2"}\nflowchart TD\n  A --> B\n```\n');

    expect(document.diagrams).toHaveLength(1);
    expect(document.diagrams[0]).toMatchObject({
      origin: 'markdown-fence',
      language: 'mermaid',
      source: 'flowchart TD\n  A --> B',
    });
  });

  it('extracts tilde fences', () => {
    const document = extractDiagrams('~~~mermaid\nflowchart TD\n  A --> B\n~~~\n');

    expect(document.diagrams).toHaveLength(1);
    expect(document.diagrams[0]).toMatchObject({
      origin: 'markdown-fence',
      language: 'mermaid',
      source: 'flowchart TD\n  A --> B',
    });
  });

  it('does not double count a nested fence inside a longer fence', () => {
    const text = '````markdown\n```mermaid\nflowchart TD\n  A --> B\n```\n````\n';
    const document = extractDiagrams(text);

    expect(document.diagrams).toHaveLength(1);
    expect(document.diagrams[0]!.source).toBe('flowchart TD\n  A --> B');
  });

  it('extracts a diagram inside a fence declared with another language', () => {
    const document = extractDiagrams('```text\nsequenceDiagram\n  A->>B: hi\n```\n');

    expect(document.diagrams).toHaveLength(1);
    expect(document.diagrams[0]!.source).toBe('sequenceDiagram\n  A->>B: hi');
    expect(document.diagrams[0]!.language).toBe('mermaid');
  });

  it('ignores fenced code that is not a diagram', () => {
    const document = extractDiagrams('```js\nconst flowchart = 1;\n```\n');

    expect(document.diagrams).toHaveLength(0);
  });

  it('ignores plain prose without diagram content', () => {
    expect(extractDiagrams('plain text only').diagrams).toHaveLength(0);
    expect(extractDiagrams('').diagrams).toHaveLength(0);
  });

  it('mixes fenced and unfenced diagrams in source order', () => {
    const text = [
      '```mermaid',
      'flowchart TD',
      '  A --> B',
      '```',
      '',
      'Then bare:',
      'pie',
      '  "a": 40',
      '  "b": 60',
      '',
      '```xmermaid',
      'flowchart LR',
      '  C --> D',
      '```',
    ].join('\n');
    const document = extractDiagrams(text);

    expect(document.diagrams.map(diagram => [diagram.origin, diagram.diagramType])).toEqual([
      ['markdown-fence', 'flowchart'],
      ['raw-mermaid-block', 'pie'],
      ['markdown-fence', 'flowchart'],
    ]);
    expect(document.diagrams[1]!.source).toBe('pie\n  "a": 40\n  "b": 60');
  });

  it('keeps frontmatter and comments attached to a bare diagram', () => {
    const text = '---\ntitle: Demo\n---\n%% init\nflowchart TD\n  A --> B\n';
    const document = extractDiagrams(text);

    expect(document.diagrams).toHaveLength(1);
    expect(document.diagrams[0]!.origin).toBe('raw-mermaid-block');
    expect(document.diagrams[0]!.source)
      .toBe('---\ntitle: Demo\n---\n%% init\nflowchart TD\n  A --> B');
  });

  it('keeps a lone delimiter out of a bare diagram block', () => {
    const document = extractDiagrams('---\nflowchart TD\n  A --> B');

    expect(document.diagrams).toHaveLength(1);
    expect(document.diagrams[0]).toMatchObject({
      origin: 'raw-mermaid-block',
      diagramType: 'flowchart',
      source: 'flowchart TD\n  A --> B',
    });
  });

  it('extracts a whole-document bare diagram as a raw block', () => {
    const document = extractDiagrams('flowchart TD\n  A --> B\n');

    expect(document.diagrams).toHaveLength(1);
    expect(document.diagrams[0]!.origin).toBe('raw-mermaid-block');
    expect(document.diagrams[0]!.source).toBe('flowchart TD\n  A --> B');
  });

  it.each([
    { name: 'lowercase "end" prose', text: 'flowchart TD\n  A --> B\nend of story', expected: 'flowchart TD\n  A --> B' },
    { name: '"note:" prose', text: 'sequenceDiagram\n  A->>B: hi\nnote: remember to check', expected: 'sequenceDiagram\n  A->>B: hi' },
    { name: 'figure caption', text: 'flowchart TD\n  A --> B\nFigure 1: system architecture', expected: 'flowchart TD\n  A --> B' },
    { name: '"Title:" prose', text: 'flowchart TD\n  A --> B\nTitle: system overview', expected: 'flowchart TD\n  A --> B' },
    { name: 'markdown hr', text: 'flowchart TD\n  A --> B\n---\nSection two follows', expected: 'flowchart TD\n  A --> B' },
  ])('stops a bare block at prose and markdown: $name', ({ text, expected }) => {
    const document = extractDiagrams(text);

    expect(document.diagrams).toHaveLength(1);
    expect(document.diagrams[0]!.source).toBe(expected);
  });

  it('does not merge several diagrams behind a stray fence line', () => {
    const text = 'intro with a stray fence:\n```\nflowchart TD\n  A --> B\nflowchart LR\n  C --> D';
    const document = extractDiagrams(text);

    expect(document.diagrams).toHaveLength(0);
  });

  it('accepts the mmd fence alias', () => {
    const document = extractDiagrams('```mmd\nflowchart TD\n  A --> B\n```\n');

    expect(document.diagrams).toHaveLength(1);
    expect(document.diagrams[0]).toMatchObject({
      origin: 'markdown-fence',
      language: 'mermaid',
      source: 'flowchart TD\n  A --> B',
    });
  });

  it('extracts a fence from CRLF text', () => {
    const document = extractDiagrams('```mermaid\r\nflowchart TD\r\n  A --> B\r\n```\r\n');

    expect(document.diagrams).toHaveLength(1);
    expect(document.diagrams[0]!.source).toBe('flowchart TD\r\n  A --> B');
  });

  it('stops an unfenced diagram at markdown lists and headings', () => {
    const document = extractDiagrams('flowchart TD\n  A --> B\n- item one\n- item two');

    expect(document.diagrams[0]!.source).toBe('flowchart TD\n  A --> B');
  });

  it('keeps zero-indented unfenced bodies and stops at trailing prose', () => {
    const document = extractDiagrams('Intro\nflowchart TD\nA[Start] --> B[End]\nC --> D\nThat is all.');

    expect(document.diagrams).toHaveLength(1);
    expect(document.diagrams[0]!.source).toBe('flowchart TD\nA[Start] --> B[End]\nC --> D');
  });

  it('skips unfenced diagram headers inside fenced code blocks', () => {
    const text = '```js\nflowchart TD\n  A --> B\n```\n';
    const document = extractDiagrams(text);

    expect(document.diagrams).toHaveLength(0);
  });

  it.each([
    { name: 'sequence alt/else/end branches', text: 'sequenceDiagram\nA->>B: ok\nalt approved\nB-->>A: yes\nelse rejected\nB-->>A: no\nend' },
    { name: 'sequence par/and branches', text: 'sequenceDiagram\npar one\nA->>B: a\nand\nB->>C: b\nend' },
    { name: 'class attribute block', text: 'classDiagram\nclass BankAccount{\n+String owner\n+deposit(amount)\n}' },
    { name: 'class stereotype', text: 'classDiagram\nclass Shape\n<<interface>>' },
    { name: 'class static member block', text: 'classDiagram\nclass Shape{\n*abstractMethod()\n}' },
    { name: 'requirement block', text: 'requirementDiagram\nrequirement Login {\n  id: 1\n  text: User must log in\n}\nLogin - satisfies -> Authenticate' },
    { name: 'packet byte rows', text: 'packet\ntitle UDP\n+16: "Source Port"\n+16: "Destination Port"' },
    { name: 'sankey rows', text: 'sankey\nSource,Qualified,36\nSource,Nurture,24' },
    { name: 'quadrant points', text: 'quadrantChart\ntitle Reach\nCampaign A: [0.25, 0.75]\nCampaign B: [0.70, 0.80]' },
    { name: 'treemap quoted labels', text: 'treemap-beta\n"Platform"\n    "Editor": 28' },
    { name: 'cynefin sections', text: 'cynefin-beta\ncomplex\n"Investigate root cause"\ncomplicated\n"Expert review needed"' },
    { name: 'wardley components', text: 'wardley-beta\nanchor Customer [0.95, 0.70]\ncomponent Storefront [0.78, 0.78]\nCustomer -> Storefront' },
    { name: 'radar axes and curves', text: 'radar-beta\naxis food["Food"], service["Service"]\ncurve a["A"]{4, 3}' },
    { name: 'journey rated tasks', text: 'journey\ntitle Checkout\nsection Explore\nFind product: 5: Buyer\nCompare options: 4: Buyer' },
    { name: 'timeline continuation lines', text: 'timeline\n2024 : First release\n: Team grows\n2025 : Global launch' },
    { name: 'architecture services', text: 'architecture-beta\nservice web(server)[Web]\nservice db(database)[Database]\nweb:R --> L:api' },
    { name: 'venn sets and unions', text: 'venn-beta\nset Frontend\nset Backend\nunion Frontend,Backend["APIs"]' },
    { name: 'quadrant sections', text: 'quadrantChart\ntitle Reach\nquadrant-1 Expand\nCampaign A: [0.25, 0.75]' },
    { name: 'event-modeling rows', text: 'eventmodeling\ntf 01 ui CartUI\ntf 02 cmd AddItem\ntimeframe 06 cmd PlaceOrder' },
    { name: 'packet byte ranges', text: 'packet\ntitle UDP\n32-47: "Length"\n+16: "Source Port"' },
  ])('collects zero-indent statements of every family: $name', ({ text }) => {
    const document = extractDiagrams(text);

    expect(document.diagrams).toHaveLength(1);
    expect(document.diagrams[0]!.source).toBe(text);
  });

  it('leaves bare-word ishikawa bodies unextracted instead of corrupted', () => {
    const document = extractDiagrams('ishikawa-beta\nBlurry Photo\nProcess\n  Out of focus');

    // Bare-word lines are indistinguishable from prose (documented limit), so
    // the header alone never forms a block.
    expect(document.diagrams).toHaveLength(0);
  });

  it.each([
    { name: 'prose comma list without numeric tail', text: 'flowchart TD\n  A --> B\nAlice, Bob, and Carol attended' },
    { name: 'quoted dialogue line', text: 'flowchart TD\n  A --> B\n"He said" and left' },
    { name: 'comma dialogue line', text: 'flowchart TD\n  A --> B\n"Hello", he said' },
    { name: 'integer bracket pair', text: 'flowchart TD\n  A --> B\nsee values [1, 2] here' },
    { name: 'emphasis line', text: 'flowchart TD\n  A --> B\n*very* important note' },
  ])('keeps prose out of the block: $name', ({ text }) => {
    const document = extractDiagrams(text);

    expect(document.diagrams[0]!.source).toBe('flowchart TD\n  A --> B');
  });

  const unfencedPastes: Array<{ name: string; text: string; expected?: string }> = [
    { name: 'whole document is a bare diagram', text: 'flowchart TD\nA --> B\nB --> C' },
    { name: 'zh prose around, blank lines', text: '下面是一个流程图：\n\nflowchart TD\n    A[开始] --> B{判断}\n    B -->|是| C[结束]\n\n希望对你有帮助！', expected: 'flowchart TD\n    A[开始] --> B{判断}\n    B -->|是| C[结束]' },
    { name: 'zh prose tight, no blanks', text: '如下：\nflowchart TD\nA --> B\n如图所示。', expected: 'flowchart TD\nA --> B' },
    { name: 'init directive first', text: '%%{init: {\'theme\':\'forest\'}}%%\nflowchart TD\nA --> B' },
    { name: 'comment after header', text: 'flowchart TD\n%% 这是注释\nA --> B' },
    { name: 'subgraph and end', text: 'flowchart TD\n  A --> B\n  subgraph inner\n    C --> D\n  end' },
    { name: 'zero-indent class', text: 'classDiagram\nclass Animal\nAnimal : +int age', expected: 'classDiagram\nclass Animal\nAnimal : +int age' },
    { name: 'zero-indent state', text: 'stateDiagram-v2\n[*] --> idle\nidle --> running' },
    { name: 'zero-indent er', text: 'erDiagram\nCUSTOMER ||--o{ ORDER : places' },
    { name: 'zero-indent sequence', text: 'sequenceDiagram\nautonumber\nA->>B: 你好\nB-->>A: 嗨' },
    { name: 'zero-indent xychart', text: 'xychart-beta\ntitle "Sales"\nx-axis [jan, feb, mar]\nline [5000, 6000, 7500]' },
    { name: 'bare gantt', text: 'gantt\ndateFormat YYYY-MM-DD\nsection 设备\n任务一 :a1, 2024-01-01, 30d' },
    { name: 'bare mindmap', text: 'mindmap\nroot((mindmap))\n  Origins\n    Long history' },
    { name: 'bare gitgraph', text: 'gitGraph\ncommit id: "one"\nbranch develop\ncommit' },
    { name: 'frontmatter bare', text: '说明\n\n---\ntitle: Demo\n---\nflowchart TD\nA --> B', expected: '---\ntitle: Demo\n---\nflowchart TD\nA --> B' },
    { name: 'crlf endings', text: 'intro\r\nflowchart TD\r\nA --> B\r\noutro', expected: 'flowchart TD\r\nA --> B' },
  ];

  it.each(unfencedPastes)('recognizes a fenceless paste: $name', ({ text, expected }) => {
    const document = extractDiagrams(text);

    expect(document.diagrams).toHaveLength(1);
    expect(document.diagrams[0]!.origin).toBe('raw-mermaid-block');
    expect(document.diagrams[0]!.source).toBe(expected ?? text);
  });
});

describe('replaceDiagramSource', () => {
  it('rewrites an unfenced diagram in place and keeps surrounding prose', () => {
    const text = 'Intro\nflowchart TD\n  A --> B\nOutro';
    const document = extractDiagrams(text);

    const next = replaceDiagramSource(text, 'diagram-1', 'flowchart LR\n  X --> Y', document);

    expect(next.text).toBe('Intro\nflowchart LR\n  X --> Y\nOutro');
    expect(next.document.diagrams).toHaveLength(1);
    expect(next.document.diagrams[0]!.source).toBe('flowchart LR\n  X --> Y');
  });

  it('keeps later unfenced diagrams extractable after an edit', () => {
    const text = 'flowchart TD\n  A --> B\n\nmid prose\n\nsequenceDiagram\n  A->>B: hi';
    const document = extractDiagrams(text);

    const next = replaceDiagramSource(text, 'diagram-1', 'flowchart TD\n  Z --> W', document);

    expect(next.document.diagrams.map(diagram => diagram.diagramType)).toEqual(['flowchart', 'sequence']);
    expect(next.document.diagrams[1]!.source).toBe('sequenceDiagram\n  A->>B: hi');
  });

  it('rewrites the source of an unclosed fence in place', () => {
    const text = '```mermaid\nflowchart TD\n  A --> B';
    const document = extractDiagrams(text);

    const next = replaceDiagramSource(text, 'diagram-1', 'flowchart LR\n  X --> Y', document);

    expect(next.text).toBe('```mermaid\nflowchart LR\n  X --> Y');
    expect(next.document.diagrams).toHaveLength(1);
    expect(next.document.diagrams[0]!.source).toBe('flowchart LR\n  X --> Y');
  });

  it('reports a missing diagram without changing the text', () => {
    const text = 'flowchart TD\n  A --> B';
    const document = extractDiagrams(text);

    const next = replaceDiagramSource(text, 'diagram-999', 'flowchart TD\n  X --> Y', document);

    expect(next.text).toBe(text);
    expect(next.document.diagnostics.some(diagnostic => diagnostic.code === 'diagram_not_found')).toBe(true);
  });
});
