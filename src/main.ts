import { decodeShareState } from 'xmermaid/editor';
import './styles.css';
import { mountApp } from './app';
import { createWorkspaceDocumentForDiagram } from './document-model';
import { SAMPLE_DOCUMENT } from './sample';
import { parseThemePreferences, serializeThemePreferences } from './theme';

const THEME_STORAGE_KEY = 'xmermaid-live.theme.v1';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing #app root.');

const restored = decodeShareState(window.location.hash);
const initialText = restored?.documentText ?? SAMPLE_DOCUMENT;
const initialState = createWorkspaceDocumentForDiagram(initialText, restored?.selectedDiagramId ?? null);
const initialThemePreferences = parseThemePreferences(safeRead(THEME_STORAGE_KEY));
mountApp(root, {
  initialText,
  initialSelectedIndex: initialState.selectedIndex ?? 0,
  initialThemePreferences,
  persistThemePreferences: preferences => {
    safeWrite(THEME_STORAGE_KEY, serializeThemePreferences(preferences));
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
