import { describe, expect, it } from 'vitest';
import {
  createWorkspaceDocument,
  createWorkspaceDocumentForDiagram,
  replaceSelectedDiagramSource,
  selectWorkspaceDiagram,
  selectedDiagram,
  setWorkspaceText,
  spliceSelectedDiagramSource,
} from '../src/document-model';

const MULTI_DOCUMENT = `# System map

\`\`\`mermaid
flowchart TD
  A[Start] --> B[Finish]
\`\`\`

Some prose.

\`\`\`xmermaid
flowchart LR
  Client --> API
\`\`\`
`;

describe('WorkspaceDocument', () => {
  it('extracts fenced diagrams from the whole document in source order', () => {
    const state = createWorkspaceDocument(MULTI_DOCUMENT);

    expect(state.document.diagrams).toHaveLength(2);
    expect(state.document.diagrams.map(diagram => diagram.source)).toEqual([
      'flowchart TD\n  A[Start] --> B[Finish]',
      'flowchart LR\n  Client --> API',
    ]);
    expect(state.document.diagrams.map(diagram => diagram.range.startLine)).toEqual([4, 11]);
    expect(state.selectedIndex).toBe(0);
  });

  it('recognizes one standalone raw flowchart', () => {
    const state = createWorkspaceDocument('flowchart TD\n  A --> B');
    expect(state.document.diagrams).toHaveLength(1);
    expect(selectedDiagram(state)?.origin).toBe('raw-mermaid-block');
  });

  it('keeps planned Mermaid families selectable in the document model', () => {
    const state = createWorkspaceDocument('```mermaid\nsequenceDiagram\n  A->>B: Hello\n```');

    expect(state.document.diagrams).toHaveLength(1);
    expect(selectedDiagram(state)).toMatchObject({
      diagramType: 'sequence',
      origin: 'markdown-fence',
    });
  });

  it('extracts an unfenced diagram embedded in prose', () => {
    const state = createWorkspaceDocument('Explanation\nflowchart TD\n  A --> B\nMore prose');
    expect(state.document.diagrams).toHaveLength(1);
    expect(selectedDiagram(state)?.source).toBe('flowchart TD\n  A --> B');
    expect(selectedDiagram(state)?.origin).toBe('raw-mermaid-block');
  });

  it('extracts an unclosed Mermaid fence', () => {
    const state = createWorkspaceDocument('```mermaid\nflowchart TD\n  A --> B');
    expect(state.document.diagrams).toHaveLength(1);
    expect(selectedDiagram(state)?.origin).toBe('markdown-fence');
  });

  it('keeps unfenced diagrams extractable while their source is edited', () => {
    const state = createWorkspaceDocument('Explanation\nflowchart TD\n  A --> B\nMore prose');
    const next = replaceSelectedDiagramSource(state, 'flowchart LR\n  X --> Y');

    expect(next.text).toBe('Explanation\nflowchart LR\n  X --> Y\nMore prose');
    expect(selectedDiagram(next)?.source).toBe('flowchart LR\n  X --> Y');
    expect(selectedDiagram(next)?.origin).toBe('raw-mermaid-block');
  });

  it('switches diagrams without copying their source into document state', () => {
    const state = selectWorkspaceDiagram(createWorkspaceDocument(MULTI_DOCUMENT), 1);
    expect(state.selectedIndex).toBe(1);
    expect(selectedDiagram(state)?.source).toContain('Client --> API');
    expect(state.text).toBe(MULTI_DOCUMENT);
  });

  it('writes a focused edit back to the matching fenced block only', () => {
    const selected = selectWorkspaceDiagram(createWorkspaceDocument(MULTI_DOCUMENT), 1);
    const next = replaceSelectedDiagramSource(selected, 'flowchart LR\n  Browser --> WASM');

    expect(next.text).toContain('A[Start] --> B[Finish]');
    expect(next.text).toContain('Browser --> WASM');
    expect(next.text).not.toContain('Client --> API');
    expect(selectedDiagram(next)?.source).toContain('Browser --> WASM');
  });

  it('clamps selection after the complete text removes diagrams', () => {
    const selected = selectWorkspaceDiagram(createWorkspaceDocument(MULTI_DOCUMENT), 1);
    const oneDiagram = setWorkspaceText(selected, 'flowchart TD\n  Only --> One');
    const empty = setWorkspaceText(oneDiagram, 'plain text');

    expect(oneDiagram.selectedIndex).toBe(0);
    expect(empty.selectedIndex).toBeNull();
  });

  it('keeps the selected diagram anchored when earlier diagrams are inserted or removed', () => {
    const selected = selectWorkspaceDiagram(createWorkspaceDocument(MULTI_DOCUMENT), 1);
    const inserted = setWorkspaceText(selected, `\`\`\`mermaid\nflowchart TD\n  New --> First\n\`\`\`\n\n${MULTI_DOCUMENT}`);
    const removed = setWorkspaceText(inserted, MULTI_DOCUMENT);

    expect(selectedDiagram(inserted)?.source).toContain('Client --> API');
    expect(inserted.selectedIndex).toBe(2);
    expect(selectedDiagram(removed)?.source).toContain('Client --> API');
    expect(removed.selectedIndex).toBe(1);
  });

  it('keeps the edited ordinal when another diagram has the old source', () => {
    const duplicateSource = 'flowchart TD\n  Duplicate --> End';
    const original = [
      '```mermaid\nflowchart TD\n  First --> End\n```',
      `\`\`\`mermaid\n${duplicateSource}\n\`\`\``,
      `\`\`\`mermaid\n${duplicateSource}\n\`\`\``,
    ].join('\n\n');
    const edited = original.replace(duplicateSource, 'flowchart TD\n  Edited --> End');
    const selected = selectWorkspaceDiagram(createWorkspaceDocument(original), 1);
    const next = setWorkspaceText(selected, edited);

    expect(next.selectedIndex).toBe(1);
    expect(selectedDiagram(next)?.source).toContain('Edited --> End');
  });

  it('restores only an existing diagram id and otherwise selects the first diagram', () => {
    expect(createWorkspaceDocumentForDiagram(MULTI_DOCUMENT, 'diagram-2').selectedIndex).toBe(1);
    expect(createWorkspaceDocumentForDiagram(MULTI_DOCUMENT, 'diagram-999').selectedIndex).toBe(0);
    expect(createWorkspaceDocumentForDiagram(MULTI_DOCUMENT, 'future-id').selectedIndex).toBe(0);
  });
});

