import {
  extractDiagrams,
  replaceDiagramSource,
  type DiagramBlock,
  type DiagramDocument,
} from '@evangwt/xmermaid/editor';

export interface WorkspaceDocument {
  text: string;
  document: DiagramDocument;
  selectedIndex: number | null;
}

export function createWorkspaceDocument(text: string, preferredIndex = 0): WorkspaceDocument {
  const document = extractDiagrams(text);
  return workspaceDocument(text, document, normalizeSelection(document.diagrams.length, preferredIndex));
}

export function createWorkspaceDocumentForDiagram(
  text: string,
  preferredDiagramId: string | null,
): WorkspaceDocument {
  const document = extractDiagrams(text);
  const selectedIndex = document.diagrams.findIndex(diagram => diagram.id === preferredDiagramId);
  return workspaceDocument(text, document, selectedIndex >= 0 ? selectedIndex : normalizeSelection(document.diagrams.length, 0));
}

export function setWorkspaceText(state: WorkspaceDocument, text: string): WorkspaceDocument {
  const document = extractDiagrams(text);
  const selectedIndex = preserveSelection(
    state.document.diagrams,
    document.diagrams,
    state.selectedIndex,
  );
  return workspaceDocument(text, document, selectedIndex);
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

function preserveSelection(
  previous: DiagramBlock[],
  next: DiagramBlock[],
  selectedIndex: number | null,
): number | null {
  if (next.length === 0) return null;
  if (selectedIndex === null || !previous[selectedIndex]) return normalizeSelection(next.length, 0);

  const overlap = Math.min(previous.length, next.length);
  let prefixLength = 0;
  while (
    prefixLength < overlap
    && previous[prefixLength]?.source === next[prefixLength]?.source
  ) prefixLength += 1;

  let suffixLength = 0;
  while (
    suffixLength < overlap - prefixLength
    && previous[previous.length - suffixLength - 1]?.source === next[next.length - suffixLength - 1]?.source
  ) suffixLength += 1;

  if (selectedIndex < prefixLength) return selectedIndex;
  if (selectedIndex >= previous.length - suffixLength) {
    return next.length - (previous.length - selectedIndex);
  }

  const selectedSource = previous[selectedIndex].source;
  const previousMatches = previous.filter(diagram => diagram.source === selectedSource);
  const nextMatches = next
    .map((diagram, index) => ({ diagram, index }))
    .filter(candidate => candidate.diagram.source === selectedSource);
  if (previousMatches.length === 1 && nextMatches.length === 1) return nextMatches[0]!.index;

  const changedStart = prefixLength;
  const changedLength = next.length - prefixLength - suffixLength;
  if (changedLength === 0) return normalizeSelection(next.length, changedStart);
  const relativeIndex = Math.max(0, selectedIndex - prefixLength);
  return changedStart + Math.min(relativeIndex, changedLength - 1);
}

function workspaceDocument(
  text: string,
  document: DiagramDocument,
  selectedIndex: number | null,
): WorkspaceDocument {
  return { text, document, selectedIndex };
}
