import { describe, expect, it } from 'vitest';
import {
  createWorkspaceDocument,
  replaceSelectedDiagramSource,
  selectWorkspaceDiagram,
  selectedDiagram,
  setWorkspaceText,
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

  it('does not guess an unfenced diagram inside prose', () => {
    const state = createWorkspaceDocument('Explanation\nflowchart TD\n  A --> B\nMore prose');
    expect(state.document.diagrams).toHaveLength(0);
    expect(state.selectedIndex).toBeNull();
  });

  it('does not extract an unclosed Mermaid fence', () => {
    const state = createWorkspaceDocument('```mermaid\nflowchart TD\n  A --> B');
    expect(state.document.diagrams).toHaveLength(0);
    expect(state.selectedIndex).toBeNull();
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
});
