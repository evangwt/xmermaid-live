import { decodeShareState } from 'xmermaid/editor';
import './styles.css';
import { mountApp } from './app';
import { createWorkspaceDocumentForDiagram } from './document-model';
import { parseLayoutPreferences, serializeLayoutPreferences } from './layout-preferences';
import { SAMPLE_DOCUMENT } from './sample';
import { parseThemePreferences, serializeThemePreferences } from './theme';
import { parseWorkspaceCache, serializeWorkspaceCache } from './workspace-cache';

const LAYOUT_STORAGE_KEY = 'xmermaid-live.layout.v1';
const THEME_STORAGE_KEY = 'xmermaid-live.theme.v1';
const DOCUMENT_STORAGE_KEY = 'xmermaid-live.document.v1';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing #app root.');

const restored = decodeShareState(window.location.hash);
const cachedText = parseWorkspaceCache(safeRead(DOCUMENT_STORAGE_KEY));
const initialText = restored?.documentText ?? cachedText ?? SAMPLE_DOCUMENT;
const initialState = createWorkspaceDocumentForDiagram(initialText, restored?.selectedDiagramId ?? null);
const initialLayoutPreferences = parseLayoutPreferences(safeRead(LAYOUT_STORAGE_KEY));
const initialThemePreferences = parseThemePreferences(safeRead(THEME_STORAGE_KEY));
mountApp(root, {
  initialText,
  initialSelectedIndex: initialState.selectedIndex ?? 0,
  initialLayoutPreferences,
  persistLayoutPreferences: preferences => {
    safeWrite(LAYOUT_STORAGE_KEY, serializeLayoutPreferences(preferences));
  },
  initialThemePreferences,
  persistThemePreferences: preferences => {
    safeWrite(THEME_STORAGE_KEY, serializeThemePreferences(preferences));
  },
  persistDocumentText: text => {
    const serialized = serializeWorkspaceCache(text);
    if (serialized) safeWrite(DOCUMENT_STORAGE_KEY, serialized);
    else safeRemove(DOCUMENT_STORAGE_KEY);
  },
});

function safeRead(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage is an optional preference cache; rendering continues without it.
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage is an optional preference cache; rendering continues without it.
  }
}