// The deferred edit path splices ranges without re-extracting in between, so the
// stored range must be advanced after every splice or the next keystroke writes
// the previous source's leftovers back into the document.
describe('spliceSelectedDiagramSource', () => {
  const original = 'Intro line.\n```mermaid\nflowchart TD\n  A --> B\n```\nOutro line.';
  const expectedFor = (source: string): string => original.replace('flowchart TD\n  A --> B', source);

  it('keeps the tail intact across consecutive keystrokes of a growing source', () => {
    let state = createWorkspaceDocument(original);
    state = spliceSelectedDiagramSource(state, 'flowchart TD\n  A --> B\n  C --> D');
    state = spliceSelectedDiagramSource(state, 'flowchart TD\n  A --> B\n  C --> D\n  E --> F');

    expect(state.text).toBe(expectedFor('flowchart TD\n  A --> B\n  C --> D\n  E --> F'));
    expect(state.text).not.toContain('  E --> F\n  C --> D');
  });

  it('keeps the tail intact when the source shrinks', () => {
    let state = createWorkspaceDocument(original);
    state = spliceSelectedDiagramSource(state, 'flowchart TD\n  A --> B\n  C --> D\n  E --> F');
    state = spliceSelectedDiagramSource(state, 'flowchart TD\n  A --> B');

    expect(state.text).toBe(original);
  });

  it('advances the stored range so the next splice still targets the diagram', () => {
    let state = createWorkspaceDocument(original);
    state = spliceSelectedDiagramSource(state, 'flowchart TD\n  A --> B\n  C --> D');

    const diagram = selectedDiagram(state)!;
    expect(state.text.slice(diagram.range.startOffset, diagram.range.endOffset)).toBe('flowchart TD\n  A --> B\n  C --> D');
    expect(diagram.source).toBe('flowchart TD\n  A --> B\n  C --> D');
  });

  it('falls back to a full replace when the range has drifted from the source', () => {
    const state = createWorkspaceDocument(original);
    // Simulate an unrelated document edit that shifted the text under the range.
    const drifted = { ...state, text: `extra prefix\n${state.text}` };

    const next = spliceSelectedDiagramSource(drifted, 'flowchart TD\n  A --> B\n  C --> D');

    expect(next.text).toContain('extra prefix\nIntro line.');
    expect(selectedDiagram(next)?.source).toBe('flowchart TD\n  A --> B\n  C --> D');
    expect(next.text).toContain('Outro line.');
  });

  it('keeps a quoted diagram quote-consistent across keystrokes', () => {
    const quoted = '> Here is the flow:\n>\n> ```mermaid\n> flowchart TD\n>   A --> B\n> ```\n> done';
    let state = createWorkspaceDocument(quoted);
    expect(state.document.diagrams).toHaveLength(1);

    state = spliceSelectedDiagramSource(state, 'flowchart TD\n  A --> B\n  C --> D');

    expect(state.text).toBe(quoted.replace('> flowchart TD\n>   A --> B', '> flowchart TD\n>   A --> B\n>   C --> D'));
    // The marker must survive on every line of the replacement.
    expect(state.text.split('\n').filter(line => line.includes('C --> D'))[0]).toMatch(/^>/);
  });
});
