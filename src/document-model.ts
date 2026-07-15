import {
  extractDiagrams,
  replaceDiagramSource,
  type DiagramBlock,
  type DiagramDocument,
} from 'xmermaid/editor';

export interface WorkspaceDocument {
  text: string;
  document: DiagramDocument;
  selectedIndex: number | null;
}

export function createWorkspaceDocument(text: string, preferredIndex = 0): WorkspaceDocument {
  const document = extractDiagrams(text);
  return {
    text,
    document,
    selectedIndex: normalizeSelection(document.diagrams.length, preferredIndex),
  };
}

export function setWorkspaceText(state: WorkspaceDocument, text: string): WorkspaceDocument {
  return createWorkspaceDocument(text, state.selectedIndex ?? 0);
}

export function selectWorkspaceDiagram(state: WorkspaceDocument, index: number): WorkspaceDocument {
  if (!Number.isInteger(index) || index < 0 || index >= state.document.diagrams.length) return state;
  return { ...state, selectedIndex: index };
}

export function selectedDiagram(state: WorkspaceDocument): DiagramBlock | null {
  if (state.selectedIndex === null) return null;
  return state.document.diagrams[state.selectedIndex] ?? null;
}

export function replaceSelectedDiagramSource(
  state: WorkspaceDocument,
  nextSource: string,
): WorkspaceDocument {
  const selected = selectedDiagram(state);
  if (!selected) return state;

  const replaced = replaceDiagramSource(state.text, selected.id, nextSource, state.document);
  return {
    text: replaced.text,
    document: replaced.document,
    selectedIndex: normalizeSelection(replaced.document.diagrams.length, selected.index),
  };
}

function normalizeSelection(diagramCount: number, preferredIndex: number): number | null {
  if (diagramCount === 0) return null;
  return Math.min(Math.max(0, preferredIndex), diagramCount - 1);
}
