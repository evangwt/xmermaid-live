import type {
  DiagramBlock,
  DiagramDocument,
} from '@evangwt/xmermaid/editor';
import { diagramRangeHoldsSource, extractDiagrams, replaceDiagramSource, spliceDiagramSource } from './diagram-extract';

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

// Cheap alternative to replaceSelectedDiagramSource for very large documents:
// splices the text without re-extracting, and keeps the edited diagram's range
// in sync so a following keystroke can splice again correctly. Line/column and
// the diagram list are refreshed by the deferred re-extraction that follows.
// Falls back to the full replace if the range no longer holds the diagram's
// source (the text drifted under it), which is always correct, just slower.
export function spliceSelectedDiagramSource(
  state: WorkspaceDocument,
  nextSource: string,
): WorkspaceDocument {
  const index = state.selectedIndex;
  const selected = index === null ? null : state.document.diagrams[index] ?? null;
  if (selected === null || index === null) return state;
  if (!diagramRangeHoldsSource(state.text, selected.range, selected.source)) {
    // The range drifted (the text changed under it without a re-extraction), so
    // every stored range is suspect: re-extract first, then replace by id.
    return replaceSelectedDiagramSource(setWorkspaceText(state, state.text), nextSource);
  }

  const nextText = spliceDiagramSource(state.text, selected, nextSource);
  const previousLength = selected.range.endOffset - selected.range.startOffset;
  const replacementLength = nextText.length - state.text.length + previousLength;
  const diagrams = state.document.diagrams.slice();
  diagrams[index] = {
    ...selected,
    source: nextSource,
    range: {
      ...selected.range,
      endOffset: selected.range.startOffset + replacementLength,
    },
  };
  return { text: nextText, document: { ...state.document, diagrams }, selectedIndex: index };
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
